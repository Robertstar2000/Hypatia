import Dexie, { type Table } from 'dexie';
import { GoogleGenAI } from "@google/genai";
import {
    Experiment,
    FineTuneSettings,
    STEP_SPECIFIC_TUNING_PARAMETERS,
    DATA_ANALYZER_SCHEMA,
    WORKFLOW_STEPS
} from './config';

// --- DATABASE SETUP (DEXIE) ---
class ExperimentDatabase extends Dexie {
    experiments!: Table<Experiment, string>;

    constructor() {
        super("ProjectHypatiaDB");
        this.version(2).stores({
            experiments: 'id, title, createdAt'
        });
    }
}
export const db = new ExperimentDatabase();


// --- GEMINI API SERVICE ---

let geminiInstance: GoogleGenAI | null = null;
let currentApiKey: string | null = null;

export const initializeGemini = (userApiKey?: string): GoogleGenAI | null => {
    const apiKey = userApiKey || process.env.API_KEY;

    if (geminiInstance && currentApiKey === apiKey) {
        return geminiInstance;
    }

    if (!apiKey) {
        console.warn("API key is not available. Waiting for user input.");
        geminiInstance = null;
        currentApiKey = null;
        return null;
    }
    
    geminiInstance = new GoogleGenAI({ apiKey });
    currentApiKey = apiKey;
    return geminiInstance;
};

export const parseGeminiError = (error: any, fallbackMessage: string = "An unknown error occurred."): string => {
    console.error("Gemini API Error:", error);
    const message = error?.message || '';
    if (message.includes('API key not valid')) {
        return 'API Key is not valid. Please check your key and try again.';
    }
    if (message.includes('429')) { // Too Many Requests
        return 'You have made too many requests in a short period. Please wait a moment and try again.';
    }
    if (message.includes('503')) { // Service Unavailable
        return 'The service is temporarily unavailable. Please try again later.';
    }
    if (message.includes('fetch failed') || message.includes('NetworkError')) {
        return 'A network error occurred. Please check your internet connection.';
    }
    return fallbackMessage;
};


export const testApiKey = async (apiKey: string): Promise<boolean> => {
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


export const getStepContext = (experiment: Experiment, stepId: number): object => {
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
    if (stepId > 7) context.analysis_summary = getStepSummary(7);
    if (stepId > 8) context.conclusion_summary = getStepSummary(8);


    // For the final steps (9 and 10), create a concise log using summaries
    if (stepId === 9 || stepId === 10) {
        let projectLog = '';
        for (let i = 1; i < stepId; i++) {
            const stepInfo = WORKFLOW_STEPS.find(s => s.id === i);
            if (stepInfo) {
                // Use full output for immediately preceding steps, summaries for older ones
                const output = (stepId - i <= 2) ? getFullOutput(i) : getStepSummary(i);
                projectLog += `--- Summary of Step ${i}: ${stepInfo.title} ---\n${output}\n\n`;
            }
        }
        context.full_project_summary_log = projectLog;
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


export const getPromptForStep = (stepId: number, userInput: string, context: any, fineTuneSettings: FineTuneSettings) => {
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

    switch (stepId) {
        case 1:
            basePrompt = `The user's initial idea is: "${userInput}". Based on this, formulate a clear, focused, and testable research question.`;
            break;
        case 2:
            basePrompt = `For the research question "${context.question}", conduct a brief but comprehensive literature review using your search tool. Identify key findings, existing gaps, and major contributors. **You must cite your sources.** Include URLs for the sources you used in your response.`;
            config.tools = [{ googleSearch: {} }];
            break;
        case 3:
            basePrompt = `Based on the research question: "${context.question}" and this literature review summary: "${context.literature_review_summary}", generate several distinct, testable hypotheses. Present them clearly. The user's initial thought is: "${userInput}"`;
            break;
        case 4:
            basePrompt = `The chosen hypothesis is: "${context.hypothesis}". The user has provided the following input: "${userInput}". Design a detailed, step-by-step methodology to test this hypothesis.`;
            break;
        case 5:
            basePrompt = `Based on the designed methodology summary: "${context.methodology_summary}", create a detailed data collection plan. Specify variables, measurement techniques, and data recording format.`;
            break;
        case 6: // Synthesize Data
            basePrompt = `The user has chosen to synthesize data. Based on the methodology summary: "${context.methodology_summary}" and data plan summary: "${context.data_collection_plan_summary}", generate a plausible, estimated, synthetic dataset in CSV format that could have resulted from this experiment. The data should be realistic and suitable for analysis. Output ONLY the CSV data and a brief, one-sentence summary of what the data represents. Separate the summary and the CSV data with '---'. For example: 'This data shows a positive correlation.\\n---\\nheader1,header2\\n1,2'`;
            break;
        case 7: // Data Analyzer
            expectJson = true;
            basePrompt = `Analyze the following data: \n\`\`\`\n${userInput}\n\`\`\`\nProvide a detailed summary of the findings and suggest at least one relevant chart configuration in the specified JSON format.`;
            config.responseMimeType = "application/json";
            config.responseSchema = DATA_ANALYZER_SCHEMA;
            break;
        case 8:
            basePrompt = `You are tasked with drawing a conclusion for a scientific experiment. Use the following information:\n\n- **Research Question:** "${context.question}"\n- **Data Analysis Summary:** "${context.analysis_summary}"\n- **User's Additional Notes:** "${userInput}"\n\nBased ONLY on the information provided, write a formal conclusion. Your conclusion must directly address the final research question. It must explicitly state whether the hypothesis ("${context.hypothesis}") was supported, rejected, or if the results were inconclusive. You must also discuss the broader implications of the findings and acknowledge potential limitations of the study.`;
            break;
        case 9:
            basePrompt = `You are a peer reviewer. Your task is to conduct a thorough and constructive review of the entire research project, summarized below. Analyze the project for clarity, scientific rigor, logical consistency between steps, and the strength of the final conclusion.\n\nHere is the summarized project log:\n\n${context.full_project_summary_log}`;
            break;
        case 10:
            basePrompt = `You are an expert scientific writer tasked with drafting a publication-ready paper for an audience of experts in **${context.experimentField}**. Use appropriate, professional terminology.\n\nYou must rewrite and synthesize the entire research project log into a cohesive scientific paper in Markdown format. Do not just copy the text; you must rephrase, connect, and structure it professionally. The paper must include the standard sections: Abstract, Introduction, Methods, Results, Discussion, and Conclusion.\n\n**Key instructions:**\n1.  **Rewrite, Don't Copy:** Re-author the content from the project log into a formal academic voice.\n2.  **Incorporate Context:** When writing, you MUST integrate context from the entire project log provided.\n3.  **Address Peer Review:** In the Discussion section, you MUST address the points raised in the simulated peer review.\n\nHere is the summarized project log you must use as your source material:\n\n${context.full_project_summary_log}`;
            break;
        default:
            basePrompt = `An unknown step was requested. Please provide general assistance.`;
    }

    return { basePrompt, expectJson, config };
};