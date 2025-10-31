
import React, { useState, useMemo } from 'react';
import { useExperiment } from '../../context/ExperimentContext';
import { useToast } from '../../toast';
import { ModeSelection } from './ModeSelection';
import { CodeSimulator } from './CodeSimulator';
import { ManualDataEntry } from './ManualDataEntry';
import { DataSynthesizer } from './DataSynthesizer';
import { DataUploader } from './DataUploader';

type ExperimentMode = 'simulate' | 'manual' | 'synthesize' | 'upload';

export const ExperimentRunner = ({ onStepComplete }) => {
    const [mode, setMode] = useState<ExperimentMode | null>(null);
    const { addToast } = useToast();
    const { activeExperiment, updateExperiment } = useExperiment();

    const handleDataSubmission = (data: string, summary: string) => {
        const currentStepData = activeExperiment.stepData || {};
        const newStepData = {
            ...currentStepData,
            6: { ...(currentStepData[6] || {}), output: summary, summary: summary, input: data },
            7: { ...(currentStepData[7] || {}), input: data }
        };
        const updatedExperiment = { ...activeExperiment, stepData: newStepData };
        updateExperiment(updatedExperiment);
        addToast("Data submitted successfully! You can now complete this step.", "success");
        onStepComplete();
    };
    
    const context = useMemo(() => {
        if (!activeExperiment) return {};
        // Manually import getStepContext to avoid circular dependency
        const getStepContext = (experiment, stepId) => {
            const tempContext: any = { experimentField: experiment.field };
            const data = experiment.stepData || {};
            const getStepSummary = (sId) => data[sId]?.summary || data[sId]?.output || 'N/A';
            if (stepId > 4) tempContext.methodology_summary = getStepSummary(4);
            if (stepId > 5) tempContext.data_collection_plan_summary = getStepSummary(5);
            return tempContext;
        };
        return getStepContext(activeExperiment, 6)
    }, [activeExperiment]);
    
    if (!mode) {
        return <ModeSelection onSelect={setMode} />;
    }

    return (
        <div>
            <button className="btn btn-sm btn-outline-secondary mb-3" onClick={() => setMode(null)}>
                <i className="bi bi-arrow-left me-1"></i> Change Data Generation Mode
            </button>
            {mode === 'simulate' && <CodeSimulator onComplete={handleDataSubmission} context={context} />}
            {mode === 'manual' && <ManualDataEntry onComplete={handleDataSubmission} context={context} />}
            {mode === 'synthesize' && <DataSynthesizer onComplete={handleDataSubmission} context={context} />}
            {mode === 'upload' && <DataUploader onComplete={handleDataSubmission} />}
        </div>
    );
};
