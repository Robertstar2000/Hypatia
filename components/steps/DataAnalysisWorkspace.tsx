import React, { useState, useCallback, useEffect } from 'react';
import { useExperiment } from '../../services';
import { useToast } from '../../toast';
import { runDataAnalysisAgent, parseGeminiError } from '../../services';
import { GeneratedOutput } from '../common/GeneratedOutput';
import { AgenticAnalysisView } from '../common/AgenticAnalysisView';


export const DataAnalysisWorkspace = ({ onStepComplete }) => {
    const { activeExperiment, updateExperiment, gemini } = useExperiment();
    const { addToast } = useToast();
    const [agenticRun, setAgenticRun] = useState({
        status: 'idle', // 'idle', 'running', 'success', 'failed'
        iterations: 0,
        maxIterations: 2, // Simplified workflow with Gemini 2.5
        logs: [],
    });

    const stepData = activeExperiment.stepData[7] || {};

    const performAgenticAnalysis = useCallback(async () => {
        if (!gemini || !stepData.input) {
            addToast("Gemini not available or no data to analyze.", "danger");
            return;
        }

        setAgenticRun({ status: 'running', logs: [], iterations: 0, maxIterations: 2 });
        const logCallback = (agent: string, message: string) => {
            setAgenticRun(prev => {
                const newLogs = [...prev.logs, { agent, message }];
                // Heuristic to advance progress bar
                const newIterations = Math.min(prev.maxIterations, new Set(newLogs.map(l => l.agent)).size);
                return { ...prev, logs: newLogs, iterations: newIterations };
            });
        };
        
        try {
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
        } catch (error) {
            console.error("Agentic data analysis failed:", error);
            const errorMessage = parseGeminiError(error, "An unknown error occurred during analysis.");
            addToast(errorMessage, "danger");
            setAgenticRun(prev => ({ 
                ...prev, 
                status: 'failed',
                logs: [...prev.logs, { agent: 'System', message: `ERROR: ${errorMessage}` }]
            }));
        }

    }, [activeExperiment, gemini, addToast, updateExperiment, stepData]);
    
    useEffect(() => {
        if (!stepData.output && agenticRun.status === 'idle') {
            performAgenticAnalysis();
        }
    }, [stepData.output, agenticRun.status, performAgenticAnalysis]);

    if (agenticRun.status === 'running') {
        return <AgenticAnalysisView agenticRun={agenticRun} subtitle="A multi-agent workflow is analyzing your data and generating visualizations." />;
    }

    // If failed, show the logs and a retry button to give the user context and a path forward.
    if (agenticRun.status === 'failed' && agenticRun.logs.length > 0) {
        return (
            <div>
                 <AgenticAnalysisView agenticRun={agenticRun} />
                 <div className="text-center mt-3">
                    <button className="btn btn-primary" onClick={performAgenticAnalysis}>
                        <i className="bi bi-arrow-clockwise me-1"></i> Retry Analysis
                    </button>
                 </div>
            </div>
        );
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