

import React, { useState, useMemo } from 'react';
import { useExperiment } from '../../../services';
import { useToast } from '../../../toast';
import { ModeSelection } from './ModeSelection';
import { CodeSimulator } from './CodeSimulator';
import { ManualDataEntry } from './ManualDataEntry';
import { DataSynthesizer } from './DataSynthesizer';
import { DataUploader } from '../../landing/DataUploader';
import { cleanAndFormatCsv } from '../../../utils/csvUtils';

type ExperimentMode = 'simulate' | 'manual' | 'synthesize' | 'upload';

export const ExperimentRunner = ({ onStepComplete }) => {
    const [mode, setMode] = useState<ExperimentMode | null>(null);
    const { addToast } = useToast();
    const { activeExperiment, updateExperiment } = useExperiment();

    const handleDataSubmission = (data: string, summary: string) => {
        const cleanedData = cleanAndFormatCsv(data);
        const currentStepData = activeExperiment.stepData || {};
        const newStepData = {
            ...currentStepData,
            