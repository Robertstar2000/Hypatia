import React, { useState, useEffect, useRef } from 'react';
import { useExperiment } from '../../../services';
import { useToast } from '../../../toast';
import { parseGeminiError, callGeminiWithRetry } from '../../../services';
import { AgenticAnalysisView } from '../../common/AgenticAnalysisView';

export const CodeSimulator = ({ onComplete, context }) => {
    const { activeExperiment, updateExperiment, gemini } = useExperiment();
    const [code, setCode] = useState(activeExperiment.stepData[6]?.input || '');
    const [isInitializing, setIsInitializing] = useState(false);
    const [initLogs, setInitLogs] = useState([]);
    const { addToast } = useToast();
    const workerRef = useRef<Worker | null>(null);

    const [agenticRun, setAgenticRun] = useState({
        status: 'idle', // 'idle', 'running', 'success', 'failed'
        logs: [],
        iterations: 0,
        maxIterations: 25,
    });
    
    // Setup and teardown for the Web Worker
    useEffect(() => {
        const workerCode = `
            self.onmessage = (event) => {
                const { code } = event.data;
                let finished = false;

                const hypatia = {
                    finish: (data, summary) => {
                        if (typeof data !== 'string' || typeof summary !== 'string') {
                            throw new Error("hypatia.finish() requires two string arguments: data (CSV format) and summary.");
                        }
                        self.postMessage({ type: 'log', payload: '✅ Simulation Finished. Data passed to next step.' });
                        self.postMessage({ type: 'finish', payload: { data, summary } });
                        finished = true;
                    }
                };
                
                const consoleProxy = {
                    log: (...args) => {
                        const logMsg = args.map(arg => {
                            try { return JSON.stringify(arg); } catch { return String(arg); }
                        }).join(' ');
                        self.postMessage({ type: 'log', payload: logMsg });
                    }
                };

                try {
                    new Function('console', 'hypatia', code)(consoleProxy, hypatia);
                    if (!finished) {
                        self.postMessage({ type: 'log', payload: "🔵 Simulation ended without calling hypatia.finish()." });
                    }
                    self.postMessage({ type: 'done' });
                } catch (e) {
                    self.postMessage({ type: 'error', payload: \`[\${e.name}] \${e.message}\` });
                }
            };
        `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        workerRef.current = new Worker(URL.createObjectURL(blob));

        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, []);


    useEffect(() => {
        if (!code && gemini) {
            const runInitializationAgent = async () => {
                setIsInitializing(true);
                setInitLogs([]);

                const log = (agent, message) => setInitLogs(prev => [...prev, { agent, message }]);

                try {
                    // Agent 1: Simplifier
                    log('Simplifier', 'Reading hypothesis, methodology, and data plan to create a simplified simulation goal...');
                    const simplifierPrompt = `You are a research assistant. Your job is to simplify complex research plans into a clear, concise goal for a programmer.
                    
                    **Primary Goal:** Create simple instructions to simulate only the #1 hypothesis. Extract the core intent from the methodology and data plan. Prioritize simplicity and a clear outcome over complex details.
                    
                    **Hypothesis:**
                    ${context.hypothesis}
                    
                    **Methodology Summary:**
                    ${context.methodology_summary}
                    
                    **Data Collection Plan:**
                    ${context.data_collection_plan_summary}
                    
                    **Output:** A short, one-paragraph instruction set for the programmer. For example: "Simulate a 30-day period. Each day, increase a 'growth_factor' by a random amount between 0.1 and 0.5. Track the 'total_size' which is affected by the growth factor. The final CSV should have 'day' and 'total_size' columns."`;

                    const simplifierResponse = await callGeminiWithRetry(gemini, 'gemini-flash-lite-latest', { contents: simplifierPrompt });
                    const simplifiedInstructions = simplifierResponse.text;
                    log('Simplifier', 'Simplified instructions created.');
                    log('Instructions', simplifiedInstructions);

                    // Agent 2: Coder
                    log('Coder', 'Generating simulation code based on simplified instructions...');
                    const coderPrompt = `You are an expert in writing simple, error-free Javascript simulations for scientific research in the field of ${context.experimentField}.
                    
                    **Your Goal:** Write a straightforward JavaScript simulation based *only* on the following instructions. The code MUST run successfully. Do not add complexity. Prioritize generating working code over perfectly simulating every detail.
                    
                    **Instructions:**
                    ${simplifiedInstructions}
                    
                    **Rules:**
                    1. The code must use \`hypatia.finish(csvData, summary)\` to return its results.
                    2. The first argument to \`hypatia.finish\` must be a string in CSV format.
                    3. The second argument must be a brief, one-sentence summary string.
                    4. Output ONLY the raw JavaScript code without any explanations or markdown backticks.`;

                    const coderResponse = await callGeminiWithRetry(gemini, 'gemini-2.5-flash', { contents: coderPrompt });
                    handleCodeChange(coderResponse.text.trim());
                    log('Coder', 'Code generated successfully.');

                } catch (err) {
                    addToast(parseGeminiError(err, "AI failed to generate initial simulation code."), "danger");
                    log('System', `Error: ${parseGeminiError(err)}`);
                } finally {
                    setIsInitializing(false);
                }
            };

            runInitializationAgent();
        }
    }, [gemini, context, code, addToast]);

    const handleCodeChange = (newCode: string) => {
        setCode(newCode);
        const updatedStepData = { ...activeExperiment.stepData, 6: { ...activeExperiment.stepData[6], input: newCode }};
        updateExperiment({ ...activeExperiment, stepData: updatedStepData });
    };

    const executeCodeInWorker = (codeToRun: string): Promise<{ type: 'finish' | 'done', payload?: any }> => {
        return new Promise((resolve, reject) => {
            if (!workerRef.current) {
                reject("Worker not initialized.");
                return;
            }
            
            const messageHandler = (event) => {
                const { type, payload } = event.data;
                if (type === 'log') {
                    setAgenticRun(prev => ({ ...prev, logs: [...prev.logs, { agent: 'Simulator', message: payload }] }));
                }
                if (type === 'finish' || type === 'done' || type === 'error') {
                    workerRef.current.removeEventListener('message', messageHandler);
                    if (type === 'error') reject(payload);
                    else resolve({ type, payload });
                }
            };
            workerRef.current.addEventListener('message', messageHandler);
            workerRef.current.postMessage({ code: codeToRun });
        });
    };

    const runAgenticSimulation = async () => {
        setAgenticRun(prev => ({ ...prev, status: 'running', logs: [], iterations: 0 }));
        let currentCode = code;
        let lastError: string = `Maximum attempts (${agenticRun.maxIterations}) reached without a successful run.`;

        for (let i = 0; i < agenticRun.maxIterations; i++) {
            setAgenticRun(prev => ({ ...prev, iterations: i + 1, logs: [...prev.logs, { agent: 'System', message: `--- Attempt ${i + 1} of ${agenticRun.maxIterations} ---` }] }));

            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1-second delay between iterations
            }

            try {
                const result = await executeCodeInWorker(currentCode);
                if (result.type === 'finish') {
                    setAgenticRun(prev => ({ ...prev, status: 'success', logs: [...prev.logs, { agent: 'System', message: 'Agentic simulation successful.' }] }));
                    addToast("Simulation successful!", "success");
                    onComplete(result.payload.data, result.payload.summary);
                    return; // Exit the loop
                }
                 const noFinishError = "Code ran without errors but did not call hypatia.finish().";
                 lastError = noFinishError;
                 setAgenticRun(prev => ({ ...prev, logs: [...prev.logs, { agent: 'Debugger', message: noFinishError }] }));
                 throw new Error(noFinishError);

            } catch (error) {
                lastError = error as string;
                setAgenticRun(prev => ({ ...prev, logs: [...prev.logs, { agent: 'Debugger', message: `Execution failed. Error: ${error}` }] }));
                
                const debuggerPrompt = `You are a debugger agent specializing in scientific simulations in the field of ${context.experimentField}. The following Javascript code failed to execute with the error: "${error}". The code is intended to run in a sandboxed environment where it must call 'hypatia.finish(csvString, summaryString)' to return a result. Analyze the code and the error, and provide a corrected version of the full script using terminology and logic appropriate for ${context.experimentField}. Output ONLY the raw corrected javascript code.\n\n---\n\nCODE:\n${currentCode}`;

                try {
                    const response = await callGeminiWithRetry(gemini, 'gemini-2.5-flash', { contents: debuggerPrompt });
                    currentCode = response.text.trim();
                    setCode(currentCode); // Update the editor
                    setAgenticRun(prev => ({ ...prev, logs: [...prev.logs, { agent: 'Debugger', message: 'Attempting a fix...' }] }));
                } catch (geminiError) {
                    const errorMessage = parseGeminiError(geminiError);
                    lastError = `Debugger agent failed: ${errorMessage}`;
                    setAgenticRun(prev => ({ ...prev, status: 'failed', logs: [...prev.logs, { agent: 'System', message: lastError }] }));
                    addToast(lastError, "danger");
                    return; // Exit loop if debugger fails
                }
            }
        }

        // If loop finishes without success
        setAgenticRun(prev => ({ ...prev, status: 'failed' }));
        addToast(`Agentic simulation failed. Last known error: ${lastError}`, 'danger');
    };

    return (
        <div>
            <ul className="nav nav-tabs mb-3">
                <li className="nav-item"><a href="#" className="nav-link active">Code Simulator</a></li>
            </ul>
            <div className="doc-section mb-3">
                <h6 className="fw-bold">AI-Generated Simulation Code</h6>
                <p className="small text-white-50">
                    The AI has generated the following JavaScript code based on your methodology. This code will be executed in a secure sandbox. It must call `hypatia.finish(csvData, summary)` to pass its results to the next step.
                </p>
            </div>
            {isInitializing && (
                <div className="mb-3">
                    <AgenticAnalysisView 
                        agenticRun={{ logs: initLogs, iterations: 0, maxIterations: 0 }} 
                        title="AI is Initializing Code"
                        subtitle="A two-step agent workflow is simplifying the requirements and generating the initial script."
                    />
                </div>
            )}
            <textarea
                id="code-editor"
                className="form-control mb-3"
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                disabled={agenticRun.status === 'running' || isInitializing}
            />
            <div className="mb-3">
                <button 
                    className="btn btn-primary"
                    onClick={runAgenticSimulation}
                    disabled={!code || isInitializing || agenticRun.status === 'running'}
                >
                    {agenticRun.status === 'running' ? 'Running Simulation...' : 'Start Agentic Simulation'}
                </button>
            </div>
            {(agenticRun.status === 'running' || agenticRun.logs.length > 0) &&
                <AgenticAnalysisView 
                    agenticRun={agenticRun} 
                    title="Agentic Debugger is Active" 
                    subtitle="The AI is running and debugging the simulation code." 
                />
            }
        </div>
    );
};
