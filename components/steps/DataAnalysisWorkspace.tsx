

import React, { useState, useCallback, useEffect } from 'react';
import { useExperiment } from '../../services';
import { useToast } from '../../toast';
import { parseGeminiError, callGeminiWithRetry } from '../../services';
import { ANALYSIS_PLAN_SCHEMA, CHART_JS_SCHEMA } from '../../config';
import { GeneratedOutput } from '../common/GeneratedOutput';
import { AgenticAnalysisView } from '../common/AgenticAnalysisView';


export const DataAnalysisWorkspace = ({ onStepComplete }) => {
    const { activeExperiment, updateExperiment, gemini } = useExperiment();
    const { addToast } = useToast();
    const [agenticRun, setAgenticRun] = useState({
        status: 'idle', // 'idle', 'running', 'success', 'failed'
        iterations: 0,
        maxIterations: 1, // Will be updated by plan
        logs: [],
    });

    const stepData = activeExperiment.stepData[7] || {};

    const performAgenticAnalysis = useCallback(async () => {
        if (!gemini || !stepData.input) {
            addToast("Gemini not available or no data to analyze.", "danger");
            return;
        }

        setAgenticRun({ status: 'running', logs: [], iterations: 0, maxIterations: 1 });
        const logCallback = (agent: string, message: string) => setAgenticRun(prev => ({...prev, logs: [...prev.logs, { agent, message }]}));
        
        const callAgentWithLog = async (agentName: string, model: string, params: any) => {
            logCallback(agentName, 'is thinking...');
            const retryLog = (msg: string) => logCallback('System', `[${agentName}] ${msg}`);
            const response = await callGeminiWithRetry(gemini, model, params, retryLog);
            const result = response.text.trim();
            logCallback(agentName, 'has completed its task.');
            await new Promise(resolve => setTimeout(resolve, 2000)); // Proactive delay
            return result;
        };
        
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

        try {
            // PHASE 1: PLANNING
            logCallback('System', '--- Phase 1: Analysis Planning ---');
            const dataLines = stepData.input.split('\n');
            const headers = dataLines[0];
            const sampleData = dataLines.slice(0, 6).join('\n'); // Header + 5 rows

            const managerPrompt = `You are a senior data scientist AI agent. Your task is to analyze the headers and a sample of a provided CSV dataset to create a robust analysis plan.

**Dataset Analysis:**
1.  **Identify Data Types:** Examine the column headers and sample data to distinguish between categorical columns (e.g., names, groups, categories) and numerical columns (e.g., measurements, counts, scores).
2.  **Propose Visualizations:** Based on your analysis, devise a plan for 2 to 3 distinct and meaningful visualizations. Aim for 3 if the data's complexity and richness support it, otherwise 2 is sufficient.
3.  **Prioritize Comparisons and Relationships:** Your plan should prioritize:
    *   **Bar charts** for comparing a numerical value across different categories.
    *   **Scatter plots** for exploring the relationship between two numerical values.
    *   **Line charts** for showing a numerical value over a continuous variable (like time, if applicable).

**Your Output:**
You must generate a single, valid JSON object that conforms to the required schema. This JSON object will contain a "plan" which is an array of visualization plans.

For each visualization in the plan, you must provide:
-   \`chartType\`: A string, must be one of 'bar', 'line', or 'scatter'.
-   \`goal\`: A highly specific, one-sentence instruction for a "Doer" agent. This instruction must be clear enough for another AI to execute. It should specify the exact aggregation to perform (e.g., "average", "total") and any filtering required (e.g., "for the 'Aged' model only").
-   \`columns\`: An array of the exact column names from the CSV required to create the chart.

**Dataset Headers:** ${headers}
**Dataset Field:** ${activeExperiment.field}
**Dataset Sample (first 5 rows):**
\`\`\`csv
${sampleData}
\`\`\``;
            const planResponse = await callAgentWithLog('Manager', 'gemini-2.5-flash', {
                contents: managerPrompt,
                config: { responseMimeType: 'application/json', responseSchema: ANALYSIS_PLAN_SCHEMA }
            });
            const analysisPlan = JSON.parse(planResponse).plan;
            if (!analysisPlan || analysisPlan.length === 0) throw new Error("Manager agent failed to produce a valid analysis plan.");
            
            setAgenticRun(prev => ({ ...prev, maxIterations: analysisPlan.length }));
            logCallback('Manager', `Analysis plan created with ${analysisPlan.length} visualizations.`);

            // PHASE 2: EXECUTION
            logCallback('System', '--- Phase 2: Chart Generation ---');
            let successfulCharts = [];
            for (const chartPlan of analysisPlan) {
                setAgenticRun(prev => ({...prev, iterations: prev.iterations + 1 }));
                logCallback('System', `Attempting to generate: ${chartPlan.goal}`);
                let chartJson = '';
                let success = false;
                for(let attempt = 0; attempt < 3; attempt++) {
                    if (attempt > 0) logCallback('Doer', `Retrying generation (attempt ${attempt + 1})...`);
                    const doerPrompt = `You are a "Doer" AI agent that specializes in creating Chart.js JSON configurations from CSV data. Your sole purpose is to execute a given instruction and generate a single, valid JSON object.

**CRITICAL INSTRUCTIONS:**
1.  **Parse Data Carefully:** The provided CSV data is your source of truth. The first row is always the header.
2.  **Execute the Goal:** You must precisely follow the \`goal\` provided. This may require you to perform calculations like filtering, grouping, and averaging the data from the specified \`columns\`.
3.  **Handle Bad Data:** When processing columns for numerical data, if you encounter non-numeric values (e.g., "N/A", "", null), you MUST ignore that entire row for your calculation. Do not treat it as zero.
4.  **Output Format:** Your final output must be ONLY the raw JSON object that conforms to the schema. Do not include any text, explanations, or markdown fences (\`\`\`json\`\`\`).
5.  **Chart-Specific Data Structures:**
    *   For **'bar'** and **'line'** charts, the \`data.datasets[0].data\` property must be an array of numbers. The \`data.labels\` property must be an array of corresponding strings.
    *   For **'scatter'** charts, the \`data.datasets[0].data\` property must be an array of objects, where each object is \`{x: number, y: number}\`. You do not need to provide \`data.labels\` for scatter plots.

**Your Task:**
*   **Goal:** "${chartPlan.goal}"
*   **Chart Type:** "${chartPlan.chartType}"
*   **Required Columns:** ${JSON.stringify(chartPlan.columns)}
*   **Full CSV Data:**
    \`\`\`csv
    ${stepData.input}
    \`\`\``;
                    const doerResponse = await callAgentWithLog('Doer', 'gemini-2.5-flash', {
                        contents: doerPrompt,
                        config: { responseMimeType: 'application/json', responseSchema: CHART_JS_SCHEMA }
                    });
                    if (isChartJsonValid(doerResponse, chartPlan.chartType)) {
                        chartJson = doerResponse;
                        success = true;
                        break;
                    }
                }
                if (success) {
                    successfulCharts.push(JSON.parse(chartJson));
                    logCallback('System', `Successfully generated chart for: ${chartPlan.goal}`);
                } else {
                    logCallback('System', `Failed to generate a valid chart for: "${chartPlan.goal}" after 3 attempts. Moving on.`);
                }
            }
            
            if (successfulCharts.length === 0) {
                 logCallback('System', 'Warning: The Doer agent failed to generate any valid charts. The summarizer will analyze the raw data directly.');
            }

            // PHASE 3: SYNTHESIS
            logCallback('System', '--- Phase 3: Final Summary ---');
            const summarizerPrompt = `You are a scientific communication AI agent. Your task is to write a detailed, comprehensive summary and interpretation of a data analysis for a research project in the field of ${activeExperiment.field}.

You have been provided with the original analysis plan, any successfully generated charts (as Chart.js JSON), and the raw data.

**Your Summary Must:**
1.  Start with a brief overview of the dataset's structure.
2.  If visualizations are provided, systematically discuss the findings from each one. Refer to them as Figure 1, Figure 2, etc. For each figure, explain what was plotted and what the key insight or trend is.
3.  **If NO visualizations are provided, you MUST perform a detailed textual analysis of the raw data directly.** Describe any observable trends, correlations, or important statistical points based on the raw numbers.
4.  Conclude with an overall interpretation of what the results mean in the context of the research field.
5.  If any charts from the original plan failed to generate, you must mention that the analysis for that aspect could not be completed visually.

**Original Analysis Plan:**
${JSON.stringify(analysisPlan, null, 2)}

**Successfully Generated Charts (as JSON):**
${JSON.stringify(successfulCharts, null, 2)}

**Raw CSV Data:**
\`\`\`csv
${stepData.input}
\`\`\`

Your output must be in Markdown format.`;
            const finalSummary = await callAgentWithLog('Summarizer', 'gemini-2.5-flash', { contents: summarizerPrompt });

            // Final Assembly
            const finalOutput = JSON.stringify({ summary: finalSummary, chartSuggestions: successfulCharts });
            const logSummary = `Generated ${successfulCharts.length}/${analysisPlan.length} planned visualizations.`;
            const finalStepData = { ...stepData, output: finalOutput, suggestedInput: logSummary };
            await updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, 7: finalStepData } });
            setAgenticRun(prev => ({ ...prev, status: 'success' }));
            addToast("Agentic analysis complete!", "success");

        } catch (error) {
            const errorMessage = parseGeminiError(error, `Agentic workflow failed.`);
            addToast(errorMessage, 'danger');
            logCallback('System', `FATAL ERROR: ${error.message}. The workflow will now generate a fallback summary.`);
            setAgenticRun(prev => ({ ...prev, status: 'running' })); // Keep it 'running' while we generate fallback

            try {
                // Generate a fallback summary
                const fallbackPrompt = `An error occurred while trying to analyze and visualize the following data. Please provide a basic textual summary of the data. Start the summary by stating: "An error prevented the generation of visualizations. However, a basic analysis of the data reveals the following:"\n\nData:\n${stepData.input}`;
                const fallbackSummary = await callAgentWithLog('Summarizer', 'gemini-2.5-flash', { contents: fallbackPrompt });

                // Assemble and save the fallback output
                const finalOutput = JSON.stringify({ summary: fallbackSummary, chartSuggestions: [] });
                const logSummary = `Workflow failed, but a fallback summary was generated.`;
                const finalStepData = { ...stepData, output: finalOutput, suggestedInput: logSummary };
                await updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, 7: finalStepData } });
                setAgenticRun(prev => ({ ...prev, status: 'success' })); // Now set to success as it's recoverable
                addToast("Workflow failed, but a fallback summary was created. You can now proceed.", "success");
            } catch (fallbackError) {
                // If even the fallback fails, save a hardcoded error message
                const finalErrorMessage = `A critical error occurred during the analysis, and a fallback summary could not be generated. Error: ${error.message}. Fallback Error: ${fallbackError.message}`;
                const finalOutput = JSON.stringify({ summary: finalErrorMessage, chartSuggestions: [] });
                const finalStepData = { ...stepData, output: finalOutput };
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
