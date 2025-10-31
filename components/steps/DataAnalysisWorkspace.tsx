
import React, { useState, useCallback, useEffect } from 'react';
import { Chart } from 'chart.js';
import { useExperiment } from '../../context/ExperimentContext';
import { useToast } from '../../toast';
import { getStepContext, getPromptForStep, parseGeminiError } from '../../be_gemini';
import { QA_AGENT_SCHEMA } from '../../config';
import { GeneratedOutput } from '../common/GeneratedOutput';
import { AgenticAnalysisView } from '../common/AgenticAnalysisView';


export const DataAnalysisWorkspace = ({ onStepComplete }) => {
    const { activeExperiment, updateExperiment, gemini } = useExperiment();
    const { addToast } = useToast();
    const [agenticRun, setAgenticRun] = useState({
        status: 'idle', // 'idle', 'running', 'success', 'failed'
        iterations: 0,
        maxIterations: 50,
        logs: [],
        finalChartConfig: null,
        finalSummary: ''
    });

    const stepData = activeExperiment.stepData[7] || {};

    const performAgenticAnalysis = useCallback(async () => {
        if (!gemini) {
            addToast("Gemini not available", "danger");
            return;
        }

        setAgenticRun(prev => ({ ...prev, status: 'running', logs: [], iterations: 0 }));
        
        let initialGoalSummary = '';
        let initialChartDescription = 'No chart was suggested by the initial analysis.';

        try {
            // Step 1: Get the initial analysis and goal description
            const context = getStepContext(activeExperiment, 7);
            const { basePrompt: initialPrompt, config: initialConfig } = getPromptForStep(7, stepData.input || '', context, { isAutomated: true });
            const initialResponse = await gemini.models.generateContent({model: 'gemini-flash-lite-latest', contents: initialPrompt, config: initialConfig});
            
            const initialResult = JSON.parse(initialResponse.text.replace(/```json/g, '').replace(/```/g, '').trim());
            initialGoalSummary = initialResult.summary;
            if (initialResult.chartSuggestions && initialResult.chartSuggestions.length > 0) {
                const chart = initialResult.chartSuggestions[0];
                // Defensive check to prevent crash on malformed chart object
                if (chart && chart.type && chart.data && Array.isArray(chart.data.datasets) && chart.data.datasets.length > 0 && chart.data.datasets[0].label) {
                    initialChartDescription = `Create a '${chart.type}' chart. The dataset label should be '${chart.data.datasets[0].label}'.`;
                } else if (chart && chart.type) {
                    initialChartDescription = `Create a '${chart.type}' chart based on the provided data.`;
                }
            }

            setAgenticRun(prev => ({...prev, logs: [...prev.logs, {agent: 'System', message: `Goal set: ${initialChartDescription}`}]}));

        } catch (error) {
            addToast(parseGeminiError(error, "Failed to get initial analysis goal."), 'danger');
            setAgenticRun(prev => ({ ...prev, status: 'failed' }));
            return;
        }
        
        let lastQAFeedback = "No feedback yet. This is the first attempt.";
        const csvData = stepData.input || '';

        const exampleLine = `{"type":"line","data":{"labels":["Jan","Feb"],"datasets":[{"label":"Product A","data":[100,120]},{"label":"Product B","data":[80,90]}]}}`;
        const exampleBar = `{"type":"bar","data":{"labels":["A","B"],"datasets":[{"label":"Count","data":[10,20]}]}}`;

        for (let i = 0; i < agenticRun.maxIterations; i++) {
            setAgenticRun(prev => ({...prev, iterations: i + 1, logs: [...prev.logs, {agent: 'System', message: `--- Iteration ${i+1} ---`}]}));

            // Manager's Turn
            const managerPrompt = `You are the Manager Agent. Your goal is to get a valid Chart.js configuration that matches this description: "${initialChartDescription}". You have examples for bar graphs and line graphs. Bar: ${exampleBar}. Line: ${exampleLine}. The raw data is: \`\`\`csv\n${csvData}\n\`\`\`. The last QA feedback was: "${lastQAFeedback}". Based on this feedback, provide a new, clear, and concise instruction to the Doer agent. Focus on correcting the specific error.`;
            const managerResponse = await gemini.models.generateContent({ model: 'gemini-flash-lite-latest', contents: managerPrompt });
            const managerInstruction = managerResponse.text;
            setAgenticRun(prev => ({...prev, logs: [...prev.logs, {agent: 'Manager', message: managerInstruction}]}));

            // Doer's Turn
            const doerPrompt = `You are the Doer. You ONLY generate Chart.js JSON configurations for 'bar' or 'line' charts. Your instruction is: "${managerInstruction}". You MUST parse the provided CSV data and use its values to populate the 'data.datasets[0].data' array with numbers. The 'labels' should correspond to the appropriate column in the CSV. The data is: \`\`\`csv\n${csvData}\n\`\`\`. Output ONLY the raw JSON.`;
            const doerResponse = await gemini.models.generateContent({ model: 'gemini-flash-lite-latest', contents: doerPrompt });
            const doerJson = doerResponse.text.replace(/```json/g, '').replace(/```/g, '').trim();
            setAgenticRun(prev => ({...prev, logs: [...prev.logs, {agent: 'Doer', message: 'Generated new chart configuration.'}]}));

            // QA's Turn
            let qaPass = false;
            let parsedConfig;
            try {
                // Local Programmatic Validation First
                parsedConfig = JSON.parse(doerJson);
                 if (!parsedConfig?.data?.datasets || !Array.isArray(parsedConfig.data.datasets) || parsedConfig.data.datasets.length === 0) {
                    throw new Error("Local validation failed: `data.datasets` array is missing or empty.");
                }
                if (!parsedConfig.data.datasets[0].data || !Array.isArray(parsedConfig.data.datasets[0].data) || parsedConfig.data.datasets[0].data.length === 0) {
                    throw new Error("Local validation failed: `datasets[0].data` array is missing or empty.");
                }
                 if (parsedConfig.data.datasets[0].data.some(d => typeof d !== 'number')) {
                    throw new Error("Local validation failed: `datasets[0].data` contains non-numeric values.");
                }
                const canvas = document.createElement('canvas');
                new Chart(canvas.getContext('2d'), parsedConfig);
                
                // If local checks pass, proceed to AI QA
                const qaPrompt = `You are the QA Agent. The goal is: "${initialChartDescription}". The Doer agent produced this Chart.js JSON: \`\`\`json\n${doerJson}\n\`\`\`. Does this JSON correctly visualize the data and fulfill the goal? Your response must be a valid JSON object.`;
                const qaResponse = await gemini.models.generateContent({ 
                    model: 'gemini-flash-lite-latest', 
                    contents: qaPrompt, 
                    config: {
                        responseMimeType: 'application/json',
                        responseSchema: QA_AGENT_SCHEMA
                    } 
                });
                const qaResult = JSON.parse(qaResponse.text);
                qaPass = qaResult.pass;
                lastQAFeedback = qaResult.feedback;
            } catch (e) {
                lastQAFeedback = e.message;
            }
            setAgenticRun(prev => ({...prev, logs: [...prev.logs, {agent: 'QA', message: lastQAFeedback}]}));

            if (qaPass) {
                const finalOutput = JSON.stringify({ summary: initialGoalSummary, chartSuggestions: [parsedConfig] });
                const finalStepData = { ...stepData, output: finalOutput };
                await updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, 7: finalStepData } });
                setAgenticRun(prev => ({ ...prev, status: 'success' }));
                addToast("Agentic analysis complete!", "success");
                return;
            }
        }
        
        // Loop finished without success
        addToast(`Agentic workflow failed after ${agenticRun.maxIterations} iterations. Saving summary only.`, 'warning');
        const finalOutput = JSON.stringify({ summary: initialGoalSummary, chartSuggestions: [] });
        const finalStepData = { ...stepData, output: finalOutput };
        await updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, 7: finalStepData } });
        setAgenticRun(prev => ({ ...prev, status: 'failed' }));
    }, [activeExperiment, gemini, addToast, updateExperiment, stepData, agenticRun.maxIterations]);
    
    useEffect(() => {
        if (!stepData.output) {
            performAgenticAnalysis();
        }
    }, []);

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
