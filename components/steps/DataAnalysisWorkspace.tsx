


import React, { useState, useCallback, useEffect } from 'react';
import { useExperiment } from '../../services';
import { useToast } from '../../toast';
// Fix: Import `callGeminiWithRetry` to resolve the undefined error.
import { parseGeminiError, runDataAnalysisAgent, callGeminiWithRetry } from '../../services';
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
        
        try {
            const { finalOutput, logSummary } = await runDataAnalysisAgent({
                experiment: activeExperiment,
                csvData: stepData.input,
                gemini,
                updateLog: logCallback,
            });

            const finalStepData = { ...stepData, output: finalOutput, suggestedInput: logSummary };
            // Fix: Corrected typo from `active-experiment` to `activeExperiment`.
            await updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, 7: finalStepData } });
            setAgenticRun(prev => ({ ...prev, status: 'success' }));
            addToast("Agentic analysis complete!", "success");

        } catch (error) {
            const errorMessage = parseGeminiError(error, `Agentic workflow failed.`);
            addToast(errorMessage, 'danger');
            logCallback('System', `FATAL ERROR: ${error.message}.`);
            
            // Attempt to generate a fallback summary
            try {
                const fallbackPrompt = `An error occurred while trying to analyze and visualize the following data. Please provide a basic textual summary of the data. Start the summary by stating: "An error prevented the generation of visualizations. However, a basic analysis of the data reveals the following:"\n\nData:\n${stepData.input}`;
                const response = await callGeminiWithRetry(gemini, 'gemini-2.5-flash', { contents: fallbackPrompt });

                const finalOutput = JSON.stringify({ summary: response.text, chartSuggestions: [] });
                const logSummary = `Workflow failed, but a fallback summary was generated.`;
                const finalStepData = { ...stepData, output: finalOutput, suggestedInput: logSummary };
                // Fix: Corrected typo from `active-experiment` to `activeExperiment`.
                await updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, 7: finalStepData } });
                setAgenticRun(prev => ({ ...prev, status: 'success' }));
                addToast("Workflow failed, but a fallback summary was created. You can now proceed.", "success");
            } catch (fallbackError) {
                const finalErrorMessage = `A critical error occurred during the analysis, and a fallback summary could not be generated. Error: ${error.message}. Fallback Error: ${fallbackError.message}`;
                const finalOutput = JSON.stringify({ summary: finalErrorMessage, chartSuggestions: [] });
                const finalStepData = { ...stepData, output: finalOutput };
                // Fix: Corrected typo from `active-experiment` to `activeExperiment`.
                await updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, 7: finalStepData } });
                setAgenticRun(prev => ({ ...prev, status: 'failed' }));
                addToast("A critical error occurred. Please review the output.", "danger");
            }
        }
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