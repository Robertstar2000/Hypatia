import React, { useState, useEffect, useRef } from 'react';
import { useExperiment } from '../../../services';
import { useToast } from '../../../toast';
import { parseGeminiError, callGeminiWithRetry } from '../../../services';
import { AgenticAnalysisView } from '../../common/AgenticAnalysisView';

export const CodeSimulator = ({ onComplete, context }) => {
    const { activeExperiment, updateExperiment, gemini } = useExperiment();
    const [code, setCode] = useState(activeExperiment.stepData[6]?.input || '');
    const [isInitializing, setIsInitializing] = useState(false);
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
            setIsInitializing(true);
            const prompt = `You are an expert in writing Javascript simulations for scientific research in the field of ${context.experimentField}. Based on the following methodology and data collection plan, write a JavaScript simulation. The code must use \`hypatia.finish(csvData, summary)\` to return its results. The data should be in CSV format. Use logic and terminology appropriate for ${context.experimentField}. Output ONLY the raw JavaScript code without any explanations or markdown backticks.\n\nMethodology Summary:\n${context.methodology_summary}\n\nData Collection Plan Summary:\n${context.data_collection_plan_summary}`;
            
            callGeminiWithRetry(gemini, 'gemini-2.5-flash', { contents: prompt })
                .then(response => handleCodeChange(response.text.trim()))
                .catch(err => addToast(parseGeminiError(err, "AI failed to generate initial simulation code."), "danger"))
                .finally(() => setIsInitializing(false));
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
                 setAgenticRun(prev => ({ ...prev, logs: [...prev.logs, { agent: 'Debugger', message: `Code ran without errors but did not call hypatia.finish(). Retrying to ensure it does.` }] }));
                 throw new Error("Code did not call hypatia.finish().");

            } catch (error) {
                setAgenticRun(prev => ({ ...prev, logs: [...prev.logs, { agent: 'Debugger', message: `Execution failed. Error: ${error}` }] }));
                
                const debuggerPrompt = `You are a debugger agent specializing in scientific simulations in the field of ${context.experimentField}. The following Javascript code failed to execute with the error: "${error}". The code is intended to run in a sandboxed environment where it must call 'hypatia.finish(csvString, summaryString)' to return a result. Analyze the code and the error, and provide a corrected version of the full script using terminology and logic appropriate for ${context.experimentField}. Output ONLY the raw corrected javascript code.\n\n---\n\nCODE:\n${currentCode}`;

                try {
                    const response = await callGeminiWithRetry(gemini, 'gemini-2.5-flash', { contents: debuggerPrompt });
                    currentCode = response.text.trim();
                    setCode(currentCode); // Update the editor
                    setAgenticRun(prev => ({ ...prev, logs: [...prev.logs, { agent: 'Debugger', message: 'Attempting a fix...' }] }));
                } catch (geminiError) {
                    const errorMessage = parseGeminiError(geminiError);
                    setAgenticRun(prev => ({ ...prev, status: 'failed', logs: [...prev.logs, { agent: 'System', message: `Debugger agent failed: ${errorMessage}` }] }));
                    addToast("Debugger agent failed to provide a fix.", "danger");
                    return; // Exit loop if debugger fails
                }
            }
        }

        // If loop finishes without success
        setAgenticRun(prev => ({ ...prev, status: 'failed' }));
        addToast(`Agentic simulation failed to produce a result after ${agenticRun.maxIterations} attempts.`, 'danger');
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
            {isInitializing && <div className="text-center p-3"><div className="spinner-border spinner-border-sm"></div> Initializing code...</div>}
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
                <AgenticAnalysisView agenticRun={agenticRun} />
            }
        </div>
    );
};