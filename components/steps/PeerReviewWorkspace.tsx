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
        maxIterations: 8, // One for each step reviewed (1-8)
        logs: [],
    });

    const stepData = activeExperiment.stepData[9] || {};

    const performAgenticReview = useCallback(async () => {
        if (!gemini || agenticRun.status === 'running') return;

        setAgenticRun(prev => ({ ...prev, status: 'running', logs: [], iterations: 0 }));

        const logCallback = (agent: string, message: string) => {
            setAgenticRun(prev => {
                const newLogs = [...prev.logs, { agent, message }];
                // A more robust way to track progress: count how many "Analyzing Step" messages we've logged.
                const newIterations = newLogs.filter(log => log.message.startsWith('Analyzing Step')).length;
                return { ...prev, logs: newLogs, iterations: newIterations };
            });
        };

        try {
            const finalDoc = await runPeerReviewAgent({
                experiment: activeExperiment,
                gemini,
                updateLog: logCallback,
            });

            const finalStepData = { ...stepData, output: finalDoc };
            await updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, 9: finalStepData } });
            setAgenticRun(prev => ({ ...prev, status: 'success' }));
            addToast("Peer review complete!", "success");

        } catch (error) {
            addToast(parseGeminiError(error, "Agentic peer review failed."), 'danger');
            setAgenticRun(prev => ({ ...prev, status: 'failed' }));
        }
    }, [activeExperiment, gemini, addToast, updateExperiment, stepData, agenticRun.status]);
    
    useEffect(() => {
        if (!stepData.output && agenticRun.status === 'idle') {
            performAgenticReview();
        }
    }, [stepData.output, agenticRun.status, performAgenticReview]);

    if (agenticRun.status === 'running') {
        return <AgenticAnalysisView agenticRun={agenticRun} />;
    }

    return (
        <div>
            <GeneratedOutput 
                stepId={9} 
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