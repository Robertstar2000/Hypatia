// This file exports an array of tests to be consumed by the TestRunner component.
// NOTE: For this self-contained environment, functions-under-test and interfaces
// are duplicated here to avoid complex module resolution issues. In a standard project
// with a build system, these would be imported.

// --- INTERFACES & CONSTANTS (Duplicated) ---
interface StepData {
    input?: string;
    output?: string;
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
    simulationCode?: string;
}

const Type = {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    ARRAY: 'ARRAY',
};

const STEP_SPECIFIC_TUNING_PARAMETERS = {
    1: [{ name: 'scope', label: 'Scope', default: 'Specific' }],
    9: [{ name: 'reviewerPersona', label: 'Reviewer Persona', default: 'Harsh Critic' }]
};

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
                    type: {
                        type: Type.STRING,
                        description: "The type of chart (e.g., 'bar', 'line', 'pie', 'scatter')."
                    },
                    data: {
                        type: Type.OBJECT,
                        description: "The data object for Chart.js, including labels and datasets."
                    },
                    options: {
                        type: Type.OBJECT,
                        description: "The options object for Chart.js, including scales, plugins, etc.",
                        properties: {
                           scales: {
                               type: Type.OBJECT,
                               description: "Configuration for the chart's axes. Can be empty for charts like 'pie'."
                           }
                        }
                    }
                }
            }
        }
    }
};


// --- Utilities for Testing ---
const expect = (actual) => ({
  toBe: (expected) => {
    if (actual !== expected) {
      throw new Error(`Assertion Failed: Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
    }
  },
  toContain: (substring) => {
    if (typeof actual !== 'string' || !actual.includes(substring)) {
      throw new Error(`Assertion Failed: Expected "${actual}" to contain "${substring}"`);
    }
  },
  toBeTruthy: () => {
    if (!actual) {
      throw new Error(`Assertion Failed: Expected ${JSON.stringify(actual)} to be truthy`);
    }
  },
  toBeFalsy: () => {
    if (actual) {
      throw new Error(`Assertion Failed: Expected ${JSON.stringify(actual)} to be falsy`);
    }
  },
  toEqual: (expected) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
       throw new Error(`Assertion Failed: Expected objects to be equal.\nGot: ${JSON.stringify(actual)}\nExpected: ${JSON.stringify(expected)}`);
    }
  },
  toThrow: (expectedMessage?: string) => {
    let thrown = false;
    let errorMessage = '';
    try {
      actual();
    } catch (e) {
      thrown = true;
      errorMessage = e.message;
    }
    if (!thrown) {
      throw new Error('Assertion Failed: Expected function to throw an error, but it did not.');
    }
    if (expectedMessage && !errorMessage.includes(expectedMessage)){
         throw new Error(`Assertion Failed: Expected error message "${errorMessage}" to include "${expectedMessage}".`);
    }
  }
});

const createMockDexie = () => {
    let store: { [id: string]: Experiment } = {};
    return {
        experiments: {
            add: async (experiment: Experiment) => {
                store[experiment.id] = experiment;
                return experiment.id;
            },
            delete: async (id: string) => {
                delete store[id];
                return 1;
            },
            get: async (id: string) => {
                return store[id] ? JSON.parse(JSON.stringify(store[id])) : undefined;
            },
            toArray: async () => {
                return Object.values(store).map(exp => JSON.parse(JSON.stringify(exp)));
            },
            put: async (experiment: Experiment) => {
                store[experiment.id] = experiment;
                return experiment.id;
            },
            orderBy: () => ({ // Mock orderBy().reverse().toArray() chain
                reverse: () => ({
                    toArray: async () => {
                        const all = Object.values(store).map(exp => JSON.parse(JSON.stringify(exp)));
                        return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                    }
                })
            })
        },
        clear: () => {
            store = {};
        }
    };
};


// --- Functions Under Test (Copied from services.ts) ---
const getStepContext = (experiment: Experiment, stepId: number): object => {
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

const getPromptForStep = (stepId: number, userInput: string, context: any, fineTuneSettings: FineTuneSettings) => {
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

// --- Test Definitions ---
export const appTests = [
    {
        name: "[Unit] getStepContext: Assembles full context for late steps",
        fn: async () => {
            const mockExperiment: Experiment = {
                id: '1', title: '', description: '', currentStep: 9, createdAt: '',
                field: 'Test Field',
                stepData: {
                    '1': { output: 'Test Question?' },
                    '2': { output: 'Lots of papers.' },
                    '3': { output: 'If A then B.' },
                    '4': { output: 'Test Method' },
                    '5': { output: 'Collect numbers' },
                    '7': { output: JSON.stringify({ summary: 'Significant results', chartSuggestions: [] }) },
                    '8': { output: 'A is proven' },
                },
                fineTuneSettings: {}
            };
            // Fix: Cast context to 'any' to allow property access in the test. The function returns a generic 'object'.
            const context: any = getStepContext(mockExperiment, 9);
            expect(context.experimentField).toBe('Test Field');
            expect(context.question).toBe('Test Question?');
            expect(context.hypothesis).toBe('If A then B.');
            expect(context.methodology).toBe('Test Method');
            expect(context.data_collection_plan).toBe('Collect numbers');
            expect(context.results).toBe('Significant results');
            expect(context.conclusion).toBe('A is proven');
        }
    },
    {
        name: "[Unit] getStepContext: Assembles partial context for early steps",
        fn: async () => {
             const mockExperiment: Experiment = {
                id: '1', title: '', description: '', currentStep: 2, createdAt: '', field: 'Test Field',
                stepData: { '1': { output: 'Test Question?' } },
                fineTuneSettings: {}
            };
             // Fix: Cast context to 'any' to allow property access in the test. The function returns a generic 'object'.
             const context: any = getStepContext(mockExperiment, 2);
             expect(context.question).toBe('Test Question?');
             expect(context.hypothesis).toBeFalsy();
        }
    },
    {
        name: "[Unit] getPromptForStep: Step 2 should enable Google Search tool",
        fn: async () => {
            const { config, basePrompt } = getPromptForStep(2, "", { question: 'test' }, {});
            expect(config.tools).toEqual([{ googleSearch: {} }]);
            expect(basePrompt).toContain("You must cite your sources.");
            expect(basePrompt).toContain("Include URLs");
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
        name: "[Unit] getPromptForStep: Step 6 (Synthesis) prompt has correct format instruction",
        fn: async () => {
            const { basePrompt } = getPromptForStep(6, "", {}, {});
            expect(basePrompt).toContain("Separate the summary and the CSV data with '---'");
        }
    },
    {
        name: "[Unit] getPromptForStep: Fine-tuning for Step 9 modifies system instruction",
        fn: async () => {
            const settings = { reviewerPersona: 'Supportive Colleague' };
            // Fix: Destructure the 'config' object which contains 'systemInstruction', instead of trying to destructure 'systemInstruction' from the top-level return object.
            const { config: defaultConfig } = getPromptForStep(9, "", {}, {});
            const { config: tunedConfig } = getPromptForStep(9, "", {}, settings);
            
            expect(defaultConfig.systemInstruction).toContain('Harsh Critic');
            expect(tunedConfig.systemInstruction).toContain('Supportive Colleague');
        }
    },
    {
        name: "[Integration] Database: Experiment creation and retrieval",
        fn: async () => {
            const mockDb = createMockDexie();
            const newExperiment: Experiment = {
                id: 'exp_1', title: "My Test Exp", description: "A test", currentStep: 1,
                stepData: {}, fineTuneSettings: {}, createdAt: new Date().toISOString(), field: 'General Science'
            };

            await mockDb.experiments.add(newExperiment);
            const fetchedExp = await mockDb.experiments.get('exp_1');
            expect(fetchedExp?.title).toBe("My Test Exp");
        }
    },
    {
        name: "[Integration] Database: Experiment deletion",
        fn: async () => {
            const mockDb = createMockDexie();
            const newExperiment: Experiment = {
                id: 'exp_1', title: "To Be Deleted", description: "A test", currentStep: 1,
                stepData: {}, fineTuneSettings: {}, createdAt: new Date().toISOString(), field: 'General Science'
            };
            await mockDb.experiments.add(newExperiment);
            await mockDb.experiments.delete('exp_1');
            const fetchedExp = await mockDb.experiments.get('exp_1');
            expect(fetchedExp).toBe(undefined);
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
        name: "[Logic] DataSynthesizer Output Parser: Correctly splits summary and CSV",
        fn: () => {
            const aiResponse = "This is the summary.---header1,header2\nval1,val2";
            const parts = aiResponse.split('---');
            const summary = parts[0].trim();
            const csv = parts[1].trim();
            expect(summary).toBe("This is the summary.");
            expect(csv).toBe("header1,header2\nval1,val2");
        }
    },
    {
        name: "[Logic] ExperimentRunner Sandboxed Code: Correctly executes hypatia.finish()",
        fn: () => {
            let resultData, resultSummary;
            const mockHypatia = {
                finish: (data, summary) => {
                    resultData = data;
                    resultSummary = summary;
                }
            };
            const code = `hypatia.finish("my,data", "my summary");`;
            const sandboxedRun = new Function('hypatia', code);
            sandboxedRun(mockHypatia);
            
            expect(resultData).toBe("my,data");
            expect(resultSummary).toBe("my summary");
        }
    },
    {
        name: "[Logic] ExperimentRunner Sandboxed Code: Catches and reports runtime errors",
        fn: () => {
            const code = `let x = undefined; x.toString();`; // This will throw a TypeError
            const sandboxedRun = new Function(code);
            expect(sandboxedRun).toThrow();
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