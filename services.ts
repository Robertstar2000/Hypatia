



import Dexie from 'dexie';
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
let currentApiKey: string | null = null; // To track which key is active

export const initializeGemini = (userApiKey?: string): GoogleGenAI | null => {
    const apiKey = userApiKey || process.env.API_KEY;

    // If we have an instance and the key hasn't changed, return it.
    if (geminiInstance && currentApiKey === apiKey) {
        return geminiInstance;
    }

    try {
        if (!apiKey) {
            // This is a valid state if user needs to provide a key, so don't throw an error.
            // The UI will handle prompting the user for a key.
            console.warn("API key is not available. Waiting for user input or promo code.");
            return null;
        }
        geminiInstance = new GoogleGenAI({ apiKey });
        currentApiKey = apiKey;
        return geminiInstance;
    } catch (error) {
        console.error("Failed to initialize Gemini:", error);
        geminiInstance = null;
        currentApiKey = null;
        return null;
    }
};

/**
 * @function testApiKey
 * Performs a simple, low-cost API call to validate if a key is functional.
 * @param {string} apiKey - The user-provided API key to test.
 * @returns {Promise<boolean>} True if the key is valid, false otherwise.
 */
export const testApiKey = async (apiKey: string): Promise<boolean> => {
    try {
        const testGemini = new GoogleGenAI({ apiKey });
        // A minimal request to check for authentication errors.
        await testGemini.models.generateContent({
             model: 'gemini-2.5-flash',
             contents: 'test',
             config: { thinkingConfig: { thinkingBudget: 0 } } // Make it as fast and cheap as possible
        });
        return true;
    } catch (error) {
        console.error("API Key validation failed:", error);
        return false;
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

    const getFullStep = (sId) => ({ input: data[sId]?.input || 'N/A', output: data[sId]?.output || 'N/A' });

    // General context available to most steps
    if (stepId > 1) context.question = data[1]?.output || '';
    if (stepId > 2) context.literature_review = data[2]?.output || '';
    if (stepId > 3) context.hypothesis = data[3]?.output || '';
    if (stepId > 4) context.methodology = data[4]?.output || '';
    if (stepId > 5) context.data_collection_plan = data[5]?.output || '';

    let analysisSummary = 'No analysis available.';
    if (data[7]?.output) {
        try {
            // Attempt to parse the summary from the JSON output of step 7
            analysisSummary = JSON.parse(data[7].output).summary;
        } catch {
            // If parsing fails, use the raw output as a fallback.
            analysisSummary = data[7].output;
        }
    }
    if (stepId > 7) context.analysis_summary = analysisSummary;
    if (stepId > 8) context.conclusion = data[8]?.output || '';

    // Step 8: Conclusion needs specific context from step 1
    if (stepId === 8) {
        context.step1_input = data[1]?.input || 'N/A';
    }

    // Step 9: Peer review needs the full log of inputs and outputs from steps 1-8
    if (stepId === 9) {
        let projectLog = '';
        for (let i = 1; i <= 8; i++) {
            const stepInfo = WORKFLOW_STEPS.find(s => s.id === i);
            if (stepInfo) {
                const step = getFullStep(i);
                projectLog += `--- Step ${i}: ${stepInfo.title} ---\n[INPUT]:\n${step.input}\n\n[OUTPUT]:\n${step.output}\n\n`;
            }
        }
        context.full_project_log = projectLog;
    }

    // Step 10: Publication needs the full log from steps 1-9
    if (stepId === 10) {
        let projectLog = '';
        for (let i = 1; i <= 9; i++) {
            const stepInfo = WORKFLOW_STEPS.find(s => s.id === i);
            if (stepInfo) {
                const step = getFullStep(i);
                projectLog += `--- Step ${i}: ${stepInfo.title} ---\n[INPUT FOR STEP ${i}]:\n${step.input}\n\n[OUTPUT FROM STEP ${i}]:\n${step.output}\n\n`;
            }
        }
        context.full_project_log = projectLog;
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
            // Data for step 7 always comes from step 6, so no suggestion is needed.
            basePrompt = null;
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
            basePrompt = `You are tasked with drawing a conclusion for a scientific experiment. Use the following information:\n\n- **Initial Research Idea:** "${context.step1_input}"\n- **Final Research Question:** "${context.question}"\n- **Data Analysis Summary:** "${context.analysis_summary}"\n- **User's Additional Notes:** "${userInput}"\n\nBased ONLY on the information provided, write a formal conclusion. Your conclusion must directly address the final research question. It must explicitly state whether the hypothesis ("${context.hypothesis}") was supported, rejected, or if the results were inconclusive. You must also discuss the broader implications of the findings and acknowledge potential limitations of the study.`;
            break;
        case 9:
            basePrompt = `You are a peer reviewer. Your task is to conduct a thorough and constructive review of the entire research project provided below. Analyze each step, from the initial question to the final conclusion, based on both the user's input and the AI's output.\n\nYour review should be a summary list of recommended improvements and changes. Focus on clarity, scientific rigor, logical consistency between steps, and the strength of the final conclusion.\n\nHere is the complete project log:\n\n${context.full_project_log}`;
            break;
        case 10:
            basePrompt = `You are an expert scientific writer tasked with drafting a publication-ready paper. Your audience consists of experts in the field of **${context.experimentField}**. Use appropriate, professional terminology.\n\nYou must rewrite and synthesize the entire research project log into a cohesive scientific paper in Markdown format. Do not just copy the text; you must rephrase, connect, and structure it professionally. The paper must include the standard sections: Abstract, Introduction, Methods, Results, Discussion, and Conclusion.\n\n**Key instructions:**\n1.  **Rewrite, Don't Copy:** Re-author the content from the project log into a formal academic voice.\n2.  **Incorporate Citations:** When writing the Introduction, you MUST integrate citations from the Literature Review (Step 2). The full text of the literature review is provided in the log.\n3.  **Address Peer Review:** In the Discussion section, you MUST address the points raised in the simulated peer review (Step 9).\n4.  **Structure:** Create a seamless narrative connecting all parts of the research.\n\nHere is the complete project log you must use as your source material:\n\n${context.full_project_log}`;
            break;
        default:
            basePrompt = `An unknown step was requested. Please provide general assistance.`;
    }

    return { basePrompt, expectJson, config };
};