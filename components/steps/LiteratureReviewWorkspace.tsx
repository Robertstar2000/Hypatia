
import React, { useState, useCallback, useEffect } from 'react';
import { useExperiment } from '../../services';
import { useToast } from '../../toast';
import { runLiteratureReviewAgent, parseGeminiError } from '../../services';
import { GeneratedOutput } from '../common/GeneratedOutput';
import { AgenticAnalysisView } from '../common/AgenticAnalysisView';

export const LiteratureReviewWorkspace = ({ onStepComplete }) => {
    const { activeExperiment, updateExperiment, gemini } = useExperiment();
    const { addToast } = useToast();
    const [agenticRun, setAgenticRun] = useState({
        status: 'idle', // 'idle', 'running', 'success', 'failed'
        iterations: 0,
        maxIterations: 5, // As defined in be_gemini.ts
        logs: [],
    });

    const stepData = activeExperiment.stepData[2] || {};

    const performAgenticReview = useCallback(async () => {
        if (!gemini) {
            addToast("Gemini not available", "danger");
            return;
        }

        if (agenticRun.status === 'running') return;

        setAgenticRun(prev => ({ ...prev, status: 'running', logs: [], iterations: 0 }));

        try {
            const finalDoc = await runLiteratureReviewAgent({
                experiment: activeExperiment,
                gemini,
                updateLog: (agent, message) => {
                    setAgenticRun(prev => ({ 
                        ...prev, 
                        logs: [...prev.logs, { agent, message }],
                        iterations: agent === 'System' && message.startsWith('--- Iteration') ? parseInt(message.split(' ')[2]) : prev.iterations
                    }));
                }
            });

            const finalStepData = { ...stepData, output: finalDoc };
            await updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, 2: finalStepData } });
            setAgenticRun(prev => ({ ...prev, status: 'success' }));
            addToast("Literature review complete!", "success");

        } catch (error) {
            addToast(parseGeminiError(error, "Agentic literature review failed."), 'danger');
            setAgenticRun(prev => ({ ...prev, status: 'failed' }));
        }

    }, [activeExperiment, gemini, addToast, updateExperiment, stepData, agenticRun.status]);
    
    useEffect(() => {
        if (!stepData.output) {
            performAgenticReview();
        }
    }, []); // Only run once on mount if there's no output

    if (agenticRun.status === 'running') {
        return <AgenticAnalysisView agenticRun={agenticRun} />;
    }

    return (
        <div>
            <GeneratedOutput 
                stepId={2} 
                onGenerate={performAgenticReview} 
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
