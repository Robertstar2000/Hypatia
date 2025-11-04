import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useExperiment } from '../../services';
import { useToast } from '../../toast';
import { parseGeminiError, getStepContext, getPromptForStep, runPublicationAgent, runLiteratureReviewAgent, callGeminiWithRetry, callGeminiStreamWithRetry } from '../../services';
import { WORKFLOW_STEPS, ANALYSIS_PLAN_SCHEMA, CHART_JS_SCHEMA } from '../../config';

import { ExperimentRunner } from '../steps/runner/ExperimentRunner';
import { DataAnalysisWorkspace } from '../steps/DataAnalysisWorkspace';
import { PublicationExporter } from '../steps/PublicationExporter';
import { EditableStepInput } from '../steps/EditableStepInput';
import { GeneratedOutput } from '../common/GeneratedOutput';
import { ProjectCompletionView } from './ProjectCompletionView';
import { AutomationModeSelector } from './AutomationModeSelector';
import { FineTuneModal } from './FineTuneModal';
import { LiteratureReviewWorkspace } from '../steps/LiteratureReviewWorkspace';

const isChartJsonValid = (jsonString, chartType) => {
    try {
        const chart = JSON.parse(jsonString);
        if (chart.type !== chartType) return false;
        if (!chart.data || !Array.isArray(chart.data.datasets) || chart.data.datasets.length === 0) return false;
        const dataset = chart.data.datasets[0];
        if (!dataset.data || !Array.isArray(dataset.data) || dataset.data.length === 0) return false;
        if (chartType === 'scatter') {
            const firstPoint = dataset.data[0];
            if (typeof firstPoint !== 'object' || firstPoint.x === undefined || firstPoint.y === undefined) return false;
        } else { // bar or line
            if (!Array.isArray(chart.data.labels) || chart.data.labels.length === 0) return false;
        }
        return true;
    } catch (e) {
        return false;
    }
};


export const ExperimentWorkspace = () => {
    const { activeExperiment, updateExperiment, gemini, setActiveExperiment } = useExperiment();
    const [activeStep, setActiveStep] = useState(activeExperiment.currentStep);
    const [isLoading, setIsLoading] = useState(false);
    const [isAutoGenerating, setIsAutoGenerating] = useState(false);
    const [fineTuneModalOpen, setFineTuneModalOpen] = useState(false);
    const { addToast } = useToast();

    const experimentRef = useRef(activeExperiment);
    useEffect(() => {
        experimentRef.current = activeExperiment;
    }, [activeExperiment]);

    const stepData = useMemo(() => activeExperiment.stepData[activeStep] || {}, [activeExperiment.stepData, activeStep]);
    const fineTuneSettings = useMemo(() => activeExperiment.fineTuneSettings[activeStep] || {}, [activeExperiment.fineTuneSettings, activeStep]);

    // This effect ensures the component's state is synchronized with the active experiment's state
    useEffect(() => {
        setActiveStep(activeExperiment.currentStep);
    }, [activeExperiment.currentStep]);

    const handleStepChange = (stepId: number) => {
        if (stepId <= activeExperiment.currentStep && !isAutoGenerating) {
            setActiveStep(stepId);
        }
    };

    const runAutomationSequence = useCallback(async (startStep: number) => {
        if (!gemini) return;
        setIsAutoGenerating(true);
        let currentExp = { ...activeExperiment };
    
        for (let i = startStep; i <= WORKFLOW_STEPS.length; i++) {
            if (currentExp.stepData[i]?.output) continue;
    
            setActiveStep(i);
            setIsLoading(true);
            await new Promise(resolve => setTimeout(resolve, 500)); // allow UI to update
            
            try {
                let resultText;
                let currentStepData = { ...(currentExp.stepData[i] || {}) };

                if (i === 10) {
                     const dummyLog = (agent: string, msg: string) => console.log(`[AutoRun Step 10] ${agent}: ${msg}`);
                     resultText = await runPublicationAgent({ experiment: currentExp, gemini, updateLog: dummyLog });
                     currentStepData = { ...currentStepData, output: resultText };
                
                } else if (i === 2) { // Use the agent for literature review
                    const dummyLog = (agent: string, msg: string) => console.log(`[AutoRun Step 2] ${agent}: ${msg}`);
                    resultText = await runLiteratureReviewAgent({ experiment: currentExp, gemini, updateLog: dummyLog });
                    currentStepData = { ...currentStepData, output: resultText };

                } else if (i === 6) {
                    const context = getStepContext(currentExp, 6);
                    const { basePrompt, config } = getPromptForStep(6, '', context, {});
                    const response = await callGeminiWithRetry(gemini, 'gemini-flash-lite-latest', { contents: basePrompt, config });
                    const [summary, csv] = response.text.split('---').map(s => s.trim());
                    if (!summary || !csv) throw new Error("AI response format was incorrect for data synthesis.");

                    currentStepData = { ...currentStepData, output: summary, summary, input: csv };
                    if (!currentExp.stepData[7]) currentExp.stepData[7] = {};
                    currentExp.stepData[7].input = csv;
                } else if (i === 7) {
                    const csvData = currentExp.stepData[i]?.input;
                    if (!csvData) throw new Error("No CSV data found for Step 7 analysis during automation.");

                    const callAgentForAutomation = async (model: string, params: any) => {
                        const response = await callGeminiWithRetry(gemini, model, params);
                        await new Promise(resolve => setTimeout(resolve, 4000));
                        return response.text.trim();
                    };

                    // Phase 1: Planning
                    const dataLines = csvData.split('\n');
                    const headers = dataLines[0];
                    const sampleData = dataLines.slice(0, 6).join('\n');
                    const managerPrompt = `You are a senior data scientist AI agent. Your task is to analyze the headers and a sample of a provided CSV dataset to create a robust analysis plan.
**Dataset Analysis:**
1.  **Identify Data Types:** Examine the column headers and sample data to distinguish between categorical columns and numerical columns.
2.  **Propose Visualizations:** Based on your analysis, devise a plan for 2 to 3 distinct and meaningful visualizations.
3.  **Prioritize Comparisons and Relationships:** Your plan should prioritize:
    *   **Bar charts** for comparing a numerical value across different categories.
    *   **Scatter plots** for exploring the relationship between two numerical values.
    *   **Line charts** for showing a numerical value over a continuous variable (like time, if applicable).
**Your Output:**
You must generate a single, valid JSON object that conforms to the required schema. This JSON object will contain a "plan" which is an array of visualization plans.
For each visualization in the plan, you must provide:
-   \`chartType\`: A string, must be one of 'bar', 'line', or 'scatter'.
-   \`goal\`: A highly specific, one-sentence instruction for a "Doer" agent.
-   \`columns\`: An array of the exact column names from the CSV required to create the chart.
**Dataset Headers:** ${headers}
**Dataset Field:** ${currentExp.field}
**Dataset Sample (first 5 rows):**
\`\`\`csv
${sampleData}
\`\`\``;
                    const planResponse = await callAgentForAutomation('gemini-2.5-flash', {
                        contents: managerPrompt,
                        config: { responseMimeType: 'application/json', responseSchema: ANALYSIS_PLAN_SCHEMA }
                    });
                    const analysisPlan = JSON.parse(planResponse).plan;
                    if (!analysisPlan || analysisPlan.length === 0) throw new Error("Manager agent failed to produce a valid analysis plan during automation.");
                    
                    // Phase 2: Execution
                    let successfulCharts = [];
                    for (const chartPlan of analysisPlan) {
                        let chartJson = '';
                        let success = false;
                        for(let attempt = 0; attempt < 3; attempt++) {
                            const doerPrompt = `You are a "Doer" AI agent that specializes in creating Chart.js JSON configurations from CSV data.
**CRITICAL INSTRUCTIONS:**
1.  **Parse Data Carefully:** The provided CSV data is your source of truth.
2.  **Execute the Goal:** You must precisely follow the \`goal\`. This may require calculations like filtering, grouping, and averaging.
3.  **Handle Bad Data:** When processing columns for numerical data, if you encounter non-numeric values (e.g., "N/A"), you MUST ignore that entire row for your calculation.
4.  **Output Format:** Your final output must be ONLY the raw JSON object that conforms to the schema.
5.  **Chart-Specific Data Structures:** For 'bar'/'line', \`data.datasets[0].data\` must be an array of numbers and \`data.labels\` must be an array of strings. For 'scatter', \`data.datasets[0].data\` must be an array of objects like \`{x: number, y: number}\`.
**Your Task:**
*   **Goal:** "${chartPlan.goal}"
*   **Chart Type:** "${chartPlan.chartType}"
*   **Required Columns:** ${JSON.stringify(chartPlan.columns)}
*   **Full CSV Data:**
    \`\`\`csv
    ${csvData}
    \`\`\``;
                            const doerResponse = await callAgentForAutomation('gemini-2.5-flash', {
                                contents: doerPrompt,
                                config: { responseMimeType: 'application/json', responseSchema: CHART_JS_SCHEMA }
                            });
                            if (isChartJsonValid(doerResponse, chartPlan.chartType)) {
                                chartJson = doerResponse;
                                success = true;
                                break;
                            }
                        }
                        if (success) successfulCharts.push(JSON.parse(chartJson));
                    }
                    
                    // Phase 3: Synthesis
                    const summarizerPrompt = `You are a scientific communication AI agent. Write a detailed summary and interpretation of a data analysis for a research project in ${currentExp.field}.
**Your Summary Must:**
1.  If visualizations are provided, systematically discuss the findings from each one. Refer to them as Figure 1, Figure 2, etc.
2.  If NO visualizations are provided, you MUST perform a detailed textual analysis of the raw data directly.
3.  Conclude with an overall interpretation of what the results mean.
**Original Analysis Plan:**
${JSON.stringify(analysisPlan, null, 2)}
**Successfully Generated Charts (as JSON):**
${JSON.stringify(successfulCharts, null, 2)}
**Raw CSV Data:**
\`\`\`csv
${csvData}
\`\`\`
Your output must be in Markdown format.`;
                    const finalSummary = await callAgentForAutomation('gemini-2.5-flash', { contents: summarizerPrompt });

                    // Final Assembly
                    resultText = JSON.stringify({ summary: finalSummary, chartSuggestions: successfulCharts });
                    const logSummary = `Generated ${successfulCharts.length}/${analysisPlan.length} planned visualizations.`;
                    currentStepData = { ...currentStepData, output: resultText, suggestedInput: logSummary };
                } else {
                    const context = getStepContext(currentExp, i);
                    const userInput = currentExp.stepData[i]?.input || 'Proceed with generation.';
                    const { basePrompt, config } = getPromptForStep(i, userInput, context, {});
                    const response = await callGeminiWithRetry(gemini, 'gemini-flash-lite-latest', { contents: basePrompt, config });
                    resultText = response.text;
                    currentStepData = { ...currentStepData, output: resultText };
                }
                currentExp.stepData[i] = currentStepData;

                // Summarize and complete the step
                await new Promise(resolve => setTimeout(resolve, 500)); // Add a small delay before summarizing
                let summaryText = '';
                const stepOutput = currentExp.stepData[i].output;

                if (i === 1) { // Special for step 1
                    try {
                        const parsed = JSON.parse(stepOutput.replace(/```json/g, '').replace(/```/g, '').trim());
                        summaryText = parsed.research_question || 'Research question formulated.';
                    } catch {
                        summaryText = 'Research question step completed, but could not be auto-summarized.';
                    }
                } else if (i === 2 || i === 7) { // Special for JSON steps 2 and 7
                    try {
                        const parsed = JSON.parse(stepOutput.replace(/```json/g, '').replace(/```/g, '').trim());
                        const textToSummarize = parsed.summary;
                        if (textToSummarize) {
                            const summaryPrompt = `Concisely summarize the following text in 1-2 sentences for a project log:\n\n${textToSummarize}`;
                            const summaryResponse = await callGeminiWithRetry(gemini, 'gemini-flash-lite-latest', { contents: summaryPrompt });
                            summaryText = summaryResponse.text;
                        } else {
                            summaryText = `Step ${i} completed, but the generated summary was empty.`;
                        }
                    } catch {
                        summaryText = `Step ${i} completed, but the output format was invalid.`;
                    }
                } else { // Fallback for all other steps
                    const summaryPrompt = `Concisely summarize the following text in 1-2 sentences for a project log:\n\n${stepOutput}`;
                    const summaryResponse = await callGeminiWithRetry(gemini, 'gemini-flash-lite-latest', { contents: summaryPrompt });
                    summaryText = summaryResponse.text;
                }
                
                currentExp.stepData[i].summary = summaryText;
                currentExp.currentStep = i < WORKFLOW_STEPS.length ? i + 1 : WORKFLOW_STEPS.length + 1;
    
                await updateExperiment(currentExp); // Save after each step
                
                setIsLoading(false); // Stop loading for this step
                await new Promise(resolve => setTimeout(resolve, 2000)); // Pause to show result
    
            } catch (error) {
                addToast(parseGeminiError(error, `Automation failed at Step ${i}.`), 'danger');
                setIsLoading(false);
                setIsAutoGenerating(false);
                return; 
            }
        }
        addToast("Automated generation complete!", "success");
        setIsAutoGenerating(false);
    }, [gemini, activeExperiment, updateExperiment, addToast]);
    

    const handleGenerate = async (regenerateFeedback = '') => {
        if (!gemini) {
            addToast("Gemini AI is not available.", "danger");
            return;
        }

        const isRerunning = activeStep < activeExperiment.currentStep;
        let experimentToProcess = { ...experimentRef.current };

        if (isRerunning) {
            const confirmed = window.confirm(
                "You are about to re-run a previous step. This will clear all progress from subsequent steps and reset your progress to this point. Are you sure you want to continue?"
            );
            if (!confirmed) return;

            const newStepData = { ...experimentToProcess.stepData };
            for (let i = activeStep + 1; i <= WORKFLOW_STEPS.length; i++) {
                delete newStepData[i];
            }
             // Also clear the output of the current step to force regeneration
            if (newStepData[activeStep]) {
                delete newStepData[activeStep].output;
                delete newStepData[activeStep].summary;
            }

            experimentToProcess = {
                ...experimentToProcess,
                stepData: newStepData,
                currentStep: activeStep,
            };
            
            await updateExperiment(experimentToProcess);
            setActiveExperiment(experimentToProcess); // Immediately update UI
            experimentRef.current = experimentToProcess; // Update ref
        }
        
        setIsLoading(true);

        const currentStepData = experimentToProcess.stepData[activeStep] || {};
        const context = getStepContext(experimentToProcess, activeStep);
        const { basePrompt, expectJson, config } = getPromptForStep(
            activeStep,
            currentStepData.input || '',
            context,
            fineTuneSettings,
            regenerateFeedback
        );
        
        const logToast = (msg: string) => addToast(msg, 'info');

        if (expectJson) {
            try {
                const response = await callGeminiWithRetry(gemini, 'gemini-2.5-flash', { contents: basePrompt, config }, logToast);
                const finalOutput = response.text;
                const finalStepData = {
                    ...currentStepData,
                    output: finalOutput,
                    provenance: [...(currentStepData.provenance || []), { timestamp: new Date().toISOString(), prompt: basePrompt, config, output: finalOutput }]
                };
                await updateExperiment({ ...experimentRef.current, stepData: { ...experimentRef.current.stepData, [activeStep]: finalStepData } });
            } catch (error) {
                const errorOutput = `Error: ${parseGeminiError(error)}`;
                addToast(parseGeminiError(error), 'danger');
                const finalStepData = { ...currentStepData, output: errorOutput };
                await updateExperiment({ ...experimentRef.current, stepData: { ...experimentRef.current.stepData, [activeStep]: finalStepData } });
            } finally {
                setIsLoading(false);
            }
        } else { // Streaming Logic
            let finalOutput = '';
            try {
                const stream = await callGeminiStreamWithRetry(gemini, 'gemini-2.5-flash', { contents: basePrompt, config }, logToast);
                let buffer = '';
                for await (const chunk of stream) {
                    buffer += chunk.text;
                    setActiveExperiment(exp => ({ ...exp, stepData: { ...exp.stepData, [activeStep]: { ...(exp.stepData[activeStep] || {}), output: buffer } } }));
                }
                finalOutput = buffer;
            } catch (error) {
                finalOutput = `Error: ${parseGeminiError(error)}`;
                addToast(parseGeminiError(error), 'danger');
            } finally {
                const latestExperiment = experimentRef.current;
                const finalStepData = {
                    ...(latestExperiment.stepData[activeStep] || {}),
                    output: finalOutput, 
                    provenance: [...((latestExperiment.stepData[activeStep] || {}).provenance || []), { timestamp: new Date().toISOString(), prompt: basePrompt, config, output: finalOutput }]
                };
                await updateExperiment({ ...latestExperiment, stepData: { ...latestExperiment.stepData, [activeStep]: finalStepData } });
                setIsLoading(false);
            }
        }
    };
    
    const handleCompleteStep = async () => {
        // FIX: Add a guard to prevent this function from running for Step 10.
        // The PublicationExporter component handles its own completion logic,
        // and a stale call here was causing a navigation bug.
        if (activeStep === 10) {
            return;
        }

        if (isLoading || !stepData.output) return;

        setIsLoading(true);
        try {
            let summaryText = '';

            // Robustly create a short summary for the step's log entry.
            if (activeStep === 1) { // Special handling for Step 1 to avoid an AI call
                if (stepData.output) {
                    try {
                        const parsedOutput = JSON.parse(stepData.output.replace(/```json/g, '').replace(/```/g, '').trim());
                        summaryText = parsedOutput.research_question || "Research question formulated.";
                    } catch (e) {
                        console.error("Could not parse Step 1 output for summary. Using fallback.", e);
                        summaryText = "Research question formulated, but could not be auto-summarized.";
                    }
                } else {
                    summaryText = "Research question step completed without an output.";
                }
            } else if (activeStep === 7 || activeStep === 2) { // Handle JSON steps
                if (activeStep === 7 && stepData.suggestedInput) {
                    // For Step 7, we pre-generated a concise summary (the 'goal') during the agentic run.
                    // Use it directly to avoid a redundant and potentially slow API call.
                    summaryText = stepData.suggestedInput;
                } else if (stepData.output) {
                    try {
                        const parsedOutput = JSON.parse(stepData.output.replace(/```json/g, '').replace(/```/g, '').trim());
                        const textToSummarize = parsedOutput.summary;
                        if (textToSummarize && typeof textToSummarize === 'string') {
                            const summaryPrompt = `Concisely summarize the following text in 1-2 sentences for a project log:\n\n${textToSummarize}`;
                            const summaryResponse = await callGeminiWithRetry(gemini, 'gemini-2.5-flash', { contents: summaryPrompt });
                            summaryText = summaryResponse.text;
                        } else {
                            summaryText = "Analysis completed, but the generated summary was empty.";
                        }
                    } catch (e) {
                        console.error(`Could not parse Step ${activeStep} output. Using a fallback summary.`, e);
                        summaryText = `Step ${activeStep} was completed, but the output format was invalid.`;
                    }
                } else {
                    summaryText = `Step ${activeStep} was completed without generating an output.`;
                }
            } else {
                // For all other steps, summarize the direct output.
                const summaryPrompt = `Concisely summarize the following text in 1-2 sentences for a project log:\n\n${stepData.output}`;
                const summaryResponse = await callGeminiWithRetry(gemini, 'gemini-2.5-flash', { contents: summaryPrompt });
                summaryText = summaryResponse.text;
            }
            
            const updatedStepData = { ...activeExperiment.stepData,
                [activeStep]: { ...stepData, summary: summaryText }
            };

            const nextStep = activeStep < WORKFLOW_STEPS.length ? activeStep + 1 : WORKFLOW_STEPS.length + 1;

            const updatedExperiment = {
                ...activeExperiment,
                stepData: updatedStepData,
                currentStep: nextStep
            };
            
            if(activeStep === 6 && stepData.input){ // pass data from exp runner to analyzer
                updatedExperiment.stepData[7] = {...updatedExperiment.stepData[7], input: stepData.input};
            }
            
            await updateExperiment(updatedExperiment);

        } catch (error) {
            addToast(parseGeminiError(error, "Failed to generate summary."), 'danger');
        } finally {
            setIsLoading(false);
        }
    };
    
    // Renders the main content for the current step
    const renderStepContent = () => {
        if (activeStep > WORKFLOW_STEPS.length) {
            return <ProjectCompletionView />;
        }

        const stepInfo = WORKFLOW_STEPS[activeStep - 1];

        if (!stepInfo) return <div>Error: Step not found.</div>;
        
        // After step 1, show the automation mode selector if not yet chosen
        if (activeExperiment.currentStep > 1 && activeExperiment.automationMode === null && !isAutoGenerating) {
            return <AutomationModeSelector onSelect={(mode) => {
                const updated = {...activeExperiment, automationMode: mode};
                updateExperiment(updated);
                if (mode === 'automated') {
                    runAutomationSequence(activeExperiment.currentStep);
                }
            }} />;
        }
        
        return (
            <div>
                <h4 className="fw-bold">{stepInfo.id}. {stepInfo.title}</h4>
                <p className="text-white-50">{stepInfo.description}</p>
                <hr />

                {/* Specific UI for certain steps */}
                {activeStep === 1 && <EditableStepInput stepId={1} />}
                {activeStep === 2 && <LiteratureReviewWorkspace onStepComplete={handleCompleteStep} />}
                {activeStep === 6 && <ExperimentRunner onStepComplete={handleCompleteStep} />}
                {activeStep === 7 && <DataAnalysisWorkspace onStepComplete={handleCompleteStep} />}
                {activeStep === 10 && <PublicationExporter />}

                {/* Default UI for text-based steps */}
                {activeStep !== 2 && activeStep !== 6 && activeStep !== 7 && activeStep !== 10 && (
                    <GeneratedOutput
                        key={activeExperiment.id + '-' + activeStep} // Force re-render on step change
                        stepId={activeStep}
                        onGenerate={handleGenerate}
                        isLoading={isLoading}
                    />
                )}
            </div>
        );
    };

    return (
        <div className="row">
            <div className="col-lg-3">
                 <div className="card sticky-top" style={{top: '80px'}}>
                    <div className="card-header fw-bold">{activeExperiment.title}</div>
                     <ul className="list-group list-group-flush">
                        {WORKFLOW_STEPS.map(step => (
                             <li
                                key={step.id}
                                className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${activeStep === step.id ? 'active' : ''} ${step.id > activeExperiment.currentStep ? 'disabled' : ''}`}
                                onClick={() => handleStepChange(step.id)}
                                style={{cursor: step.id > activeExperiment.currentStep || isAutoGenerating ? 'not-allowed' : 'pointer'}}
                            >
                                <span>{step.id}. {step.title}</span>
                                 {isAutoGenerating && activeStep === step.id && <div className="spinner-border spinner-border-sm" role="status"></div>}
                                {activeExperiment.currentStep > step.id && <i className="bi bi-check-circle-fill text-success"></i>}
                            </li>
                        ))}
                    </ul>
                 </div>
            </div>
            <div className="col-lg-9">
                <div className="card">
                    <div className="card-body" style={{minHeight: '70vh'}}>
                        {isAutoGenerating && (
                            <div className="alert alert-info d-flex align-items-center">
                                <div className="spinner-border spinner-border-sm me-2" role="status"></div>
                                <span>Automated generation in progress... Now working on Step {activeStep}: {WORKFLOW_STEPS[activeStep - 1]?.title}.</span>
                            </div>
                        )}
                        {renderStepContent()}
                    </div>
                    {activeStep <= WORKFLOW_STEPS.length && activeExperiment.automationMode !== 'automated' && !isAutoGenerating && activeStep !== 2 && activeStep !== 6 && activeStep !== 7 && activeStep !== 10 && (
                         <div className="card-footer d-flex justify-content-between align-items-center bottom-nav">
                             <div>
                                <button className="btn btn-secondary me-2" onClick={() => setFineTuneModalOpen(true)}>
                                    <i className="bi bi-sliders me-1"></i> Fine-Tune AI
                                </button>
                             </div>
                             <button 
                                className="btn btn-success" 
                                onClick={handleCompleteStep} 
                                disabled={isLoading || !stepData?.output}>
                                 <i className="bi bi-check-circle-fill me-1"></i> Complete Step & Continue
                             </button>
                         </div>
                    )}
                </div>
            </div>
             {fineTuneModalOpen && (
                <FineTuneModal
                    stepId={activeStep}
                    onClose={() => setFineTuneModalOpen(false)}
                />
            )}
        </div>
    );
};