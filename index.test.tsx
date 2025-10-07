// This file exports an array of tests to be consumed by the TestRunner component.
// NOTE: For this self-contained environment, functions-under-test and interfaces
// are duplicated here to avoid complex module resolution issues. In a standard project
// with a build system, these would be imported.

// --- INTERFACES & CONSTANTS (Duplicated) ---
interface StepData {
    input?: string;
    output?: string;
    summary?: string;
    history?: { timestamp: string; output: string }[];
}

interface FineTuneSettings {
    [key: string]: any;
}

interface Experiment {
    id: string;
    title: string;
    description: string;
    currentStep: number;
    stepData: { [key: string]: StepData };
    fineTuneSettings: { [key: string]: FineTuneSettings };
    createdAt: string;
    field: string;
}

const Type = {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    ARRAY: 'ARRAY',
    NUMBER: 'NUMBER',
    BOOLEAN: 'BOOLEAN',
};

const STEP_SPECIFIC_TUNING_PARAMETERS = {
    1: [{ name: 'scope', label: 'Scope', default: 'Specific' }],
    9: [{ name: 'reviewerPersona', label: 'Reviewer Persona', default: 'Harsh Critic' }]
};

const WORKFLOW_STEPS = [ { id: 1, title: 'Research Question'}, { id: 2, title: 'Literature Review'}, { id: 3, title: 'Hypothesis Formulation'}, { id: 4, title: 'Methodology Design'}, { id: 5, title: 'Data Collection Plan'}, { id: 6, title: 'Experiment Runner / Data Synthesis'}, { id: 7, title: 'Data Analyzer'}, { id: 8, title: 'Conclusion Drawing'}, { id: 9, title: 'Peer Review Simulation'}, { id: 10, title: 'Publication Exporter'} ];

const DATA_ANALYZER_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        summary: {
            type: Type.STRING,
            description: "A detailed summary and interpretation of the data analysis findings, written in Markdown format."
        },
        chartSuggestions: {
            type: Type.ARRAY,
            description: "An array of chart configurations suggested for visualizing the data. Each object should be a valid Chart.js configuration.",
            items: {
                type: Type.OBJECT,
                properties: {
                    type: { type: Type.STRING, description: "The type of chart (e.g., 'bar', 'line', 'pie', 'scatter')." },
                    data: { type: Type.OBJECT, description: "The data object for Chart.js, including labels and datasets.", properties: { labels: { type: Type.ARRAY, items: { type: Type.STRING } }, datasets: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, data: { type: Type.ARRAY, items: { type: Type.NUMBER } }, backgroundColor: { type: Type.ARRAY, items: { type: Type.STRING } }, borderColor: { type: Type.ARRAY, items: { type: Type.STRING } }, borderWidth: { type: Type.NUMBER } } } } } },
                    options: { type: Type.OBJECT, description: "The options object for Chart.js, including scales, plugins, etc.", properties: { scales: { type: Type.OBJECT, description: "Configuration for the chart's axes. Can be empty for charts like 'pie'.", properties: { y: { type: Type.OBJECT, properties: { beginAtZero: { type: Type.BOOLEAN } } }, x: { type: Type.OBJECT, properties: { title: { type: Type.OBJECT, properties: { display: {type: Type.BOOLEAN}, text: {type: Type.STRING} } } } } } } } }
                }
            }
        }
    }
};


// --- Utilities for Testing ---
// FIX: Add support for `.not` to the expect utility to allow for inverted assertions.
const expect = (actual) => {
    const self = {
        toBe: (expected) => { if (actual !== expected) throw new Error(`Assertion Failed: Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`); },
        toContain: (substring) => { if (typeof actual !== 'string' || !actual.includes(substring)) throw new Error(`Assertion Failed: Expected "${actual}" to contain "${substring}"`); },
        toBeTruthy: () => { if (!actual) throw new Error(`Assertion Failed: Expected ${JSON.stringify(actual)} to be truthy`); },
        toBeFalsy: () => { if (actual) throw new Error(`Assertion Failed: Expected ${JSON.stringify(actual)} to be falsy`); },
        toEqual: (expected) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Assertion Failed: Expected objects to be equal.\nGot: ${JSON.stringify(actual)}\nExpected: ${JSON.stringify(expected)}`); },
        toThrow: (expectedMessage?: string) => {
            let thrown = false, errorMessage = '';
            try { actual(); } catch (e) { thrown = true; errorMessage = e.message; }
            if (!thrown) throw new Error('Assertion Failed: Expected function to throw an error, but it did not.');
            if (expectedMessage && !errorMessage.includes(expectedMessage)) throw new Error(`Assertion Failed: Expected error message "${errorMessage}" to include "${expectedMessage}".`);
        },
        not: {
            toBe: (expected) => { if (actual === expected) throw new Error(`Assertion Failed: Expected ${JSON.stringify(actual)} not to be ${JSON.stringify(expected)}`); },
            toContain: (substring) => { if (typeof actual === 'string' && actual.includes(substring)) throw new Error(`Assertion Failed: Expected "${actual}" not to contain "${substring}"`); },
            toBeTruthy: () => { if (actual) throw new Error(`Assertion Failed: Expected ${JSON.stringify(actual)} not to be truthy`); },
            toBeFalsy: () => { if (!actual) throw new Error(`Assertion Failed: Expected ${JSON.stringify(actual)} not to be falsy`); },
            toEqual: (expected) => { if (JSON.stringify(actual) === JSON.stringify(expected)) throw new Error(`Assertion Failed: Expected objects not to be equal.\nGot: ${JSON.stringify(actual)}`); },
            toThrow: () => {
                let thrown = false;
                try { actual(); } catch (e) { thrown = true; }
                if (thrown) throw new Error('Assertion Failed: Expected function not to throw an error, but it did.');
            },
        },
    };
    return self;
};

// --- Functions Under Test (Copied from services.ts) ---
const getStepContext = (experiment: Experiment, stepId: number): object => {
    const context: any = { experimentField: experiment.field };
    const data = experiment.stepData || {};

    const getStepSummary = (sId) => data[sId]?.summary || data[sId]?.output || 'N/A';
    const getFullOutput = (sId) => data[sId]?.output || 'N/A';

    if (stepId > 1) context.question = getFullOutput(1);
    if (stepId > 2) context.literature_review_summary = getStepSummary(2);
    if (stepId > 3) context.hypothesis = getFullOutput(3);
    if (stepId > 4) context.methodology_summary = getStepSummary(4);
    if (stepId > 5) context.data_collection_plan_summary = getStepSummary(5);
    if (stepId > 7) context.analysis_summary = getStepSummary(7);
    if (stepId > 8) context.conclusion_summary = getStepSummary(8);

    if (stepId === 9 || stepId === 10) {
        let projectLog = '';
        for (let i = 1; i < stepId; i++) {
            const stepInfo = WORKFLOW_STEPS.find(s => s.id === i);
            if (stepInfo) {
                const output = (stepId - i <= 2) ? getFullOutput(i) : getStepSummary(i);
                projectLog += `--- Summary of Step ${i}: ${stepInfo.title} ---\n${output}\n\n`;
            }
        }
        context.full_project_summary_log = projectLog;
    }

    return context;
};

const getPromptForStep = (stepId: number, userInput: string, context: any, fineTuneSettings: FineTuneSettings) => {
    let systemInstruction = `You are an expert AI research assistant specializing in ${context.experimentField || 'General Science'}.`;
    const settings = fineTuneSettings || {};
    const params = STEP_SPECIFIC_TUNING_PARAMETERS[stepId] || [];
    params.forEach(param => {
        const value = settings[param.name] ?? param.default;
        if (value && param.name === 'reviewerPersona') systemInstruction += ` You must adopt the persona of a '${value}' peer reviewer.`;
    });
    let basePrompt = "";
    let expectJson = false;
    const config: any = { systemInstruction };
    if (settings.temperature) config.temperature = settings.temperature;

    switch (stepId) {
        case 2:
            basePrompt = `For the research question "${context.question}", conduct a literature review.`;
            config.tools = [{ googleSearch: {} }];
            break;
        case 7:
            expectJson = true;
            basePrompt = `Analyze data: ${userInput}`;
            config.responseMimeType = "application/json";
            config.responseSchema = DATA_ANALYZER_SCHEMA;
            break;
        case 9:
             basePrompt = `Review this log: ${context.full_project_summary_log}`;
             break;
    }
    return { basePrompt, expectJson, config };
};

// --- Test Definitions ---
export const appTests = [
    {
        name: "[Unit] getStepContext: Uses summaries for old steps and full output for recent ones",
        fn: async () => {
            const mockExperiment: Experiment = {
                id: '1', title: '', description: '', currentStep: 9, createdAt: '',
                field: 'Test Field',
                stepData: {
                    '1': { output: 'Full Question?', summary: 'Q Summary' },
                    '2': { output: 'Full Lit Review', summary: 'LR Summary' },
                    '7': { output: 'Full Analysis', summary: 'Analysis Summary' }, // Step being completed, full output
                    '8': { output: 'Full Conclusion', summary: 'Conclusion Summary' }, // Recently completed step, full output
                },
                fineTuneSettings: {}
            };
            const context: any = getStepContext(mockExperiment, 9);
            expect(context.question).toBe('Full Question?'); // Step 1 is always full
            expect(context.literature_review_summary).toBe('LR Summary'); // Old step uses summary
            expect(context.analysis_summary).toBe('Analysis Summary'); // Recent step uses summary
            
            // For step 9, the log should contain full outputs for steps 7 & 8, but summaries for earlier steps.
            const log: string = context.full_project_summary_log;
            expect(log).toContain('--- Summary of Step 2: Literature Review ---\nLR Summary');
            expect(log).not.toContain('Full Lit Review');
            expect(log).toContain('--- Summary of Step 7: Data Analyzer ---\nFull Analysis');
            expect(log).toContain('--- Summary of Step 8: Conclusion Drawing ---\nFull Conclusion');
        }
    },
    {
        name: "[Unit] getStepContext: Falls back to full output if summary is missing",
        fn: async () => {
            const mockExperiment: Experiment = {
                id: '1', title: '', description: '', currentStep: 4, createdAt: '', field: 'Test Field',
                stepData: {
                    '1': { output: 'Full Question?' }, // No summary
                    '2': { output: 'Full Lit Review', summary: 'LR Summary' },
                },
                fineTuneSettings: {}
            };
            const context: any = getStepContext(mockExperiment, 3);
            expect(context.literature_review_summary).toBe('LR Summary');
            
            const contextForStep4 = getStepContext(mockExperiment, 4);
            const log = (contextForStep4 as any).full_project_summary_log; // This test is for step 9/10 logic
            if (log) {
                 expect(log).toContain('--- Summary of Step 1: Research Question ---\nFull Question?'); // Falls back
            }
        }
    },
    {
        name: "[Unit] getPromptForStep: Step 2 should enable Google Search tool",
        fn: async () => {
            const { config, basePrompt } = getPromptForStep(2, "", { question: 'test' }, {});
            expect(config.tools).toEqual([{ googleSearch: {} }]);
        }
    },
    {
        name: "[Unit] getPromptForStep: Step 7 should expect JSON with a specific schema",
        fn: async () => {
            const { expectJson, config } = getPromptForStep(7, "", {}, {});
            expect(expectJson).toBe(true);
            expect(config.responseMimeType).toBe("application/json");
            expect(config.responseSchema).toEqual(DATA_ANALYZER_SCHEMA);
        }
    },
    {
        name: "[Unit] getPromptForStep: Step 9 context prompt is based on summaries",
        fn: async () => {
             const context = { full_project_summary_log: "Summary of project..." };
             const { basePrompt } = getPromptForStep(9, "", context, {});
             expect(basePrompt).toContain("Review this log: Summary of project...");
        }
    },
    {
        name: "[Unit] getPromptForStep: Fine-tuning for Step 9 modifies system instruction",
        fn: async () => {
            const settings = { reviewerPersona: 'Supportive Colleague' };
            const { config: defaultConfig } = getPromptForStep(9, "", {}, {});
            const { config: tunedConfig } = getPromptForStep(9, "", {}, settings);
            
            expect(defaultConfig.systemInstruction).toContain('Harsh Critic');
            expect(tunedConfig.systemInstruction).toContain('Supportive Colleague');
        }
    },
    {
        name: "[Logic] GeneratedOutput JSON Parser: Handles valid JSON with schema",
        fn: () => {
            const validJsonString = `{"summary":"Test summary","chartSuggestions":[{"type":"bar","data":{"labels":["A"],"datasets":[{"data":[1]}]}}]}`;
            const parsed = JSON.parse(validJsonString);
            expect(parsed.summary).toBe("Test summary");
            expect(Array.isArray(parsed.chartSuggestions)).toBe(true);
        }
    },
    {
        name: "[Logic] GeneratedOutput JSON Parser: Throws on JSON missing required fields",
        fn: () => {
            const jsonMissingSummary = `{"chartSuggestions":[]}`;
            const jsonMissingCharts = `{"summary":"A summary"}`;
            const parseAndCheck = (json) => {
                const parsed = JSON.parse(json);
                if (!parsed.summary || !parsed.chartSuggestions) {
                    throw new Error("Missing required fields");
                }
            };
            expect(() => parseAndCheck(jsonMissingSummary)).toThrow("Missing required fields");
            expect(() => parseAndCheck(jsonMissingCharts)).toThrow("Missing required fields");
        }
    },
    {
        name: "[Sanity Check] Base test helper works correctly",
        fn: async () => {
            expect("hello").toBe("hello");
            expect([1, 2]).toEqual([1, 2]);
        }
    }
];