import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { marked } from 'marked';
import { appTests } from './index.test.tsx';
import { Chart, registerables } from 'chart.js';
import Dexie, { type Table } from 'dexie';

Chart.register(...registerables);

declare var bootstrap: any;

// Configure marked for better markdown rendering
marked.setOptions({
    gfm: true,
    breaks: true,
});

// --- DATA STRUCTURES & CONFIG ---
const SCIENTIFIC_FIELDS = [
    'General Science',
    'Computer Science',
    'Neuroscience',
    'Molecular Biology',
    'Particle Physics',
    'Organic Chemistry',
    'Environmental Science',
    'Materials Science',
    'Astronomy & Astrophysics',
    'Psychology',
    'Economics',
    'Mechanical Engineering',
    'Electrical Engineering',
    'Civil Engineering',
    'Medicine',
    'Genetics',
    'Ecology',
    'Geology',
    'Mathematics',
    'Artificial Intelligence'
];


// --- DATA INTERFACES ---
/** @interface StepData Represents the data stored for a single workflow step. */
interface StepData {
    input?: string;
    output?: string;
    history?: { timestamp: string; output: string }[];
}

/** @interface FineTuneSettings Represents the AI settings for a specific step */
interface FineTuneSettings {
    [key: string]: any;
}

/** @interface Experiment Represents a single research project. */
interface Experiment {
    id: string;
    title: string;
    description: string;
    currentStep: number;
    stepData: { [key: string]: StepData };
    fineTuneSettings: { [key: string]: FineTuneSettings };
    createdAt: string;
    field: (typeof SCIENTIFIC_FIELDS)[number];
    simulationCode?: string;
}

/** @interface ToastContextType Defines the shape of the toast notification context. */
interface ToastContextType {
    addToast: (message: string, type?: 'success' | 'danger' | 'warning' | 'info') => void;
}

// --- DATABASE SETUP with Dexie.js ---
class HypatiaDB extends Dexie {
    experiments!: Table<Experiment>;

    constructor() {
        super('hypatiaDB');
        this.version(1).stores({
            experiments: 'id, createdAt' // Primary key 'id', index 'createdAt' for sorting
        });
    }
}

const db = new HypatiaDB();


// --- TOAST NOTIFICATION CONTEXT ---
const ToastContext = React.createContext<ToastContextType | null>(null);
const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const addToast = useCallback((message, type = 'success') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 5000);
    }, []);

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <div className="toast-container position-fixed bottom-0 end-0 p-3" style={{zIndex: 1100}}>
                {toasts.map(toast => (
                    <div key={toast.id} className={`toast show bg-${toast.type} text-white`} role="alert">
                        <div className="toast-body">{toast.message}</div>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};
const useToast = () => React.useContext(ToastContext);

// --- GEMINI API INITIALIZATION ---
const initializeGemini = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        console.error("API Key is missing. Please set up the environment variable.");
        return null;
    }
    try {
        return new GoogleGenAI({ apiKey });
    } catch (e) {
        console.error("Failed to initialize Gemini API:", e);
        return null;
    }
};

// --- APP CONSTANTS & WORKFLOW ---
const WORKFLOW_STEPS = [
    { id: 1, title: 'Research Question', icon: 'bi-question-circle', description: 'Start by defining a clear, focused research question.' },
    { id: 2, title: 'Literature Review', icon: 'bi-book', description: 'Survey existing research to understand the current landscape. (Uses Google Search)' },
    { id: 3, title: 'Hypothesis Formulation', icon: 'bi-lightbulb', description: 'Formulate a testable hypothesis based on your question and review.' },
    { id: 4, title: 'Methodology Design', icon: 'bi-diagram-3', description: 'Design the experimental methods you will use to test your hypothesis.' },
    { id: 5, title: 'Data Collection Plan', icon: 'bi-clipboard-data', description: 'Outline how you will collect the necessary data.' },
    { id: 6, title: 'Experiment Runner / Data Synthesis', icon: 'bi-beaker', description: 'Run a virtual experiment, upload data, or synthesize a plausible dataset.' },
    { id: 7, title: 'Data Analyzer', icon: 'bi-graph-up-arrow', description: 'Analyze the collected data to identify patterns and insights.' },
    { id: 8, title: 'Conclusion Drawing', icon: 'bi-trophy', description: 'Draw conclusions based on your analysis and the initial hypothesis.' },
    { id: 9, title: 'Peer Review Simulation', icon: 'bi-people', description: 'Get simulated feedback on your research from an AI peer.' },
    { id: 10, title: 'Publication Exporter', icon: 'bi-journal-richtext', description: 'Generate a draft of your research paper for publication.' }
];

const DEFAULT_STEP_INPUTS = {
    1: 'The effect of intermittent fasting on metabolic health markers.',
    2: '', // Step 2 is based on the output of Step 1, so no default input needed.
    3: 'Hypothesis 1: Intermittent fasting will lead to a significant reduction in fasting insulin levels.',
    4: 'A randomized controlled trial with two groups: one following an intermittent fasting protocol and a control group with a regular diet.',
    5: 'Collect blood samples at baseline and after 12 weeks to measure fasting glucose, insulin, and lipid profiles. Data will be recorded in a CSV file.',
    6: '', // Step 6 is for simulation or synthesis, no text input needed to start.
    7: 'time,group,fasting_insulin\n0,control,15.1\n0,fasting,14.8\n84,control,14.5\n84,fasting,10.2',
    8: '', // Based on Step 7 output.
    9: '', // Based on previous steps.
    10: '', // This step generates, doesn't take input.
};


const STEP_SPECIFIC_TUNING_PARAMETERS = {
    1: [
        { name: 'scope', label: 'Scope', type: 'select', options: ['Broad', 'Specific', 'Niche'], default: 'Specific', description: 'Define the breadth of the research question.' },
        { name: 'questionType', label: 'Question Type', type: 'select', options: ['Descriptive', 'Comparative', 'Relational'], default: 'Comparative', description: 'The nature of the question (e.g., what is vs. is x better than y).' },
        // FIX: The default value for a range input must be a number, not a string, to prevent type errors.
        { name: 'clarity', label: 'Clarity', type: 'range', min: 0.5, max: 1.0, step: 0.1, default: 0.8, description: 'How precise and unambiguous the question should be.' },
        { name: 'testability', label: 'Testability', type: 'boolean', default: true, description: 'Ensure the question can be practically tested.' },
    ],
    2: [
        { name: 'sourceRecency', label: 'Source Recency', type: 'select', options: ['Last Year', 'Last 5 Years', 'Any Time'], default: 'Last 5 Years', description: 'Filter sources by publication date.' },
        { name: 'summaryLength', label: 'Summary Length', type: 'select', options: ['Brief', 'Standard', 'Detailed'], default: 'Standard', description: 'The level of detail for the literature summary.' },
        { name: 'focus', label: 'Focus Area', type: 'select', options: ['Key Findings', 'Methodologies', 'Gaps in Research'], default: 'Gaps in Research', description: 'The main emphasis of the review.' },
        // FIX: The default value for a range input must be a number, not a string, to prevent type errors.
        { name: 'sourceCount', label: 'Number of Sources', type: 'range', min: 3, max: 8, step: 1, default: 5, description: 'How many key sources to identify and cite.' },
    ],
    3: [
        // FIX: The default value for a range input must be a number, not a string, to prevent type errors.
        { name: 'hypothesisCount', label: 'Number of Hypotheses', type: 'range', min: 1, max: 5, step: 1, default: 3, description: 'How many distinct hypotheses to generate.' },
        { name: 'style', label: 'Hypothesis Style', type: 'select', options: ['If/Then Statement', 'Null/Alternative Pair', 'Directional Prediction'], default: 'Directional Prediction', description: 'The format for presenting the hypotheses.' },
        // FIX: The default value for a range input must be a number, not a string, to prevent type errors.
        { name: 'novelty', label: 'Novelty', type: 'range', min: 0.2, max: 1.0, step: 0.1, default: 0.6, description: 'How conventional or groundbreaking the hypotheses should be.' },
        { name: 'includeReasoning', label: 'Include Reasoning', type: 'boolean', default: true, description: 'Whether to include a brief justification for each hypothesis.' },
    ],
    4: [
        { name: 'detailLevel', label: 'Level of Detail', type: 'select', options: ['High-level Overview', 'Standard Protocol', 'Granular Step-by-Step'], default: 'Standard Protocol', description: 'The granularity of the methodology description.' },
        // FIX: The default value for a range input must be a number, not a string, to prevent type errors.
        { name: 'rigor', label: 'Methodological Rigor', type: 'range', min: 0.5, max: 1.0, step: 0.1, default: 0.8, description: 'The level of scientific control and precision in the design.' },
        { name: 'focusOn', label: 'Primary Focus', type: 'select', options: ['Internal Validity', 'External Validity', 'Feasibility'], default: 'Internal Validity', description: 'Prioritize one aspect of the study design.' },
        { name: 'includeContingencies', label: 'Include Contingencies', type: 'boolean', default: false, description: 'Plan for potential issues or alternative procedures.' },
    ],
    5: [
        { name: 'dataFormat', label: 'Data Format', type: 'select', options: ['CSV', 'JSON', 'Tabular Text'], default: 'CSV', description: 'The format for the data to be collected.' },
        { name: 'instrumentationDetail', label: 'Instrumentation Detail', type: 'select', options: ['Conceptual', 'Specific Instruments', 'Vendor/Model Agnostic'], default: 'Specific Instruments', description: 'How detailed to be about the tools used.' },
        { name: 'qualityControl', label: 'Quality Control', type: 'boolean', default: true, description: 'Include a section on measures to ensure data quality.' },
        { name: 'ethicsConsiderations', label: 'Ethics Considerations', type: 'boolean', default: true, description: 'Include a section on ethical considerations, if applicable.' },
    ],
    6: [
        { name: 'datasetSize', label: 'Dataset Size', type: 'select', options: ['Small (10-50 rows)', 'Medium (50-200 rows)', 'Large (200+ rows)'], default: 'Medium (50-200 rows)', description: 'The approximate number of records to generate.' },
        { name: 'dataComplexity', label: 'Data Complexity', type: 'select', options: ['Simple', 'With Noise/Outliers', 'Multi-variate'], default: 'With Noise/Outliers', description: 'The complexity and realism of the data.' },
        { name: 'trend', label: 'Data Trend', type: 'select', options: ['Clear Support for Hypothesis', 'Ambiguous/Null Result', 'Contradicts Hypothesis'], default: 'Clear Support for Hypothesis', description: 'The underlying pattern in the synthesized data.' },
        { name: 'format', label: 'Output Format', type: 'select', options: ['CSV', 'JSON'], default: 'CSV', description: 'The final format for the synthesized data.' },
    ],
    7: [
        { name: 'analysisType', label: 'Analysis Type', type: 'select', options: ['Descriptive Statistics', 'Inferential Statistics', 'Trend Analysis'], default: 'Inferential Statistics', description: 'The primary type of statistical analysis to perform.' },
        { name: 'chartSuggestion', label: 'Suggested Chart', type: 'select', options: ['Bar', 'Line', 'Scatter', 'Pie', 'Let AI Decide'], default: 'Let AI Decide', description: 'Suggest a chart type, or let the AI choose the most appropriate one.' },
        { name: 'interpretationDepth', label: 'Interpretation Depth', type: 'select', options: ['Surface Level', 'In-depth Statistical', 'Implication-focused'], default: 'In-depth Statistical', description: 'How deeply to interpret the findings.' },
        { name: 'statisticalSignificance', label: 'Mention Significance', type: 'boolean', default: true, description: 'Mention p-values, confidence intervals, etc.' },
    ],
    8: [
        { name: 'confidence', label: 'Confidence Level', type: 'select', options: ['Cautious', 'Assertive', 'Balanced'], default: 'Balanced', description: 'The tone of confidence in the conclusions.' },
        { name: 'focusOn', label: 'Primary Focus', type: 'select', options: ['Implications', 'Limitations', 'Future Work'], default: 'Implications', description: 'Emphasize one part of the conclusion section.' },
        { name: 'audience', label: 'Target Audience', type: 'select', options: ['Expert', 'General Academic', 'Layperson'], default: 'General Academic', description: 'Tailor the language to a specific audience.' },
        { name: 'structure', label: 'Conclusion Structure', type: 'select', options: ['Standard', 'Executive Summary First'], default: 'Standard', description: 'The format of the conclusion.' },
    ],
    9: [
        { name: 'reviewerPersona', label: 'Reviewer Persona', type: 'select', options: ['Supportive Colleague', 'Harsh Critic', 'Methodology Expert', 'Big Picture Thinker'], default: 'Harsh Critic', description: 'The personality of the simulated peer reviewer.' },
        { name: 'reviewFocus', label: 'Review Focus', type: 'select', options: ['Logical Cohesion', 'Statistical Rigor', 'Novelty & Impact', 'Clarity of Writing'], default: 'Statistical Rigor', description: 'The main area the reviewer should critique.' },
        // FIX: The default value for a range input must be a number, not a string, to prevent type errors.
        { name: 'constructiveness', label: 'Constructiveness', type: 'range', min: 0.2, max: 1.0, step: 0.1, default: 0.8, description: 'How constructive vs. purely critical the feedback is.' },
        { name: 'includeActionableSuggestions', label: 'Include Suggestions', type: 'boolean', default: true, description: 'Provide concrete suggestions for improvement.' },
    ],
    10: [
        { name: 'targetJournalStyle', label: 'Target Journal Style', type: 'select', options: ['Nature (Concise)', 'PLOS ONE (Comprehensive)', 'Generic Academic'], default: 'Generic Academic', description: 'Emulate the style of a specific type of journal.' },
        // FIX: The default value for a range input must be a number, not a string, to prevent type errors.
        { name: 'abstractLength', label: 'Abstract Length (words)', type: 'range', min: 150, max: 300, step: 10, default: 250, description: 'The target word count for the abstract.' },
        { name: 'emphasis', label: 'Paper Emphasis', type: 'select', options: ['Results & Data', 'Narrative & Impact', 'Methodological Detail'], default: 'Narrative & Impact', description: 'Which aspect of the research to highlight most prominently.' },
        { name: 'includeReferences', label: 'Include Placeholder References', type: 'boolean', default: true, description: 'Generate a list of placeholder references.' },
    ]
};


// --- HELPER FUNCTIONS ---
const getStepContext = (experiment: Experiment, stepId: number) => {
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

const getPromptForStep = (stepId, userInput, context, fineTuneSettings: FineTuneSettings) => {
    let systemInstruction = `You are an AI research assistant specializing in ${context.experimentField || 'General Science'}. Your tone should be expert, academic, and tailored to that field. Use appropriate terminology, common methodologies, and theoretical frameworks relevant to ${context.experimentField || 'General Science'}.`;

    // Add dynamic tuning instructions
    const settings = fineTuneSettings || {};
    const params = STEP_SPECIFIC_TUNING_PARAMETERS[stepId] || [];
    const instructions = [];

    params.forEach(param => {
        const value = settings[param.name] ?? param.default;
        if (value === undefined) return;

        // Special handling for persona which modifies the core system instruction
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
        case 1:
            basePrompt = `The user's initial idea for a research topic is: "${userInput}". Refine this into a clear, concise, and testable scientific question relevant to the field of ${context.experimentField || 'General Science'}. Output only the question.`;
            break;
        case 2:
            useSearch = true;
            basePrompt = `The research question is: "${context.question}". Conduct a comprehensive literature review using Google Search to find recent and highly relevant academic papers, articles, and conference proceedings.
Your output must be structured in Markdown and include the following sections:
1. **Literature Review Summary:** A detailed synthesis of the current state of research on this topic. Discuss the primary findings, prevailing theories, and common methodologies.
2. **Identified Gaps:** A bulleted list of specific gaps or unanswered questions in the existing literature that your research could address.
3. **Key References:** A numbered list of 7-12 of the most relevant sources you found. For each source, provide its title and URI. Format it clearly.`;
            break;
        case 3:
            basePrompt = `Based on the research question: "${context.question}" and the provided literature review summary: "${context.literature_review}", generate distinct, testable hypotheses. Present them as a numbered list.`;
            break;
        case 4:
            basePrompt = `The research question is: "${context.question}". The chosen hypothesis is: "${userInput || context.hypothesis}". Design a detailed, step-by-step research methodology to test this hypothesis. The methodology should be appropriate for the field of ${context.experimentField || 'General Science'}. Include sections for: Participants/Subjects (if applicable), Materials/Apparatus, Procedure, and Data Analysis techniques to be used.`;
            break;
        case 5:
            basePrompt = `Based on the designed methodology: "${context.methodology}", create a detailed data collection plan. Specify the exact data points to be collected, the format they should be in, and the instruments or protocols for collection. Also, describe any measures to ensure data quality and integrity.`;
            break;
        case 6:
            basePrompt = `The research hypothesis is: "${context.hypothesis}" and the methodology is: "${context.methodology}". Generate a plausible, synthetic dataset that could have resulted from this experiment. The dataset should be in a simple, machine-readable format. Ensure the data is realistic for the described experiment and will be suitable for the analysis planned in the next step. Provide the dataset directly, without extra explanations unless necessary for context.`;
            break;
        case 7:
            expectJson = true;
            basePrompt = `Analyze the following data: "${userInput}". The research hypothesis is: "${context.hypothesis}". The methodology was: "${context.methodology}".
Your task is to perform a statistical analysis.
Your entire response MUST be a single, valid JSON object and nothing else.
Do not include markdown backticks like \`\`\`json, any introductory text, or any explanations. Your output will be directly processed by a machine, so any extraneous text will cause a critical failure.
The JSON object must strictly adhere to the following schema:
{
  "summary": "string (A one-paragraph summary of your analysis findings, formatted as Markdown. This will be displayed above the chart.)",
  "chartConfig": {
    "type": "string (e.g., 'bar', 'line', 'pie')",
    "data": {
      "labels": "string[]",
      "datasets": [
        {
          "label": "string",
          "data": "number[]",
          "backgroundColor": "string[] (optional)",
          "borderColor": "string[] (optional)",
          "borderWidth": "number (optional)"
        }
      ]
    },
    "options": "object (Chart.js options object, optional)"
  }
}
`;
            break;
        case 8:
            basePrompt = `The research question was: "${context.question}". The hypothesis was: "${context.hypothesis}". The data analysis results are summarized as: "${context.analysis_summary}". Based on this analysis, draw a clear and concise conclusion. State whether the hypothesis was supported, refuted, or if the results were inconclusive. Discuss the implications of these findings, potential limitations of the study, and suggest directions for future research.`;
            break;
        case 9:
            basePrompt = `Conduct a peer review of the following research project. Be critical and constructive.
- Research Question: "${context.question}"
- Hypothesis: "${context.hypothesis}"
- Methodology: "${context.methodology}"
- Results Summary: "${context.analysis_summary}"
- Conclusion: "${context.conclusion}"
Critique the study's design, methodology, and the validity of its conclusions. Point out any logical fallacies, potential biases, or areas where the research could be strengthened. Format your review into sections: Strengths, Weaknesses, and Suggestions for Improvement.`;
            break;
        case 10:
            basePrompt = `Generate a draft for a scientific publication based on the entire research project. The paper should be structured with the following sections: Abstract, Introduction (containing the research question), Literature Review, Methodology, Results (based on the analysis summary), Discussion (including conclusions and limitations), and Future Work. Use the context provided below to fill in each section.
- Research Question: "${context.question}"
- Literature Review Summary: "${context.literature_review}"
- Hypothesis: "${context.hypothesis}"
- Methodology: "${context.methodology}"
- Results & Analysis Summary: "${context.analysis_summary}"
- Conclusion: "${context.conclusion}"`;
            break;
        default:
            basePrompt = `An unknown step was requested. Please check the application logic.`;
    }
    return { basePrompt, systemInstruction, useSearch, expectJson };
};

// --- REACT COMPONENTS ---

/**
 * @component App
 * The root component that manages the overall application state and routing.
 */
const App = () => {
    const [view, setView] = useState('landing'); // 'landing', 'dashboard', 'experiment'
    const [experiments, setExperiments] = useState<Experiment[]>([]);
    const [activeExperiment, setActiveExperiment] = useState<Experiment | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const { addToast } = useToast();

    // Load experiments from Dexie on initial mount
    useEffect(() => {
        const loadData = async () => {
            try {
                const storedExperiments = await db.experiments.orderBy('createdAt').reverse().toArray();
                setExperiments(storedExperiments);
            } catch (error) {
                console.error("Failed to load experiments from database:", error);
                addToast("Could not load saved experiments.", 'danger');
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, [addToast]);

    // Handlers for experiment management
    const createNewExperiment = async (title: string, description: string, field: (typeof SCIENTIFIC_FIELDS)[number]) => {
        const newId = `exp_${Date.now()}`;
        const newExperiment: Experiment = {
            id: newId,
            title,
            description,
            field,
            currentStep: 1,
            stepData: {},
            fineTuneSettings: {},
            createdAt: new Date().toISOString(),
        };
        try {
            await db.experiments.add(newExperiment);
            setExperiments(prev => [newExperiment, ...prev]);
            setActiveExperiment(newExperiment);
            setView('experiment');
            addToast("New experiment created successfully!", 'success');
        } catch (error) {
            console.error("Failed to save new experiment:", error);
            addToast("Failed to create experiment.", 'danger');
        }
    };

    const updateExperiment = async (updatedExperiment: Experiment) => {
        try {
            await db.experiments.put(updatedExperiment);
            setExperiments(prev => prev.map(e => e.id === updatedExperiment.id ? updatedExperiment : e));
            setActiveExperiment(updatedExperiment);
        } catch (error) {
            console.error("Failed to update experiment:", error);
            addToast("Failed to save progress.", 'danger');
        }
    };

    const deleteExperiment = async (id: string) => {
        if (window.confirm("Are you sure you want to delete this experiment? This action cannot be undone.")) {
            try {
                await db.experiments.delete(id);
                const updatedExperiments = experiments.filter(e => e.id !== id);
                setExperiments(updatedExperiments);
                if (activeExperiment?.id === id) {
                    setActiveExperiment(null);
                    setView('dashboard');
                }
                addToast("Experiment deleted.", 'success');
            } catch (error) {
                console.error("Failed to delete experiment:", error);
                addToast("Failed to delete experiment.", 'danger');
            }
        }
    };

    const selectExperiment = (id: string) => {
        const experiment = experiments.find(e => e.id === id);
        if (experiment) {
            setActiveExperiment(experiment);
            setView('experiment');
        }
    };

    // Render logic
    if (isLoading) {
        return <div className="d-flex justify-content-center align-items-center vh-100"><div className="spinner-border" role="status"><span className="visually-hidden">Loading...</span></div></div>;
    }

    return (
        <>
            <Header setView={setView} activeView={view} />
            <main className="container-fluid mt-4">
                {view === 'landing' && <LandingPage setView={setView} createNewExperiment={createNewExperiment} />}
                {view === 'dashboard' && <Dashboard experiments={experiments} onSelect={selectExperiment} onDelete={deleteExperiment} setView={setView} createNewExperiment={createNewExperiment}/>}
                {view === 'experiment' && activeExperiment && <ExperimentWorkspace key={activeExperiment.id} experiment={activeExperiment} onUpdate={updateExperiment} />}
                {view === 'testing' && <TestRunner />}
            </main>
            <Footer />
        </>
    );
};

const Header = ({ setView, activeView }) => {
    const [showHelp, setShowHelp] = useState(false);
    const [readmeContent, setReadmeContent] = useState('');

    useEffect(() => {
        // Fetch readme content only when the modal is about to be shown for the first time
        if (showHelp && !readmeContent) {
            fetch('./README.md')
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }
                    return response.text();
                })
                .then(text => setReadmeContent(text))
                .catch(err => {
                    console.error("Failed to load README.md:", err);
                    setReadmeContent("# Error\n\nCould not load help content. Please check the console for more details.");
                });
        }
    }, [showHelp, readmeContent]);

    return (
        <>
            <nav className="navbar navbar-expand-lg navbar-dark sticky-top">
                <div className="container-fluid">
                    <a className="navbar-brand fw-bold" href="#" onClick={() => setView('landing')}>
                        <i className="bi bi-stars me-2" style={{color: 'var(--primary-glow)'}}></i>
                        Project Hypatia
                    </a>
                    <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                        <span className="navbar-toggler-icon"></span>
                    </button>
                    <div className="collapse navbar-collapse" id="navbarNav">
                        <ul className="navbar-nav ms-auto">
                            <li className="nav-item">
                                <a className={`nav-link ${activeView === 'dashboard' ? 'active' : ''}`} href="#" onClick={() => setView('dashboard')}>Dashboard</a>
                            </li>
                             {activeView !== 'landing' && (
                                <li className="nav-item">
                                    <a className="nav-link" href="#" onClick={() => setShowHelp(true)}>
                                        <i className="bi bi-question-circle me-1"></i> Help
                                    </a>
                                </li>
                            )}
                            <li className="nav-item">
                                <a className={`nav-link ${activeView === 'testing' ? 'active' : ''}`} href="#" onClick={() => setView('testing')}>
                                    <i className="bi bi-clipboard-check me-1"></i> Test Runner
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>
            </nav>
            {showHelp && <HelpModal content={readmeContent} onClose={() => setShowHelp(false)} />}
        </>
    );
};

const Footer = () => (
    <footer className="mifeco-footer text-center p-3 mt-5">
        <p className="mb-0">Powered by Google Gemini. Developed with Mifeco.</p>
    </footer>
);


const LandingPage = ({ setView, createNewExperiment }) => {
     const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [field, setField] = useState(SCIENTIFIC_FIELDS[0]);

    const handleStart = (e) => {
        e.preventDefault();
        if(title.trim() && description.trim()){
            createNewExperiment(title, description, field);
        }
    };
    return (
        <div>
            <section className="landing-page-hero">
                <div className="landing-content">
                    <h1 className="display-4 landing-title">Unlock Your Next Discovery</h1>
                    <p className="lead landing-subtitle mb-4">Project Hypatia is your AI-powered partner in scientific research, guiding you from initial question to final publication.</p>

                    <div className="row justify-content-center g-3 mb-4">
                        <div className="col-md-4">
                            <div className="hero-feature-card">
                                <i className="bi bi-code-slash"></i>
                                <span>Run Simulations</span>
                            </div>
                        </div>
                        <div className="col-md-4">
                             <div className="hero-feature-card">
                                <i className="bi bi-cloud-upload"></i>
                                <span>Upload Data</span>
                            </div>
                        </div>
                        <div className="col-md-4">
                             <div className="hero-feature-card">
                                <i className="bi bi-magic"></i>
                                <span>Synthesize Results</span>
                            </div>
                        </div>
                    </div>

                     <div className="getting-started-fields mx-auto">
                         <form onSubmit={handleStart}>
                             <p className="fw-bold text-light">Start a New Experiment</p>
                            <div className="mb-3">
                                <input type="text" className="form-control" placeholder="Experiment Title" value={title} onChange={e => setTitle(e.target.value)} required />
                            </div>
                            <div className="mb-3">
                                 <textarea className="form-control" placeholder="Briefly describe your research idea..." value={description} onChange={e => setDescription(e.target.value)} required rows="2"></textarea>
                            </div>
                            <div className="mb-3">
                                 <select className="form-select" value={field} onChange={e => setField(e.target.value)}>
                                    {SCIENTIFIC_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                            </div>
                             <button type="submit" className="btn btn-primary btn-lg w-100">
                                <i className="bi bi-play-circle me-2"></i> Begin Research
                            </button>
                         </form>
                    </div>

                    <p className="mt-4 text-white-50 small">
                        Perfect for Researchers, Students, Citizen Scientists, and Innovators.
                    </p>
                </div>
            </section>

             <section className="landing-details-section">
                <div className="container">
                    <div className="row text-center mb-5">
                        <div className="col-md-8 mx-auto">
                            <h2 className="section-title">A Comprehensive Toolkit for Modern Research</h2>
                            <p className="lead text-white-50">Hypatia streamlines your entire workflow with powerful, AI-driven features at every step.</p>
                        </div>
                    </div>
                    <div className="row g-4">
                        <div className="col-md-4">
                            <div className="feature-card h-100">
                                <div className="feature-icon"><i className="bi bi-lightbulb"></i></div>
                                <h5>Guided Workflow</h5>
                                <p>Follow a structured 10-step process that mirrors the scientific method, ensuring a rigorous and complete research cycle.</p>
                            </div>
                        </div>
                        <div className="col-md-4">
                            <div className="feature-card h-100">
                                <div className="feature-icon"><i className="bi bi-beaker"></i></div>
                                <h5>Virtual Experiments</h5>
                                <p>Run custom JavaScript simulations, upload your own data, or let the AI synthesize plausible results for you.</p>
                            </div>
                        </div>
                         <div className="col-md-4">
                            <div className="feature-card h-100">
                                <div className="feature-icon"><i className="bi bi-graph-up-arrow"></i></div>
                                <h5>AI-Powered Analysis</h5>
                                <p>Leverage Gemini for advanced data analysis, generating insights and visualizations automatically from your results.</p>
                            </div>
                        </div>
                    </div>

                    <hr className="landing-divider" />

                    <div className="row align-items-center">
                        <div className="col-lg-6">
                             <h2 className="section-title mb-3">From Idea to Publication</h2>
                             <p className="text-white-50 mb-4">Project Hypatia provides all the tools you need to take your research from a nascent idea to a polished, publication-ready paper. The integrated workflow ensures that each step logically builds on the last, creating a cohesive and comprehensive research narrative.</p>
                             <ul className="list-unstyled">
                                <li className="mb-3 d-flex align-items-center"><i className="bi bi-check-circle-fill text-primary-glow me-2"></i><span>Maintain full control with editable AI outputs.</span></li>
                                <li className="mb-3 d-flex align-items-center"><i className="bi bi-check-circle-fill text-primary-glow me-2"></i><span>Get up-to-date sources with Google Search grounding.</span></li>
                                <li className="mb-3 d-flex align-items-center"><i className="bi bi-check-circle-fill text-primary-glow me-2"></i><span>Simulate peer review to strengthen your arguments.</span></li>
                             </ul>
                        </div>
                         <div className="col-lg-6 text-center">
                            <img src="https://images.unsplash.com/photo-1581093458791-9a6680c18e3e?q=80&w=2070&auto=format&fit=crop" alt="Scientist in a modern lab looking at data on a computer screen" className="researcher-image" />
                        </div>
                    </div>

                    <hr className="landing-divider" />

                     <div className="row text-center mb-5">
                        <div className="col-md-8 mx-auto">
                            <h2 className="section-title">The Hypatia Workflow</h2>
                            <p className="lead text-white-50">A step-by-step journey through the scientific method, enhanced by AI.</p>
                        </div>
                    </div>
                     <div className="row g-4">
                        {WORKFLOW_STEPS.slice(0, 8).map(step => (
                            <div key={step.id} className="col-md-6 col-lg-3">
                                <div className="workflow-step-item">
                                    <div className="workflow-step-icon"><i className={`bi ${step.icon}`}></i></div>
                                    <div>
                                        <h6 className="mb-1 fw-bold">{step.id}. {step.title}</h6>
                                        <p className="mb-0 small text-white-50">{step.description}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                     <div className="text-center mt-5">
                        <button className="btn btn-primary btn-lg" onClick={() => setView('dashboard')}>
                            <i className="bi bi-rocket-takeoff me-2"></i>
                            Go to Dashboard
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
}

const Dashboard = ({ experiments, onSelect, onDelete, setView, createNewExperiment }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [field, setField] = useState(SCIENTIFIC_FIELDS[0]);

    const handleCreate = (e) => {
        e.preventDefault();
         if(title.trim() && description.trim()){
            createNewExperiment(title, description, field);
            setIsModalOpen(false);
            setTitle('');
            setDescription('');
            setField(SCIENTIFIC_FIELDS[0]);
        }
    }

    return (
        <div className="container">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h1 className="mb-0">Experiment Dashboard</h1>
                <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                    <i className="bi bi-plus-circle me-2"></i>New Experiment
                </button>
            </div>
            {experiments.length > 0 ? (
                 <div className="row g-4">
                    {experiments.map(exp => (
                        <div key={exp.id} className="col-md-6 col-lg-4">
                            <div className="card h-100 d-flex flex-column">
                                <div className="card-body flex-grow-1">
                                    <h5 className="card-title">{exp.title}</h5>
                                    <h6 className="card-subtitle mb-2 text-muted">{exp.field}</h6>
                                    <p className="card-text small text-white-50">{exp.description}</p>
                                </div>
                                 <div className="card-footer bg-transparent border-top-0 d-flex justify-content-between align-items-center">
                                    <button className="btn btn-sm btn-outline-light" onClick={() => onSelect(exp.id)}>
                                        <i className="bi bi-arrow-right-circle me-1"></i> Open
                                    </button>
                                    <button className="btn btn-sm btn-outline-danger" onClick={(e) => {e.stopPropagation(); onDelete(exp.id);}}>
                                        <i className="bi bi-trash"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                 <div className="text-center p-5 dashboard-empty-state">
                     <i className="bi bi-journal-x display-4 mb-3"></i>
                    <h4>No Experiments Yet</h4>
                    <p>Click "New Experiment" to start your first research project.</p>
                </div>
            )}

             {isModalOpen && (
                <div className="modal show" style={{ display: 'block' }} tabIndex="-1">
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">Create New Experiment</h5>
                                <button type="button" className="btn-close" onClick={() => setIsModalOpen(false)}></button>
                            </div>
                             <form onSubmit={handleCreate}>
                                <div className="modal-body">
                                        <div className="mb-3">
                                            <label className="form-label">Title</label>
                                            <input type="text" className="form-control" value={title} onChange={e => setTitle(e.target.value)} required />
                                        </div>
                                        <div className="mb-3">
                                             <label className="form-label">Description</label>
                                             <textarea className="form-control" value={description} onChange={e => setDescription(e.target.value)} required></textarea>
                                        </div>
                                        <div className="mb-3">
                                             <label className="form-label">Field of Science</label>
                                             <select className="form-select" value={field} onChange={e => setField(e.target.value)}>
                                                {SCIENTIFIC_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                                            </select>
                                        </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary">Create</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
            {isModalOpen && <div className="modal-backdrop fade show"></div>}
        </div>
    );
};


const ExperimentWorkspace = ({ experiment: initialExperiment, onUpdate }) => {
    const [experiment, setExperiment] = useState(initialExperiment);
    const [activeStep, setActiveStep] = useState(initialExperiment.currentStep);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [streamingOutput, setStreamingOutput] = useState("");
    const [isFineTuneModalOpen, setFineTuneModalOpen] = useState(false);

    const gemini = useMemo(() => initializeGemini(), []);
    const { addToast } = useToast();

    // Reset input when step changes
    useEffect(() => {
        const existingInput = experiment.stepData[activeStep]?.input;
        if (existingInput !== undefined) {
             setUserInput(existingInput);
        } else {
             setUserInput(DEFAULT_STEP_INPUTS[activeStep] || '');
        }
        setStreamingOutput("");
    }, [activeStep, experiment.stepData]);

    const handleUpdate = (updatedData) => {
        const updatedExperiment = { ...experiment, ...updatedData };
        setExperiment(updatedExperiment);
        onUpdate(updatedExperiment);
    };

    const handleSaveFineTune = (settings) => {
        const updatedSettings = {
            ...experiment.fineTuneSettings,
            [activeStep]: settings
        };
        handleUpdate({ fineTuneSettings: updatedSettings });
        addToast('Settings saved!', 'success');
    };


    const handleGenerate = async () => {
        if (!gemini) {
            addToast("Gemini API not initialized. Check your API Key.", 'danger');
            return;
        }
        if (!userInput && activeStep !== 6 && activeStep !== 10) { // Step 6 and 10 can be triggered without input
             if (activeStep !== 2) { // Step 2 uses context question
                addToast("Please provide input for this step.", 'warning');
                return;
             }
        }

        setIsLoading(true);
        setStreamingOutput("");

        const currentTimestamp = new Date().toISOString();
        const stepData = experiment.stepData[activeStep] || {};
        const oldHistory = stepData.history || [];

        // Save previous output to history if it exists
        if (stepData.output) {
            const lastOutput = stepData.output;
            const lastTimestamp = stepData.history?.[oldHistory.length - 1]?.timestamp || experiment.createdAt;
            oldHistory.push({ timestamp: lastTimestamp, output: lastOutput });
        }

        const context = getStepContext(experiment, activeStep);
        const fineTuneSettings = experiment.fineTuneSettings[activeStep] || {};
        const { basePrompt, systemInstruction, useSearch, expectJson } = getPromptForStep(activeStep, userInput, context, fineTuneSettings);

        try {
            const config: any = {
                systemInstruction,
            };
            
            if (useSearch) {
                config.tools = [{ googleSearch: {} }];
            }

            // For JSON mode, use generateContent, not streaming
            if (expectJson) {
                const response = await gemini.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: basePrompt,
                    config: config
                });
                const text = response.text;
                setStreamingOutput(text);

                handleUpdate({
                    currentStep: Math.min(WORKFLOW_STEPS.length, experiment.currentStep + (experiment.currentStep === activeStep ? 1 : 0)),
                    stepData: {
                        ...experiment.stepData,
                        [activeStep]: {
                            input: userInput,
                            output: text,
                            history: oldHistory
                        }
                    }
                });

            } else { // Handle streaming for text
                const response = await gemini.models.generateContentStream({
                    model: 'gemini-2.5-flash',
                    contents: basePrompt,
                    config: config
                });

                let fullResponse = "";
                for await (const chunk of response) {
                    const chunkText = chunk.text;
                    fullResponse += chunkText;
                    setStreamingOutput(prev => prev + chunkText);
                }

                 // Update experiment state after streaming is complete
                handleUpdate({
                    currentStep: Math.min(WORKFLOW_STEPS.length, experiment.currentStep + (experiment.currentStep === activeStep ? 1 : 0)),
                    stepData: {
                        ...experiment.stepData,
                        [activeStep]: {
                            input: userInput,
                            output: fullResponse,
                            history: oldHistory
                        }
                    }
                });
            }

        } catch (error) {
            console.error("Gemini API Error:", error);
            addToast(`An error occurred: ${error.message}`, 'danger');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveOutput = (newOutput) => {
        handleUpdate({
            stepData: {
                ...experiment.stepData,
                [activeStep]: {
                    ...experiment.stepData[activeStep],
                    output: newOutput
                }
            }
        });
        addToast("Changes saved!", "success");
    };

    const currentStepInfo = WORKFLOW_STEPS.find(s => s.id === activeStep);
    const output = streamingOutput || experiment.stepData[activeStep]?.output;
    const isStepCompleted = experiment.currentStep > activeStep;

    return (
        <div className="row g-4">
            {/* Sidebar */}
            <div className="col-lg-3">
                 <div className="card sticky-top" style={{top: '80px'}}>
                     <div className="card-header fw-bold">{experiment.title}</div>
                    <div className="list-group list-group-flush">
                        {WORKFLOW_STEPS.map(step => (
                            <a
                                key={step.id}
                                href="#"
                                className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${activeStep === step.id ? 'active' : ''} ${step.id > experiment.currentStep ? 'disabled' : ''}`}
                                onClick={(e) => { e.preventDefault(); if (step.id <= experiment.currentStep) setActiveStep(step.id); }}
                            >
                                <span><i className={`bi ${step.icon} me-2`}></i>{step.title}</span>
                                {experiment.currentStep > step.id && <i className="bi bi-check-circle-fill text-success"></i>}
                            </a>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="col-lg-9">
                <div className="card">
                    <div className="card-header d-flex justify-content-between align-items-center">
                         <h4 className="mb-0"><i className={`bi ${currentStepInfo.icon} me-2`}></i> Step {activeStep}: {currentStepInfo.title}</h4>
                          <button className="btn btn-sm btn-outline-light" onClick={() => setFineTuneModalOpen(true)}>
                            <i className="bi bi-sliders me-1"></i> Fine-Tune AI
                        </button>
                    </div>
                    <div className="card-body">
                        <p>{currentStepInfo.description}</p>
                        <hr />
                        {/* Special UI for Step 6 */}
                        {activeStep === 6 ? (
                           <ExperimentRunner
                                experiment={experiment}
                                onUpdate={handleUpdate}
                                onSynthesize={handleGenerate}
                                isLoading={isLoading}
                                gemini={gemini}
                            />
                        ) : activeStep === 10 ? (
                           <PublicationExporter
                                experiment={experiment}
                                onGenerate={handleGenerate}
                                isLoading={isLoading}
                                output={output}
                                onSaveOutput={handleSaveOutput}
                            />
                        ) : (
                            // Standard Step UI
                            <>
                                <div className="mb-3">
                                    <label className="form-label fw-bold">Input</label>
                                    <textarea
                                        className="form-control"
                                        rows="4"
                                        value={userInput}
                                        onChange={(e) => setUserInput(e.target.value)}
                                        placeholder={isStepCompleted ? "This step is completed. Input is locked." : "Enter your notes, data, or prompt for this step..."}
                                        disabled={isStepCompleted || isLoading}
                                    />
                                </div>

                                <div className="d-flex justify-content-end align-items-center">
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleGenerate}
                                        disabled={isLoading || isStepCompleted}
                                    >
                                        {isLoading ? (
                                            <>
                                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                                Generating...
                                            </>
                                        ) : (
                                            <>
                                                <i className="bi bi-stars me-2"></i>
                                                {isStepCompleted ? 'Step Completed' : 'Generate'}
                                            </>
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                    {(output || isLoading) && activeStep !== 6 && activeStep !== 10 && (
                        <div className="card-footer">
                            <h5 className="fw-bold">AI Output</h5>
                            {isLoading && !streamingOutput && <div className="d-flex justify-content-center p-5"><div className="spinner-border" role="status"><span className="visually-hidden">Loading...</span></div></div>}
                            {output && <GeneratedOutput output={output} stepId={activeStep} onSave={handleSaveOutput} isEditable={!isLoading} />}
                        </div>
                    )}
                </div>
            </div>
            {isFineTuneModalOpen && <FineTuneModal settings={experiment.fineTuneSettings[activeStep]} onSave={handleSaveFineTune} onClose={() => setFineTuneModalOpen(false)} stepId={activeStep} />}
        </div>
    );
};

const FineTuneModal = ({ settings = {}, onSave, onClose, stepId }) => {
    const stepParams = STEP_SPECIFIC_TUNING_PARAMETERS[stepId] || [];

    // Initialize state from props and defaults
    const [tempSettings, setTempSettings] = useState(() => {
        const initialState = {};
        stepParams.forEach(param => {
            initialState[param.name] = settings[param.name] ?? param.default;
        });
        return initialState;
    });

    const handleSave = () => {
        onSave(tempSettings);
        onClose();
    };

    const renderControl = (param) => {
        const value = tempSettings[param.name];

        switch (param.type) {
            case 'select':
                return (
                    <select className="form-select" value={value} onChange={e => setTempSettings(s => ({ ...s, [param.name]: e.target.value }))}>
                        {param.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                );
            case 'range':
                return (
                    <div className="d-flex align-items-center">
                        <input
                            type="range"
                            className="form-range"
                            min={param.min} max={param.max} step={param.step}
                            // FIX: Ensure value passed to range input is a number to avoid type errors.
                            value={Number(value)}
                            // FIX: Parse the range input value to a number to prevent type errors.
                            onChange={e => setTempSettings(s => ({ ...s, [param.name]: parseFloat(e.target.value) }))}
                        />
                        <span className="ms-3 fw-bold">{value}</span>
                    </div>
                );
            case 'boolean':
                return (
                    <div className="form-check form-switch">
                        <input 
                            className="form-check-input" 
                            type="checkbox" 
                            role="switch"
                            checked={!!value}
                            onChange={e => setTempSettings(s => ({...s, [param.name]: e.target.checked}))}
                        />
                        <label className="form-check-label">{value ? 'Enabled' : 'Disabled'}</label>
                    </div>
                )
            default:
                return null;
        }
    };

    return (
        <div className="modal show" style={{ display: 'block' }} tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered modal-lg">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">Fine-Tune AI Parameters (Step {stepId})</h5>
                        <button type="button" className="btn-close" onClick={onClose}></button>
                    </div>
                    <div className="modal-body">
                        {stepParams.length > 0 ? stepParams.map(param => (
                             <div className="mb-4" key={param.name}>
                                <label className="form-label fw-bold">{param.label}</label>
                                <p className="form-text text-white-50 small mt-0 mb-2">{param.description}</p>
                                {renderControl(param)}
                            </div>
                        )) : <p>No specific tuning parameters for this step.</p>}
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={handleSave}>Save Settings</button>
                    </div>
                </div>
            </div>
            <div className="modal-backdrop fade show"></div>
        </div>
    );
};

const GeneratedOutput = ({ output, stepId, onSave, isEditable }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedOutput, setEditedOutput] = useState(output);
    const [analysis, setAnalysis] = useState(null);
    const [parseError, setParseError] = useState(null);
    const chartCanvasRef = useRef(null);
    const chartInstanceRef = useRef(null);

    useEffect(() => {
        setEditedOutput(output); // Sync with external changes
    }, [output]);

    const handleSaveClick = () => {
        onSave(editedOutput);
        setIsEditing(false);
    };

    // Special rendering logic for Step 7 (Data Analyzer)
    useEffect(() => {
        if (stepId !== 7) return;

        // Cleanup previous chart instance if it exists
        if (chartInstanceRef.current) {
            chartInstanceRef.current.destroy();
            chartInstanceRef.current = null;
        }

        if (!output) {
            setAnalysis(null);
            setParseError(null);
            return;
        }

        try {
            // Be lenient with markdown backticks but strict with content.
            let jsonString = output
                .replace(/^```json\s*/, '')
                .replace(/```$/, '')
                .trim();

            const parsedData = JSON.parse(jsonString);

            // Validate the structure of the parsed JSON.
            if (!parsedData.summary || typeof parsedData.summary !== 'string') {
                throw new Error("The 'summary' field is missing or not a string.");
            }
            if (!parsedData.chartConfig || typeof parsedData.chartConfig !== 'object') {
                throw new Error("The 'chartConfig' field is missing or not an object.");
            }

            setAnalysis(parsedData);
            setParseError(null);
        } catch (error) {
            console.error("Data Analyzer Parse Error:", error);
            setAnalysis(null);
            setParseError(`Failed to render analysis. The AI's response was not in the correct JSON format or was missing required fields. Details: ${error.message}`);
        }
    }, [output, stepId]);

    // Effect for rendering the Chart.js chart
    useEffect(() => {
        if (stepId !== 7) return;

        if (analysis && chartCanvasRef.current) {
            try {
                // FIX: Ensure data values are numbers, as AI might return them as strings in JSON which would cause a rendering error.
                if (analysis.chartConfig?.data?.datasets) {
                    analysis.chartConfig.data.datasets.forEach(dataset => {
                        if (dataset.data) {
                            dataset.data = dataset.data.map(d => (typeof d === 'string' ? parseFloat(d) : d)).filter(d => d !== null && !isNaN(d));
                        }
                        // FIX: Ensure borderWidth is a number, as AI might return it as a string.
                        if (dataset.borderWidth && typeof dataset.borderWidth === 'string') {
                            dataset.borderWidth = parseFloat(dataset.borderWidth);
                        }
                    });
                }
                chartInstanceRef.current = new Chart(chartCanvasRef.current, analysis.chartConfig);
            } catch (chartError) {
                console.error("Chart.js Error:", chartError);
                setParseError(`The chart configuration from the AI was invalid. Details: ${chartError.message}`);
                setAnalysis(null); // Clear analysis to remove potentially rendered summary
            }
        }
    }, [analysis, stepId]);


    if (isEditing) {
        return (
            <div className="generated-text-container">
                <textarea
                    className="editable-textarea"
                    value={editedOutput}
                    onChange={(e) => setEditedOutput(e.target.value)}
                    rows={15}
                />
                <div className="mt-2 d-flex justify-content-end">
                    <button className="btn btn-sm btn-secondary me-2" onClick={() => setIsEditing(false)}>Cancel</button>
                    <button className="btn btn-sm btn-primary" onClick={handleSaveClick}>
                        <i className="bi bi-check-lg me-1"></i> Save
                    </button>
                </div>
            </div>
        );
    }
    
    // Special renderer for Data Analyzer (Step 7)
    if (stepId === 7) {
        return (
             <div className="generated-text-container">
                 {isEditable && (
                    <div className="edit-controls">
                        <button className="btn btn-sm btn-outline-light" onClick={() => setIsEditing(true)}>
                            <i className="bi bi-pencil-square me-1"></i> Edit Raw JSON
                        </button>
                    </div>
                )}

                {parseError && (
                    <div className="alert alert-danger">
                        <i className="bi bi-exclamation-triangle-fill me-2"></i>
                        {parseError}
                    </div>
                )}

                {analysis && !parseError && (
                    <>
                        <div dangerouslySetInnerHTML={{ __html: marked(analysis.summary) }} />
                        <div className="mt-4">
                            <canvas ref={chartCanvasRef} aria-label="Data analysis chart" role="img"></canvas>
                        </div>
                    </>
                )}

                {!analysis && !parseError && !output && (
                    <p className="text-white-50">Analysis results will be displayed here.</p>
                )}
             </div>
        );
    }

    // Default renderer for all other steps
    return (
        <div className="generated-text-container">
            {isEditable && (
                <div className="edit-controls">
                    <button className="btn btn-sm btn-outline-light" onClick={() => setIsEditing(true)}>
                        <i className="bi bi-pencil-square me-1"></i> Edit
                    </button>
                </div>
            )}
            <div dangerouslySetInnerHTML={{ __html: marked(output) }} />
        </div>
    );
};


const ExperimentRunner = ({ experiment, onUpdate, onSynthesize, isLoading, gemini }) => {
    const [activeTab, setActiveTab] = useState('simulate'); // 'simulate', 'upload', 'docs'
    const [code, setCode] = useState(experiment.simulationCode || `// Welcome to the Hypatia Simulator!
// Use console.log() to print debug messages below.
// When your simulation is complete, call hypatia.finish(data, summary)
// to pass your results to the next step.

console.log("Starting simulation...");

// Example: Simulating a simple chemical reaction
const initialConcentration = 1.0;
let concentration = initialConcentration;
let time = 0;
const rate = 0.1;

const dataPoints = ['Time (s),Concentration (M)'];

while (time <= 10) {
    dataPoints.push(\`\${time},\${concentration.toFixed(4)}\`);
    concentration -= concentration * rate;
    time++;
}

console.log("Simulation finished.");

// Finalize the experiment and pass data to the analyzer
const csvData = dataPoints.join('\\n');
const summaryText = "The simulation shows an exponential decay in reactant concentration over 10 seconds, consistent with a first-order reaction model.";

hypatia.finish(csvData, summaryText);
`);
    const [output, setOutput] = useState({ logs: [], error: null });
    const [uploadedData, setUploadedData] = useState('');
    const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);
    const fileInputRef = useRef(null);
    const { addToast } = useToast();

    const runCode = () => {
        setOutput({ logs: [], error: null }); // Clear previous output
        const logs = [];
        let finishedSuccessfully = false;

        // Create a sandboxed environment
        const hypatia = {
            finish: (data, summary) => {
                if (typeof data !== 'string' || typeof summary !== 'string') {
                    // This error will be caught by the outer try/catch block
                    throw new Error("hypatia.finish() requires two string arguments: data and summary.");
                }
                const newStepData = {
                    ...experiment.stepData,
                    '6': {
                        ...experiment.stepData['6'],
                        output: summary // Save summary as the output of step 6
                    },
                    '7': {
                        ...experiment.stepData['7'],
                        input: data // Pass data as input to step 7
                    }
                };

                // The onUpdate call saves the current code state along with the data.
                onUpdate({
                    simulationCode: code,
                    stepData: newStepData,
                    currentStep: 7
                });

                navigator.clipboard.writeText(data);
                addToast("Simulation complete! Data passed to Step 7 and copied to clipboard.", "success");
                
                // Add success messages to the output console for better user feedback
                logs.push(`✅ Simulation Finished Successfully.`);
                logs.push(`Summary: ${summary}`);
                logs.push(`Data has been passed to Step 7 and copied to your clipboard.`);
                setOutput({ logs: [...logs], error: null });

                finishedSuccessfully = true;
            }
        };

        const consoleProxy = {
            log: (...args) => {
                logs.push(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '));
                setOutput({ logs: [...logs], error: null });
            }
        };

        try {
            // Use the Function constructor to sandbox the code
            const sandboxedRun = new Function('console', 'hypatia', code);
            sandboxedRun(consoleProxy, hypatia);

            if (!finishedSuccessfully) {
                logs.push("🔵 Simulation code finished running without calling hypatia.finish().");
                setOutput({ logs: [...logs], error: null });
            }
        } catch (e) {
            setOutput({ logs, error: e.message });
        }
    };

    const handleCodeChange = (newCode) => {
        setCode(newCode);
        // This ensures the code is saved as the user types, preserving their work.
        onUpdate({ simulationCode: newCode });
    };

    const handleDownloadTemplate = async () => {
        if (!gemini) {
            addToast("Gemini API not initialized.", "danger");
            return;
        }
        setIsGeneratingTemplate(true);
        try {
            const dataPlan = experiment.stepData['5']?.output;
            if (!dataPlan) {
                addToast("Data collection plan from Step 5 is missing. Providing generic template.", "warning");
                const genericTemplate = "column_1,column_2,column_3";
                const a = document.createElement("a");
                const file = new Blob([genericTemplate], { type: 'text/csv' });
                a.href = URL.createObjectURL(file);
                a.download = 'template.csv';
                a.click();
                URL.revokeObjectURL(a.href);
                return;
            }

            const prompt = `You are a data formatting expert. Your task is to create a CSV header row based on a data collection plan. Analyze the following data collection plan and extract the key variables to be measured. Format these variables as a single line of comma-separated values, which will serve as a CSV header. Your output must be ONLY this single line. Do not include any other text, explanations, or markdown formatting.\n\nData Collection Plan:\n"""\n${dataPlan}\n"""`;

            const response = await gemini.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            const template = response.text.trim();
            const a = document.createElement("a");
            const file = new Blob([template], { type: 'text/csv' });
            a.href = URL.createObjectURL(file);
            a.download = 'data_template.csv';
            a.click();
            URL.revokeObjectURL(a.href);

        } catch (error) {
            console.error("Template Generation Error:", error);
            addToast(`Failed to generate template: ${error.message}`, 'danger');
        } finally {
            setIsGeneratingTemplate(false);
        }
    };

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setUploadedData(e.target.result as string);
                addToast(`${file.name} loaded successfully.`, 'success');
            };
            reader.readAsText(file);
        }
    };

    const handleSubmitUploadedData = () => {
        if (!uploadedData) {
            addToast("No data has been uploaded.", "warning");
            return;
        }
        const summaryText = "User-provided data was uploaded for analysis.";

        const newStepData = {
            ...experiment.stepData,
            '6': {
                ...experiment.stepData['6'],
                output: summaryText
            },
            '7': {
                ...experiment.stepData['7'],
                input: uploadedData
            }
        };

        onUpdate({
            stepData: newStepData,
            currentStep: 7
        });

        addToast("Data submitted! Proceed to Step 7 for analysis.", "success");
    };


    return (
        <div>
            <ul className="nav nav-tabs mb-3">
                <li className="nav-item">
                    <a className={`nav-link ${activeTab === 'simulate' ? 'active' : ''}`} href="#" onClick={() => setActiveTab('simulate')}>Run Custom Code</a>
                </li>
                 <li className="nav-item">
                    <a className={`nav-link ${activeTab === 'upload' ? 'active' : ''}`} href="#" onClick={() => setActiveTab('upload')}>Upload Own Data</a>
                </li>
                <li className="nav-item">
                    <a className={`nav-link ${activeTab === 'docs' ? 'active' : ''}`} href="#" onClick={() => setActiveTab('docs')}>Documentation</a>
                </li>
            </ul>

            {activeTab === 'simulate' && (
                <>
                    <div className="mb-3">
                        <textarea
                            id="code-editor"
                            className="form-control"
                            value={code}
                            onChange={(e) => handleCodeChange(e.target.value)}
                            rows={15}
                        />
                    </div>
                     <div className="d-flex justify-content-between align-items-center mb-3">
                        <button className="btn btn-success" onClick={runCode}>
                            <i className="bi bi-play-fill me-1"></i> Run Simulation
                        </button>
                        <button className="btn btn-outline-primary" onClick={onSynthesize} disabled={isLoading}>
                             {isLoading ? (
                                <>
                                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                    Synthesizing...
                                </>
                            ) : (
                                <>
                                    <i className="bi bi-magic me-1"></i> Skip & Synthesize Results
                                </>
                            )}
                        </button>
                    </div>
                     <div>
                        <h6 className="fw-bold">Output</h6>
                         <div className={`code-output ${output.error ? 'error' : ''}`}>
                            {output.logs.map((log, i) => <div key={i}>{'>'} {log}</div>)}
                            {output.error && <div className="fw-bold">Error: {output.error}</div>}
                        </div>
                    </div>
                </>
            )}

             {activeTab === 'upload' && (
                <div className="p-2 text-center">
                    <i className="bi bi-cloud-upload display-4 mb-3"></i>
                    <h5>Upload Your Experimental Data</h5>
                    <p className="text-white-50">If you've run your experiment offline, you can upload the results here. The data will be passed directly to the Data Analyzer step.</p>
                    
                    <div className="card my-4 text-start">
                        <div className="card-body">
                            <h6 className="card-title">1. Get a Data Template (Optional)</h6>
                            <p className="card-text small text-white-50">Generate a CSV header based on your data collection plan from Step 5 to ensure your data is formatted correctly.</p>
                            <button className="btn btn-outline-secondary" onClick={handleDownloadTemplate} disabled={isGeneratingTemplate}>
                                {isGeneratingTemplate ? <><span className="spinner-border spinner-border-sm me-2"></span>Generating...</> : <><i className="bi bi-download me-1"></i> Download Template</>}
                            </button>
                        </div>
                    </div>

                    <div className="card my-4 text-start">
                        <div className="card-body">
                            <h6 className="card-title">2. Upload Your Data File</h6>
                            <p className="card-text small text-white-50">Select a CSV or text file from your computer. The contents will be displayed below for verification.</p>
                            <input type="file" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} accept=".csv,.txt,.json" />
                            <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                                <i className="bi bi-folder2-open me-1"></i> Choose File...
                            </button>
                            {uploadedData && (
                                <textarea
                                    className="form-control mt-3"
                                    rows="8"
                                    value={uploadedData}
                                    readOnly
                                    placeholder="Your uploaded data will appear here..."
                                />
                            )}
                        </div>
                    </div>
                    
                    <div className="d-grid">
                        <button className="btn btn-success btn-lg" onClick={handleSubmitUploadedData} disabled={!uploadedData}>
                            <i className="bi bi-arrow-right-circle-fill me-1"></i> Use This Data for Analysis
                        </button>
                    </div>
                </div>
            )}


            {activeTab === 'docs' && (
                <div className="doc-section">
                    <h4>Simulator Documentation</h4>
                    <p>Welcome to the Hypatia custom code simulator. This is a sandboxed JavaScript environment where you can run virtual experiments to generate data.</p>
                    <h5>The `hypatia` Object</h5>
                    <p>A special global object, `hypatia`, is available to connect your simulation back to the main application.</p>
                    <p><strong>Function: </strong> `hypatia.finish(data, summary)`</p>
                    <ul>
                        <li>This is the most important function. Call it when your simulation has produced its final results.</li>
                        <li>`data` (string): The raw data from your experiment. This should be in a machine-readable format like CSV or JSON. This data will become the input for Step 7: Data Analyzer.</li>
                        <li>`summary` (string): A brief, human-readable summary of what the simulation did or found. This will be saved as the output for the current step (Step 6).</li>
                    </ul>
                     <h5>Example Usage</h5>
                    <pre><code>{`
const results = [
  { time: 0, value: 10 },
  { time: 1, value: 12 },
  { time: 2, value: 15 }
];

// Convert results to a CSV string for the analyzer
const csvData = "time,value\\n" + results.map(r => \`\${r.time},\${r.value}\`).join('\\n');

const summaryText = "Generated 3 data points showing a positive trend.";

// Pass data to the next step
hypatia.finish(csvData, summaryText);
                    `}</code></pre>
                     <h5>Debugging</h5>
                    <p>You can use `console.log()` to print messages, variables, and objects to the "Output" panel below the code editor. This is useful for debugging your simulation as you write it.</p>
                </div>
            )}
        </div>
    );
};

const PublicationExporter = ({ experiment, onGenerate, isLoading, output, onSaveOutput }) => {
    const sections = ['Abstract', 'Introduction', 'Literature Review', 'Methodology', 'Results', 'Discussion', 'Future Work'];
    const [generatedSections, setGeneratedSections] = useState({});

    // This is a simplified approach. A real implementation might generate section by section.
    // For now, we trigger one large generation.

    const handleExport = (format) => {
        let content = ``;
        if (format === 'markdown') {
            content = `# ${experiment.title}\n\n${output}`;
        } else { // text
            content = `${experiment.title}\n\n${output.replace(/#+\s/g, '')}`;
        }

        const blob = new Blob([content], { type: `text/${format === 'markdown' ? 'markdown' : 'plain'}` });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${experiment.title.replace(/\s/g, '_')}.${format === 'markdown' ? 'md' : 'txt'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div>
            {!output && !isLoading && (
                 <div className="text-center p-4 publication-progress">
                     <i className="bi bi-journal-richtext display-4 mb-3"></i>
                    <h5>Ready to Generate Publication Draft</h5>
                    <p className="text-white-50">Click the button below to have the AI assemble all your research steps into a structured scientific paper.</p>
                     <button className="btn btn-primary" onClick={onGenerate} disabled={isLoading}>
                        <i className="bi bi-stars me-2"></i> Generate Draft
                    </button>
                </div>
            )}
            {isLoading && !output && (
                 <div className="d-flex flex-column align-items-center p-4 publication-progress">
                    <div className="spinner-border mb-3" role="status"></div>
                    <h5 className="mb-1">Generating Publication...</h5>
                    <p className="text-white-50">This may take a moment as the AI reviews your entire project.</p>
                </div>
            )}
            {output && (
                <>
                    <div className="d-flex justify-content-end mb-3">
                         <button className="btn btn-sm btn-outline-light me-2" onClick={() => handleExport('markdown')}>
                            <i className="bi bi-filetype-md me-1"></i> Export as Markdown
                        </button>
                         <button className="btn btn-sm btn-outline-light" onClick={() => handleExport('text')}>
                            <i className="bi bi-file-text me-1"></i> Export as Text
                        </button>
                    </div>
                     <GeneratedOutput output={output} stepId={10} onSave={onSaveOutput} isEditable={!isLoading} />
                </>
            )}
        </div>
    );
};

const HelpModal = ({ content, onClose }) => {
    return (
        <div className="help-modal" onClick={onClose}>
            <div className="help-modal-dialog" onClick={e => e.stopPropagation()}>
                <div className="help-modal-content">
                    <div className="help-modal-header">
                        <h5 className="modal-title"><i className="bi bi-question-circle me-2"></i>Project Hypatia Documentation</h5>
                        <button type="button" className="btn-close" onClick={onClose}></button>
                    </div>
                    <div className="help-modal-body" dangerouslySetInnerHTML={{ __html: marked(content || '### Loading...') }}>
                    </div>
                </div>
            </div>
        </div>
    );
};


const TestRunner = () => {
    const [testResults, setTestResults] = useState([]);
    const [isRunning, setIsRunning] = useState(false);
    
    const runTests = async () => {
        setIsRunning(true);
        const results = [];
        for (const test of appTests) {
            try {
                await test.fn();
                results.push({ name: test.name, passed: true });
            } catch (error) {
                results.push({ name: test.name, passed: false, error: error.message });
            }
        }
        setTestResults(results);
        setIsRunning(false);
    };

    const totalTests = testResults.length;
    const passedTests = testResults.filter(r => r.passed).length;

    return (
        <div className="container">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h1 className="mb-0">Application Test Suite</h1>
                <button className="btn btn-primary" onClick={runTests} disabled={isRunning}>
                    {isRunning ? <><span className="spinner-border spinner-border-sm me-2"></span>Running...</> : <><i className="bi bi-play-circle me-2"></i>Run All Tests</>}
                </button>
            </div>
            
            {testResults.length > 0 && (
                <div className="mb-4">
                    <h5>Test Summary: {passedTests} / {totalTests} passed</h5>
                    <div className="progress">
                        <div 
                            className={`progress-bar ${passedTests === totalTests ? 'bg-success' : 'bg-warning'}`} 
                            role="progressbar" 
                            style={{width: `${(passedTests/totalTests) * 100}%`}}
                        ></div>
                    </div>
                </div>
            )}

            <div>
                {testResults.map((result, index) => (
                    <div key={index} className={`test-result ${result.passed ? 'passed' : 'failed'}`}>
                        <div className="test-status">
                            {result.passed ? <i className="bi bi-check-circle-fill text-success"></i> : <i className="bi bi-x-circle-fill text-danger"></i>}
                        </div>
                        <div className="test-details">
                            <span className="fw-bold">{result.name}</span>
                            {!result.passed && <div className="test-error">{result.error}</div>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};


// --- ROOT RENDER ---
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <ToastProvider>
            <App />
        </ToastProvider>
    </React.StrictMode>
);