

import { GoogleGenAI } from "@google/genai";
import {
    Experiment,
    FineTuneSettings,
    STEP_SPECIFIC_TUNING_PARAMETERS,
    DATA_ANALYZER_SCHEMA,
    LITERATURE_REVIEW_SCHEMA,
    STATISTICAL_METHODS_SCHEMA,
    RESEARCH_QUESTION_SCHEMA,
    WORKFLOW_STEPS
} from './config';


// --- GEMINI API SERVICE ---

/**
 * @deprecated The App component now manages the Gemini instance directly. This function is kept for potential future use or legacy support but should not be the primary way to get the Gemini instance.
 */
export const initializeGemini = (): GoogleGenAI | null => {
    // Adhere to security guidelines: API key is exclusively from environment variables.
    const apiKey = process.env.API_KEY;

    if (!apiKey) {
        console.error("API key is not configured in environment variables.");
        return null;
    }
    
    try {
        return new GoogleGenAI({ apiKey });
    } catch (e) {
        console.error("Failed to initialize GoogleGenAI:", e);
        return null;
    }
};

export const parseGeminiError = (error: any, fallbackMessage: string = "An unknown error occurred."): string => {
    console.error("Gemini API Error:", error);

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
        await testGemini.models.generateContent({
             model: 'gemini-2.5-flash',
             contents: 'test',
             config: { thinkingConfig: { thinkingBudget: 0 } }
        });
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
                // Use full output for Step 2 (Lit Review for references) and other recent steps.
                let output = (i === 2 || stepId - i <= 2) ? getFullOutput(i) : getStepSummary(i);
                
                if (i === 7 && data[7]?.output) {
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
1. Formulate a clear, focused, and testable research question from this idea.
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
            expectJson = true;
            basePrompt += `For the research question "${context.question}", conduct a literature review using your search tool. Your final output must be ONLY a single, valid JSON object inside a markdown code block (e.g., \`\`\`json\n{...}\n\`\`\`). Do not include any other text or explanations. The JSON must be strictly valid: all property names (keys) must be enclosed in double quotes. The JSON object must contain a 'summary' key (with a markdown string value) and a 'references' key (with an array of objects, where each object has 'title', 'authors' (as an array of strings), 'year' (as a number), 'journal', and 'url' keys).`;
            config.tools = [{ googleSearch: {} }];
            break;
        case 3:
            basePrompt += `Based on the research question: "${context.question}" and this literature review summary: "${context.literature_review_summary}", generate several distinct, testable hypotheses. Present them clearly. The user's initial thought is: "${userInput}"`;
            break;
        case 4:
            basePrompt += `The chosen hypothesis is: "${context.hypothesis}". The user has provided the following input: "${userInput}". Design a detailed, step-by-step methodology to test this hypothesis.`;
            break;
        case 5:
            basePrompt += `Based on the designed methodology summary: "${context.methodology_summary}", create a detailed data collection plan. Specify variables, measurement techniques, and data recording format.`;
            break;
        case 6: // Synthesize Data
            basePrompt += `The user has chosen to synthesize data. Based on the methodology summary: "${context.methodology_summary}" and data plan summary: "${context.data_collection_plan_summary}", generate a plausible, estimated, synthetic dataset in CSV format that could have resulted from this experiment. The data should be realistic and suitable for analysis. Output ONLY the CSV data and a brief, one-sentence summary of what the data represents. Separate the summary and the CSV data with '---'. For example: 'This data shows a positive correlation.\\n---\\nheader1,header2\\n1,2'`;
            break;
        case 7: // Data Analyzer
            expectJson = true;
            config.responseMimeType = "application/json";
            config.responseSchema = DATA_ANALYZER_SCHEMA;
            const jsonInstructions = "Your final output must be ONLY a single, raw JSON object that conforms to the required schema. Do not include any text, explanations, or markdown fences. The 'chartSuggestions' array should only contain configurations for 'bar' or 'line' charts. If a table is more appropriate, describe it in the summary using Markdown. Ensure that within each chart configuration, 'data.datasets' is an array of objects and each 'dataset.data' is an array of numbers.";

            if (settings.isAutomated) { // This is now used for the initial goal-setting call
                basePrompt += `Analyze the following CSV data: \n\`\`\`\n${userInput}\n\`\`\`\nFirst, determine the best statistical analysis method. Then, perform that analysis. Provide a detailed summary of the findings and suggest at least one relevant chart configuration. ${jsonInstructions}`;
            } else if (settings.analysisStage === 'suggest_methods') { // This is now deprecated by the agentic workflow but kept for structure
                config.responseSchema = STATISTICAL_METHODS_SCHEMA;
                basePrompt += `Based on the data collection plan: "${context.data_collection_plan_summary}" and a preview of the data: \n\`\`\`\n${context.experiment_data_csv}\n\`\`\`\nSuggest 3 to 5 appropriate statistical analysis methods. For each method, provide a brief description. Your final output must be ONLY a single, raw JSON object.`;
            } else { // Fallback/default for the main agentic process trigger
                 basePrompt += `Analyze the following CSV data: \n\`\`\`\n${userInput}\n\`\`\`\nProvide a detailed summary of the findings and suggest at least one relevant chart configuration. ${jsonInstructions}`;
            }
            break;
        case 8:
            basePrompt += `You are tasked with drawing a conclusion for a scientific experiment. Use the following information:\n\n- **Research Question:** "${context.question}"\n- **Data Analysis Summary:** "${context.analysis_summary}"\n- **User's Additional Notes:** "${userInput}"\n\nBased ONLY on the information provided, write a formal conclusion. Your conclusion must directly address the final research question. It must explicitly state whether the hypothesis ("${context.hypothesis}") was supported, rejected, or if the results were inconclusive. You must also discuss the broader implications of the findings and acknowledge potential limitations of the study.`;
            break;
        case 9:
            basePrompt += `You are a peer reviewer. Your task is to conduct a thorough and constructive review of the entire research project, summarized below. Analyze the project for clarity, scientific rigor, logical consistency between steps, and the strength of the final conclusion.\n\nHere is the summarized project log:\n\n${context.full_project_summary_log}`;
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
             basePrompt += `Based on the following scientific paper, create a concise 10-slide presentation outline in Markdown format. Each slide heading should be a level 2 header (##). The slides should be: Title, Introduction/Background, Research Question, Methods, Key Results (1-2 slides with data points), Data Visualization (Chart description), Discussion, Conclusion, Future Work, and Q&A.\n\nPaper:\n${context.publication_draft}`;
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
    
    const callGeminiWithRetry = async (params, agentName, maxRetries = 5) => {
        let attempts = 0;
        let delay = 2000;
        while (attempts < maxRetries) {
            try {
                const response = await gemini.models.generateContent(params);
                return response.text;
            } catch (error) {
                attempts++;
                const errorMessage = parseGeminiError(error);
                if (attempts >= maxRetries) {
                    updateLog('System', `${agentName} failed after ${maxRetries} attempts. Error: ${errorMessage}`);
                    throw new Error(`${agentName} failed: ${errorMessage}`);
                }
                updateLog('System', `${agentName} failed. Retrying in ${delay / 1000}s... (Attempt ${attempts}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
            }
        }
        throw new Error(`${agentName} failed to get a response.`);
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
    const outlineText = await callGeminiWithRetry({ model: 'gemini-flash-lite-latest', contents: outlinePrompt }, 'Manager');
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
        await new Promise(resolve => setTimeout(resolve, 1000)); // Pacing to avoid rate limits
        
        let sectionPrompt;
        if (section.toLowerCase() === "results") {
            const analysisSummary = getStepContext(experiment, 7).analysis_summary;
            const chartCount = JSON.parse(experiment.stepData[7]?.output || '{}').chartSuggestions?.length || 0;
            sectionPrompt = `Write the "${section}" section for a paper in ${scientificField}. The paper should be a ${pageCount} document. Describe the findings from this analysis summary: "${analysisSummary}". Crucially, if there are charts to include (${chartCount} of them), you MUST insert placeholders for them where appropriate in the text. Use the format [CHART_1], [CHART_2], etc.`;
        } else {
             sectionPrompt = `You are a scientific writer. Write the "${section}" section of a research paper in the field of ${scientificField}. The paper's target length is ${pageCount}. Here is the full project log for context. Focus on the relevant parts for this section.\n\nLog:\n${fullContextLog}`;
        }
        
        const sectionText = await callGeminiWithRetry({ model: 'gemini-flash-lite-latest', contents: sectionPrompt }, 'Writer');
        paper += `\n## ${section}\n\n${sectionText}\n`;
        updateLog('Writer', `${section} section complete.`);
    }

    // 4. Generate captions and create final placeholders
    const analysisData = JSON.parse(experiment.stepData[7]?.output || '{}');
    const chartConfigs = analysisData.chartSuggestions || [];
    if (chartConfigs.length > 0) {
        updateLog('System', 'Generating chart captions...');
        for (let i = 0; i < chartConfigs.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Pacing to avoid rate limits
            const chartConfig = chartConfigs[i] || {};
            const chartType = chartConfig.type || 'chart';
            const chartTitle = chartConfig.data?.datasets?.[0]?.label || 'Untitled Chart';

            const captionPrompt = `Write a descriptive caption for a scientific chart. The caption should start with "Figure ${i + 1}:". Here is the project's analysis summary for context: "${analysisData.summary}". The chart is a ${chartType} chart titled "${chartTitle}".`;
            const caption = await callGeminiWithRetry({ model: 'gemini-flash-lite-latest', contents: captionPrompt }, 'Captioner');
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
                const refsText = await callGeminiWithRetry({ model: 'gemini-flash-lite-latest', contents: refsPrompt }, 'Bibliographer');
                paper += `\n## References\n\n${refsText}`;
                updateLog('System', 'References section complete.');
            }
        } catch (e) {
            updateLog('System', 'Warning: Could not parse references from literature review step.');
        }
    }

    // 6. Final Polish
    updateLog('Editor', 'Performing final editorial review...');
    const polishPrompt = `You are an editor for a ${scientificField} journal. Review the following paper for flow, consistency, and grammar. The target length is ${pageCount}. Add a title based on the content (as a Level 1 Markdown Header: # Title). Output the final, polished version in Markdown.\n\n${paper}`;
    const finalText = await callGeminiWithRetry({ model: 'gemini-2.5-flash', contents: polishPrompt }, 'Editor');
    updateLog('System', 'Publication ready.');
    
    return finalText;
};