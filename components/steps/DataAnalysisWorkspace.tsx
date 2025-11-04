



import React, { useState, useCallback, useEffect } from 'react';
import { useExperiment } from '../../services';
import { useToast } from '../../toast';
import { runDataAnalysisAgent } from '../../services';
import { GeneratedOutput } from '../common/GeneratedOutput';
import { AgenticAnalysisView } from '../common/AgenticAnalysisView';


export const DataAnalysisWorkspace = ({ onStepComplete }) => {
    const { activeExperiment, updateExperiment, gemini } = useExperiment();
    const { addToast } = useToast();
    const [agenticRun, setAgenticRun] = useState({
        status: 'idle', // 'idle', 'running', 'success', 'failed'
        iterations: 0,
        maxIterations: 4, // 4 phases: System, Manager, Doer(s), Summarizer
        logs: [],
    });

    const stepData = activeExperiment.stepData[7] || {};

    const performAgenticAnalysis = useCallback(async () => {
        if (!gemini || !stepData.input) {
            addToast("Gemini not available or no data to analyze.", "danger");
            return;
        }

        setAgenticRun({ status: 'running', logs: [], iterations: 0, maxIterations: 4 });
        const logCallback = (agent: string, message: string) => {
            setAgenticRun(prev => {
                const newLogs = [...prev.logs, { agent, message }];
                // Heuristic to advance progress bar
                const newIterations = Math.min(prev.maxIterations, new Set(newLogs.map(l => l.agent)).size);
                return { ...prev, logs: newLogs, iterations: newIterations };
            });
        };
        
        // This is now much simpler. We don't need a complex try/catch here because
        // runDataAnalysisAgent is guaranteed to resolve successfully with a valid output.
        const { finalOutput, logSummary } = await runDataAnalysisAgent({
            experiment: activeExperiment,
            csvData: stepData.input,
            gemini,
            updateLog: logCallback,
        });

        const finalStepData = { ...stepData, output: finalOutput, suggestedInput: logSummary };
        await updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, 7: finalStepData } });
        setAgenticRun(prev => ({ ...prev, status: 'success' }));
        addToast("Analysis complete!", "success");

    }, [activeExperiment, gemini, addToast, updateExperiment, stepData]);
    
    useEffect(() => {
        if (!stepData.output && agenticRun.status === 'idle') {
            performAgenticAnalysis();
        }
    }, [stepData.output, agenticRun.status, performAgenticAnalysis]);

    if (agenticRun.status === 'running') {
        return <AgenticAnalysisView agenticRun={agenticRun} />;
    }

    return (
        <div>
            <GeneratedOutput 
                stepId={7} 
                onGenerate={performAgenticAnalysis} 
                isLoading={agenticRun.status === 'running'} 
            />
             {stepData.output && (
                 <div className="card-footer d-flex justify-content-end align-items-center bottom-nav">
                    <button className="btn btn-success" onClick={onStepComplete} disabled={agenticRun.status === 'running'}>
                        <i className="bi bi-check-circle-fill me-1"></i> Complete Step & Continue
                    </button>
                 </div>
            )}
        </div>
    );
};