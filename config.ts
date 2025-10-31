
import type { Dispatch, SetStateAction } from 'react';
import { Type } from "@google/genai";
import { GoogleGenAI } from "@google/genai";

// --- TYPE DEFINITIONS ---
export interface StepData {
    input?: string;
    suggestedInput?: string;
    output?: string;
    summary?: string;
    history?: { timestamp: string; input: string; output: string }[];
    provenance?: { timestamp: string; prompt: string; config: object, output?: string }[];
    uniquenessScore?: number;
    uniquenessJustification?: string;
}

export interface FineTuneSettings {
    [key: string]: any;
}

export interface Experiment {
    id: string;
    title: string;
    description: string;
    field: string;
    currentStep: number;
    stepData: { [key: number]: StepData };
    fineTuneSettings: { [key: number]: FineTuneSettings };
    createdAt: string;
    labNotebook?: string;
    automationMode: 'manual' | 'automated' | null;
    status?: 'active' | 'archived';
}

export interface ExperimentContextType {
    experiments: Experiment[];
    activeExperiment: Experiment | null;
    gemini: GoogleGenAI | null;
    createNewExperiment: (title: string, description: string, field: string) => Promise<void>;
    updateExperiment: (updatedExperiment: Experiment) => Promise<void>;
    deleteExperiment: (id: string) => Promise<void>;
    selectExperiment: (id: string) => void;
    setActiveExperiment: Dispatch<SetStateAction<Experiment | null>>;
    importExperiment: (experimentData: Experiment) => Promise<void>;
    handleAuthentication: (type: 'promo' | 'key', value: string) => Promise<void>;
}

// FIX: Add and export ToastContextType, which was missing.
export interface ToastContextType {
    addToast: (message: string, type?: 'success' | 'danger' | 'warning' | 'info') => void;
}


// --- APPLICATION CONSTANTS ---

export const SCIENTIFIC_FIELDS = [
    "Physics",
    "Biology",
    "Chemistry",
    "Computer Science",
    "Medicine",
    "Engineering",
    "Materials Science",
    "Astronomy",
    "Geology",
    "Environmental Science",
    "Psychology",
    "Sociology",
    "Economics",
    "Mathematics",
    "Neuroscience",
    "Biochemistry",
    "Genetics",
    "Ecology",
    "Statistics",
    "Political Science"
] as const;


export const WORKFLOW_STEPS = [
    { id: 1, title: 'Research Question', icon: 'bi-patch-question', description: "Refine your initial idea into a clear, focused, and testable research question." },
    { id: 2, title: 'Literature Review', icon: 'bi-book', description: "Survey existing research to understand the current state of knowledge and identify gaps. This step uses Google Search for up-to-date results." },
    { id: 3, title: 'Hypothesis Formulation', icon: 'bi-lightbulb', description: "Propose a clear, testable explanation for an observed phenomenon based on your literature review." },
    { id: 4, title: 'Methodology Design', icon: 'bi-rulers', description: "Outline the step-by-step procedure you will use to test your hypothesis." },
    { id: 5, title: 'Data Collection Plan', icon: 'bi-clipboard-data', description: "Detail how you will collect, record, and organize the data from your experiment." },
    { id: 6, title: 'Experiment Runner / Data Synthesis', icon: 'bi-beaker', description: "Execute your experiment virtually by running a simulation, uploading your own data, or having the AI synthesize a plausible dataset." },
    { id: 7, title: 'Data Analyzer', icon: 'bi-graph-up-arrow', description: "Process and analyze the collected data to identify patterns, relationships, and statistical significance. The AI will output a JSON object with a summary and chart suggestions." },
    { id: 8, title: 'Conclusion Drawing', icon: 'bi-trophy', description: "Interpret the results of your analysis, determine if your hypothesis was supported, and discuss the implications of your findings." },
    { id: 9, title: 'Peer Review Simulation', icon: 'bi-people', description: "Subject your findings and conclusions to a simulated critical review to identify weaknesses and strengthen your arguments." },
    { id: 10, title: 'Publication Exporter', icon: 'bi-journal-richtext', description: "Assemble all the preceding steps into a cohesive, publication-ready scientific paper draft." }
];

export const STEP_SPECIFIC_TUNING_PARAMETERS = {
    1: [
        { name: 'scope', label: 'Scope', description: 'Define how broad or narrow the research question should be.', type: 'select', options: ['Specific', 'Broad', 'Exploratory'], default: 'Specific' },
        { name: 'novelty', label: 'Novelty', description: 'Adjust how unique or groundbreaking the AI should aim for the question to be.', type: 'range', min: 0.1, max: 1.0, step: 0.1, default: 0.5 },
        { name: 'questionStyle', label: 'Question Style', description: 'Defines the grammatical style and format of the research question.', type: 'select', options: ['Interrogative (Why/How)', 'Descriptive (What)', 'Comparative'], default: 'Interrogative (Why/How)' },
        { name: 'targetAudience', label: 'Target Audience', description: 'Influences the complexity and jargon used in formulating the question.', type: 'select', options: ['Expert', 'Student', 'General Public'], default: 'Expert' }
    ],
    2: [
        { name: 'sourceRecency', label: 'Source Recency', description: 'Prioritize literature by publication date. Note: This is a strong hint, not a strict filter.', type: 'select', options: ['Past Year', 'Past 5 Years', 'Any Time'], default: 'Past 5 Years' },
        { name: 'reviewScope', label: 'Review Scope', description: 'Define the depth and breadth of the literature review summary.', type: 'select', options: ['Comprehensive', 'Targeted Summary', 'Key Papers Only'], default: 'Targeted Summary' },
        { name: 'geographicalFocus', label: 'Geographical Focus', description: 'Narrow the search to studies from a specific region (if applicable).', type: 'select', options: ['Global', 'North America', 'Europe', 'Asia'], default: 'Global' },
        { name: 'criticalStance', label: 'Critical Stance', description: 'Analyze sources for strengths and weaknesses, not just summarize.', type: 'boolean', default: true }
    ],
    3: [
        { name: 'creativity', label: 'Creativity', description: 'Control the level of conventional vs. out-of-the-box thinking for hypotheses.', type: 'range', min: 0.1, max: 1.0, step: 0.1, default: 0.6 },
        { name: 'hypothesis_count', label: 'Number of Hypotheses', description: 'Set how many distinct hypotheses the AI should generate.', type: 'select', options: ['2', '3', '4'], default: '3' },
        { name: 'hypothesisType', label: 'Hypothesis Type', description: 'Specify the scientific format of the hypotheses (e.g., directional, null).', type: 'select', options: ['Directional', 'Non-directional', 'Null & Alternative'], default: 'Directional' },
        { name: 'riskLevel', label: 'Risk Level', description: 'The boldness of the proposed hypotheses, from safe to high-risk/high-reward.', type: 'select', options: ['Conservative (High-likelihood)', 'Balanced', 'Bold (High-reward)'], default: 'Balanced' }
    ],
    4: [
        { name: 'detail_level', label: 'Level of Detail', description: 'Specify the granularity of the methodology steps.', type: 'select', options: ['High-level overview', 'Detailed protocol', 'Step-by-step for replication'], default: 'Detailed protocol' },
        { name: 'methodType', label: 'Methodology Type', description: 'Specify the primary research approach (e.g., quantitative, qualitative).', type: 'select', options: ['Quantitative', 'Qualitative', 'Mixed-Methods', 'Theoretical'], default: 'Quantitative' },
        { name: 'feasibilityFocus', label: 'Feasibility Focus', description: 'Prioritize practicality (cost, time) over ideal scientific rigor, or vice versa.', type: 'boolean', default: true },
        { name: 'ethicalConsiderations', label: 'Ethical Considerations', description: 'Ensure a dedicated section on ethical considerations is included.', type: 'boolean', default: true }
    ],
    5: [
        { name: 'instrumentDetail', label: 'Instrument Detail', description: 'Specify how detailed the equipment/tool suggestions should be.', type: 'select', options: ['General instruments', 'Specify exact models/tools', 'Suggest software for collection'], default: 'General instruments' },
        { name: 'samplingStrategy', label: 'Sampling Strategy', description: 'Suggest a specific sampling method for the data collection plan.', type: 'select', options: ['Random', 'Stratified', 'Convenience', 'AI Suggests Best'], default: 'AI Suggests Best' },
        { name: 'dataSecurity', label: 'Data Security', description: 'Include measures for data security, privacy, and anonymization in the plan.', type: 'boolean', default: false },
        { name: 'formatSuggestion', label: 'Format Suggestion', description: 'Suggest a specific file format or structure for data storage.', type: 'select', options: ['CSV', 'JSON', 'Spreadsheet', 'Database Schema'], default: 'CSV' }
    ],
    7: [
        { name: 'statisticalApproach', label: 'Statistical Approach', description: 'Guide the type of statistical analysis to be performed.', type: 'select', options: ['Descriptive', 'Inferential (t-tests, ANOVA)', 'Predictive (Regression)', 'AI Default'], default: 'AI Default' },
        { name: 'visualizationEmphasis', label: 'Visualization Emphasis', description: 'A higher value suggests more diverse and numerous chart types.', type: 'range', min: 0.2, max: 1.0, step: 0.2, default: 0.6 },
        { name: 'assumeAudience', label: 'Audience for Summary', description: 'Tailor the language in the analysis summary for a specific audience.', type: 'select', options: ['Technical Expert', 'Business Stakeholder', 'Layperson'], default: 'Technical Expert' },
        { name: 'identifyOutliers', label: 'Identify Outliers', description: 'Explicitly identify and comment on potential outliers in the data.', type: 'boolean', default: true }
    ],
    8: [
        { name: 'conclusionTone', label: 'Conclusion Tone', description: 'Set the tone of the conclusion, from highly confident to more reserved.', type: 'select', options: ['Confident', 'Cautious', 'Objective & Neutral'], default: 'Objective & Neutral' },
        { name: 'futureWork', label: 'Suggest Future Work', description: 'Include a section with specific, actionable suggestions for future research.', type: 'boolean', default: true },
        { name: 'practicalImplications', label: 'Practical Implications', description: 'Discuss the practical, real-world applications or implications of the findings.', type: 'boolean', default: false },
        { name: 'limitationDetail', label: 'Limitation Detail', description: 'Specify how deeply the limitations of the study should be discussed.', type: 'select', options: ['Briefly mention', 'Detailed discussion', 'Categorize limitations'], default: 'Detailed discussion' }
    ],
    9: [
        { name: 'reviewerPersona', label: 'Reviewer Persona', description: 'Choose the personality of the simulated peer reviewer.', type: 'select', options: ['Harsh Critic', 'Supportive Colleague', 'Methodology Expert', 'Journal Editor', 'Skeptical Statistician', 'Big Picture Thinker'], default: 'Harsh Critic' },
        { name: 'focus_area', label: 'Focus Area', description: 'Direct the reviewer to focus on a specific part of your research.', type: 'select', options: ['Overall Cohesion', 'Methodology Rigor', 'Conclusion Strength', 'Novelty & Impact'], default: 'Overall Cohesion' },
        { name: 'reviewFormat', label: 'Review Format', description: 'Define the structure of the feedback provided by the reviewer.', type: 'select', options: ['Numbered List', 'Prose Paragraphs', 'Q&A Format'], default: 'Numbered List' },
        { name: 'actionability', label: 'Actionability', description: 'Ensure the review provides actionable suggestions, not just identifies flaws.', type: 'boolean', default: true }
    ],
    10: [
        { name: 'targetJournal', label: 'Target Journal Style', description: 'Tailor the tone, structure, and formatting to a specific type of academic journal.', type: 'select', options: ['High-Impact (Nature/Science)', 'Specialized Field Journal', 'General Open Access', 'Pre-print Server (arXiv)'], default: 'Specialized Field Journal' },
        { name: 'abstractLength', label: 'Abstract Length', description: 'Set the approximate word count for the abstract.', type: 'select', options: ['Concise (~150 words)', 'Standard (~250 words)', 'Extended (~400 words)'], default: 'Standard (~250 words)' },
        { name: 'authorVoice', label: 'Author Voice', description: 'Choose the narrative voice for the paper.', type: 'select', options: ['Formal Third-Person', 'Active First-Person Plural ("We found...")'], default: 'Formal Third-Person' },
        { name: 'keywords', label: 'Generate Keywords', description: 'Generate a list of 5-7 relevant keywords for indexing.', type: 'boolean', default: true }
    ]
};

/**
 * @const RESEARCH_QUESTION_SCHEMA
 * New schema for Step 1 to enforce a structured response containing the question and uniqueness score.
 */
export const RESEARCH_QUESTION_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        research_question: {
            type: Type.STRING,
            description: "The final, refined research question."
        },
        uniqueness_score: {
            type: Type.NUMBER,
            description: "A score from 0.0 to 1.0 indicating the novelty of the research question."
        },
        justification: {
            type: Type.STRING,
            description: "A brief justification for the assigned uniqueness score."
        }
    },
    required: ["research_question", "uniqueness_score", "justification"]
};


/**
 * @const LITERATURE_REVIEW_SCHEMA
 * New schema for Step 2 to enforce structured reference data alongside the summary.
 */
export const LITERATURE_REVIEW_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        summary: {
            type: Type.STRING,
            description: "A comprehensive summary of the literature review in Markdown format."
        },
        references: {
            type: Type.ARRAY,
            description: "An array of structured reference objects.",
            items: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    authors: { type: Type.ARRAY, items: { type: Type.STRING } },
                    year: { type: Type.NUMBER },
                    journal: { type: Type.STRING, description: "Journal, conference, or publisher name." },
                    url: { type: Type.STRING, description: "A direct URL to the source if available." }
                },
                required: ["title", "authors", "year"]
            }
        }
    }
};

/**
 * @const QA_AGENT_SCHEMA
 * Schema for Step 7's agentic QA step to enforce a structured response.
 */
export const QA_AGENT_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        pass: {
            type: Type.BOOLEAN,
            description: "Whether the Chart.js JSON passes validation."
        },
        feedback: {
            type: Type.STRING,
            description: "Concise feedback for the Doer agent, explaining why it passed or failed."
        }
    },
    required: ["pass", "feedback"]
};

/**
 * @const DYNAMIC_TABLE_SCHEMA
 * Schema for generating a dynamic table structure for manual data entry.
 */
export const DYNAMIC_TABLE_SCHEMA = {
    type: Type.ARRAY,
    description: "An array of objects representing column headers and their suggested data types for a data entry table.",
    items: {
        type: Type.OBJECT,
        properties: {
            columnName: {
                type: Type.STRING,
                description: "The name of the column header."
            },
            dataType: {
                type: Type.STRING,
                description: "The suggested data type for this column (e.g., 'number', 'string', 'date')."
            }
        },
        required: ["columnName", "dataType"]
    }
};


/**
 * @const STATISTICAL_METHODS_SCHEMA
 * New schema for the first stage of Step 7, where the AI suggests analysis methods.
 */
export const STATISTICAL_METHODS_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        methods: {
            type: Type.ARRAY,
            description: "An array of suggested statistical methods.",
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING, description: "The name of the statistical method (e.g., 'T-Test', 'Linear Regression')." },
                    description: { type: Type.STRING, description: "A brief explanation of what the method is used for and why it's suitable." }
                },
                required: ["name", "description"]
            }
        }
    },
    required: ["methods"]
};


/**
 * @const DATA_ANALYZER_SCHEMA
 * Defines the expected JSON structure for the output of Step 7 (Data Analyzer).
 * This ensures the AI provides data in a consistent, parsable format for rendering charts.
 */
export const DATA_ANALYZER_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        summary: {
            type: Type.STRING,
            description: "A detailed summary and interpretation of the data analysis findings, written in Markdown format."
        },
        chartSuggestions: {
            type: Type.ARRAY,
            description: "An array of chart configurations for visualizing the data. Each object must be a valid Chart.js configuration. Suggested chart types should be limited to 'bar' or 'line'.",
            items: {
                type: Type.OBJECT,
                properties: {
                    type: {
                        type: Type.STRING,
                        description: "The type of chart (must be 'bar' or 'line')."
                    },
                    data: {
                        type: Type.OBJECT,
                        description: "The data object for Chart.js, including labels and datasets.",
                        properties: {
                            labels: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING }
                            },
                            datasets: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        label: { type: Type.STRING },
                                        data: {
                                            type: Type.ARRAY,
                                            description: "An array of numerical data points for the chart. Must contain numbers.",
                                            items: { type: Type.NUMBER }
                                        },
                                        backgroundColor: {
                                            type: Type.ARRAY,
                                            items: { type: Type.STRING }
                                        },
                                        borderColor: {
                                            type: Type.ARRAY,
                                            items: { type: Type.STRING }
                                        },
                                        borderWidth: { type: Type.NUMBER }
                                    }
                                }
                            }
                        }
                    },
                    options: {
                        type: Type.OBJECT,
                        description: "The options object for Chart.js, including scales, plugins, etc.",
                        properties: {
                           scales: {
                               type: Type.OBJECT,
                               description: "Configuration for the chart's axes. Can be empty for charts like 'pie'.",
                               properties: {
                                   y: {
                                       type: Type.OBJECT,
                                       properties: {
                                           beginAtZero: { type: Type.BOOLEAN }
                                       }
                                   },
                                   x: {
                                        type: Type.OBJECT,
                                        properties: {
                                            title: {
                                                type: Type.OBJECT,
                                                properties: {
                                                    display: {type: Type.BOOLEAN},
                                                    text: {type: Type.STRING}
                                                }
                                            }
                                        }
                                   }
                               }
                           }
                        }
                    }
                }
            }
        }
    },
    required: ["summary", "chartSuggestions"]
};
