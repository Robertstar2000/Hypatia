
import React, { useState, useEffect, useMemo, useCallback, useRef, createContext, useContext } from 'react';
import ReactDOM from 'react-dom/client';
import { marked } from 'marked';
import { appTests } from './index.test.tsx';
import { Chart, registerables } from 'chart.js';
import { GoogleGenAI } from "@google/genai";
import {
    Experiment,
    SCIENTIFIC_FIELDS,
    WORKFLOW_STEPS,
    STEP_SPECIFIC_TUNING_PARAMETERS,
    ExperimentContextType,
    RESEARCH_QUESTION_SCHEMA
} from './config';
import { db } from './be_db';
import {
    getStepContext,
    getPromptForStep,
    testApiKey,
    parseGeminiError
} from './be_gemini';
import { ToastProvider, useToast } from './toast';
import { ExperimentRunner } from './experimentRunner';


// --- TOP-LEVEL INITIALIZATION ---
// Initialize libraries here to prevent any race conditions with React's render cycle.
Chart.register(...registerables);
marked.setOptions({
    gfm: true,
    breaks: true,
});


// --- REACT CONTEXT ---
const ExperimentContext = createContext<ExperimentContextType | null>(null);
export const useExperiment = () => {
    const context = useContext(ExperimentContext);
    if (!context) {
        throw new Error('useExperiment must be used within an ExperimentProvider');
    }
    return context;
};

// --- UTILITY FUNCTIONS ---
/**
 * Ensures a Chart.js configuration object has default styling to prevent invisible charts.
 * @param config - The Chart.js configuration object from the AI.
 * @returns A new configuration object with guaranteed styling.
 */
const ensureChartStyling = (config) => {
    const newConfig = JSON.parse(JSON.stringify(config)); // Deep copy
    const themeColors = [
        'rgba(0, 242, 254, 0.7)', // primary-glow
        'rgba(166, 74, 255, 0.7)', // secondary-glow
        'rgba(255, 205, 86, 0.7)', // yellow
        'rgba(75, 192, 192, 0.7)',  // teal
        'rgba(255, 99, 132, 0.7)',  // red
        'rgba(54, 162, 235, 0.7)',  // blue
    ];
    const borderColors = themeColors.map(c => c.replace('0.7', '1'));

    if (newConfig.data && newConfig.data.datasets) {
        newConfig.data.datasets.forEach((dataset, index) => {
            if (!dataset.backgroundColor) {
                dataset.backgroundColor = (newConfig.type === 'pie' || newConfig.type === 'doughnut') 
                    ? themeColors 
                    : themeColors[index % themeColors.length];
            }
            if (!dataset.borderColor) {
                dataset.borderColor = borderColors[index % borderColors.length];
            }
            if (dataset.borderWidth === undefined) {
                dataset.borderWidth = 1;
            }
        });
    }
    
    // Set default options for all charts to ensure responsiveness and proper sizing.
    if (!newConfig.options) {
        newConfig.options = {};
    }
    newConfig.options = {
        responsive: true,
        maintainAspectRatio: false, // This is critical for charts in flexible containers
        ...newConfig.options,
        scales: {
            ...(newConfig.options.scales || {}),
            x: {
                ...(newConfig.options.scales?.x || {}),
                ticks: { color: 'rgba(255, 255, 255, 0.7)' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' }
            },
            y: {
                ...(newConfig.options.scales?.y || {}),
                ticks: { color: 'rgba(255, 255, 255, 0.7)' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' }
            }
        },
        plugins: {
            ...(newConfig.options.plugins || {}),
            legend: {
                ...(newConfig.options.plugins?.legend || {}),
                labels: {
                    color: 'rgba(255, 255, 255, 0.8)'
                }
            }
        }
    };


    return newConfig;
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
    const [gemini, setGemini] = useState(null);
    const [isLabNotebookOpen, setLabNotebookOpen] = useState(false);

    const { addToast } = useToast();

    // Load experiments from Dexie on initial mount. Gemini is initialized by user action.
    useEffect(() => {
        const loadData = async () => {
            try {
                // Load experiments
                const storedExperiments = await db.experiments.orderBy('createdAt').reverse().toArray();
                setExperiments(storedExperiments);
                if (storedExperiments.length > 0) {
                    setActiveExperiment(storedExperiments[0]);
                }
            } catch (error) {
                console.error("Failed to load data:", error);
                addToast("Could not load saved experiments.", 'danger');
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, [addToast]);
    
    // Scroll to top after successful authentication
    useEffect(() => {
        if (gemini && view === 'landing') {
             setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
        }
    }, [gemini, view]);

    const handleAuthentication = async (type: 'promo' | 'key', value: string) => {
        let keyToUse: string | undefined = undefined;
    
        if (type === 'promo' && value.toUpperCase() === 'MTI') {
            keyToUse = process.env.API_KEY;
            if (!keyToUse) {
                addToast("Promo code is valid, but no default API key is configured for this session.", 'danger');
                return;
            }
        } else if (type === 'key' && value) {
            keyToUse = value;
        } else {
            addToast("Invalid input. Please try again.", 'warning');
            return;
        }
    
        try {
            const isValid = await testApiKey(keyToUse);
            if (isValid) {
                const geminiInstance = new GoogleGenAI({ apiKey: keyToUse });
                setGemini(geminiInstance);
                addToast("Authentication successful! Welcome to Project Hypatia.", 'success');
            } else {
                throw new Error("Invalid API Key provided.");
            }
        } catch (error) {
            setGemini(null);
            addToast(parseGeminiError(error, "Authentication failed. The key or code is not valid."), 'danger');
        }
    };


    // Handlers for experiment management
    const createNewExperiment = async (title: string, description: string, field: string) => {
        const newId = `exp_${Date.now()}`;
        const newExperiment: Experiment = {
            id: newId,
            title,
            description,
            field,
            currentStep: 1,
            stepData: {
                1: {
                    input: `Title: ${title}\n\nDescription: ${description}`,
                    history: [],
                    provenance: [],
                }
            },
            fineTuneSettings: {},
            createdAt: new Date().toISOString(),
            labNotebook: '',
            automationMode: null,
            status: 'active',
        };
        try {
            await db.experiments.add(newExperiment);
            setExperiments(prev => [newExperiment, ...prev]);
            setActiveExperiment(newExperiment);
            setView('experiment');
            addToast("New research project created successfully!", 'success');
        } catch (error) {
            console.error("Failed to save new experiment:", error);
            addToast("Failed to create project.", 'danger');
        }
    };
    
    const importExperiment = async (experimentData: Experiment) => {
        try {
            if (!experimentData.id || !experimentData.title || !experimentData.createdAt) {
                throw new Error("Invalid experiment file format.");
            }
            const existing = await db.experiments.get(experimentData.id);
            if(existing) {
                if(!window.confirm("An experiment with this ID already exists. Overwrite it?")) {
                    return;
                }
                await db.experiments.put(experimentData);
            } else {
                await db.experiments.add(experimentData);
            }
            const storedExperiments = await db.experiments.orderBy('createdAt').reverse().toArray();
            setExperiments(storedExperiments);
            addToast(`Project "${experimentData.title}" imported successfully!`, 'success');

        } catch(error) {
             addToast(`Failed to import project: ${error.message}`, 'danger');
        }
    }


    const updateExperiment = async (updatedExperiment: Experiment) => {
        try {
            await db.experiments.put(updatedExperiment);
            setExperiments(prev => prev.map(e => e.id === updatedExperiment.id ? updatedExperiment : e));
            if (activeExperiment?.id === updatedExperiment.id) {
                setActiveExperiment(updatedExperiment);
            }
        } catch (error) {
            console.error("Failed to update experiment:", error);
            addToast("Failed to save progress.", 'danger');
        }
    };

    const deleteExperiment = async (id: string) => {
        if (window.confirm("Are you sure you want to delete this project? This action cannot be undone.")) {
            try {
                await db.experiments.delete(id);
                const updatedExperiments = experiments.filter(e => e.id !== id);
                setExperiments(updatedExperiments);
                if (activeExperiment?.id === id) {
                    setActiveExperiment(updatedExperiments.length > 0 ? updatedExperiments[0] : null);
                    if(updatedExperiments.length > 0) {
                        setView('dashboard');
                    } else {
                        setView('landing');
                    }
                }
                addToast("Project deleted.", 'success');
            } catch (error) {
                console.error("Failed to delete experiment:", error);
                addToast("Failed to delete project.", 'danger');
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

    const contextValue = {
        experiments,
        activeExperiment,
        gemini,
        createNewExperiment,
        updateExperiment,
        deleteExperiment,
        selectExperiment,
        setActiveExperiment,
        importExperiment,
        handleAuthentication,
    };

    // Render logic
    if (isLoading) {
        return <div className="d-flex justify-content-center align-items-center vh-100"><div className="spinner-border" role="status"><span className="visually-hidden">Loading...</span></div></div>;
    }

    return (
        <ExperimentContext.Provider value={contextValue}>
            <Header setView={setView} activeView={view} onToggleNotebook={() => setLabNotebookOpen(p => !p)} />
            <main className="container-fluid mt-4">
                {view === 'landing' && <LandingPage 
                    setView={setView}
                />}
                {view === 'dashboard' && <Dashboard setView={setView} />}
                {view === 'experiment' && activeExperiment && <ExperimentWorkspace key={activeExperiment.id} />}
                {view === 'testing' && <TestRunner />}
            </main>
            {activeExperiment && gemini && (
                <LabNotebook 
                    isOpen={isLabNotebookOpen} 
                    onClose={() => setLabNotebookOpen(false)}
                />
            )}
            <Footer />
        </ExperimentContext.Provider>
    );
};

const Header = ({ setView, activeView, onToggleNotebook }) => {
    const [showHelp, setShowHelp] = useState(false);
    const [readmeContent, setReadmeContent] = useState('');
    const { gemini } = useExperiment();

    useEffect(() => {
        if (showHelp && !readmeContent) {
            fetch('./README.md')
                .then(response => response.ok ? response.text() : Promise.reject('Failed to load'))
                .then(text => setReadmeContent(text))
                .catch(err => {
                    console.error("Failed to load README.md:", err);
                    setReadmeContent("# Error\n\nCould not load help content.");
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
                            {gemini && (
                                <li className="nav-item">
                                    <span className="nav-link text-success"><i className="bi bi-check-circle-fill me-1"></i> API Connection Active</span>
                                </li>
                            )}
                             {activeView !== 'landing' && (
                                <>
                                <li className="nav-item">
                                    <a className="nav-link" href="#" onClick={onToggleNotebook}>
                                        <i className="bi bi-journal-bookmark-fill me-1"></i> Lab Notebook
                                    </a>
                                </li>
                                <li className="nav-item">
                                    <a className="nav-link" href="#" onClick={() => setShowHelp(true)}>
                                        <i className="bi bi-question-circle me-1"></i> Help
                                    </a>
                                </li>
                                </>
                            )}
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

const ApiKeySection = ({ onAuthenticate }) => {
    const [apiKey, setApiKey] = useState('');
    const [promoCode, setPromoCode] = useState('');
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const { addToast } = useToast();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!apiKey && !promoCode) {
            addToast('Please enter an API key or a promo code.', 'warning');
            return;
        }
        setIsAuthenticating(true);
        if (promoCode) {
            await onAuthenticate('promo', promoCode);
        } else {
            await onAuthenticate('key', apiKey);
        }
        setIsAuthenticating(false);
    };

    return (
        <div className="getting-started-fields mx-auto api-key-section">
            <form onSubmit={handleSubmit}>
                <p className="fw-bold text-light">Authenticate to Begin</p>
                <p className="small text-white-50 mb-3">
                    Please provide your Google Gemini API key to activate AI features. Your key is used only for this session and is not stored. You can get your free Gemini API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-primary-glow">Google AI Studio</a>.
                </p>
                <div className="mb-3">
                    <input
                        type="password"
                        className="form-control"
                        placeholder="Enter your Gemini API Key"
                        value={apiKey}
                        onChange={(e) => { setApiKey(e.target.value); setPromoCode(''); }}
                        disabled={isAuthenticating || !!promoCode}
                        aria-label="Gemini API Key"
                    />
                </div>
                <div className="text-center text-white-50 my-2">OR</div>
                <div className="mb-3">
                    <input
                        type="text"
                        className="form-control"
                        placeholder="Enter a Promo Code"
                        value={promoCode}
                        onChange={(e) => { setPromoCode(e.target.value); setApiKey(''); }}
                        disabled={isAuthenticating || !!apiKey}
                        aria-label="Promo Code"
                    />
                </div>
                <button type="submit" className="btn btn-primary btn-lg w-100" disabled={isAuthenticating}>
                    {isAuthenticating ? 'Validating...' : 'Unlock Hypatia'}
                </button>
            </form>
        </div>
    );
};


const LandingPage = ({ setView }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [field, setField] = useState<string>(SCIENTIFIC_FIELDS[0]);
    const { addToast } = useToast();
    const { gemini, createNewExperiment, handleAuthentication } = useExperiment();

    const handleStart = (e) => {
        e.preventDefault();
        if (!gemini) {
            addToast("The Gemini API connection is not active. AI features will be unavailable.", 'warning');
        }
        if(title.trim() && description.trim()){
            createNewExperiment(title, description, field);
        }
    };

    const handleGoToDashboard = () => {
        if (!gemini) {
            addToast("The Gemini API connection is not active. AI features will be unavailable.", 'warning');
        }
        setView('dashboard');
    };
    
    return (
        <div>
            <section className="landing-page-hero">
                <div className="landing-content">
                    <h1 className="display-4 landing-title">Project Hypatia</h1>
                    <p className="lead landing-subtitle mb-4">Project Hypatia is your AI-powered partner in scientific research, guiding you from initial question to the mock publication of a draft scientific paper.</p>
                     
                     {gemini ? (
                         <div className="getting-started-fields mx-auto">
                             <form onSubmit={handleStart}>
                                 <p className="fw-bold text-light">Start a New Research Project</p>
                                <div className="mb-3">
                                    <input type="text" className="form-control" placeholder="Project Title" value={title} onChange={e => setTitle(e.target.value)} required />
                                </div>
                                <div className="mb-3">
                                     <textarea className="form-control" placeholder="Briefly describe your research idea..." value={description} onChange={e => setDescription(e.target.value)} required rows={5}></textarea>
                                </div>
                                <div className="mb-3">
                                   <label htmlFor="discipline-select" className="form-label visually-hidden">Scientific Discipline</label>
                                   <select
                                       id="discipline-select"
                                       className="form-select"
                                       value={field}
                                       onChange={e => setField(e.target.value)}
                                       required
                                       aria-label="Scientific Discipline"
                                   >
                                       {SCIENTIFIC_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                                   </select>
                               </div>
                                 <button type="submit" className="btn btn-primary btn-lg w-100">
                                    <i className="bi bi-play-circle me-2"></i> Begin Research
                                </button>
                             </form>
                             <p className="mt-3 text-warning small">
                                Be sure to read and edit AI output to keep the project aligned with your needs. Depending on project complexity, agentic AI generation can take several minutes per step—please be patient.
                            </p>
                        </div>
                     ) : (
                        <ApiKeySection onAuthenticate={handleAuthentication} />
                     )}


                    <p className="mt-4 text-white-50 small">
                        An Application for ideation and to be used by Students, Scientists, Engineers, Lay Scientists and Anyone who wants to explore new ideas.
                    </p>
                </div>
            </section>

             <section className="landing-details-section">
                <div className="container">

                    <ResearchSummary />
                    <hr className="landing-divider" />

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
                                <p>A versatile virtual lab: upload existing data, run AI-generated simulations, use external tools like Google Colab, or let the AI synthesize plausible results for you.</p>
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
                         <div className="col-lg-6 text-center order-lg-2">
                            <img src="https://images.unsplash.com/photo-1554475901-4538ddfbccc2?q=80&w=2072&auto=format&fit=crop" alt="Scientist in a dark lab examining glowing blue liquids in test tubes" className="researcher-image" />
                        </div>
                        <div className="col-lg-6 order-lg-1">
                             <h2 className="section-title mb-3">From Idea to Publication</h2>
                             <p className="text-white-50 mb-4">Project Hypatia provides all the tools you need to take your research from a nascent idea to a polished, publication-ready paper. The integrated workflow ensures that each step logically builds on the last, creating a cohesive and comprehensive research narrative.</p>
                             <ul className="list-unstyled">
                                <li className="mb-3 d-flex align-items-center"><i className="bi bi-check-circle-fill text-primary-glow me-2"></i><span>Maintain full control with editable AI outputs.</span></li>
                                <li className="mb-3 d-flex align-items-center"><i className="bi bi-check-circle-fill text-primary-glow me-2"></i><span>Export your final paper and manage projects from a central dashboard.</span></li>
                                <li className="mb-3 d-flex align-items-center"><i className="bi bi-check-circle-fill text-primary-glow me-2"></i><span>All data stays local on your machine—no sign-up required.</span></li>
                             </ul>
                             <button className="btn btn-secondary" onClick={handleGoToDashboard}>Go to Your Dashboard <i className="bi bi-arrow-right"></i></button>
                        </div>
                    </div>
                    
                    <hr className="landing-divider" />

                    <div className="row">
                        <div className="col-12 text-center">
                            <h2 className="section-title">The 10-Step Research Workflow</h2>
                        </div>
                    </div>
                    <div className="row mt-4 g-3">
                        {WORKFLOW_STEPS.slice(0, 5).map(step => (
                             <div className="col-lg" key={step.id}>
                                <div className="workflow-step-item">
                                    <div className="workflow-step-icon"><i className={step.icon}></i></div>
                                    <div>
                                        <h6 className="fw-bold mb-1">{step.id}. {step.title}</h6>
                                        <p className="small text-white-50 mb-0">{step.description}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                     <div className="row mt-3 g-3">
                        {WORKFLOW_STEPS.slice(5, 10).map(step => (
                            <div className="col-lg" key={step.id}>
                                <div className="workflow-step-item">
                                    <div className="workflow-step-icon"><i className={step.icon}></i></div>
                                    <div>
                                        <h6 className="fw-bold mb-1">{step.id}. {step.title}</h6>
                                        <p className="small text-white-50 mb-0">{step.description}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                </div>
            </section>
        </div>
    );
};


const ResearchSummary = () => {
    const { experiments, selectExperiment } = useExperiment();
    const latestExperiment = experiments.length > 0 ? experiments[0] : null;

    if (!latestExperiment) return null;

    const handleContinueResearch = () => {
        if (latestExperiment) {
            selectExperiment(latestExperiment.id);
        }
    };

    // Defensively find the last step with any output by inspecting actual keys
    const lastStepWithOutput = latestExperiment.stepData
        ? Object.keys(latestExperiment.stepData)
            .map(Number)
            .filter(k => !isNaN(k) && k > 0) // Ensure we only consider valid numeric step keys
            .sort((a, b) => b - a)
            .find(stepId => latestExperiment.stepData[stepId]?.summary || latestExperiment.stepData[stepId]?.output)
        : null;

    // Defensively get the summary text, ensuring it is always a string.
    let summaryText = 'No summary available yet.';
    if (lastStepWithOutput && latestExperiment.stepData && latestExperiment.stepData[lastStepWithOutput]) {
        summaryText = latestExperiment.stepData[lastStepWithOutput].summary || latestExperiment.stepData[lastStepWithOutput].output || summaryText;
    }
    
    // Defensively get the current step's title to prevent crashes on invalid step numbers.
    const currentStepInfo = latestExperiment.currentStep > 0 && latestExperiment.currentStep <= WORKFLOW_STEPS.length 
        ? WORKFLOW_STEPS[latestExperiment.currentStep - 1].title 
        : "Completed";


    return (
        <section className="research-summary-section">
            <div className="row">
                <div className="col-lg-8 mx-auto">
                     <h2 className="section-title text-center mb-4">Your Latest Research</h2>
                     <div className="card" onClick={handleContinueResearch} style={{cursor: 'pointer'}} title="Click to continue this project">
                        <div className="card-body">
                            <h5 className="card-title text-primary-glow">{latestExperiment.title}</h5>
                            <h6 className="card-subtitle mb-2 text-white-50">{latestExperiment.field}</h6>
                            <blockquote className="p-3">
                                <p className="mb-0 fst-italic">"{summaryText.substring(0, 200)}{summaryText.length > 200 ? '...' : ''}"</p>
                            </blockquote>
                            <p className="mt-3 small text-white-50">Currently at: Step {latestExperiment.currentStep} - {currentStepInfo}</p>
                        </div>
                        <div className="card-footer bg-transparent border-top-0 text-end">
                            <button className="btn btn-primary" onClick={handleContinueResearch}>Continue Project <i className="bi bi-arrow-right"></i></button>
                        </div>
                     </div>
                </div>
            </div>
        </section>
    );
};

// FIX: Moved ExperimentCard outside of Dashboard to resolve key prop type issue
// FIX: Explicitly type component with React.FC to fix key prop type error.
const ExperimentCard: React.FC<{
    exp: Experiment;
    isArchived?: boolean;
    onUnarchive: (exp: Experiment) => Promise<void>;
    deleteExperiment: (id: string) => Promise<void>;
    selectExperiment: (id: string) => void;
    handleDeployClick: (experiment: Experiment) => void;
    handleExport: (experiment: Experiment) => void;
}> = ({ exp, isArchived = false, onUnarchive, deleteExperiment, selectExperiment, handleDeployClick, handleExport }) => (
    <div className={`col-md-6 col-lg-4 mb-4`}>
        <div className={`card h-100 d-flex flex-column ${isArchived ? 'archived-project-card' : ''}`}>
            <div className="card-body flex-grow-1">
                <h5 className="card-title text-primary-glow">{exp.title}</h5>
                <p className="card-text text-white-50 small">{exp.description}</p>
            </div>
            <div className="card-footer bg-transparent border-top-0">
                <p className="small text-white-50 mb-2">Progress: Step {exp.currentStep}/10</p>
                <div className="progress mb-3" style={{ height: '5px' }}>
                    <div className="progress-bar" style={{ width: `${exp.currentStep * 10}%` }}></div>
                </div>
                {isArchived ? (
                    <>
                        <button className="btn btn-sm btn-outline-light me-2" onClick={() => onUnarchive(exp)}>Unarchive</button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => deleteExperiment(exp.id)}><i className="bi bi-trash"></i></button>
                    </>
                ) : (
                    <>
                        {exp.currentStep >= 10 && exp.stepData[10]?.output ? (
                            <button className="btn btn-sm btn-primary w-100 mb-2" onClick={() => handleDeployClick(exp)}>
                                <i className="bi bi-rocket-takeoff-fill me-1"></i> Finalize & Deploy
                            </button>
                        ) : (
                            <button className="btn btn-sm btn-primary w-100 mb-2" onClick={() => selectExperiment(exp.id)}>
                                <i className="bi bi-play-circle-fill me-1"></i> View Project
                            </button>
                        )}
                        <div className="d-flex justify-content-between">
                            <button className="btn btn-sm btn-outline-secondary" onClick={() => handleExport(exp)}><i className="bi bi-download me-1"></i> Export</button>
                            <button className="btn btn-sm btn-outline-danger" onClick={() => deleteExperiment(exp.id)}><i className="bi bi-trash"></i></button>
                        </div>
                    </>
                )}
            </div>
        </div>
    </div>
);

const Dashboard = ({ setView }) => {
    const { experiments, selectExperiment, deleteExperiment, createNewExperiment, updateExperiment, importExperiment, gemini } = useExperiment();
    const [showDeployModal, setShowDeployModal] = useState(false);
    const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null);

    const activeExperiments = useMemo(() => experiments.filter(e => !e.status || e.status === 'active'), [experiments]);
    const archivedExperiments = useMemo(() => experiments.filter(e => e.status === 'archived'), [experiments]);

    const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const imported = JSON.parse(e.target.result as string);
                    importExperiment(imported);
                } catch (err) {
                    alert("Failed to parse experiment file. Is it a valid JSON export?");
                }
            };
            reader.readAsText(file);
        }
    };
    
    const handleExport = (experiment: Experiment) => {
        const dataStr = JSON.stringify(experiment, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `hypatia_export_${experiment.id}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleDeployClick = (experiment: Experiment) => {
        setSelectedExperiment(experiment);
        setShowDeployModal(true);
    };

    const handleUnarchive = async (exp: Experiment) => {
        await updateExperiment({ ...exp, status: 'active' });
    };
    
    return (
        <div className="container">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h2 className="section-title mb-0">Research Dashboard</h2>
                <div>
                     <label className="btn btn-secondary me-2">
                        <i className="bi bi-upload me-1"></i> Import Project
                        <input type="file" accept=".json" onChange={handleFileImport} style={{display: 'none'}} />
                    </label>
                    <button className="btn btn-primary" onClick={() => setView('landing')}>+ New Project</button>
                </div>
            </div>

            {activeExperiments.length === 0 && archivedExperiments.length === 0 && (
                 <div className="text-center p-5 dashboard-empty-state">
                    <i className="bi bi-journal-plus" style={{fontSize: '3rem'}}></i>
                    <h4 className="mt-3">No research projects yet.</h4>
                    <p className="text-white-50">Start a new project to begin your discovery journey.</p>
                    <button className="btn btn-primary mt-2" onClick={() => setView('landing')}>Create Your First Project</button>
                </div>
            )}
            
            {activeExperiments.length > 0 && <div className="row">
                {activeExperiments.map(exp => <ExperimentCard key={exp.id} exp={exp} onUnarchive={handleUnarchive} deleteExperiment={deleteExperiment} selectExperiment={selectExperiment} handleDeployClick={handleDeployClick} handleExport={handleExport} />)}
            </div>}
            
            {archivedExperiments.length > 0 && (
                <>
                    <hr className="my-5" />
                    <h3 className="section-title mb-4">Archived Projects</h3>
                    <div className="row">
                        {archivedExperiments.map(exp => <ExperimentCard key={exp.id} exp={exp} isArchived={true} onUnarchive={handleUnarchive} deleteExperiment={deleteExperiment} selectExperiment={selectExperiment} handleDeployClick={handleDeployClick} handleExport={handleExport} />)}
                    </div>
                </>
            )}

            {showDeployModal && selectedExperiment && (
                <DeployModal
                    experiment={selectedExperiment}
                    onClose={() => setShowDeployModal(false)}
                    onUpdateExperiment={updateExperiment}
                    onExportExperiment={handleExport}
                    gemini={gemini}
                />
            )}
        </div>
    );
};

const DeployModal = ({ experiment, onClose, onUpdateExperiment, onExportExperiment, gemini }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [generatedContent, setGeneratedContent] = useState('');
    const { addToast } = useToast();

    const handleArchiveAction = async () => {
        await onUpdateExperiment({ ...experiment, status: 'archived' });
        addToast("Project archived.", 'success');
        onClose();
    };

    const handleGenerate = async (step: number) => {
        if (!gemini) {
            addToast("Gemini AI is not available.", 'danger');
            return;
        }
        setIsLoading(true);
        setGeneratedContent('');
        try {
            const context = getStepContext(experiment, step);
            const { basePrompt, config } = getPromptForStep(step, '', context, {});
            const response = await gemini.models.generateContent({model: 'gemini-2.5-flash', contents: basePrompt, config});
            setGeneratedContent(response.text);
        } catch (error) {
            addToast(parseGeminiError(error, "Failed to generate content."), 'danger');
        } finally {
            setIsLoading(false);
        }
    };

    const generateShareableSummary = () => {
        const publicationText = experiment.stepData[10]?.output || 'No publication draft found.';
        const htmlContent = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${experiment.title}</title>
                <style> body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 20px auto; padding: 25px; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); } h1, h2, h3 { color: #000; } hr { border: 0; border-top: 1px solid #eee; margin: 20px 0; } </style>
            </head>
            <body>
                <h1>${experiment.title}</h1>
                <p><strong>Field:</strong> ${experiment.field}</p>
                <p><em>${experiment.description}</em></p>
                <hr>
                <div>${marked(publicationText)}</div>
            </body>
            </html>
        `;
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${experiment.title.replace(/\s+/g, '_')}_summary.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addToast("Shareable summary downloaded.", 'success');
    };

    const renderContent = () => {
        if (isLoading) {
            return <div className="text-center p-4"><div className="spinner-border"></div><p className="mt-2">AI is working...</p></div>;
        }
        if (generatedContent) {
            return (
                <div>
                    <textarea className="form-control" rows="10" value={generatedContent} readOnly></textarea>
                     <button className="btn btn-sm btn-outline-secondary mt-2" onClick={() => { navigator.clipboard.writeText(generatedContent); addToast('Copied to clipboard!', 'success'); }}>
                        <i className="bi bi-clipboard me-1"></i> Copy
                    </button>
                </div>
            );
        }
        return null;
    };

    const renderManualMode = () => (
        <>
            <h5 className="modal-title">Deploy Your Research</h5>
            <p className="text-white-50 small">This project used the Manual Control workflow, ideal for rigorous scientific work.</p>
            <div className="d-grid gap-2 mt-3">
                <button className="btn btn-outline-primary" onClick={() => handleGenerate(11)}>Generate Submission Checklist</button>
                <button className="btn btn-outline-secondary" onClick={() => onExportExperiment(experiment)}>Export for Collaboration</button>
                <button className="btn btn-outline-warning" onClick={handleArchiveAction}>Archive Project</button>
            </div>
        </>
    );

    const renderAutomatedMode = () => (
        <>
            <h5 className="modal-title">Share Your Exploration</h5>
            <p className="text-white-50 small">This project used the Automated Generation workflow, great for educational use.</p>
            <div className="d-grid gap-2 mt-3">
                <button className="btn btn-outline-primary" onClick={() => handleGenerate(12)}>Generate Presentation Outline</button>
                <button className="btn btn-outline-secondary" onClick={generateShareableSummary}>Download Shareable Summary (HTML)</button>
                <button className="btn btn-outline-warning" onClick={handleArchiveAction}>Archive Project</button>
            </div>
        </>
    );

    return (
         <div className="modal" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content">
                    <div className="modal-header">
                        {experiment.automationMode === 'manual' ? renderManualMode() : renderAutomatedMode()}
                        <button type="button" className="btn-close" onClick={onClose}></button>
                    </div>
                    <div className="modal-body">
                        {renderContent()}
                    </div>
                </div>
            </div>
        </div>
    );
};


const TestRunner = () => {
    const [results, setResults] = useState([]);
    const [isRunning, setIsRunning] = useState(false);

    const runTests = async () => {
        setIsRunning(true);
        const testResults = [];
        for (const test of appTests) {
            try {
                await test.fn();
                testResults.push({ name: test.name, passed: true });
            } catch (error) {
                testResults.push({ name: test.name, passed: false, error: error.message });
            }
        }
        setResults(testResults);
        setIsRunning(false);
    };

    useEffect(() => {
        runTests();
    }, []);

    return (
        <div>
            <h2>Application Self-Tests</h2>
            <p>This checks the core logic of the application to ensure everything is working as expected.</p>
            <button className="btn btn-primary mb-3" onClick={runTests} disabled={isRunning}>
                {isRunning ? 'Running...' : 'Re-run All Tests'}
            </button>
            <div>
                {results.map((result, index) => (
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

const HelpModal = ({ content, onClose }) => {
    const modalBodyRef = useRef(null);

    useEffect(() => {
        if (modalBodyRef.current) {
            modalBodyRef.current.innerHTML = marked(content);
        }
    }, [content]);

    return (
        <div className="help-modal" style={{display: 'flex'}} onClick={onClose}>
            <div className="help-modal-dialog" onClick={e => e.stopPropagation()}>
                <div className="help-modal-content">
                    <div className="help-modal-header">
                        <h5 className="modal-title">Project Hypatia Help</h5>
                        <button type="button" className="btn-close" onClick={onClose}></button>
                    </div>
                    <div className="help-modal-body" ref={modalBodyRef}>
                        {/* Content is rendered here via useEffect */}
                    </div>
                </div>
            </div>
        </div>
    );
};


const LabNotebook = ({ isOpen, onClose }) => {
    const { activeExperiment, updateExperiment } = useExperiment();
    const [content, setContent] = useState(activeExperiment?.labNotebook || '');
    const { addToast } = useToast();

    const colabTemplate = `\n\n### Google Colab Experiment Notes\n\n*   **Colab Notebook Link:** [https://colab.research.google.com/](https://colab.research.google.com/)\n*   **Anvil Uplink Key:** \`PASTE_YOUR_KEY_HERE\`\n*   **Setup Instructions:**\n    1.  In your Anvil web app, enable the "Server Uplink" service to get an Uplink key.\n    2.  In your Colab notebook, install the anvil-uplink library: \`!pip install anvil-uplink\`.\n    3.  Connect your notebook to Anvil: \`import anvil.server; anvil.server.connect("YOUR_UPLINK_KEY")\`.\n    4.  You can now call functions defined in your Colab notebook from your Anvil web app.\n\n---\n\n`;

    useEffect(() => {
        setContent(activeExperiment?.labNotebook || '');
    }, [activeExperiment?.labNotebook, isOpen]);

    const handleInsertTemplate = () => {
        setContent(prev => prev + colabTemplate);
        addToast("Colab template added.", "info");
    };

    const handleSave = () => {
        if (activeExperiment) {
            updateExperiment({ ...activeExperiment, labNotebook: content });
            addToast("Lab notebook saved.", "success");
            onClose();
        }
    };
    
    return (
         <div className={`lab-notebook-drawer ${isOpen ? 'open' : ''}`}>
            <div className="lab-notebook-header d-flex justify-content-between align-items-center">
                <h5 className="mb-0"><i className="bi bi-journal-bookmark-fill me-2"></i>Lab Notebook</h5>
                <div>
                    <button className="btn btn-outline-info btn-sm me-2" onClick={handleInsertTemplate} title="Insert Google Colab connection template">
                        <i className="bi bi-google me-1"></i> Colab Template
                    </button>
                    <button className="btn btn-primary btn-sm me-2" onClick={handleSave}>Save & Close</button>
                    <button className="btn btn-secondary btn-sm" onClick={onClose}><i className="bi bi-x-lg"></i></button>
                </div>
            </div>
            <div className="lab-notebook-body">
                <textarea 
                    className="form-control lab-notebook-textarea" 
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Record your thoughts, observations, and notes here..."
                />
            </div>
        </div>
    );
};

// FIX: Moved UniquenessMeter, DataAnalysisView and GeneratedOutput before ExperimentWorkspace
const UniquenessMeter = ({ score, justification }) => {
    const percentage = (score * 100).toFixed(0);
    const color = score > 0.8 ? 'text-success' : score > 0.5 ? 'text-warning' : 'text-danger';

    return (
        <div className="card mt-3">
            <div className="card-body">
                <h6 className="card-title">Research Uniqueness Score</h6>
                <div className="d-flex align-items-center">
                    <div className="flex-grow-1">
                        <div className="progress" style={{ height: '20px' }}>
                            <div className={`progress-bar ${color.replace('text-', 'bg-')}`} style={{ width: `${percentage}%` }} role="progressbar">{percentage}%</div>
                        </div>
                    </div>
                    <div className={`fw-bold ms-3 ${color}`} style={{ fontSize: '1.2rem' }}>
                        {score > 0.8 ? 'Highly Unique' : score > 0.5 ? 'Moderately Unique' : 'Common Topic'}
                    </div>
                </div>
                <p className="small text-white-50 mt-2 mb-0">{justification}</p>
            </div>
        </div>
    );
};

/**
 * @component DataAnalysisView
 * A robust component for rendering Chart.js visualizations.
 * FIX: This component has been rewritten to be more robust. It uses a single, comprehensive
 * useEffect hook to manage the lifecycle of chart instances. It uses a timeout to delay
 * rendering, giving parent components (like accordions) time to animate and become visible,
 * which is crucial for Chart.js to calculate the canvas size correctly.
 */
const DataAnalysisView = ({ analysisData }) => {
    const chartRefs = useRef({});
    const chartInstances = useRef(new Map());

    useEffect(() => {
        const instances = chartInstances.current;
        // Always clean up previous charts before creating new ones.
        instances.forEach(chart => chart.destroy());
        instances.clear();

        if (analysisData?.chartSuggestions && Array.isArray(analysisData.chartSuggestions)) {
            // Defer chart creation to allow the DOM (e.g., accordions in the summary view)
            // to finish animating and become visible. This prevents Chart.js from rendering
            // into a zero-size canvas, which results in a blank chart.
            const renderTimeout = setTimeout(() => {
                analysisData.chartSuggestions.forEach((config, index) => {
                    const canvas = chartRefs.current[index];
                    // Double-check that the canvas element is in the DOM and visible.
                    if (canvas && canvas.offsetParent !== null) {
                        try {
                            const styledConfig = ensureChartStyling(config);
                            const newChart = new Chart(canvas, styledConfig);
                            instances.set(index, newChart);
                        } catch (error) {
                            console.error(`Failed to render chart ${index}:`, error, config);
                        }
                    }
                });
            }, 300); // A 300ms delay is generally sufficient for standard UI animations.

            // The return function from useEffect serves as the cleanup function.
            // It runs when the component unmounts or when `analysisData` changes.
            return () => {
                clearTimeout(renderTimeout);
                instances.forEach(chart => chart.destroy());
                instances.clear();
            };
        }
    }, [analysisData]); // Effect runs only when the data changes.

    if (!analysisData || analysisData.summary === undefined) {
        return <div className="alert alert-info">Awaiting analysis results...</div>;
    }

    const hasCharts = Array.isArray(analysisData.chartSuggestions) && analysisData.chartSuggestions.length > 0;

    return (
        <div>
            {analysisData.summary && <div className="generated-text-container" dangerouslySetInnerHTML={{ __html: marked(analysisData.summary) }} />}
            {hasCharts && (
                <div className="mt-4">
                    <h5 className="fw-bold">Data Visualizations</h5>
                    <div className="row">
                        {analysisData.chartSuggestions.map((_config, index) => (
                            <div className="col-md-6 mb-3" key={index}>
                                <div className="card h-100">
                                    <div className="card-body" style={{ minHeight: '300px', position: 'relative' }}>
                                        {/* Canvas needs to be inside a relatively positioned container for responsive sizing */}
                                        {/* FIX: The ref callback was implicitly returning the element, which is invalid. Changed to a block body to ensure it returns undefined. */}
                                        <canvas ref={el => { chartRefs.current[index] = el; }}></canvas>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};


// FIX: Explicitly type component with React.FC to fix key prop type error.
const GeneratedOutput: React.FC<{
    stepId: number;
    onGenerate: (regenerateFeedback?: string) => Promise<void>;
    isLoading: boolean;
}> = ({ stepId, onGenerate, isLoading }) => {
    const { activeExperiment, setActiveExperiment, updateExperiment } = useExperiment();
    const { addToast } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState('');
    const [showRegenInput, setShowRegenInput] = useState(false);
    const [regenFeedback, setRegenFeedback] = useState('');

    const stepData = activeExperiment.stepData[stepId] || {};
    const output = stepData.output || '';

    useEffect(() => {
        setEditText(output);
    }, [output]);

    const handleSave = () => {
        const updatedStepData = { ...activeExperiment.stepData,
            [stepId]: { ...stepData, output: editText }
        };
        // Use the context update function to ensure data is persisted
        updateExperiment({ ...activeExperiment, stepData: updatedStepData });
        setIsEditing(false);
        addToast("Changes saved.", "success");
    };

    const handleRegenerate = () => {
        onGenerate(regenFeedback);
        setShowRegenInput(false);
        setRegenFeedback('');
    }

    const jsonParser = (text) => {
        let data;
        try {
            const sanitizedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            if (!sanitizedText) throw new Error("AI response was empty.");
            if (!sanitizedText.startsWith('{') || !sanitizedText.endsWith('}')) {
                 throw new Error("Sanitized text is not a JSON object.");
            }
            data = JSON.parse(sanitizedText);
            
            // Step 1: Research Question
            if (stepId === 1 && data.research_question && data.uniqueness_score !== undefined) {
                 return (
                    <div>
                        <div dangerouslySetInnerHTML={{ __html: marked(data.research_question) }} />
                        <UniquenessMeter score={data.uniqueness_score} justification={data.justification} />
                    </div>
                );
            }

            // Step 2: Literature Review
            if (stepId === 2 && data.summary && Array.isArray(data.references)) {
                return (
                    <div>
                        <div className="generated-text-container" dangerouslySetInnerHTML={{ __html: marked(data.summary) }} />
                        <h5 className="mt-4">References</h5>
                        <ul className="reference-list">
                            {data.references.map((ref, i) => (
                                <li key={i} className="reference-item">
                                    <div className="reference-title">{ref.title}</div>
                                    <div className="reference-meta">
                                        <em>{ref.authors.join(', ') || 'N/A'}</em> ({ref.year || 'N/A'}). {ref.journal || ''}
                                        {ref.url && <a href={ref.url} target="_blank" rel="noopener noreferrer" className="ms-2">[Source]</a>}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            }

            // Step 7: Data Analyzer (Robust parsing)
            if (stepId === 7) {
                 const summary = data.summary || '';
                 const chartSuggestions = (Array.isArray(data.chartSuggestions) ? data.chartSuggestions : [])
                    .filter(c => c && typeof c === 'object' && c.type && c.data && Array.isArray(c.data.datasets));
                 
                 if (!summary && chartSuggestions.length === 0) {
                    throw new Error("Parsed JSON for Step 7 is missing both 'summary' and 'chartSuggestions'.");
                 }
                 
                 const hadChartsInitially = Array.isArray(data.chartSuggestions) && data.chartSuggestions.length > 0;
                 const hasValidCharts = chartSuggestions.length > 0;

                 return (
                     <div>
                         {hadChartsInitially && !hasValidCharts &&
                             <div className="alert alert-info small mb-3">
                                 The AI suggested visualizations, but they were in an invalid format and could not be rendered. The summary is displayed below.
                             </div>
                         }
                         <DataAnalysisView analysisData={{ summary, chartSuggestions }} />
                     </div>
                 );
            }
            throw new Error("JSON format is valid, but does not match expected structure for this step.");
        } catch (error) {
            console.error("JSON Parse Error:", error);
            // Fallback for ANY error: render raw text with a warning. This prevents getting stuck.
            return (
                <div>
                    <div className="alert alert-warning">
                        <p className="fw-bold">AI response could not be parsed as structured data.</p>
                        <p className="small mb-1">You can still review the raw text below and complete the step. The raw text will be used as the step's output.</p>
                    </div>
                    <pre className="p-2 bg-dark text-white rounded small" style={{whiteSpace: 'pre-wrap'}}><code>{text}</code></pre>
                </div>
            );
        }
    };

    if (isLoading) {
        return (
            <div className="text-center p-5">
                 <div className="spinner-border mb-3" role="status"></div>
                <h5>AI is generating content...</h5>
                <p className="text-white-50">This may take a moment, especially for complex steps.</p>
            </div>
        );
    }

    if (!output) {
        return (
            <div className="text-center p-5">
                <p>Ready to generate content for this step.</p>
                <button className="btn btn-primary" onClick={() => onGenerate()}>
                    <i className="bi bi-stars me-1"></i> Generate
                </button>
            </div>
        );
    }
    
    // Check if the output is meant to be JSON
    const expectJson = (stepId === 1 || stepId === 2 || stepId === 7);

    return (
        <div className="generated-text-container">
             <div className="edit-controls">
                {isEditing ? (
                    <>
                        <button className="btn btn-sm btn-success me-1" onClick={handleSave}><i className="bi bi-check-lg"></i></button>
                        <button className="btn btn-sm btn-secondary" onClick={() => setIsEditing(false)}><i className="bi bi-x-lg"></i></button>
                    </>
                ) : (
                    <>
                        <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => setShowRegenInput(p => !p)} title="Regenerate">
                           <i className="bi bi-arrow-clockwise"></i>
                        </button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => { setIsEditing(true); setEditText(output); }} title="Edit">
                            <i className="bi bi-pencil-square"></i>
                        </button>
                    </>
                )}
            </div>
             {showRegenInput && (
                <div className="input-group mb-3">
                    <input type="text" className="form-control" placeholder="Optional: Provide feedback for regeneration..." value={regenFeedback} onChange={e => setRegenFeedback(e.target.value)} />
                    <button className="btn btn-primary" onClick={handleRegenerate}>Regenerate</button>
                </div>
            )}
            {isEditing ? (
                 <textarea className="editable-textarea" value={editText} onChange={(e) => setEditText(e.target.value)} />
            ) : (
                expectJson ? jsonParser(output) : <div dangerouslySetInnerHTML={{ __html: marked(output) }} />
            )}
        </div>
    );
};

const EditableStepInput = ({ stepId }) => {
    const { activeExperiment, updateExperiment } = useExperiment();
    const { addToast } = useToast();
    const stepData = activeExperiment.stepData[stepId] || {};
    const [inputValue, setInputValue] = useState(stepData.input || '');

    useEffect(() => {
        setInputValue(stepData.input || '');
    }, [stepData.input]);

    const handleSaveInput = () => {
        const updatedStepData = { 
            ...activeExperiment.stepData,
            [stepId]: { ...(activeExperiment.stepData[stepId] || {}), input: inputValue }
        };
        updateExperiment({ ...activeExperiment, stepData: updatedStepData });
        addToast("Input saved.", "success");
    };

    return (
        <div className="mb-3">
            <label htmlFor={`step-input-${stepId}`} className="form-label fw-bold">Step Input</label>
            <textarea
                id={`step-input-${stepId}`}
                className="form-control"
                rows={4}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onBlur={handleSaveInput}
            />
             <div className="form-text">This input will be used to generate the content for this step. It saves automatically when you click away.</div>
        </div>
    );
};


const ExperimentWorkspace = () => {
    const { activeExperiment, updateExperiment, gemini, setActiveExperiment } = useExperiment();
    const [activeStep, setActiveStep] = useState(activeExperiment.currentStep);
    const [isLoading, setIsLoading] = useState(false);
    const [isAutoGenerating, setIsAutoGenerating] = useState(false);
    const [fineTuneModalOpen, setFineTuneModalOpen] = useState(false);
    const { addToast } = useToast();

    const experimentRef = useRef(activeExperiment);
    useEffect(() => {
        experimentRef.current = activeExperiment;
    }, [activeExperiment]);

    const stepData = useMemo(() => activeExperiment.stepData[activeStep] || {}, [activeExperiment.stepData, activeStep]);
    const fineTuneSettings = useMemo(() => activeExperiment.fineTuneSettings[activeStep] || {}, [activeExperiment.fineTuneSettings, activeStep]);

    // This effect ensures the component's state is synchronized with the active experiment's state
    useEffect(() => {
        setActiveStep(activeExperiment.currentStep);
    }, [activeExperiment.currentStep]);

    const handleStepChange = (stepId: number) => {
        if (stepId <= activeExperiment.currentStep && !isAutoGenerating) {
            setActiveStep(stepId);
        }
    };

    const runAutomationSequence = useCallback(async (startStep: number) => {
        if (!gemini) return;
        setIsAutoGenerating(true);
        let currentExp = { ...activeExperiment };
    
        for (let i = startStep; i <= WORKFLOW_STEPS.length; i++) {
            if (currentExp.stepData[i]?.output && currentExp.status !== 'active') continue;
    
            setActiveStep(i);
            setIsLoading(true);
            await new Promise(resolve => setTimeout(resolve, 500)); // allow UI to update
            
            try {
                let resultText;
                let currentStepData = { ...(currentExp.stepData[i] || {}) };

                if (i === 6) {
                    const context = getStepContext(currentExp, 6);
                    const { basePrompt, config } = getPromptForStep(6, '', context, {});
                    const response = await gemini.models.generateContent({model: 'gemini-flash-lite-latest', contents: basePrompt, config});
                    const [summary, csv] = response.text.split('---').map(s => s.trim());
                    if (!summary || !csv) throw new Error("AI response format was incorrect for data synthesis.");

                    currentStepData = { ...currentStepData, output: summary, summary, input: csv };
                    if (!currentExp.stepData[7]) currentExp.stepData[7] = {};
                    currentExp.stepData[7].input = csv;
                } else {
                    const context = getStepContext(currentExp, i);
                    const userInput = currentExp.stepData[i]?.input || 'Proceed with generation.';
                    const fineTuneSettings = i === 7 ? { isAutomated: true } : {};
                    const { basePrompt, config } = getPromptForStep(i, userInput, context, fineTuneSettings);
                    const response = await gemini.models.generateContent({ model: 'gemini-flash-lite-latest', contents: basePrompt, config });
                    resultText = response.text;
                    currentStepData = { ...currentStepData, output: resultText };
                }
                currentExp.stepData[i] = currentStepData;

                // Summarize and complete the step
                const summaryPrompt = `Concisely summarize the following text in 1-2 sentences for a project log:\n\n${currentExp.stepData[i].output}`;
                const summaryResponse = await gemini.models.generateContent({model: 'gemini-flash-lite-latest', contents: summaryPrompt});
                currentExp.stepData[i].summary = summaryResponse.text;
                currentExp.currentStep = i < WORKFLOW_STEPS.length ? i + 1 : WORKFLOW_STEPS.length + 1;
    
                await updateExperiment(currentExp); // Save after each step
                
                setIsLoading(false); // Stop loading for this step
                await new Promise(resolve => setTimeout(resolve, 2000)); // Pause to show result
    
            } catch (error) {
                addToast(parseGeminiError(error, `Automation failed at Step ${i}.`), 'danger');
                setIsLoading(false);
                setIsAutoGenerating(false);
                return; 
            }
        }
        addToast("Automated generation complete!", "success");
        setIsAutoGenerating(false);
    }, [gemini, activeExperiment, updateExperiment, addToast]);
    

    const handleGenerate = async (regenerateFeedback = '') => {
        if (!gemini) {
            addToast("Gemini AI is not available.", "danger");
            return;
        }
        setIsLoading(true);

        // Always get the latest state from the ref to build context
        const currentExperiment = experimentRef.current;
        const currentStepData = currentExperiment.stepData[activeStep] || {};
        const context = getStepContext(currentExperiment, activeStep);
        const { basePrompt, expectJson, config } = getPromptForStep(
            activeStep,
            currentStepData.input || '',
            context,
            fineTuneSettings,
            regenerateFeedback
        );
        
        if (expectJson) {
            try {
                const response = await gemini.models.generateContent({ model: 'gemini-2.5-flash', contents: basePrompt, config });
                const finalOutput = response.text;
                const finalStepData = {
                    ...currentStepData,
                    output: finalOutput,
                    provenance: [...(currentStepData.provenance || []), { timestamp: new Date().toISOString(), prompt: basePrompt, config, output: finalOutput }]
                };
                // Use the ref to ensure we're updating the most recent version of the experiment
                await updateExperiment({ ...experimentRef.current, stepData: { ...experimentRef.current.stepData, [activeStep]: finalStepData } });
            } catch (error) {
                const errorOutput = `Error: ${parseGeminiError(error)}`;
                addToast(parseGeminiError(error), 'danger');
                const finalStepData = { ...currentStepData, output: errorOutput };
                await updateExperiment({ ...experimentRef.current, stepData: { ...experimentRef.current.stepData, [activeStep]: finalStepData } });
            } finally {
                setIsLoading(false);
            }
        } else { // Streaming Logic
            let finalOutput = '';
            try {
                const stream = await gemini.models.generateContentStream({ model: 'gemini-2.5-flash', contents: basePrompt, config });
                let buffer = '';
                for await (const chunk of stream) {
                    buffer += chunk.text;
                    // Functional update is safe and keeps UI responsive
                    setActiveExperiment(exp => ({ ...exp, stepData: { ...exp.stepData, [activeStep]: { ...(exp.stepData[activeStep] || {}), output: buffer } } }));
                }
                finalOutput = buffer;
            } catch (error) {
                finalOutput = `Error: ${parseGeminiError(error)}`;
                addToast(parseGeminiError(error), 'danger');
            } finally {
                 // After streaming, the ref holds the latest state due to setActiveExperiment.
                 // We'll perform one final update to persist the complete text and provenance.
                const latestExperiment = experimentRef.current;
                const finalStepData = {
                    ...(latestExperiment.stepData[activeStep] || {}),
                    output: finalOutput, // Ensure complete final text is saved
                    provenance: [...((latestExperiment.stepData[activeStep] || {}).provenance || []), { timestamp: new Date().toISOString(), prompt: basePrompt, config, output: finalOutput }]
                };
                await updateExperiment({ ...latestExperiment, stepData: { ...latestExperiment.stepData, [activeStep]: finalStepData } });
                setIsLoading(false);
            }
        }
    };
    
    const handleCompleteStep = async () => {
        if (isLoading || !stepData.output) return;

        setIsLoading(true);
        try {
            const summaryPrompt = `Concisely summarize the following text in 1-2 sentences for a project log:\n\n${stepData.output}`;
            const summaryResponse = await gemini.models.generateContent({model: 'gemini-2.5-flash', contents: summaryPrompt});
            
            const updatedStepData = { ...activeExperiment.stepData,
                [activeStep]: { ...stepData, summary: summaryResponse.text }
            };

            const nextStep = activeStep < WORKFLOW_STEPS.length ? activeStep + 1 : WORKFLOW_STEPS.length + 1;

            const updatedExperiment = {
                ...activeExperiment,
                stepData: updatedStepData,
                currentStep: nextStep
            };
            
            if(activeStep === 6 && stepData.input){ // pass data from exp runner to analyzer
                updatedExperiment.stepData[7] = {...updatedExperiment.stepData[7], input: stepData.input};
            }
            
            await updateExperiment(updatedExperiment);

        } catch (error) {
            addToast(parseGeminiError(error, "Failed to generate summary."), 'danger');
        } finally {
            setIsLoading(false);
        }
    };
    
    // Renders the main content for the current step
    const renderStepContent = () => {
        if (activeStep > WORKFLOW_STEPS.length) {
            return <ProjectCompletionView />;
        }

        const stepInfo = WORKFLOW_STEPS[activeStep - 1];

        if (!stepInfo) return <div>Error: Step not found.</div>;
        
        // After step 1, show the automation mode selector if not yet chosen
        if (activeExperiment.currentStep > 1 && activeExperiment.automationMode === null && !isAutoGenerating) {
            return <AutomationModeSelector onSelect={(mode) => {
                const updated = {...activeExperiment, automationMode: mode};
                updateExperiment(updated);
                if (mode === 'automated') {
                    runAutomationSequence(activeExperiment.currentStep);
                }
            }} />;
        }
        
        return (
            <div>
                <h4 className="fw-bold">{stepInfo.id}. {stepInfo.title}</h4>
                <p className="text-white-50">{stepInfo.description}</p>
                <hr />

                {/* Specific UI for certain steps */}
                {activeStep === 1 && <EditableStepInput stepId={1} />}
                {activeStep === 6 && <ExperimentRunner onStepComplete={handleCompleteStep} />}
                {activeStep === 7 && <DataAnalysisWorkspace onStepComplete={handleCompleteStep} />}
                {activeStep === 10 && <PublicationExporter />}

                {/* Default UI for text-based steps */}
                {activeStep !== 6 && activeStep !== 7 && activeStep !== 10 && (
                    <GeneratedOutput
                        key={activeExperiment.id + '-' + activeStep} // Force re-render on step change
                        stepId={activeStep}
                        onGenerate={handleGenerate}
                        isLoading={isLoading}
                    />
                )}
            </div>
        );
    };

    return (
        <div className="row">
            <div className="col-lg-3">
                 <div className="card sticky-top" style={{top: '80px'}}>
                    <div className="card-header fw-bold">{activeExperiment.title}</div>
                     <ul className="list-group list-group-flush">
                        {WORKFLOW_STEPS.map(step => (
                             <li
                                key={step.id}
                                className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${activeStep === step.id ? 'active' : ''} ${step.id > activeExperiment.currentStep ? 'disabled' : ''}`}
                                onClick={() => handleStepChange(step.id)}
                                style={{cursor: step.id > activeExperiment.currentStep || isAutoGenerating ? 'not-allowed' : 'pointer'}}
                            >
                                <span>{step.id}. {step.title}</span>
                                 {isAutoGenerating && activeStep === step.id && <div className="spinner-border spinner-border-sm" role="status"></div>}
                                {activeExperiment.currentStep > step.id && <i className="bi bi-check-circle-fill text-success"></i>}
                            </li>
                        ))}
                    </ul>
                 </div>
            </div>
            <div className="col-lg-9">
                <div className="card">
                    <div className="card-body" style={{minHeight: '70vh'}}>
                        {isAutoGenerating && (
                            <div className="alert alert-info d-flex align-items-center">
                                <div className="spinner-border spinner-border-sm me-2" role="status"></div>
                                <span>Automated generation in progress... Now working on Step {activeStep}: {WORKFLOW_STEPS[activeStep - 1]?.title}.</span>
                            </div>
                        )}
                        {renderStepContent()}
                    </div>
                    {activeStep <= WORKFLOW_STEPS.length && activeExperiment.automationMode !== 'automated' && !isAutoGenerating && activeStep !== 10 && activeStep !== 6 && activeStep !== 7 && (
                         <div className="card-footer d-flex justify-content-between align-items-center bottom-nav">
                             <div>
                                <button className="btn btn-secondary me-2" onClick={() => setFineTuneModalOpen(true)}>
                                    <i className="bi bi-sliders me-1"></i> Fine-Tune AI
                                </button>
                             </div>
                             <button 
                                className="btn btn-success" 
                                onClick={handleCompleteStep} 
                                disabled={isLoading || !stepData?.output}>
                                 <i className="bi bi-check-circle-fill me-1"></i> Complete Step & Continue
                             </button>
                         </div>
                    )}
                </div>
            </div>
             {fineTuneModalOpen && (
                <FineTuneModal
                    stepId={activeStep}
                    onClose={() => setFineTuneModalOpen(false)}
                />
            )}
        </div>
    );
};

const AgenticAnalysisView = ({ agenticRun }) => {
    const logsEndRef = useRef(null);

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [agenticRun.logs]);
    
    return (
        <div className="p-4">
            <h5 className="fw-bold text-center">AI Agents at Work...</h5>
            <p className="text-white-50 text-center">A multi-agent workflow is analyzing your data and generating visualizations.</p>
            <div className="progress my-3" style={{height: '20px'}}>
                <div 
                    className="progress-bar progress-bar-striped progress-bar-animated" 
                    style={{ width: `${(agenticRun.iterations / agenticRun.maxIterations) * 100}%` }}
                >{`Iteration ${agenticRun.iterations}/${agenticRun.maxIterations}`}</div>
            </div>
            <div className="agent-log-container">
                {agenticRun.logs.map((log, index) => (
                    <div key={index} className={`agent-log-entry agent-log-${log.agent.toLowerCase()}`}>
                        <span className="agent-log-agent">{log.agent}:</span>
                        <span className="agent-log-message">{log.message}</span>
                    </div>
                ))}
                <div ref={logsEndRef} />
            </div>
        </div>
    );
};


const DataAnalysisWorkspace = ({ onStepComplete }) => {
    const { activeExperiment, updateExperiment, gemini } = useExperiment();
    const { addToast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [agenticRun, setAgenticRun] = useState({
        status: 'idle', // 'idle', 'running', 'success', 'failed'
        iterations: 0,
        maxIterations: 50,
        logs: [],
        finalChartConfig: null,
        finalSummary: ''
    });

    const stepData = activeExperiment.stepData[7] || {};

    const performAgenticAnalysis = useCallback(async () => {
        if (!gemini) {
            addToast("Gemini not available", "danger");
            return;
        }

        setAgenticRun(prev => ({ ...prev, status: 'running', logs: [], iterations: 0 }));
        
        let initialGoalSummary = '';
        let initialChartDescription = 'No chart was suggested by the initial analysis.';

        try {
            // Step 1: Get the initial analysis and goal description
            const context = getStepContext(activeExperiment, 7);
            const { basePrompt: initialPrompt, config: initialConfig } = getPromptForStep(7, stepData.input || '', context, { isAutomated: true });
            const initialResponse = await gemini.models.generateContent({model: 'gemini-flash-lite-latest', contents: initialPrompt, config: initialConfig});
            
            const initialResult = JSON.parse(initialResponse.text.replace(/```json/g, '').replace(/```/g, '').trim());
            initialGoalSummary = initialResult.summary;
            if (initialResult.chartSuggestions && initialResult.chartSuggestions.length > 0) {
                const chart = initialResult.chartSuggestions[0];
                // Defensive check to prevent crash on malformed chart object
                if (chart && chart.type && chart.data && Array.isArray(chart.data.datasets) && chart.data.datasets.length > 0 && chart.data.datasets[0].label) {
                    initialChartDescription = `Create a '${chart.type}' chart. The dataset label should be '${chart.data.datasets[0].label}'.`;
                } else if (chart && chart.type) {
                    initialChartDescription = `Create a '${chart.type}' chart based on the provided data.`;
                }
            }

            setAgenticRun(prev => ({...prev, logs: [...prev.logs, {agent: 'System', message: `Goal set: ${initialChartDescription}`}]}));

        } catch (error) {
            addToast(parseGeminiError(error, "Failed to get initial analysis goal."), 'danger');
            setAgenticRun(prev => ({ ...prev, status: 'failed' }));
            return;
        }
        
        let history = ``;
        let lastDoerOutput = "{}";
        let lastQAFeedback = "No feedback yet. This is the first attempt.";
        const csvData = stepData.input || '';

        const exampleLine = `{"type":"line","data":{"labels":["Jan","Feb"],"datasets":[{"label":"Product A","data":[100,120]},{"label":"Product B","data":[80,90]}]}}`;
        const exampleBar = `{"type":"bar","data":{"labels":["A","B"],"datasets":[{"label":"Count","data":[10,20]}]}}`;

        for (let i = 0; i < agenticRun.maxIterations; i++) {
            setAgenticRun(prev => ({...prev, iterations: i + 1, logs: [...prev.logs, {agent: 'System', message: `--- Iteration ${i+1} ---`}]}));

            // Manager's Turn
            const managerPrompt = `You are the Manager Agent. Your goal is to get a valid Chart.js configuration that matches this description: "${initialChartDescription}". You have examples for bar graphs and line graphs. Bar: ${exampleBar}. Line: ${exampleLine}. The raw data is: \`\`\`csv\n${csvData}\n\`\`\`. The last QA feedback was: "${lastQAFeedback}". Based on this feedback, provide a new, clear, and concise instruction to the Doer agent. Focus on correcting the specific error.`;
            const managerResponse = await gemini.models.generateContent({ model: 'gemini-flash-lite-latest', contents: managerPrompt });
            const managerInstruction = managerResponse.text;
            history += `\nManager: ${managerInstruction}`;
            setAgenticRun(prev => ({...prev, logs: [...prev.logs, {agent: 'Manager', message: managerInstruction}]}));

            // Doer's Turn
            const doerPrompt = `You are the Doer. You ONLY generate Chart.js JSON configurations for 'bar' or 'line' charts. Your instruction is: "${managerInstruction}". You MUST parse the provided CSV data and use its values to populate the 'data.datasets[0].data' array with numbers. The 'labels' should correspond to the appropriate column in the CSV. The data is: \`\`\`csv\n${csvData}\n\`\`\`. Output ONLY the raw JSON.`;
            const doerResponse = await gemini.models.generateContent({ model: 'gemini-flash-lite-latest', contents: doerPrompt });
            const doerJson = doerResponse.text.replace(/```json/g, '').replace(/```/g, '').trim();
            lastDoerOutput = doerJson;
            history += `\nDoer: ${doerJson}`;
            setAgenticRun(prev => ({...prev, logs: [...prev.logs, {agent: 'Doer', message: 'Generated new chart configuration.'}]}));

            // QA's Turn
            let qaPass = false;
            let parsedConfig;
            try {
                // Local Programmatic Validation First
                parsedConfig = JSON.parse(doerJson);
                 if (!parsedConfig?.data?.datasets || !Array.isArray(parsedConfig.data.datasets) || parsedConfig.data.datasets.length === 0) {
                    throw new Error("Local validation failed: `data.datasets` array is missing or empty.");
                }
                if (!parsedConfig.data.datasets[0].data || !Array.isArray(parsedConfig.data.datasets[0].data) || parsedConfig.data.datasets[0].data.length === 0) {
                    throw new Error("Local validation failed: `datasets[0].data` array is missing or empty.");
                }
                 if (parsedConfig.data.datasets[0].data.some(d => typeof d !== 'number')) {
                    throw new Error("Local validation failed: `datasets[0].data` contains non-numeric values.");
                }
                const canvas = document.createElement('canvas');
                new Chart(canvas.getContext('2d'), parsedConfig);
                
                // If local checks pass, proceed to AI QA
                const qaPrompt = `You are the QA Agent. The goal is: "${initialChartDescription}". The Doer agent produced this Chart.js JSON: \`\`\`json\n${doerJson}\n\`\`\`. Does this JSON correctly visualize the data and fulfill the goal? Respond with ONLY a single raw JSON object: {"pass": boolean, "feedback": "Concise feedback for the Doer."}`;
                const qaResponse = await gemini.models.generateContent({ model: 'gemini-flash-lite-latest', contents: qaPrompt, config: {responseMimeType: 'application/json'} });
                const qaResult = JSON.parse(qaResponse.text);
                qaPass = qaResult.pass;
                lastQAFeedback = qaResult.feedback;
            } catch (e) {
                lastQAFeedback = e.message;
            }
            history += `\nQA: ${lastQAFeedback}`;
            setAgenticRun(prev => ({...prev, logs: [...prev.logs, {agent: 'QA', message: lastQAFeedback}]}));

            if (qaPass) {
                const finalOutput = JSON.stringify({ summary: initialGoalSummary, chartSuggestions: [parsedConfig] });
                const finalStepData = { ...stepData, output: finalOutput };
                await updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, 7: finalStepData } });
                setAgenticRun(prev => ({ ...prev, status: 'success' }));
                addToast("Agentic analysis complete!", "success");
                return;
            }
        }
        
        // Loop finished without success
        addToast(`Agentic workflow failed after ${agenticRun.maxIterations} iterations. Saving summary only.`, 'warning');
        const finalOutput = JSON.stringify({ summary: initialGoalSummary, chartSuggestions: [] });
        const finalStepData = { ...stepData, output: finalOutput };
        await updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, 7: finalStepData } });
        setAgenticRun(prev => ({ ...prev, status: 'failed' }));
    }, [activeExperiment, gemini, addToast, updateExperiment, stepData]);
    
    useEffect(() => {
        if (!stepData.output) {
            performAgenticAnalysis();
        }
    }, []);

    if (agenticRun.status === 'running') {
        return <AgenticAnalysisView agenticRun={agenticRun} />;
    }

    return (
        <div>
            <GeneratedOutput 
                stepId={7} 
                onGenerate={performAgenticAnalysis} 
                isLoading={agenticRun.status === 'running'} 
            />
             {stepData.output && (
                 <div className="card-footer d-flex justify-content-end align-items-center bottom-nav">
                    <button className="btn btn-success" onClick={onStepComplete} disabled={agenticRun.status === 'running'}>
                        <i className="bi bi-check-circle-fill me-1"></i> Complete Step & Continue
                    </button>
                 </div>
            )}
        </div>
    );
};

const AutomationModeSelector = ({ onSelect }) => {
    return (
        <div className="text-center p-4">
            <h4 className="fw-bold">Select Your Workflow Mode</h4>
            <p className="text-white-50 mb-4">Choose how you want to proceed with the rest of your research project.</p>
            <div className="row justify-content-center g-4">
                <div className="col-md-5">
                    <div className="card h-100 d-flex flex-column">
                        <div className="card-body text-center flex-grow-1">
                            <i className="bi bi-person-fill-gear" style={{ fontSize: '2.5rem' }}></i>
                            <h5 className="card-title mt-2">Manual Control</h5>
                            <p className="card-text text-white-50 small flex-grow-1">
                                You remain in full control. Generate, edit, and approve the output for each of the remaining steps individually.
                            </p>
                        </div>
                        <div className="card-footer bg-transparent border-top-0 p-3">
                             <button className="btn btn-outline-primary w-100" onClick={() => onSelect('manual')}>Choose Manual</button>
                        </div>
                    </div>
                </div>
                <div className="col-md-5">
                     <div className="card h-100 d-flex flex-column">
                        <div className="card-body text-center flex-grow-1">
                            <i className="bi bi-robot" style={{ fontSize: '2.5rem' }}></i>
                            <h5 className="card-title mt-2">Automated Generation</h5>
                            <p className="card-text text-white-50 small flex-grow-1">
                                The AI will agentically complete all remaining steps based on its best judgment, from literature review to final publication draft.
                            </p>
                        </div>
                        <div className="card-footer bg-transparent border-top-0 p-3">
                            <button className="btn btn-primary w-100" onClick={() => onSelect('automated')}>Choose Automated</button>
                        </div>
                    </div>
                </div>
            </div>
             <div className="alert alert-info mt-4 small">
                <strong>Pro Tip:</strong> Use <strong>Manual Control</strong> for rigorous scientific work where you provide your own experimental data and guide each step. Use <strong>Automated Generation</strong> for educational purposes or rapidly exploring research ideas with AI-generated data.
            </div>
        </div>
    );
};


const FinalPublicationView = ({ publicationText, experimentTitle, experimentId, onRegenerate, showRegenerate = true }) => {
    const { addToast } = useToast();
    const contentRef = useRef(null);

    useEffect(() => {
        if (contentRef.current) {
            // This is necessary because React's dangerouslySetInnerHTML doesn't re-render on prop change alone sometimes
            contentRef.current.innerHTML = marked(publicationText);
        }
    }, [publicationText]);

    const handleDownload = (format: 'md' | 'doc' | 'pdf' | 'txt') => {
        if (format === 'pdf') {
            addToast("Preparing a print-friendly view...", "info");
            const printContent = marked(publicationText);
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                addToast("Could not open a new window. Please check your browser's pop-up blocker.", 'warning');
                return;
            }
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Print - ${experimentTitle}</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 20px auto; }
                        h1, h2, h3, h4 { color: #000; }
                        pre, code { background-color: #f4f4f4; padding: 2px 4px; border-radius: 4px; font-family: monospace; }
                        pre { padding: 1em; overflow: auto; }
                        img { max-width: 100%; height: auto; }
                    </style>
                </head>
                <body>
                    ${printContent}
                    <script>
                        setTimeout(() => {
                            window.print();
                            window.close();
                        }, 500);
                    </script>
                </body>
                </html>
            `);
            printWindow.document.close();
            return;
        }

        let blob;
        let filename = `${experimentTitle.replace(/ /g, '_')}_${experimentId}`;
        if (format === 'doc') {
            const htmlContent = `
                <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
                <head><meta charset='utf-8'><title>${experimentTitle}</title></head>
                <body>${marked(publicationText)}</body>
                </html>`;
            blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
            filename += '.doc';
        } else {
            const content = format === 'md' ? publicationText : contentRef.current?.innerText || publicationText;
            blob = new Blob([content], { type: 'text/plain' });
            filename += `.${format}`;
        }
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div>
            <div className="d-flex justify-content-end mb-2">
                {showRegenerate && 
                    <button className="btn btn-sm btn-outline-secondary me-auto" onClick={onRegenerate}>
                        <i className="bi bi-arrow-clockwise me-1"></i> Regenerate with Agents
                    </button>
                }
                <div className="btn-group">
                    <button type="button" className="btn btn-sm btn-secondary dropdown-toggle" data-bs-toggle="dropdown">
                       <i className="bi bi-download me-1"></i> Download As
                    </button>
                    <ul className="dropdown-menu dropdown-menu-end">
                        <li><a className="dropdown-item" href="#" onClick={() => handleDownload('md')}>Markdown (.md)</a></li>
                        <li><a className="dropdown-item" href="#" onClick={() => handleDownload('txt')}>Plain Text (.txt)</a></li>
                        <li><a className="dropdown-item" href="#" onClick={() => handleDownload('doc')}>Word Document (.doc)</a></li>
                         <li><a className="dropdown-item" href="#" onClick={() => handleDownload('pdf')}>PDF (Print)</a></li>
                    </ul>
                </div>
            </div>
            <div ref={contentRef} className="generated-text-container" style={{ minHeight: '50vh' }}>
                {/* Content is rendered here via useEffect */}
            </div>
        </div>
    );
};

const PublicationExporter = () => {
    const { activeExperiment, updateExperiment, gemini } = useExperiment();
    const { addToast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [agenticRun, setAgenticRun] = useState({ logs: [], status: 'idle', iterations: 0 });
    const stepData = activeExperiment.stepData[10] || {};
    const publicationText = stepData.output || '';

    const handleManualGenerate = async (regenerateFeedback = '') => {
        setIsLoading(true);
        try {
            const context = getStepContext(activeExperiment, 10);
            const { basePrompt, config } = getPromptForStep(10, '', context, activeExperiment.fineTuneSettings[10], regenerateFeedback);
            const stream = await gemini.models.generateContentStream({ model: 'gemini-2.5-flash', contents: basePrompt, config });
            let buffer = '';
            for await (const chunk of stream) {
                buffer += chunk.text;
                updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, 10: { ...stepData, output: buffer } } });
            }
        } catch (error) {
            addToast(parseGeminiError(error), 'danger');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleAgenticGeneration = async () => {
        setIsLoading(true);
        setAgenticRun({ logs: [], status: 'running', iterations: 0 });
        let currentDraft = '';

        try {
            const addLog = (agent, message) => setAgenticRun(prev => ({ ...prev, logs: [...prev.logs, { agent, message }] }));

            // 1. Get Context
            const initialContext = getStepContext(activeExperiment, 10);
            addLog('System', 'Project context compiled.');

            // 2. Author Agent
            setAgenticRun(prev => ({ ...prev, iterations: 1 }));
            addLog('Author', 'Drafting initial paper...');
            const authorPrompt = `You are the Author agent. Based on the following project log, write the complete content for a scientific paper in Markdown format, including all sections from Abstract to Conclusion. The paper should be written for an expert audience in ${initialContext.experimentField}. It is of **critical importance** that when you write the 'Discussion' section, you MUST explicitly and thoroughly address the feedback provided in the 'Peer Review Simulation' (Step 9) of the log. Explain in detail how the research accounts for or counters the critiques. Your source material is this project log:\n\n${initialContext.full_project_summary_log}`;
            const authorResponse = await gemini.models.generateContent({ model: 'gemini-flash-lite-latest', contents: authorPrompt });
            currentDraft = authorResponse.text;
            addLog('Author', 'Initial draft complete.');

            // 3. Editor Agent
            setAgenticRun(prev => ({ ...prev, iterations: 2 }));
            addLog('Editor', 'Reviewing and editing draft...');
            const editorPrompt = `You are the Editor agent, a meticulous proofreader and scientific editor. You will be given a draft written by the Author agent and the full project log for context. Your job is to improve the draft by correcting grammar, enhancing clarity, and ensuring a formal, academic tone. **YOUR MOST IMPORTANT TASK:** Rigorously verify that the Author has adequately addressed all points from the simulated peer review (Step 9) within the 'Discussion' section. If the response is weak, evasive, or missing, you MUST revise it to be more robust and scientifically sound. Your output must be ONLY the full, corrected Markdown text of the paper.`;
            const editorResponse = await gemini.models.generateContent({ model: 'gemini-flash-lite-latest', contents: `${editorPrompt}\n\nProject Log:\n${initialContext.full_project_summary_log}\n\nAuthor's Draft:\n${currentDraft}` });
            currentDraft = editorResponse.text;
            addLog('Editor', 'Editing complete.');

            // 4. Formatter & Chart Placer Agent
            setAgenticRun(prev => ({ ...prev, iterations: 3 }));
            addLog('Formatter', 'Formatting and embedding chart placeholders...');
            const analysisData = JSON.parse(activeExperiment.stepData[7]?.output || '{}');
            const charts = analysisData.chartSuggestions || [];
            
            if (charts.length > 0) {
                const generateAndEmbedCharts = async (text, chartConfigs) => {
                    let newText = text;
                    const chartPromises = chartConfigs.map(async (config, index) => {
                        const canvas = document.createElement('canvas');
                        canvas.width = 800;
                        canvas.height = 450;
                        const styledConfig = ensureChartStyling(config);
                        new Chart(canvas, styledConfig);
                        // Wait for chart to render
                        await new Promise(resolve => setTimeout(resolve, 500));
                        return { dataUrl: canvas.toDataURL('image/png'), index };
                    });
                    
                    const dataUrls = await Promise.all(chartPromises);

                    dataUrls.forEach(({ dataUrl, index }) => {
                        const placeholder = `[CHART_${index + 1}]`;
                        const imgTag = `<img src="${dataUrl}" alt="Chart ${index + 1}" style="max-width: 80%; height: auto; display: block; margin: 1rem auto;" />`;
                        newText = newText.replace(placeholder, imgTag);
                    });
                    return newText;
                };

                const placeholderPrompt = `You are the Formatter agent. The user's research paper draft is below. Your task is to identify the best places in the 'Results' section to insert placeholders for ${charts.length} chart(s). Use the format [CHART_1], [CHART_2], etc. Do not add captions. Only output the modified Markdown text.\n\nDraft:\n${currentDraft}`;
                const placeholderResponse = await gemini.models.generateContent({ model: 'gemini-flash-lite-latest', contents: placeholderPrompt });
                currentDraft = await generateAndEmbedCharts(placeholderResponse.text, charts);

            }
            addLog('Formatter', 'Final document prepared.');
            setAgenticRun(prev => ({ ...prev, status: 'success', iterations: 4 }));
        
        } catch (error) {
            addToast(parseGeminiError(error, "Agentic generation failed."), 'danger');
            setAgenticRun(prev => ({ ...prev, status: 'failed' }));
        } finally {
            if (currentDraft) {
                updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, 10: { ...stepData, output: currentDraft } } });
            }
            setIsLoading(false);
        }
    };
    
    if (isLoading) {
        return <AgenticAnalysisView agenticRun={{...agenticRun, maxIterations: 4}} />;
    }

    if (!publicationText) {
        return (
            <div className="text-center p-5">
                <h5 className="fw-bold">Ready to Assemble Your Publication</h5>
                <p className="text-white-50">Choose a method to generate your final paper.</p>
                <div className="d-flex justify-content-center gap-2">
                    <button className="btn btn-primary" onClick={() => handleManualGenerate()}>
                        <i className="bi bi-person-fill me-1"></i> Manual Generation
                    </button>
                    <button className="btn btn-secondary" onClick={handleAgenticGeneration}>
                        <i className="bi bi-robot me-1"></i> Use Agentic Workflow
                    </button>
                </div>
            </div>
        );
    }
    
    return (
        <FinalPublicationView 
            publicationText={publicationText} 
            experimentTitle={activeExperiment.title}
            experimentId={activeExperiment.id}
            onRegenerate={handleAgenticGeneration}
        />
    );
};


const ProjectCompletionView = () => {
    const { activeExperiment } = useExperiment();
    
    // Check if step 10 has output to show the deploy modal trigger
    const isDeployable = activeExperiment && activeExperiment.stepData[10]?.output;
    
    return (
        <div className="text-center p-5">
            <i className="bi bi-award-fill" style={{fontSize: '3rem', color: 'var(--primary-glow)'}}></i>
            <h3 className="mt-3">Research Project Complete!</h3>
            <p className="text-white-50">Congratulations on completing all 10 steps of your research project.</p>
            {isDeployable ? (
                 <p>You can now finalize and export your work from the dashboard.</p>
            ) : (
                <p>Complete Step 10 to enable final deployment and sharing options from the dashboard.</p>
            )}
        </div>
    );
};

const FineTuneModal = ({ stepId, onClose }) => {
    const { activeExperiment, updateExperiment } = useExperiment();
    const { addToast } = useToast();
    const [settings, setSettings] = useState(activeExperiment.fineTuneSettings[stepId] || {});
    const parameters = STEP_SPECIFIC_TUNING_PARAMETERS[stepId] || [];

    const handleSettingChange = (name, value) => {
        setSettings(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = () => {
        updateExperiment({
            ...activeExperiment,
            fineTuneSettings: { ...activeExperiment.fineTuneSettings, [stepId]: settings }
        });
        addToast("AI settings saved for this step.", "success");
        onClose();
    };

    const handleReset = () => {
        const defaultSettings = {};
        parameters.forEach(p => defaultSettings[p.name] = p.default);
        setSettings(defaultSettings);
        addToast("Settings reset to default.", "info");
    }

    return (
        <div className="modal" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title"><i className="bi bi-sliders me-2"></i>Fine-Tune AI for Step {stepId}</h5>
                        <button type="button" className="btn-close" onClick={onClose}></button>
                    </div>
                    <div className="modal-body">
                        {parameters.length > 0 ? parameters.map(param => (
                            <div className="mb-3" key={param.name}>
                                <label htmlFor={param.name} className="form-label fw-bold">{param.label}</label>
                                {param.type === 'select' && (
                                    <select
                                        id={param.name}
                                        className="form-select"
                                        value={settings[param.name] ?? param.default}
                                        onChange={(e) => handleSettingChange(param.name, e.target.value)}
                                    >
                                        {param.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                )}
                                 {param.type === 'range' && (
                                     <div className="d-flex align-items-center">
                                        <input
                                            type="range"
                                            id={param.name}
                                            className="form-range"
                                            min={param.min}
                                            max={param.max}
                                            step={param.step}
                                            value={settings[param.name] ?? param.default}
                                            // FIX: The value from a range input's event is a string. It must be parsed as a number.
                                            onChange={(e) => handleSettingChange(param.name, parseFloat(e.target.value))}
                                        />
                                         <span className="ms-2 temperature-slider-label">{settings[param.name]?.toFixed(1) ?? param.default.toFixed(1)}</span>
                                     </div>
                                )}
                                {param.type === 'boolean' && (
                                    <div className="form-check form-switch">
                                        <input
                                            className="form-check-input"
                                            type="checkbox"
                                            id={param.name}
                                            checked={settings[param.name] ?? param.default}
                                            onChange={(e) => handleSettingChange(param.name, e.target.checked)}
                                        />
                                        <label className="form-check-label" htmlFor={param.name}>Enable</label>
                                    </div>
                                )}
                                <div className="form-text">{param.description}</div>
                            </div>
                        )) : <p>No specific tuning parameters available for this step.</p>}
                        
                        <div className="mb-3">
                            <label htmlFor="temperature" className="form-label fw-bold">Temperature</label>
                            <div className="d-flex align-items-center">
                                <input
                                    type="range"
                                    id="temperature"
                                    className="form-range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={settings.temperature ?? 0.7}
                                    onChange={(e) => handleSettingChange('temperature', parseFloat(e.target.value))}
                                />
                                <span className="ms-2 temperature-slider-label">{(settings.temperature ?? 0.7).toFixed(1)}</span>
                            </div>
                            <div className="form-text">Controls randomness. Lower values are more deterministic.</div>
                        </div>

                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-outline-secondary me-auto" onClick={handleReset}>Reset to Defaults</button>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={handleSave}>Save Settings</button>
                    </div>
                </div>
            </div>
        </div>
    );
};


// --- RENDER APPLICATION ---
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
    <React.StrictMode>
        <ToastProvider>
            <App />
        </ToastProvider>
    </React.StrictMode>
);