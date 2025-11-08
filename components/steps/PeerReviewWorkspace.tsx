import React, { useState, useCallback, useEffect } from 'react';
import { useExperiment } from '../../services';
import { useToast } from '../../toast';
import { runPeerReviewAgent, parseGeminiError } from '../../services';
import { GeneratedOutput } from '../common/GeneratedOutput';
import { AgenticAnalysisView } from '../common/AgenticAnalysisView';

export const PeerReviewWorkspace = ({ onStepComplete }) => {
    const { activeExperiment, updateExperiment, gemini } = useExperiment();
    const { addToast } = useToast();
    const [agenticRun, setAgenticRun] = useState({
        status: 'idle', // 'idle', 'running', 'success', 'failed'
        iterations: 0,
        maxIterations: 7, // Steps 2 through 8
        logs: [],
    });

    const stepData = activeExperiment.stepData[9] || {};

    const performAgenticReview = useCallback(async () => {
        if (!gemini) {
            addToast("Gemini not available", "danger");
            return;
        }

        if (agenticRun.status === 'running') return;

        setAgenticRun(prev => ({ ...prev, status: 'running', logs: [], iterations: 0 }));

        try {
            const finalDoc = await runPeerReviewAgent({
                experiment: activeExperiment,
                gemini,
                updateLog: (agent, message) => {
                    setAgenticRun(prev => ({
                        ...prev,
                        logs: [...prev.logs, { agent, message }],
                        iterations: message.startsWith('Now reviewing Step') ? prev.iterations + 1 : prev.iterations
                    }));
                }
            });

            const finalStepData = { ...stepData, output: finalDoc };
            await updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, 9: finalStepData } });
            setAgenticRun(prev => ({ ...prev, status: 'success' }));
            addToast("Peer review complete!", "success");

        } catch (error) {
            const errorMessage = parseGeminiError(error, "Agentic peer review failed.");
            addToast(errorMessage, 'danger');
            setAgenticRun(prev => ({ 
                ...prev, 
                status: 'failed',
                logs: [...prev.logs, { agent: 'System', message: `ERROR: ${errorMessage}`}]
            }));
        }

    }, [activeExperiment, gemini, addToast, updateExperiment, stepData, agenticRun.status]);
    
    useEffect(() => {
        if (!stepData.output && agenticRun.status === 'idle') {
            performAgenticReview();
        }
    }, [stepData.output, agenticRun.status, performAgenticReview]);

    if (agenticRun.status === 'running' || (agenticRun.status === 'failed' && agenticRun.logs.length > 0)) {
        return (
            <div>
                 <AgenticAnalysisView agenticRun={agenticRun} title="Peer Review Simulation in Progress" subtitle="The AI Reviewer is critiquing each step of the project."/>
                 {agenticRun.status === 'failed' && 
                    <div className="text-center mt-3">
                        <button className="btn btn-primary" onClick={performAgenticReview}>
                            <i className="bi bi-arrow-clockwise me-1"></i> Retry Review
                        </button>
                    </div>
                 }
            </div>
        );
    }

    return (
        <div>
            <GeneratedOutput 
                stepId={9} 
                onGenerate={performAgenticReview} 
                isLoading={agenticRun.status === 'running'} 
            />
             {stepData.output && (
                 <div className="card-footer d-flex justify-content-between align-items-center bottom-nav">
                     <div>
                        {/* Placeholder for fine-tune button if added later */}
                     </div>
                    <button className="btn btn-success" onClick={onStepComplete} disabled={agenticRun.status === 'running'}>
                        <i className="bi bi-check-circle-fill me-1"></i> Complete Step & Continue
                    </button>
                 </div>
            )}
        </div>
    );
};
