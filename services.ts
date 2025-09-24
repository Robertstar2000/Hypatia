

import Dexie from 'dexie';
import { GoogleGenAI } from "@google/genai";
import {
    Experiment,
    FineTuneSettings,
    STEP_SPECIFIC_TUNING_PARAMETERS,
    DATA_ANALYZER_SCHEMA
} from './config';

// --- DATABASE SETUP (DEXIE) ---
class ExperimentDatabase extends Dexie {
    experiments: Dexie.Table<Experiment, string>;

    constructor() {
        super("ProjectHypatiaDB");
        // Fix: Cast 'this' to Dexie to resolve type error where methods from the base class are not found.
        (this as Dexie).version(2).stores({
            experiments: 'id, title, createdAt'
        });
        // Fix: Cast 'this' to Dexie to resolve type error where methods from the base class are not found.
        this.experiments = (this as Dexie).table("experiments");
    }
}
export const db = new ExperimentDatabase();


// --- GEMINI API SERVICE ---

let geminiInstance: GoogleGenAI | null = null;

export const initializeGemini = (): GoogleGenAI | null => {
    if (geminiInstance) return geminiInstance;
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            throw new Error("API_KEY environment variable not set.");
        }
        geminiInstance = new GoogleGenAI({ apiKey });
        return geminiInstance;
    } catch (error) {
        console.error("Failed to initialize Gemini:", error);
        return null;
    }
};

/**
 * @function getStepContext
 * Gathers outputs from previous steps to provide context for the current step's prompt.
 * @param {Experiment} experiment - The current experiment object.
 * @param {number} stepId - The ID of the current workflow step.
 * @returns {object} An object containing contextual data.
 */
export const getStepContext = (experiment: Experiment, stepId: number): object => {
    const context: any = { experimentField: experiment.field };
    const data = experiment.stepData || {};

    if (stepId > 1) context.question = data[1]?.output || '';
    if (stepId > 2) context.literature_review = data[2]?.output || '';
    if (stepId > 3) context.hypothesis = data[3]?.output || '';
    if (stepId > 4) context.methodology = data[4]?.output || '';
    if (stepId > 5) context.data_collection_plan = data[5]?.output || '';
    if (stepId > 7) context.analysis_summary = data[7]?.output ? JSON.parse(data[7].output).summary : '';
    if (stepId > 8) context.conclusion = data[8]?.output || '';

    // Provide all necessary context for later steps
    if (stepId === 9 || stepId === 10) {
        context.results = data[7]?.output ? JSON.parse(data[7].output).summary : 'No analysis available.';
    }
    if (stepId === 10) {
        context.peer_review = data[9]?.output || 'No peer review available.';
    }

    return context;
};


/**
 * @function getPromptForInputSuggestion
 * Creates a prompt to ask the AI to generate a suggested input for the user.
 * @param {number} stepId - The ID of the current workflow step.
 * @param {object} context - Contextual data from previous steps.
 * @returns {object} An object containing the basePrompt and config for the API call.
 */
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
             basePrompt = `The user needs to analyze data from their experiment. The data collection plan was: "${context.data_collection_plan}". Please provide the raw data to be analyzed below.`;
            break;
        // Steps 2, 5, 8, 9, 10 can be triggered without a specific input suggestion, as they primarily act on previous outputs.
        default:
            basePrompt = null; // No suggestion needed
    }
    return { basePrompt, config };
};


/**
 * @function getPromptForStep
 * Constructs the final prompt and configuration for the Gemini API call based on the current step.
 * @param {number} stepId - The ID of the current workflow step.
 * @param {string} userInput - The user's input for the current step.
 * @param {object} context - The contextual data from previous steps.
 * @param {FineTuneSettings} fineTuneSettings - The user-defined AI settings for this step.
 * @returns {object} An object containing the basePrompt, expectJson flag, and the final config object.
 */
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
    const config: any = {
        systemInstruction,
    };
    
    // Apply general fine-tuning settings to the config
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
            basePrompt = `Based on the research question: "${context.question}" and this literature review: "${context.literature_review}", generate several distinct, testable hypotheses. Present them clearly. The user's initial thought is: "${userInput}"`;
            break;
        case 4:
            basePrompt = `The chosen hypothesis is: "${context.hypothesis}". The user has provided the following input: "${userInput}". Design a detailed, step-by-step methodology to test this hypothesis.`;
            break;
        case 5:
            basePrompt = `Based on the designed methodology: "${context.methodology}", create a detailed data collection plan. Specify variables, measurement techniques, and data recording format.`;
            break;
        case 6: // Synthesize Data
            basePrompt = `The user has chosen to synthesize data. Based on the methodology: "${context.methodology}" and data plan: "${context.data_collection_plan}", generate a plausible, estimated, synthetic dataset in CSV format that could have resulted from this experiment. The data should be realistic and suitable for analysis. Output ONLY the CSV data and a brief, one-sentence summary of what the data represents. Separate the summary and the CSV data with '---'. For example: 'This data shows a positive correlation.\\n---\\nheader1,header2\\n1,2'`;
            break;
        case 7: // Data Analyzer
            expectJson = true;
            basePrompt = `Analyze the following data: \n\`\`\`\n${userInput}\n\`\`\`\nProvide a detailed summary of the findings and suggest at least one relevant chart configuration in the specified JSON format.`;
            config.responseMimeType = "application/json";
            config.responseSchema = DATA_ANALYZER_SCHEMA;
            break;
        case 8:
            basePrompt = `The data analysis results are summarized as: "${context.analysis_summary}". Based on this, draw a conclusion. State whether the hypothesis ("${context.hypothesis}") was supported, and discuss the broader implications and potential limitations of the findings.`;
            break;
        case 9:
            basePrompt = `Conduct a critical peer review of the following research project. Be thorough and constructive.\n\n- Research Question: "${context.question}"\n- Hypothesis: "${context.hypothesis}"\n- Methodology: "${context.methodology}"\n- Results Summary: "${context.results}"\n- Conclusion: "${context.conclusion}"`;
            break;
        case 10:
            basePrompt = `Assemble the entire research project into a well-structured scientific paper draft using Markdown format. Include sections for Introduction (based on the literature review), Methods, Results (based on the analysis summary), Discussion (based on the conclusion and peer review), and a final Conclusion.\n\n- Research Question: "${context.question}"\n- Literature Review: "${context.literature_review}"\n- Hypothesis: "${context.hypothesis}"\n- Methodology: "${context.methodology}"\n- Results Summary: "${context.results}"\n- Conclusion: "${context.conclusion}"\n- Peer Review Feedback: "${context.peer_review}"`;
            break;
        default:
            basePrompt = `An unknown step was requested. Please provide general assistance.`;
    }

    return { basePrompt, expectJson, config };
};