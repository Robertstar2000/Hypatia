// This file exports an array of tests to be consumed by the TestRunner component.
// NOTE: For this self-contained environment, functions-under-test and interfaces
// are duplicated here to avoid complex module resolution issues. In a standard project
// with a build system, these would be imported.

// --- INTERFACES (Duplicated) ---
interface StepData {
    input?: string;
    output?: string;
    history?: { timestamp: string; output: string }[];
}

/** @interface FineTuneSettings Represents the AI settings for a specific step */
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
       throw new Error(`Assertion Failed: Expected objects to be equal.
Got: ${JSON.stringify(actual)}
Expected: ${JSON.stringify(expected)}`);
    }
  },
  toThrow: () => {
    let thrown = false;
    try {
      actual();
    } catch (e) {
      thrown = true;
    }
    if (!thrown) {
      throw new Error('Assertion Failed: Expected function to throw an error, but it did not.');
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

const STEP_SPECIFIC_TUNING_PARAMETERS = {
    1: [{ name: 'scope', label: 'Scope', default: 'Specific' }],
    9: [{ name: 'reviewerPersona', label: 'Reviewer Persona', default: 'Harsh Critic' }]
};


// --- Functions Under Test (Duplicated from index.tsx) ---
const getStepContext = (experiment: Partial<Experiment>, stepId: number) => {
  const context: any = { experimentField: experiment.field };
  const data = experiment.stepData || {};
  if (stepId > 1) context.question = data['1']?.output || '';
  if (stepId > 2) context.literature_review = data['2']?.output || '';
  if (stepId > 3) context.hypothesis = data['3']?.output || '';
  if (stepId > 4) context.methodology = data['4']?.output || '';
  if (stepId > 7) context.analysis_summary = data['7']?.output || '';
  if (stepId > 8) context.conclusion = data['8']?.output || '';
  if (stepId === 9) {
      context.results = data['7']?.output || '';
  }
  return context;
};

const getPromptForStep = (stepId, userInput, context, fineTuneSettings: FineTuneSettings) => {
    let systemInstruction = `You are an AI research assistant specializing in ${context.experimentField || 'General Science'}.`;
    const settings = fineTuneSettings || {};
    const params = STEP_SPECIFIC_TUNING_PARAMETERS[stepId] || [];
    const instructions = [];
    params.forEach(param => {
        const value = settings[param.name] ?? param.default;
        if (value === undefined) return;
        if (param.name === 'reviewerPersona') {
            systemInstruction += ` You are now acting as a critical peer reviewer with the persona of a '${value}'.`;
        } else {
             instructions.push(`For the parameter '${param.label}', the value must be '${value}'.`);
        }
    });
    if (instructions.length > 0) {
        systemInstruction += ` Strictly adhere to the following tuning parameters: ${instructions.join(' ')}.`;
    }

    let basePrompt = "";
    let useSearch = false;
    let expectJson = false;

    switch (stepId) {
        case 1: basePrompt = `The user's initial idea for a research topic is: "${userInput}".`; break;
        case 2: useSearch = true; basePrompt = `The research question is: "${context.question}".`; break;
        case 3: basePrompt = `Based on the research question: "${context.question}" and the provided literature review summary: "${context.literature_review}", generate distinct, testable hypotheses.`; break;
        case 4: basePrompt = `The chosen hypothesis is: "${userInput || context.hypothesis}".`; break;
        case 5: basePrompt = `Based on the designed methodology: "${context.methodology}", create a detailed data collection plan.`; break;
        case 6: basePrompt = `Generate a plausible, synthetic dataset that could have resulted from this experiment.`; break;
        case 7: expectJson = true; basePrompt = `Analyze the following data: "${userInput}".`; break;
        case 8: basePrompt = `The data analysis results are summarized as: "${context.analysis_summary}".`; break;
        case 9: basePrompt = `Conduct a peer review of the following research project. - Research Question: "${context.question}"`; break;
        case 10: basePrompt = `Generate a draft for a scientific publication based on the entire research project. - Literature Review Summary: "${context.literature_review}"`; break;
        default: basePrompt = `An unknown step was requested.`;
    }
    return { basePrompt, systemInstruction, useSearch, expectJson };
};

// --- Test Definitions ---
export const appTests = [
    {
        name: "[Unit] getStepContext: Assembles full context for late steps",
        fn: async () => {
            const mockExperiment: Partial<Experiment> = {
                field: 'Test Field',
                stepData: {
                    '1': { output: 'Test Question?' },
                    '2': { output: 'Lots of papers.' },
                    '3': { output: 'If A then B.' },
                    '4': { output: 'Test Method' },
                    '7': { output: 'Significant results' },
                    '8': { output: 'A is proven' },
                }
            };
            const context = getStepContext(mockExperiment, 9);
            expect(context.experimentField).toBe('Test Field');
            expect(context.question).toBe('Test Question?');
            expect(context.hypothesis).toBe('If A then B.');
            expect(context.methodology).toBe('Test Method');
            expect(context.results).toBe('Significant results');
            expect(context.conclusion).toBe('A is proven');
        }
    },
    {
        name: "[Unit] getStepContext: Assembles partial context for early steps",
        fn: async () => {
             const mockExperiment: Partial<Experiment> = {
                field: 'Test Field',
                stepData: { '1': { output: 'Test Question?' } }
            };
             const context = getStepContext(mockExperiment, 2);
             expect(context.question).toBe('Test Question?');
             expect(context.hypothesis).toBeFalsy();
        }
    },
    {
        name: "[Unit] getPromptForStep: Step 2 should enable search",
        fn: async () => {
            const { useSearch } = getPromptForStep(2, "", { question: 'test' }, {});
            expect(useSearch).toBe(true);
        }
    },
    {
        name: "[Unit] getPromptForStep: Step 7 should expect JSON",
        fn: async () => {
            const { expectJson } = getPromptForStep(7, "", {}, {});
            expect(expectJson).toBe(true);
        }
    },
    {
        name: "[Unit] getPromptForStep: Fine-tuning for Step 9 (Peer Review) modifies system instruction",
        fn: async () => {
            const settings = { reviewerPersona: 'Supportive Colleague' };
            const { systemInstruction: defaultInstruction } = getPromptForStep(9, "", {}, {});
            const { systemInstruction: tunedInstruction } = getPromptForStep(9, "", {}, settings);
            
            expect(defaultInstruction).toContain('Harsh Critic');
            expect(tunedInstruction).toContain('Supportive Colleague');
        }
    },
    {
        name: "[Unit] getPromptForStep: Fine-tuning for Step 1 modifies system instruction",
        fn: async () => {
            const settings = { scope: 'Broad' };
             const { systemInstruction: tunedInstruction } = getPromptForStep(1, "", {}, settings);
            expect(tunedInstruction).toContain("the value must be 'Broad'");
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
        name: "[Integration] Database: Experiment update",
        fn: async () => {
            const mockDb = createMockDexie();
            const originalExp: Experiment = {
                id: 'exp_1', title: "Original Title", description: "A test", currentStep: 1,
                stepData: {}, fineTuneSettings: {}, createdAt: new Date().toISOString(), field: 'General Science'
            };
            await mockDb.experiments.add(originalExp);
            const updatedExp = { ...originalExp, title: "Updated Title" };
            await mockDb.experiments.put(updatedExp);
            const fetchedExp = await mockDb.experiments.get('exp_1');
            expect(fetchedExp?.title).toBe("Updated Title");
        }
    },
    {
        name: "[Logic] GeneratedOutput JSON Parser: Handles valid JSON",
        fn: () => {
            const validJsonString = `{"summary":"Test summary","chartSuggestions":[{"type":"bar","data":{"labels":["A"],"datasets":[{"data":[1]}]}}]}`;
            const parsed = JSON.parse(validJsonString);
            expect(parsed.summary).toBe("Test summary");
        }
    },
    {
        name: "[Logic] GeneratedOutput JSON Parser: Handles valid JSON with markdown backticks",
        fn: () => {
            const jsonWithTicks = "```json\n{\"summary\":\"Test summary\",\"chartSuggestions\":[{\"type\":\"bar\"}]}\n```";
            const cleaned = jsonWithTicks.replace(/^```json\s*/, '').replace(/```$/, '').trim();
            const parsed = JSON.parse(cleaned);
            expect(parsed.summary).toBe("Test summary");
        }
    },
    {
        name: "[Logic] GeneratedOutput JSON Parser: Throws on invalid JSON",
        fn: () => {
            const invalidJson = `{"summary": "missing brace"`;
            expect(() => JSON.parse(invalidJson)).toThrow();
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
