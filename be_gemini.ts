




import { GoogleGenAI, Type, Modality } from "@google/genai";
import {
    Experiment,
    FineTuneSettings,
    STEP_SPECIFIC_TUNING_PARAMETERS,
    DATA_ANALYSIS_IMAGE_OUTPUT_SCHEMA,
    LITERATURE_REVIEW_SCHEMA,
    RESEARCH_QUESTION_SCHEMA,
    WORKFLOW_STEPS,
    CHART_JS_SCHEMA,
    VISUALIZATION_PLAN_SCHEMA,
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
 * @param timeout - The timeout for the API call in milliseconds.
 * @returns The response from the Gemini API.
 */
export const callGeminiWithRetry = async (
    gemini: GoogleGenAI,
    model: string,
    params: any,
    onLog?: (message: string) => void,
    maxRetries = 5,
    timeout: number = 60000
) => {
    let attempt = 0;
    let delay = 2000; // Start with a 2-second delay
    while (attempt < maxRetries) {
        try {
            const response = await callGeminiWithTimeout(gemini.models.generateContent({ model, ...params }), timeout);
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

        // Handle specific server-side 500 errors
        if (errorCode === 500) {
            return `A server error occurred on the AI's side (Code: 500). Please try again later. Details: ${errorMessage}`;
        }
        return `An API error occurred (Code: ${errorCode}): ${errorMessage}`;
    }

    if (error?.message) {
        if (error.message.includes('API key not valid')) {
            return "Authentication failed: The provided API Key is not valid. Please check the key and try again.";
        }
        if (error.message.toLowerCase().includes('timed out')) {
            return "The request to the AI service timed out. Please check your network connection and try again.";
        }
        return error.message;
    }

    return fallbackMessage;
};


export const testApiKey = async (apiKey: string): Promise<boolean> => {
    if (!apiKey) return false;
    try {
        const ai = new GoogleGenAI({ apiKey });
        await ai.models.generateContent({model: 'gemini-2.5-flash', contents: 'test'});
        return true;
    } catch (error) {
        console.error("API Key validation failed:", error);
        return false;
    }
};

/**
 * Gathers context from previous steps for the current step's prompt.
 * Uses concise summaries for older steps to save tokens.
 * @param experiment The full experiment object.
 * @param stepId The ID of the step to get context FOR.
 * @returns A context object.
 */
// Fix: Changed the return type from `object` to `any` to allow accessing dynamically added properties without causing TypeScript errors.
export const getStepContext = (experiment: Experiment, stepId: number): any => {
    const context: any = { experimentField: experiment.field };
    const data = experiment.stepData || {};

    // Helper to get summary, falling back to full output if summary is missing
    const getStepSummary = (sId: number) => data[sId]?.summary || data[sId]?.output || 'N/A';
    // Helper to get the full, raw output of a step
    const getFullOutput = (sId: number) => data[sId]?.output || 'N/A';

    // Build context object with relevant data from previous steps
    if (stepId > 1) context.question = getFullOutput(1);
    if (stepId > 2) context.literature_review_summary = getStepSummary(2);
    if (stepId > 3) context.hypothesis = getFullOutput(3);
    if (stepId > 4) context.methodology_summary = getStepSummary(4);
    if (stepId > 5) context.data_collection_plan_summary = getStepSummary(5);
    if (stepId > 6) context.experimental_data_summary = getStepSummary(6);
    if (stepId > 7) context.analysis_summary = getStepSummary(7);
    if (stepId > 8) context.conclusion_summary = getStepSummary(8);
    if (stepId > 9) context.peer_review_summary = getStepSummary(9);
    
    // For steps that need a full project log (like Peer Review and Publication),
    // compile a log. Use full output for recent steps and summaries for older ones.
    if (stepId === 9 || stepId === 10 || stepId === 13) { // Added step 13 for explanation generation
        let projectLog = '';
        for (let i = 1; i < stepId; i++) {
            const stepInfo = WORKFLOW_STEPS.find(s => s.id === i);
            if (stepInfo) {
                // Use full output for the two most recent steps, summaries for the rest
                const output = (stepId - i <= 2) ? getFullOutput(i) : getStepSummary(i);
                projectLog += `--- Summary of Step ${i}: ${stepInfo.title} ---\n${output}\n\n`;
            }
        }
        context.full_project_summary_log = projectLog.trim();
    }

    return context;
};

/**
 * Constructs the prompt and configuration for a given step.
 * @param stepId The ID of the step.
 * @param userInput The direct user input for the step (if any).
 * @param context The context object from getStepContext.
 * @param fineTuneSettings The fine-tuning settings for the step.
 * @param regenerateFeedback Optional feedback for regeneration.
 * @returns An object with the base prompt, whether to expect JSON, and the Gemini config.
 */
export const getPromptForStep = (
    stepId: number, 
    userInput: string, 
    context: any, 
    fineTuneSettings: FineTuneSettings,
    regenerateFeedback: string = ''
) => {
    let systemInstruction = `You are an expert AI research assistant specializing in ${context.experimentField || 'General Science'}. You are a helpful, creative, and brilliant research assistant.`;
    const settings = fineTuneSettings || {};
    const params = STEP_SPECIFIC_TUNING_PARAMETERS[stepId] || [];

    params.forEach(param => {
        const value = settings[param.name] ?? param.default;
        if (value && param.name === 'reviewerPersona') {
            systemInstruction += ` You must adopt the persona of a '${value}' peer reviewer.`;
        }
    });

    let basePrompt = "";
    let expectJson = false;
    const config: any = { systemInstruction };
    if (settings.temperature) config.temperature = settings.temperature;

    if (regenerateFeedback) {
        basePrompt += `Please regenerate the response. The user provided the following feedback: "${regenerateFeedback}". Please incorporate this feedback to improve the result.\n\n`;
    }

    switch (stepId) {
        case 1:
            expectJson = true;
            basePrompt += `Refine the following research idea into a clear, focused, and testable research question. Also, provide a uniqueness score (0.0 to 1.0) and a brief justification. Idea: ${userInput}`;
            config.responseMimeType = "application/json";
            config.responseSchema = RESEARCH_QUESTION_SCHEMA;
            break;
        case 2:
            // This case is now handled by the dedicated runLiteratureReviewAgent
            basePrompt += `For the research question "${context.question}", conduct a literature review. Find relevant, recent, and authoritative sources. Provide a comprehensive summary and a list of structured references.`;
            config.tools = [{ googleSearch: {} }];
            break;
        case 3:
            basePrompt += `Based on the literature review summary: "${context.literature_review_summary}", formulate ${settings.hypothesis_count || 3} distinct hypotheses for the research question: "${context.question}"`;
            break;
        case 4:
            basePrompt += `Design a detailed methodology to test the hypothesis: "${context.hypothesis}". The methodology should be ${settings.detail_level || 'a detailed protocol'}.`;
            break;
        case 5:
            basePrompt += `Create a data collection plan for the methodology: "${context.methodology_summary}".`;
            break;
        case 6: // AI Data Synthesis
            basePrompt += `Based on the methodology summary: "${context.methodology_summary}" and data plan summary: "${context.data_collection_plan_summary}", generate a plausible, estimated, synthetic dataset in CSV format. Output ONLY the CSV data and a brief, one-sentence summary of what the data represents. Separate the summary and the CSV data with '---'.`;
            break;
        case 7:
            // This case is now handled by the dedicated runDataAnalysisAgent
            basePrompt += `Analyze the following data: ${userInput}`;
            break;
        case 8:
            basePrompt += `Based on the data analysis summary: "${context.analysis_summary}", draw conclusions for the research project. Was the hypothesis "${context.hypothesis}" supported?`;
            break;
        case 9:
             basePrompt += `Act as a peer reviewer. Critically review the entire research project based on this log and provide constructive feedback. Your persona is: ${settings.reviewerPersona || 'Harsh Critic'}. \n\nFULL PROJECT LOG:\n${context.full_project_summary_log}`;
             break;
        case 10:
             // This case is now handled by the dedicated runPublicationAgent
             basePrompt += `Assemble the entire research project into a publication-ready paper based on this log: \n\n${context.full_project_summary_log}`;
             break;
        case 11: // Manual Mode Deploy: Submission Checklist
             basePrompt += `Based on the completed research paper draft, generate a detailed "Journal Submission Checklist". This should include sections like 'Manuscript Formatting', 'Figure & Table Preparation', 'Author Contributions', 'Conflict of Interest Statement', and 'Cover Letter Key Points'. The research is in the field of ${context.experimentField}.`;
             break;
        case 12: // Automated Mode Deploy: Presentation Outline
             basePrompt += `Based on the completed research paper draft, generate a 10-slide presentation outline. For each slide, provide a title, key bullet points, and a suggestion for a visual aid. The research is in the field of ${context.experimentField}.`;
             break;
        case 13: // Completion View: Explain this Paper
             basePrompt += `You are an expert science communicator. Explain the following research paper in plain English, suitable for a 12th-grade reading level. Minimize jargon and focus on the key findings and their importance. \n\n---\n\n${context.full_project_summary_log}`;
             break;
        default:
            basePrompt += `For step ${stepId}, with input "${userInput}", using context: ${JSON.stringify(context)}.`;
    }

    return { basePrompt, expectJson, config };
};

/**
 * Agentic workflow for Step 2: Literature Review.
 */
export const runLiteratureReviewAgent = async ({ experiment, gemini, updateLog }) => {
    updateLog('System', '--- Iteration 1: Initial Search & Summary ---');
    updateLog('Researcher', 'Conducting initial literature search using Google Search grounding.');
    const context = getStepContext(experiment, 2);
    const { basePrompt, config } = getPromptForStep(2, '', context, experiment.fineTuneSettings[2] || {});
    config.responseMimeType = "application/json";
    config.responseSchema = LITERATURE_REVIEW_SCHEMA;

    const response = await callGeminiWithRetry(gemini, 'gemini-2.5-flash', { contents: basePrompt, config }, (log) => updateLog('System', log));
    const result = response.text;
    
    updateLog('System', 'Review complete. Formatting results.');
    return result;
};


/**
 * New agentic workflow for Step 7: Data Analysis & Visualization.
 * Implements a three-agent pipeline: Planner, Dataset-Builder, and Plotter.
 */
export const runDataAnalysisAgent = async ({ experiment, csvData, gemini, updateLog }) => {
    const context = getStepContext(experiment, 7);

    // --- AGENT 1: PLANNER ---
    updateLog('Planner', 'Analyzing data structure to create a visualization plan...');
    const csvLines = csvData.trim().split('\n');
    const csvHeader = csvLines[0];
    const csvSample = csvLines.slice(1, 4).join('\n');
    const plannerPrompt = `You are a Data Scientist Planner. Your goal is to create a visualization plan for a dataset.
Rules:
1.  Each visualization must use 3 or fewer variables (columns).
2.  Suggest 'bar' charts for categorical data or when there are few data points.
3.  Suggest 'line' charts for time-series data or continuous data with many points.
4.  Suggest 'scatter' plots to show the relationship between two numerical variables.

Dataset Info:
- Research Question: ${context.question}
- Hypothesis: ${context.hypothesis}
- CSV Header: ${csvHeader}
- Data Sample:
${csvSample}

Based on this, create a JSON object with a 'charts' array, defining 2-3 appropriate visualizations.`;

    const plannerResponse = await callGeminiWithRetry(gemini, 'gemini-2.5-flash', {
        contents: plannerPrompt,
        config: { responseMimeType: "application/json", responseSchema: VISUALIZATION_PLAN_SCHEMA }
    });
    const plan = JSON.parse(plannerResponse.text).charts;
    updateLog('Planner', `Plan created with ${plan.length} visualizations.`);

    const generatedCharts = [];

    for (const chartPlan of plan) {
        // --- AGENT 2: DATASET-BUILDER ---
        updateLog('Dataset-Builder', `Preparing data for chart: "${chartPlan.title}"`);
        const builderPrompt = `You are a data preparation specialist. Based on the visualization plan and the full CSV data, create a valid Chart.js JSON object for the following chart.
- Chart Goal: ${chartPlan.title} (${chartPlan.explanation})
- Chart Type: ${chartPlan.chartType}
- Columns to use: ${chartPlan.columns.join(', ')}

Full CSV Data:
${csvData}

Respond with ONLY the raw Chart.js JSON object.`;
        
        const builderResponse = await callGeminiWithRetry(gemini, 'gemini-2.5-flash', {
            contents: builderPrompt,
            config: { responseMimeType: "application/json", responseSchema: CHART_JS_SCHEMA }
        });
        const chartJsConfig = builderResponse.text;
        updateLog('Dataset-Builder', `Chart.js JSON created for "${chartPlan.title}".`);

        // --- AGENT 3: PLOTTER ---
        updateLog('Plotter', `Generating image for chart: "${chartPlan.title}"`);
        const plotterPrompt = `Generate a high-quality, professional '${chartPlan.chartType}' chart with a dark theme, suitable for a scientific publication. The chart's title should be "${chartPlan.title}". The data for the chart is provided in the following JSON object. Plot this data accurately and clearly.

Chart Data:
${chartJsConfig}`;

        const plotterResponse = await callGeminiWithRetry(gemini, 'gemini-2.5-flash-image', {
            contents: { parts: [{ text: plotterPrompt }] },
            config: { responseModalities: [Modality.IMAGE] }
        });
        
        const imagePart = plotterResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePart) {
            throw new Error(`Plotter agent failed to generate an image for "${chartPlan.title}".`);
        }
        
        const imageData = imagePart.inlineData.data;
        generatedCharts.push({ title: chartPlan.title, imageData });
        updateLog('Plotter', `Image generated for "${chartPlan.title}".`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Pause to avoid rate limiting
    }

    // --- FINAL SUMMARY ---
    updateLog('System', 'All visualizations generated. Compiling final report...');
    const summaryPrompt = `Based on the research question, hypothesis, and the visualization plan that was just executed, write a detailed summary and interpretation of the data analysis findings in Markdown format.
- Research Question: ${context.question}
- Hypothesis: ${context.hypothesis}
- Visualizations Created:
${plan.map(p => `- A ${p.chartType} chart titled "${p.title}" showing: ${p.explanation}`).join('\n')}
`;
    const summaryResponse = await callGeminiWithRetry(gemini, 'gemini-2.5-flash', { contents: summaryPrompt });
    const summary = summaryResponse.text;

    const finalOutput = JSON.stringify({ summary, charts: generatedCharts });
    const logSummary = `Generated ${generatedCharts.length} charts and a summary based on the analysis plan.`;

    return { finalOutput, logSummary };
};


/**
 * Agentic workflow for Step 10: Publication Exporter.
 */
export const runPublicationAgent = async ({ experiment, gemini, updateLog }) => {
    const fullContext = getStepContext(experiment, 10).full_project_summary_log;
    let finalDoc = '';

    // Agent 1: Manager (Outliner)
    updateLog('Manager', 'Analyzing project log to create a publication outline...');
    const outlinePrompt = `You are a scientific editor. Based on the provided research log, create a standard publication outline as a JSON array of strings (e.g., ["Abstract", "Introduction", "Methodology", "Results", "Discussion", "Conclusion", "References"]). Research Log:\n\n${fullContext}`;
    const outlineResponse = await callGeminiWithRetry(gemini, 'gemini-2.5-flash', { contents: outlinePrompt });
    const outline = JSON.parse(outlineResponse.text.replace(/```json/g, '').replace(/```/g, ''));
    updateLog('Manager', 'Outline created: ' + outline.join(', '));
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Agent 2: Writer (Section by Section)
    const sections = {};
    for (const section of outline) {
        updateLog('Writer', `Drafting section: ${section}...`);
        const writerPrompt = `You are a scientific writer. Using the full research log, write the "${section}" section of a scientific paper. For the 'Results' section, insert placeholders like [CHART_1: A descriptive caption], [CHART_2: Another caption], etc., where charts should appear. For the 'References' section, format them professionally. Full Log:\n\n${fullContext}`;
        const sectionResponse = await callGeminiWithRetry(gemini, 'gemini-2.5-flash', { contents: writerPrompt }, (log) => updateLog('System', log), 5, 120000);
        sections[section] = sectionResponse.text;
        updateLog('Writer', `"${section}" section complete.`);
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Agent 3: Editor (Compiler and Finisher)
    updateLog('Editor', 'Assembling and polishing the final manuscript...');
    const editorPrompt = `You are a final editor. Combine the following sections into a single, cohesive scientific paper. Add a suitable title, ensure smooth transitions, and check for consistency. Here are the sections:\n\n${JSON.stringify(sections, null, 2)}`;
    const finalResponse = await callGeminiWithRetry(gemini, 'gemini-2.5-flash', { contents: editorPrompt }, (log) => updateLog('System', log), 5, 120000);
    finalDoc = finalResponse.text;
    updateLog('Editor', 'Final manuscript complete.');

    return finalDoc;
};