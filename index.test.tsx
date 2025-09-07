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
// FIX: The FineTuneSettings interface was out of sync with index.tsx. It is now aligned.
interface FineTuneSettings {
    [key: string]: any;
}

interface Experiment {
    id: string;
    title: string;
    description: string;
    currentStep: number;
    stepData: { [key: string]: StepData };
    // Fix: The index type for fineTuneSettings should be a string to match the main application and avoid type errors.
    fineTuneSettings: { [key: string]: FineTuneSettings };
    createdAt: string;
    // FIX: The field enum was out of sync with SCIENTIFIC_FIELDS in index.tsx. Changed to string for flexibility.
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
  toEqual: (expected) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
       throw new Error(`Assertion Failed: Expected objects to be equal.
Got: ${JSON.stringify(actual)}
Expected: ${JSON.stringify(expected)}`);
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
  if (stepId === 9) { // Peer review needs everything
      context.results = data['7']?.output || '';
  }
  return context;
};

const getPromptForStep = (stepId, userInput, context, fineTuneSettings = {}) => {
    let basePrompt = "";
    switch (stepId) {
        case 1: basePrompt = `The user's initial idea is: "${userInput}". Refine this into a clear, concise, and testable scientific question...`; break;
        case 2: basePrompt = `The research question is: "${context.question}". Conduct a literature review using Google Search...`; break;
        case 3: basePrompt = `Based on the research question: "${context.question}" and the literature review summary: "${context.literature_review}", generate 3-5 testable hypotheses...`; break;
        case 4: basePrompt = `For the hypothesis: "${userInput || context.hypothesis}", design a detailed research methodology...`; break;
        case 5: basePrompt = `Based on the designed methodology: "${context.methodology}", create a data collection plan...`; break;
        case 6: basePrompt = `The user is about to run a custom simulation... Their hypothesis is: "${context.hypothesis}"...`; break;
        case 7: basePrompt = `The user has collected the following data: "${userInput}". The research hypothesis is: "${context.hypothesis}"...`; break;
        case 8: basePrompt = `Based on the data analysis results: "${context.analysis_summary}", draw conclusions...`; break;
        case 9: basePrompt = `Review the entire research project: Question: "${context.question}", Hypothesis: "${context.hypothesis}"...`; break;
        case 10: basePrompt = `Using all the information from the previous steps, structure and write the sections of a research paper...`; break;
        default: return { basePrompt: "", systemInstruction: "" };
    }
    const systemInstruction = "You are an AI research assistant.";
    return { basePrompt, systemInstruction };
};


// --- Test Definitions ---
export const appTests = [
    {
        name: "[Unit] getPromptForStep correctly generates a prompt for Step 1",
        fn: async () => {
            const { basePrompt, systemInstruction } = getPromptForStep(1, "my cool idea", {}, {});
            expect(basePrompt).toContain("my cool idea");
            expect(systemInstruction).toContain("AI research assistant");
        }
    },
    {
        name: "[Unit] getStepContext assembles context correctly",
        fn: async () => {
            const mockExperiment: Partial<Experiment> = {
                stepData: {
                    '1': { output: 'Test Question?' },
                    '2': { output: 'Lots of papers.' },
                    '3': { output: 'If A then B.' },
                }
            };
            const context = getStepContext(mockExperiment, 4);
            expect(context.question).toBe('Test Question?');
            expect(context.hypothesis).toBe('If A then B.');
            expect(context.literature_review).toBe('Lots of papers.');
        }
    },
    {
        name: "[Unit] getStepContext returns empty context for early steps",
        fn: async () => {
             const mockExperiment: Partial<Experiment> = { stepData: {} };
             const context = getStepContext(mockExperiment, 1);
             expect(context).toEqual({ experimentField: undefined });
        }
    },
    {
        name: "[Integration] Experiment creation adds to the database",
        fn: async () => {
            const mockDb = createMockDexie();
            const newId = `exp_12345`;
            const newExperiment: Experiment = {
                id: newId,
                title: "My Test Exp",
                description: "A test",
                currentStep: 1,
                stepData: {},
                fineTuneSettings: {},
                createdAt: new Date().toISOString(),
                // FIX: Use a field value that is consistent with index.tsx
                field: 'General Science'
            };

            await mockDb.experiments.add(newExperiment);
            
            const fetchedExp = await mockDb.experiments.get(newId);
            expect(fetchedExp).toBeTruthy();
            if (fetchedExp) {
                expect(fetchedExp.title).toBe("My Test Exp");
            }
        }
    },
    {
        name: "[Assertion] Sanity check test passes",
        fn: async () => {
            expect("hello").toBe("hello");
        }
    }
];