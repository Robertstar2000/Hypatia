





import { GoogleGenAI } from "@google/genai";
import {
    Experiment,
    FineTuneSettings,
    STEP_SPECIFIC_TUNING_PARAMETERS,
    DATA_ANALYZER_SCHEMA,
    LITERATURE_REVIEW_SCHEMA,
    // FIX: Removed STATISTICAL_METHODS_SCHEMA as it is not defined in config.ts and was used in deprecated code.
    RESEARCH_QUESTION_SCHEMA,
    WORKFLOW_STEPS,
    QA_AGENT_SCHEMA,
    CHART_JS_SCHEMA,
    ANALYSIS_DECISION_SCHEMA
} from './config';


// --- GEMINI API SERVICE ---

/**
 * Wraps any promise with a timeout.
 * @param geminiCall The promise to execute (e.g., a Gemini API call).
 * @param timeout The timeout in milliseconds.
 * @returns The result of the promise or throws a timeout error.
 */
const callGeminiWithTimeout = async (geminiCall: Promise<any>, timeout: number = 60000) => {
    return Promise.race([
        geminiCall,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Gemini API call timed out after ${timeout / 1000} seconds.`)), timeout)
        ),
    ]);
};


/**
 * A robust wrapper for Gemini API calls that includes exponential backoff for rate limiting and timeout errors.
 * @param gemini - The initialized GoogleGenAI instance.
 * @param model - The model name to use.
 * @param params - The parameters for the generateContent call.
 * @param onLog - An optional callback to log retry attempts.
 * @param maxRetries - The maximum number of retry attempts.
 * @returns The response from the Gemini API.
 */
export const callGeminiWithRetry = async (
    gemini: GoogleGenAI,
    model: string,
    params: any,
    onLog?: (message: string) => void,
    maxRetries = 5
) => {
    let attempt = 0;
    let delay = 2000; // Start with a 2-second delay
    while (attempt < maxRetries) {
        try {
            const response = await callGeminiWithTimeout(gemini.models.generateContent({ model, ...params }));
            return response;
        } catch (error) {
            const errorMessage = error.toString();
            const isRateLimitError = error.status === 'RESOURCE_EXHAUSTED' || errorMessage.includes('429') || errorMessage.toLowerCase().includes('too many requests');
            const isTimeoutError = errorMessage.includes('timed out');
            
            if ((isRateLimitError || isTimeoutError) && attempt < maxRetries - 1) {
                attempt++;
                const reason = isTimeoutError ? 'timed out' : 'rate limit hit';
                const logMessage = `Call ${reason}. Retrying in ${delay / 1000}s... (Attempt ${attempt}/${maxRetries-1})`;
                if (onLog) onLog(logMessage); else console.warn(logMessage);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            } else {
                throw error; // Rethrow for other errors or if max retries are reached
            }
        }
    }
    throw new Error("Max retries reached for Gemini API call.");
};

/**
 * A robust wrapper for Gemini API streaming calls that includes exponential backoff and timeouts.
 */
export const callGeminiStreamWithRetry = async (
    gemini: GoogleGenAI,
    model: string,
    params: any,
    onLog?: (message: string) => void,
    maxRetries = 5
) => {
    let attempt = 0;
    let delay = 2000;
    while (attempt < maxRetries) {
        try {
            const stream = await callGeminiWithTimeout(gemini.models.generateContentStream({ model, ...params }));
            return stream;
        } catch (error) {
            const errorMessage = error.toString();
            const isRateLimitError = error.status === 'RESOURCE_EXHAUSTED' || errorMessage.includes('429') || errorMessage.toLowerCase().includes('too many requests');
            const isTimeoutError = errorMessage.includes('timed out');
            
            if ((isRateLimitError || isTimeoutError) && attempt < maxRetries - 1) {
                attempt++;
                const reason = isTimeoutError ? 'timed out' : 'rate limit hit';
                const logMessage = `Streaming call ${reason}. Retrying in ${delay / 1000}s... (Attempt ${attempt}/${maxRetries-1})`;
                if (onLog) onLog(logMessage); else console.warn(logMessage);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
            } else {
                throw error;
            }
        }
    }
    throw new Error("Max retries reached for Gemini API streaming call.");
};


export const parseGeminiError = (error: any, fallbackMessage: string = "An unknown error occurred."): string => {
    console.error("Gemini API Error:", error);

    if (error?.message?.includes('Max retries reached')) {
        return 'The AI service is currently busy or unresponsive. The operation was automatically retried several times but failed. Please try again in a few moments.';
    }

    // Check for the structured error response from Gemini
    if (error?.error?.message) {
        const errorCode = error.error.code;
        const errorMessage = error.error.message;

        // Handle specific server-side 500 errors with a more user-friendly message
        if (errorCode === 500 || errorMessage.includes('Internal error')) {
            return 'The AI model encountered an internal error. This is usually a temporary issue. Please try again in a few moments.';
        }
        return errorMessage; // Return other specific messages from the API
    }
    
    // Fallback to checking string content for other types of errors (e.g., from the client library)
    const message = error?.message || '';
    if (message.includes('API key not valid')) {
        return 'API Key is not valid. Please check your key and try again.';
    }
    if (message.includes('429') || message.toLowerCase().includes('too many requests')) {
        return 'You have made too many requests in a short period. Please wait a moment and try again.';
    }
    if (message.includes('503')) { // Service Unavailable or internal server error from client library
        return 'The AI service is temporarily unavailable or experiencing issues. Please try again later.';
    }
    if (message.includes('fetch failed') || message.includes('NetworkError')) {
        return 'A network error occurred. Please check your internet connection.';
    }
    
    return fallbackMessage;
};


export const testApiKey = async (apiKey: string): Promise<boolean> => {
    if (!apiKey) return false;
    try {
        const testGemini = new GoogleGenAI({ apiKey });
        await callGeminiWithRetry(testGemini, 'gemini-2.5-flash', {
             contents: 'test',
             config: { thinkingConfig: { thinkingBudget: 0 } }
        }, undefined, 2);
        return true;
    } catch (error) {
        console.error("API Key validation failed:", error);
        return false;
    }
};


export const getStepContext = (experiment: Experiment, stepId: number): any => {
    const context: any = { experimentField: experiment.field };
    const data = experiment.stepData || {};

    const getStepSummary = (sId) => data[sId]?.summary || data[sId]?.output || 'N/A';
    const getFullOutput = (sId) => data[sId]?.output || 'N/A';

    // Build context using summaries for efficiency
    if (stepId > 1) context.question = getFullOutput(1); // The question should always be in full
    if (stepId > 2) context.literature_review_summary = getStepSummary(2);
    if (stepId > 3) context.hypothesis = getFullOutput(3); // Hypothesis is usually short, keep full
    if (stepId > 4) context.methodology_summary = getStepSummary(4);
    if (stepId > 5) context.data_collection_plan_summary = getStepSummary(5);
    if (stepId > 6) context.experiment_data_csv = data[6]?.input?.slice(0, 2000); // Send a preview of the data
    if (stepId > 7) context.analysis_summary = getStepSummary(7);
    if (stepId > 8) context.conclusion_summary = getStepSummary(8);


    // For the final steps (9, 10, and new deploy actions), create a concise log using summaries
    if (stepId >= 9) {
        let projectLog = '';
        for (let i = 1; i < Math.min(stepId, 10); i++) { // Only loop through the 10 main steps
            const stepInfo = WORKFLOW_STEPS.find(s => s.id === i);
            if (stepInfo) {
                // Use full output for Step 2 (Lit Review for references) and other recent steps, BUT NOT for step 7.
                // For Step 7, the summary is always more useful in a text log than the full JSON.
                let output = (i !== 7 && (i === 2 || stepId - i <= 2)) ? getFullOutput(i) : getStepSummary(i);
                
                if (i === 7 && data[7]?.output) {
                     // For step 7, we already have the summary, just add the note.
                     output += "\n[Note: Data visualizations were generated during this step.]";
                }
                projectLog += `--- Summary of Step ${i}: ${stepInfo.title} ---\n${output}\n\n`;
            }
        }
        context.full_project_summary_log = projectLog;
    }
    
    // For presentation generation, we need the final draft specifically
    if (stepId === 12) {
        context.publication_draft = getFullOutput(10);
    }

    return context;
};


export const getPromptForInputSuggestion = (stepId: number, context: any) => {
    const systemInstruction = `You are an AI research assistant. Your task is to propose a concise, well-formed input for the user for the upcoming step in their research project. The user will be able to edit this, so make it a strong starting point.`;
    const config = { systemInstruction };
    let basePrompt = "";

    switch (stepId) {
        case 1:
            basePrompt = `The user has started a new experiment in the field of ${context.experimentField}. Propose an initial research idea or topic for them to refine. For example: 'My research idea is to investigate the effects of plastic pollution on marine life.'`;
            break;
        case 3:
            basePrompt = `Based on the research question "${context.question}" and the literature review, propose a primary, testable hypothesis.`;
            break;
        case 4:
            basePrompt = `The current hypothesis is "${context.hypothesis}". Propose a suitable title or brief description for the methodology that will be designed to test it.`;
            break;
        case 7:
            basePrompt = null;
            break;
        default:
            basePrompt = null;
    }
    return { basePrompt, config };
};


export const getPromptForStep = (stepId: number, userInput: string, context: any, fineTuneSettings: FineTuneSettings, regenerationFeedback: string = '') => {
    let systemInstruction = `You are an expert AI research assistant specializing in ${context.experimentField || 'General Science'}. Your goal is to guide a user through the scientific method.`;
    const settings = fineTuneSettings || {};
    const params = STEP_SPECIFIC_TUNING_PARAMETERS[stepId] || [];
    const instructions = [];

    params.forEach(param => {
        const value = settings[param.name] ?? param.default;
        if (value === undefined) return;
        if (param.name === 'reviewerPersona') {
            systemInstruction += ` You must adopt the persona of a '${value}' peer reviewer.`;
        } else {
            instructions.push(`For the parameter '${param.label}', the value must be '${value}'.`);
        }
    });

    if (instructions.length > 0) {
        systemInstruction += ` Strictly adhere to the following tuning parameters: ${instructions.join(' ')}.`;
    }

    let basePrompt = "";
    let expectJson = false;
    const config: any = { systemInstruction, };
    
    if (settings.temperature) config.temperature = settings.temperature;
    if (settings.topP) config.topP = settings.topP;
    if (settings.topK) config.topK = settings.topK;

    if(regenerationFeedback) {
        basePrompt += `The user was not satisfied with the previous response. They have provided the following feedback: "${regenerationFeedback}". Please generate a new response that incorporates this feedback.\n\n---\n\nOriginal prompt follows:\n`;
    }

    switch (stepId) {
        case 1:
            expectJson = true;
            basePrompt += `The user's initial idea is: "${userInput}". Your tasks are to:
1. Formulate a clear, focused, and testable research question from this idea in the field of ${context.experimentField}.
2. Provide a 'uniqueness_score' from 0.0 to 1.0 and a 'justification'.

To determine the 'uniqueness_score', you MUST assess the density of existing, published information on the topic within your vast knowledge base. The score is inversely proportional to the amount of information available:
- If you find a VAST amount of information (the topic is foundational or extensively studied, like 'the effects of gravity'), the score must be very low, around 0.05.
- If you find essentially NO information (the idea is completely novel or a new intersection of fields), the score must be 1.0.
- If you find LITTLE information (the topic is niche, emerging, or has few studies), the score should be high (e.g., 0.8 or above).
- Use the full range between 0.05 and 1.0 to represent the spectrum of information density.

Your justification MUST briefly explain your reasoning for the score by referencing the density and type of information you found (or didn't find).

Your final output must be ONLY a single, raw JSON object that conforms to the required schema.`;
            config.responseMimeType = "application/json";
            config.responseSchema = RESEARCH_QUESTION_SCHEMA;
            break;
        case 2:
            // This step is now handled by the runLiteratureReviewAgent workflow.
            // This prompt is a fallback in case it's called directly, but it shouldn't be.
            basePrompt += `For the research question "${context.question}", conduct a literature review using your search tool.`;
            config.tools = [{ googleSearch: {} }];
            break;
        case 3:
            basePrompt += `Based on the research question: "${context.question}" and this literature review summary: "${context.literature_review_summary}", generate several distinct, testable hypotheses for the field of ${context.experimentField}. Present them clearly. The user's initial thought is: "${userInput}"`;
            break;
        case 4:
            basePrompt += `The chosen hypothesis is: "${context.hypothesis}". The user has provided the following input: "${userInput}". Design a detailed, step-by-step methodology to test this hypothesis, appropriate for the field of ${context.experimentField}.`;
            break;
        case 5:
            basePrompt += `Based on the designed methodology summary: "${context.methodology_summary}", create a detailed data collection plan appropriate for ${context.experimentField}. Specify variables, measurement techniques, and data recording format.`;
            break;
        case 6: // Synthesize Data
            basePrompt += `The user has chosen to synthesize data. Based on the methodology summary: "${context.methodology_summary}" and data plan summary: "${context.data_collection_plan_summary}", generate a plausible, estimated, synthetic dataset in CSV format that could have resulted from this experiment. This simulation should be realistic for an experiment in ${context.experimentField}. Output ONLY the CSV data and a brief, one-sentence summary of what the data represents. Separate the summary and the CSV data with '---'. For example: 'This data shows a positive correlation.\\n---\\nheader1,header2\\n1,2'`;
            break;
        case 7: // Data Analyzer
            expectJson = true;
            config.responseMimeType = "application/json";
            config.responseSchema = DATA_ANALYZER_SCHEMA;
            const jsonInstructions = "Your final output must be ONLY a single, raw JSON object that conforms to the required schema. Do not include any text, explanations, or markdown fences. The 'chartSuggestions' array should only contain configurations for 'bar' or 'line' charts. If a table is more appropriate, describe it in the summary using Markdown. Ensure that within each chart configuration, 'data.datasets' is an array of objects and each 'dataset.data' is an array of numbers.";

            // FIX: Removed deprecated `else if (settings.analysisStage === 'suggest_methods')` block which caused an error.
            if (settings.isAutomated) { // This is now used for the initial goal-setting call
                basePrompt += `Analyze the following CSV data from a study in ${context.experimentField}: \n\`\`\`\n${userInput}\n\`\`\`\nFirst, determine the best statistical analysis method. Then, perform that analysis. Provide a detailed summary of the findings and suggest at least one relevant chart configuration. ${jsonInstructions}`;
            } else { // Fallback/default for the main agentic process trigger
                 basePrompt += `Analyze the following CSV data from a study in ${context.experimentField}: \n\`\`\`\n${userInput}\n\`\`\`\nProvide a detailed summary of the findings and suggest at least one relevant chart configuration. ${jsonInstructions}`;
            }
            break;
        case 8:
            basePrompt += `You are tasked with drawing a conclusion for a scientific experiment in ${context.experimentField}. Use the following information:\n\n- **Research Question:** "${context.question}"\n- **Data Analysis Summary:** "${context.analysis_summary}"\n- **User's Additional Notes:** "${userInput}"\n\nBased ONLY on the information provided, write a formal conclusion. Your conclusion must directly address the final research question. It must explicitly state whether the hypothesis ("${context.hypothesis}") was supported, rejected, or if the results were inconclusive. You must also discuss the broader implications of the findings and acknowledge potential limitations of the study.`;
            break;
        case 9:
            basePrompt += `You are a peer reviewer. Your task is to conduct a thorough and constructive review of the entire research project, which is in the field of ${context.experimentField}. Analyze the project for clarity, scientific rigor, logical consistency between steps, and the strength of the final conclusion.\n\nHere is the summarized project log:\n\n${context.full_project_summary_log}`;
            break;
        case 10:
            // This step is now handled by the dedicated runPublicationAgent workflow.
            // This prompt is a fallback in case it's called directly, but it shouldn't be.
            basePrompt += `Assemble the project log into a publication. Log: ${context.full_project_summary_log}`;
            break;
        case 11: // Virtual step for Submission Checklist
             basePrompt += `Based on the following research project summary log, generate a comprehensive pre-submission checklist for a high-impact journal in the field of ${context.experimentField}. The checklist should be in Markdown format and cover key areas like formatting, authorship, data availability statements, conflict of interest declarations, and ethical considerations.\n\nProject Log:\n${context.full_project_summary_log}`;
            break;
        case 12: // Virtual step for Presentation Outline
             basePrompt += `Based on the following scientific paper from the field of ${context.experimentField}, create a concise 10-slide presentation outline in Markdown format. Each slide heading should be a level 2 header (##). The slides should be: Title, Introduction/Background, Research Question, Methods, Key Results (1-2 slides with data points), Data Visualization (Chart description), Discussion, Conclusion, Future Work, and Q&A.\n\nPaper:\n${context.publication_draft}`;
            break;
        default:
            basePrompt += `An unknown step was requested. Please provide general assistance.`;
    }

    return { basePrompt, expectJson, config };
};

/**
 * Executes a multi-agent workflow to generate a complete scientific paper.
 * @param {object} params - The parameters for the agent.
 * @param {Experiment} params.experiment - The active experiment object.
 * @param {GoogleGenAI} params.gemini - The initialized Gemini client.
 * @param {(agent: string, message: string) => void} params.updateLog - Callback to send log updates to the UI.
 * @returns {Promise<string>} The final, formatted publication text in Markdown.
 */
export const runPublicationAgent = async ({ experiment, gemini, updateLog }) => {
    
    // A robust, rate-limited agent caller.
    const callAgent = async (model: string, params: any, agentName: string) => {
        updateLog(agentName, 'is thinking...');
        const logCallback = (msg: string) => updateLog('System', `[${agentName}] ${msg}`);
        const response = await callGeminiWithRetry(gemini, model, params, logCallback);
        const result = response.text;
        updateLog(agentName, 'has completed its task.');
        // Proactive delay to prevent rate limiting on sequential calls.
        await new Promise(resolve => setTimeout(resolve, 6000));
        return result;
    };
    
    // 1. Get full context and fine-tuning settings
    const fullContextLog = getStepContext(experiment, 10).full_project_summary_log;
    const fineTuneSettings = experiment.fineTuneSettings[10] || {};
    const scientificField = experiment.field;
    const referenceStyle = fineTuneSettings.referenceStyle || 'APA';
    const pageCount = fineTuneSettings.pageCount || 'Standard (5-7 pages)';
    
    updateLog('System', `Project context compiled. Field: ${scientificField}. Style: ${referenceStyle}. Length: ${pageCount}.`);

    // 2. Outline
    const outlinePrompt = `Based on the project log, create a structural outline for a scientific paper in the field of ${scientificField}. Output a JSON array of strings, e.g., ["Abstract", "Introduction", "Methods", "Results", "Discussion", "Conclusion", "References"].\n\nLog:\n${fullContextLog}`;
    const outlineText = await callAgent('gemini-flash-lite-latest', { contents: outlinePrompt }, 'Manager');
    let sections;
    try {
      sections = JSON.parse(outlineText.replace(/```json/g, '').replace(/```/g, ''));
    } catch {
      sections = ["Abstract", "Introduction", "Methods", "Results", "Discussion", "Conclusion", "References"];
    }
    updateLog('Manager', `Paper outline confirmed: ${sections.join(', ')}`);
    
    let paper = '';

    // 3. Write sections
    for (const section of sections) {
        if (section.toLowerCase() === 'references') continue; // Handle this specifically later
        
        updateLog('Writer', `Drafting ${section}...`);
        
        let sectionPrompt;
        if (section.toLowerCase() === "results") {
            let analysisContext = '';
            let chartCount = 0;
            const analysisOutput = experiment.stepData[7]?.output;

            if (analysisOutput) {
                try {
                    const analysisData = JSON.parse(analysisOutput);
                    const detailedSummary = analysisData.summary;
                    const charts = analysisData.chartSuggestions || [];
                    
                    if (!detailedSummary) throw new Error("Analysis JSON is missing the 'summary' field.");

                    analysisContext = detailedSummary; // Start with the detailed summary.
                    chartCount = charts.length;

                    if (chartCount > 0) {
                        let chartDescriptions = "\n\nThe following data visualizations were generated and must be described in the results section. You must refer to them as Figure 1, Figure 2, etc.:\n";
                        charts.forEach((chart, index) => {
                            const chartType = chart.type || 'N/A';
                            const chartLabel = chart.data?.datasets?.[0]?.label || 'Untitled Chart';
                            const dataPoints = chart.data?.datasets?.[0]?.data?.length || 0;
                            chartDescriptions += `- Figure ${index + 1}: A '${chartType}' chart titled '${chartLabel}' that visualizes ${dataPoints} data points.\n`;
                        });
                        analysisContext += chartDescriptions;
                    }
                } catch (e) {
                    console.error("Could not parse analysis data for publication agent:", e);
                    analysisContext = `[ERROR: The data analysis from Step 7 could not be read or is corrupted. Please state in the results section that the detailed analysis is unavailable due to a data processing error. The short summary of the analysis was: "${getStepContext(experiment, 8).analysis_summary}"]`;
                    chartCount = 0;
                }
            } else {
                analysisContext = "[ERROR: No data analysis output from Step 7 was found. Please state in the results section that the analysis is missing.]";
                chartCount = 0;
            }
            
            sectionPrompt = `Write the "${section}" section for a paper in ${scientificField}. The paper should be a ${pageCount} document. Describe the findings based on this analysis context: "${analysisContext}". Crucially, if the context contains an error message, you must report that error clearly in this section. Otherwise, you MUST insert placeholders for all ${chartCount} charts where appropriate in the text. Use the format [CHART_1], [CHART_2], etc. The placeholder number should correspond to the Figure number in the context.`;
        } else {
             sectionPrompt = `You are a scientific writer. Write the "${section}" section of a research paper in the field of ${scientificField}. The paper's target length is ${pageCount}. Here is the full project log for context. Focus on the relevant parts for this section.\n\nLog:\n${fullContextLog}`;
        }
        
        const sectionText = await callAgent('gemini-flash-lite-latest', { contents: sectionPrompt }, 'Writer');
        paper += `\n## ${section}\n\n${sectionText}\n`;
        updateLog('Writer', `${section} section complete.`);
    }

    // 4. Generate captions and create final placeholders
    const analysisData = JSON.parse(experiment.stepData[7]?.output || '{}');
    const chartConfigs = analysisData.chartSuggestions || [];
    if (chartConfigs.length > 0) {
        updateLog('System', 'Generating chart captions...');
        for (let i = 0; i < chartConfigs.length; i++) {
            const chartConfig = chartConfigs[i] || {};
            const chartType = chartConfig.type || 'chart';
            const chartTitle = chartConfig.data?.datasets?.[0]?.label || 'Untitled Chart';

            const captionPrompt = `Write a descriptive caption for a scientific chart in the field of ${scientificField}. The caption should start with "Figure ${i + 1}:". Here is the project's analysis summary for context: "${analysisData.summary}". The chart is a ${chartType} chart titled "${chartTitle}".`;
            const caption = await callAgent('gemini-flash-lite-latest', { contents: captionPrompt }, 'Captioner');
            const placeholderWithCaption = `\n[CHART_${i + 1}:${caption}]\n`;
            paper = paper.replace(`[CHART_${i + 1}]`, placeholderWithCaption);
        }
        updateLog('System', 'Captions generated and embedded.');
    }
    
    // 5. Format References
    const litReviewOutput = experiment.stepData[2]?.output;
    if (litReviewOutput) {
        try {
            const refs = JSON.parse(litReviewOutput.replace(/```json/g, '').replace(/```/g, '')).references;
            if (refs && refs.length > 0) {
                 updateLog('System', `Formatting references in ${referenceStyle} style...`);
                const refsPrompt = `Format the following JSON reference list into a ${referenceStyle}-style bibliography. Output only the formatted list in Markdown.\n\n${JSON.stringify(refs)}`;
                const refsText = await callAgent('gemini-flash-lite-latest', { contents: refsPrompt }, 'Bibliographer');
                paper += `\n## References\n\n${refsText}`;
                updateLog('System', 'References section complete.');
            }
        } catch (e) {
            updateLog('System', 'Warning: Could not parse references from literature review step.');
        }
    }

    // 6. Final Polish
    updateLog('Editor', 'Performing final editorial review...');
    const polishPrompt = `You are a helpful scientific editor. Your task is to perform a single, final pass on the following draft paper in the field of ${scientificField}. Your goals are to: 1. Add a compelling title (as a Level 1 Markdown Header: # Title). 2. Improve the overall flow, clarity, and grammatical correctness. 3. Ensure a consistent and professional tone. The paper's target length is ${pageCount}. Do not drastically change the scientific content or conclusions. Output the final, polished version of the complete paper in Markdown.\n\n${paper}`;
    const finalText = await callAgent('gemini-2.5-flash', { contents: polishPrompt }, 'Editor');
    updateLog('System', 'Publication ready.');
    
    return finalText;
};


/**
 * Executes a multi-agent workflow for a literature review.
 * @param {object} params - The parameters for the agent.
 * @param {Experiment} params.experiment - The active experiment object.
 * @param {GoogleGenAI} params.gemini - The initialized Gemini client.
 * @param {(agent: string, message: string) => void} params.updateLog - Callback to send log updates to the UI.
 * @returns {Promise<string>} The final, formatted JSON output.
 */
export const runLiteratureReviewAgent = async ({ experiment, gemini, updateLog }) => {
    // A robust, rate-limited agent caller.
    const callAgent = async (model: string, params: any, agentName: string) => {
        updateLog(agentName, 'is thinking...');
        const logCallback = (msg: string) => updateLog('System', `[${agentName}] ${msg}`);
        const response = await callGeminiWithRetry(gemini, model, params, logCallback);
        const result = response.text;
        updateLog(agentName, 'has completed its task.');
        // Proactive delay to prevent rate limiting on sequential calls.
        await new Promise(resolve => setTimeout(resolve, 2000));
        return result;
    };

    const context = getStepContext(experiment, 2);
    let lastFeedback = 'This is the first attempt.';
    const maxIterations = 5;

    for (let i = 0; i < maxIterations; i++) {
        updateLog('System', `--- Iteration ${i + 1} of ${maxIterations} ---`);

        // 1. Manager: Create search queries
        const managerPrompt = `You are a Manager agent creating a search strategy for a literature review on "${context.question}" in the field of ${context.experimentField}.

Your task is to generate 3 diverse search queries suitable for a standard web search engine like Google. These are NOT for a scientific database like Scopus or PubMed.

**CRITICAL INSTRUCTIONS:**
1.  **Use Natural Language:** Queries should be simple phrases or questions someone would type into Google.
2.  **NO Complex Boolean Logic:** You MUST NOT use complex boolean operators like parenthesized (A OR B) AND (C OR D). Avoid operators like NEAR, ADJ, or complex nesting. Simple keyword combinations are fine.
3.  **Focus on different angles:** Each query should explore a different facet of the research question.

**Example of GOOD queries:**
- "latest research on UHTC stability above 5000 K"
- "thermodynamic limits of covalent bonds in ceramics"
- "computational modeling of high-entropy refractory materials"

**Example of BAD queries (DO NOT DO THIS):**
- ("atomic-scale engineering" OR "bond network modification") AND ("ultra-high temperature ceramics")
- (materials science) AND (UHTCs OR "refractory materials") AND (stability > 5000 K)

Your final output must be ONLY a raw JSON array of 3 strings. e.g., ["query 1", "query 2", "query 3"]`;
        const managerResponse = await callAgent('gemini-flash-lite-latest', { contents: managerPrompt }, 'Manager');
        let searchQueries = [];
        try {
            const sanitizedResponse = managerResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            searchQueries = JSON.parse(sanitizedResponse);
            if (!Array.isArray(searchQueries) || !searchQueries.every(q => typeof q === 'string')) {
                 throw new Error("Manager agent output was not a valid array of strings.");
            }
            updateLog('Manager', `Search strategy confirmed: ${searchQueries.join(', ')}`);
        } catch (e) {
            updateLog('Manager', `Error parsing search queries: ${e.message}. Raw response: ${managerResponse}`);
            throw new Error("Manager failed to produce valid JSON for search queries.");
        }

        // 2. Researcher: Execute search and gather data
        let searchResults = '';
        for (const query of searchQueries) {
            updateLog('Researcher', `Searching for: "${query}"...`);
            const researcherPrompt = `Using your search tool, find relevant academic literature for the query: "${query}". Provide a detailed summary of the findings, including any links found.`;
            const searchResult = await callAgent('gemini-2.5-flash', { contents: researcherPrompt, config: { tools: [{ googleSearch: {} }] } }, 'Researcher');
            searchResults += `\n\n--- Results for query: "${query}" ---\n${searchResult}`;
        }
        updateLog('Researcher', `All search results collected.`);

        // 3. Synthesizer: Create the final JSON output
        const synthesizerPrompt = `You are a Synthesizer agent. Based on the following research results, you must synthesize the results into a cohesive literature review summary and structured reference list, appropriate for the field of ${context.experimentField}. Your output MUST be a single, valid JSON object that conforms to the schema. It must contain 'summary' and 'references' keys. The 'references' array must contain objects with 'title', 'authors', 'year', 'journal', and 'url'. Previous attempt failed with this feedback: "${lastFeedback}".\n\nSearch Results:\n${searchResults}`;
        const synthesizerResponse = await callAgent('gemini-2.5-flash', {
            contents: synthesizerPrompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: LITERATURE_REVIEW_SCHEMA,
            }
        }, 'Synthesizer');
        updateLog('Synthesizer', 'Generated new literature review summary and reference list.');

        // 4. QA: Validate the output
        let qaPass = false;
        try {
            JSON.parse(synthesizerResponse); // Basic validation
            qaPass = true; // If it parses and came from the schema'd call, assume it's good enough
            updateLog('QA', 'Validation passed. The JSON structure is correct.');
        } catch (e) {
            lastFeedback = `The generated output was not valid JSON. Error: ${e.message}. Please try again, ensuring your entire output is a single, perfectly-formed JSON object.`;
            updateLog('QA', lastFeedback);
        }

        if (qaPass) {
            updateLog('System', 'Literature Review complete.');
            return synthesizerResponse;
        }
    }

    throw new Error(`Literature Review generation failed after ${maxIterations} attempts.`);
};