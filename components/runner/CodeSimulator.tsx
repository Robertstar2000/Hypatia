

import React, { useState, useEffect, useRef } from 'react';
import { useExperiment } from '../../context/ExperimentContext';
import { useToast } from '../../toast';
import { parseGeminiError } from '../../be_gemini';
import { AgenticAnalysisView } from '../common/AgenticAnalysisView';

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
        maxIterations: 4,
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
            const prompt = `Based on the following methodology and data collection plan, write a JavaScript simulation. The code must use \`hypatia.finish(csvData, summary)\` to return its results. The data should be in CSV format. Output ONLY the raw JavaScript code without any explanations or markdown backticks.\n\nMethodology Summary:\n${context.methodology_summary}\n\nData Collection Plan Summary:\n${context.data_collection_plan_summary}`;
            
            gemini.models.generateContent({model: 'gemini-2.5-flash', contents: prompt})
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

            try {
                const result = await executeCodeInWorker(currentCode);
                if (result.type === 'finish') {
                    setAgenticRun(prev => ({ ...prev, status: 'success', logs: [...prev.logs, { agent: 'System', message: 'Simulation completed successfully!' }] }));
                    onComplete(result.payload.data, result.payload.summary);
                    return;
                }
                 setAgenticRun(prev => ({ ...prev, status: 'failed', logs: [...prev.logs, { agent: 'System', message: "Code ran without errors but did not call hypatia.finish(). Halting." }] }));
                return;

            } catch (error) {
                const errorMessage = error as string;
                 setAgenticRun(prev => ({ ...prev, logs: [...prev.logs, { agent: 'System', message: `Error detected: ${errorMessage}` }, { agent: 'Debugger', message: 'Attempting to fix the code...' }] }));
                
                const fixPrompt = `You are an expert JavaScript debugger. The following simulation code, intended to run in a sandboxed environment, failed.

**Goal of the code:**
The code is supposed to simulate a scientific experiment based on this methodology:
- Methodology: ${context.methodology_summary}
- Data Plan: ${context.data_collection_plan_summary}

**The code MUST eventually call the \`hypatia.finish(csvData, summary)\` function with two string arguments to signal completion.**

**Error Detected:**
- ${errorMessage}

**Code with the error:**
\`\`\`javascript
${currentCode}
\`\`\`

**Your Task:**
1.  Analyze the error and the code.
2.  Identify the root cause. Pay close attention to common JavaScript issues like syntax errors (e.g., missing commas, brackets), runtime errors (e.g., 'Cannot read properties of undefined', 'is not a function'), or logical errors (e.g., an infinite loop, never calling \`hypatia.finish\`).
3.  Rewrite the entire code block with the necessary corrections.
4.  Ensure the corrected code still aligns with the original scientific goal.
5.  **Output ONLY the raw, corrected JavaScript code.** Do not include any explanations, comments about your changes, or markdown formatting like \`\`\`javascript.\`\`\`;
`;
                
                try {
                    const response = await gemini.models.generateContent({ model: 'gemini-2.5-flash', contents: fixPrompt });
                    const fixedCode = response.text.trim();
                    currentCode = fixedCode;
                    setCode(fixedCode);
                    handleCodeChange(fixedCode);
                    setAgenticRun(prev => ({ ...prev, logs: [...prev.logs, { agent: 'Debugger', message: `AI generated a potential fix. Retrying...` }] }));
                } catch (geminiError) {
                    const msg = parseGeminiError(geminiError, "AI fix failed.");
                    addToast(msg, 'danger');
                    setAgenticRun(prev => ({ ...prev, status: 'failed', logs: [...prev.logs, { agent: 'System', message: `AI failed to provide a fix: ${msg}` }] }));
                    return;
                }
            }
        }
        setAgenticRun(prev => ({ ...prev, status: 'failed', logs: [...prev.logs, { agent: 'System', message: `Failed to fix the code after ${agenticRun.maxIterations} attempts. Please review manually.` }] }));
    };

    if (isInitializing) return <div className="text-center p-4"><div className="spinner-border"></div><p className="mt-2">AI is writing your simulation code...</p></div>

    if (agenticRun.status === 'running') {
        return <AgenticAnalysisView agenticRun={agenticRun} />;
    }

    return (
        <div>
            <h6 className="fw-bold">AI-Generated Simulation Code (Sandboxed)</h6>
            <textarea className="form-control" id="code-editor" value={code} onChange={e => handleCodeChange(e.target.value)} rows={15} />
            <button className="btn btn-success mt-2" onClick={runAgenticSimulation}><i className="bi bi-robot me-1"></i> Start Agentic Simulation</button>
            
            {agenticRun.logs.length > 0 && (
                <div className="mt-3">
                    <h6 className="fw-bold">Last Run Log</h6>
                    <div className="agent-log-container">
                        {agenticRun.logs.map((log, index) => (
                            <div key={index} className={`agent-log-entry agent-log-${log.agent.toLowerCase().replace(/\s+/g, '-')}`}>
                                <span className="agent-log-agent">{log.agent}:</span>
                                <span className="agent-log-message">{log.message}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};