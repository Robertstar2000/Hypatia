



import React, { useState, useCallback, useEffect } from 'react';
import { Chart } from 'chart.js';
import { useExperiment } from '../../services';
import { useToast } from '../../toast';
import { getStepContext, parseGeminiError, callGeminiWithRetry } from '../../services';
import { QA_AGENT_SCHEMA, CHART_JS_SCHEMA, ANALYSIS_DECISION_SCHEMA } from '../../config';
import { GeneratedOutput } from '../common/GeneratedOutput';
import { AgenticAnalysisView } from '../common/AgenticAnalysisView';


export const DataAnalysisWorkspace = ({ onStepComplete }) => {
    const { activeExperiment, updateExperiment, gemini } = useExperiment();
    const { addToast } = useToast();
    const [agenticRun, setAgenticRun] = useState({
        status: 'idle', // 'idle', 'running', 'success', 'failed'
        iterations: 0,
        maxIterations: 25,
        logs: [],
    });

    const stepData = activeExperiment.stepData[7] || {};

    const performAgenticAnalysis = useCallback(async () => {
        if (!gemini) {
            addToast("Gemini not available", "danger");
            return;
        }

        setAgenticRun(prev => ({ ...prev, status: 'running', logs: [], iterations: 0 }));
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

        try {
            // Step 1: Analyst Agent makes a decision
            const decisionPrompt = `You are an expert Analyst agent in the field of ${activeExperiment.field}. Your task is to analyze the following CSV data and decide the single best way to visualize the primary finding. Your choice must be either 'chart' or 'table'. You must also provide a concise 'goal' for the visualization. Your response must be a single, valid JSON object.\n\nData:\n\`\`\`csv\n${stepData.input}\n\`\`\``;
            const decisionResponse = await callAgentWithLog('Analyst', 'gemini-flash-lite-latest', {
                contents: decisionPrompt,
                config: { responseMimeType: 'application/json', responseSchema: ANALYSIS_DECISION_SCHEMA }
            });
            const decision = JSON.parse(decisionResponse);
            logCallback('Analyst', `Decision: ${decision.analysis_type}. Goal: "${decision.goal}"`);

            let visualizationOutput = '';
            let chartSuggestions = [];

            // Step 2: Branch based on decision
            if (decision.analysis_type === 'chart') {
                logCallback('System', 'Chart generation workflow initiated.');
                let lastQAFeedback = "No feedback yet. This is the first attempt.";

                for (let i = 0; i < agenticRun.maxIterations; i++) {
                    setAgenticRun(prev => ({...prev, iterations: i + 1, logs: [...prev.logs, {agent: 'System', message: `--- Charting Iteration ${i+1} ---`}]}));
                    
                    const managerInstruction = await callAgentWithLog('Manager', 'gemini-flash-lite-latest', { contents: `You are the Manager Agent. The goal is: "${decision.goal}". Last QA feedback: "${lastQAFeedback}". Provide a new, concise instruction for the Doer agent to create a Chart.js JSON configuration.` });
                    logCallback('Manager', managerInstruction);
                    
                    const doerJson = await callAgentWithLog('Doer', 'gemini-flash-lite-latest', {
                        contents: `You are the Doer. You ONLY generate Chart.js JSON for 'bar' or 'line' charts. Your instruction is: "${managerInstruction}". The data is: \`\`\`csv\n${stepData.input}\n\`\`\`. Output ONLY the raw JSON.`,
                        config: { responseMimeType: 'application/json', responseSchema: CHART_JS_SCHEMA }
                    });
                    logCallback('Doer', 'Generated new chart configuration.');
                    
                    try {
                        JSON.parse(doerJson); // Quick local validation
                        const qaResponse = await callAgentWithLog('QA', 'gemini-flash-lite-latest', {
                            contents: `You are the QA Agent. Goal: "${decision.goal}". Doer's JSON: \`\`\`json\n${doerJson}\n\`\`\`. Does this perfectly fulfill the goal? Your response must be a valid JSON object with "pass" (boolean) and "feedback" (string).`,
                            config: { responseMimeType: 'application/json', responseSchema: QA_AGENT_SCHEMA }
                        });
                        const qaResult = JSON.parse(qaResponse);
                        lastQAFeedback = qaResult.feedback;
                        logCallback('QA', lastQAFeedback);
                        
                        if (qaResult.pass) {
                            visualizationOutput = doerJson;
                            chartSuggestions = [JSON.parse(doerJson)];
                            logCallback('System', 'Chart generation successful.');
                            break; // Exit loop on success
                        }
                    } catch (e) {
                        lastQAFeedback = `The generated output was not valid JSON. Error: ${e.message}. Please try again.`;
                        logCallback('QA', lastQAFeedback);
                    }
                }
                if (chartSuggestions.length === 0) throw new Error("Chart generation loop failed after multiple attempts.");

            } else { // Handle 'table'
                logCallback('System', 'Table generation workflow initiated.');
                const tablePrompt = `You are a Data Analyst. Your goal is to create a summary table based on this instruction: "${decision.goal}". Use the following CSV data to create a concise but informative table in Markdown format. Output ONLY the Markdown table.\n\nData:\n\`\`\`csv\n${stepData.input}\n\`\`\``;
                visualizationOutput = await callAgentWithLog('Table Generator', 'gemini-flash-lite-latest', { contents: tablePrompt });
                logCallback('Table Generator', 'Generated Markdown table.');
            }
            
            // Step 3: Final Summarizer Agent
            const summarizerPrompt = `You are an expert Data Analyst in the field of ${activeExperiment.field}. Based on the original CSV data and the following generated visualization, write a detailed, comprehensive summary and interpretation of the findings in Markdown format.\n\nVisualization:\n${visualizationOutput}\n\nOriginal Data:\n\`\`\`csv\n${stepData.input}\n\`\`\``;
            let finalSummary = await callAgentWithLog('Summarizer', 'gemini-2.5-flash', { contents: summarizerPrompt });

            // If a table was made, prepend it to the summary.
            if (decision.analysis_type === 'table') {
                finalSummary = `### Summary Table\n\n${visualizationOutput}\n\n### Analysis\n\n${finalSummary}`;
            }

            // Step 4: Assemble and Save
            const finalOutput = JSON.stringify({ summary: finalSummary, chartSuggestions: chartSuggestions });
            const finalStepData = { ...stepData, output: finalOutput };
            await updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, 7: finalStepData } });
            setAgenticRun(prev => ({ ...prev, status: 'success' }));
            addToast("Agentic analysis complete!", "success");

        } catch (error) {
            addToast(parseGeminiError(error, `Agentic workflow failed.`), 'danger');
            setAgenticRun(prev => ({ ...prev, status: 'failed' }));
        }

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