import React, { useState, useEffect, useMemo, useCallback, useRef, createContext, useContext } from 'react';
import ReactDOM from 'react-dom/client';
import { marked } from 'marked';
import { appTests } from './index.test.tsx';
import { Chart, registerables } from 'chart.js';
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
    initializeGemini,
    getStepContext,
    getPromptForStep,
    getPromptForInputSuggestion,
    testApiKey,
    parseGeminiError
} from './be_gemini';
import { ToastProvider, useToast } from './toast';
import { ExperimentRunner } from './experimentRunner';


// --- REACT CONTEXT ---
const ExperimentContext = createContext<ExperimentContextType | null>(null);
export const useExperiment = () => {
    const context = useContext(ExperimentContext);
    if (!context) {
        throw new Error('useExperiment must be used within an ExperimentProvider');
    }
    return context;
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

    // Initialize libraries safely on mount
    useEffect(() => {
        Chart.register(...registerables);
        marked.setOptions({
            gfm: true,
            breaks: true,
        });
    }, []);

    // Load experiments from Dexie on initial mount
    useEffect(() => {
        const loadData = async () => {
            try {
                const storedExperiments = await db.experiments.orderBy('createdAt').reverse().toArray();
                setExperiments(storedExperiments);
                if (storedExperiments.length > 0) {
                    setActiveExperiment(storedExperiments[0]);
                }
            } catch (error) {
                console.error("Failed to load experiments from database:", error);
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

    const handleAuthentication = (apiKey: string) => {
        try {
            const geminiInstance = initializeGemini(apiKey);
            setGemini(geminiInstance);
        } catch (e) {
            addToast(parseGeminiError(e), 'danger');
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
                    onAuthenticate={handleAuthentication}
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
                                    <span className="nav-link text-success"><i className="bi bi-check-circle-fill me-1"></i> API Key Active</span>
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
    const [userApiKey, setUserApiKey] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { addToast } = useToast();

    const handleValidate = async () => {
        if (!userApiKey.trim()) {
            addToast("Please enter your API key.", 'warning');
            return;
        }
        setIsLoading(true);
        const isValid = await testApiKey(userApiKey.trim());
        if (isValid) {
            addToast("API Key validated successfully!", 'success');
            onAuthenticate(userApiKey.trim());
        } else {
            addToast("API Key is not valid. Please check your key and try again.", 'danger');
        }
        setIsLoading(false);
    };

    return (
        <section className="api-key-section text-center">
            <div className="container">
                <div className="row justify-content-center">
                    <div className="col-lg-8">
                        <h2 className="section-title">API Key Access</h2>
                        <p className="lead text-white-50">This application requires a Google Gemini API key to function. The key is stored in memory and is not saved anywhere.</p>
                        <div className="card">
                            <div className="card-body p-4">
                                <div>
                                    <h5>Enter Your Google API Key</h5>
                                    <p className="text-white-50">
                                        You can get your own free API key from Google AI Studio.
                                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="ms-2">Get a key here <i className="bi bi-box-arrow-up-right"></i></a>
                                    </p>
                                    <div className="input-group">
                                        <input type="password" className="form-control" placeholder="Enter your API key" value={userApiKey} onChange={e => setUserApiKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleValidate()} />
                                        <button className="btn btn-primary" onClick={handleValidate} disabled={isLoading}>
                                            {isLoading ? 'Validating...' : 'Validate & Use Key'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};


const LandingPage = ({ setView, onAuthenticate }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [field, setField] = useState<string>(SCIENTIFIC_FIELDS[0]);
    const { addToast } = useToast();
    const { gemini, createNewExperiment } = useExperiment();
    const authSectionRef = useRef<HTMLDivElement>(null);

    const handleStart = (e) => {
        e.preventDefault();
        if (!gemini) {
            addToast("Please complete the API Key Access step below to begin.", 'warning');
            authSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
            return;
        }
        if(title.trim() && description.trim()){
            createNewExperiment(title, description, field);
        }
    };

    const handleGoToDashboard = () => {
        if (!gemini) {
            addToast("Please complete the API Key Access step below to continue.", 'warning');
            authSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
            return;
        }
        setView('dashboard');
    };
    
    return (
        <div>
            <section className="landing-page-hero">
                <div className="landing-content">
                    <h1 className="display-4 landing-title">Project Hypatia</h1>
                    <p className="lead landing-subtitle mb-4">Project Hypatia is your AI-powered partner in scientific research, guiding you from initial question to the mock publication of a draft scientific paper.</p>

                     <div className="getting-started-fields mx-auto">
                         <form onSubmit={handleStart}>
                             <p className="fw-bold text-light">Start a New Research Project</p>
                            <div className="mb-3">
                                <input type="text" className="form-control" placeholder="Project Title" value={title} onChange={e => setTitle(e.target.value)} required />
                            </div>
                            <div className="mb-3">
                                 <textarea className="form-control" placeholder="Briefly describe your research idea..." value={description} onChange={e => setDescription(e.target.value)} required rows={2}></textarea>
                            </div>
                            <div className="mb-3">
                               <label htmlFor="discipline-input" className="form-label visually-hidden">Scientific Discipline</label>
                               <input
                                   type="text"
                                   className="form-control"
                                   id="discipline-input"
                                   list="discipline-options"
                                   placeholder="Enter or select a scientific discipline"
                                   value={field}
                                   onChange={e => setField(e.target.value)}
                                   required
                               />
                               <datalist id="discipline-options">
                                   {SCIENTIFIC_FIELDS.map(f => <option key={f} value={f} />)}
                               </datalist>
                           </div>
                             <button type="submit" className="btn btn-primary btn-lg w-100">
                                <i className="bi bi-play-circle me-2"></i> Begin Research
                            </button>
                         </form>
                         <p className="mt-3 text-warning small">
                            Be sure to read and edit AI output to keep the project aligned with your needs. Depending on project complexity, agentic AI generation can take several minutes per step—please be patient.
                        </p>
                    </div>

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
            
            <div ref={authSectionRef}>
                { !gemini && <ApiKeySection onAuthenticate={onAuthenticate} /> }
            </div>
        </div>
    );
};


const ResearchSummary = () => {
    const { experiments } = useExperiment();
    const latestExperiment = experiments.length > 0 ? experiments[0] : null;

    if (!latestExperiment) return null;

    const lastStepWithOutput = [...Array(10).keys()].map(i => 10-i).find(stepId => latestExperiment.stepData[stepId]?.summary || latestExperiment.stepData[stepId]?.output);
    const summary = lastStepWithOutput ? latestExperiment.stepData[lastStepWithOutput]?.summary || latestExperiment.stepData[lastStepWithOutput]?.output : 'No summary available yet.';

    return (
        <section className="research-summary-section">
            <div className="row">
                <div className="col-lg-8 mx-auto">
                     <h2 className="section-title text-center mb-4">Your Latest Research</h2>
                     <div className="card">
                        <div className="card-body">
                            <h5 className="card-title text-primary-glow">{latestExperiment.title}</h5>
                            <h6 className="card-subtitle mb-2 text-white-50">{latestExperiment.field}</h6>
                            <blockquote className="p-3">
                                <p className="mb-0 fst-italic">"{summary.substring(0, 200)}{summary.length > 200 ? '...' : ''}"</p>
                            </blockquote>
                            <p className="mt-3 small text-white-50">Currently at: Step {latestExperiment.currentStep} - {WORKFLOW_STEPS[latestExperiment.currentStep - 1].title}</p>
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
    const color = score > 0.7 ? 'text-success' : score > 0.4 ? 'text-warning' : 'text-danger';

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
                        {score > 0.7 ? 'Highly Unique' : score > 0.4 ? 'Moderately Unique' : 'Common Topic'}
                    </div>
                </div>
                <p className="small text-white-50 mt-2 mb-0">{justification}</p>
            </div>
        </div>
    );
};

const DataAnalysisView = ({ analysisData }) => {
    const chartRefs = useRef({});

    useEffect(() => {
        if (analysisData && Array.isArray(analysisData.chartSuggestions)) {
            analysisData.chartSuggestions.forEach((chartConfig, index) => {
                const canvas = chartRefs.current[index];
                if (canvas) {
                    try {
                        const existingChart = Chart.getChart(canvas);
                        if (existingChart) {
                            existingChart.destroy();
                        }
                        new Chart(canvas.getContext('2d'), chartConfig);
                    } catch (error) {
                        console.error(`Failed to render chart at index ${index} due to invalid configuration:`, error);
                    }
                }
            });
        }
        return () => {
            Object.values(chartRefs.current).forEach((canvas: any) => {
                if (canvas) {
                    const chart = Chart.getChart(canvas);
                    if (chart) {
                        chart.destroy();
                    }
                }
            });
        };
    }, [analysisData]);

    return (
        <div>
            {analysisData?.summary && <div className="generated-text-container" dangerouslySetInnerHTML={{ __html: marked(analysisData.summary) }} />}
            <div className="row mt-4">
                {analysisData && Array.isArray(analysisData.chartSuggestions) && analysisData.chartSuggestions.map((_, index) => (
                    <div className="col-md-6 mb-4" key={index}>
                        <canvas ref={el => chartRefs.current[index] = el}></canvas>
                    </div>
                ))}
            </div>
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
        try {
            // New: Sanitize the string before parsing. Remove markdown fences and trim.
            const sanitizedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(sanitizedText);
            
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

            // Step 7: Data Analyzer
            if (stepId === 7 && data.summary && Array.isArray(data.chartSuggestions)) {
                 return <DataAnalysisView analysisData={data} />;
            }
            throw new Error("JSON format is valid, but does not match expected structure for this step.");
        } catch (error) {
            console.error("JSON Parse Error:", error);
            return (
                <div className="alert alert-danger">
                    <p className="fw-bold">Failed to render analysis. AI response was not in the correct JSON format.</p>
                    <p className="small mb-1">Details: {error.message}</p>
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
                    const response = await gemini.models.generateContent({model: 'gemini-2.5-flash', contents: basePrompt, config});
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
                    const response = await gemini.models.generateContent({ model: 'gemini-2.5-flash', contents: basePrompt, config });
                    resultText = response.text;
                    currentStepData = { ...currentStepData, output: resultText };
                }
                currentExp.stepData[i] = currentStepData;

                // Summarize and complete the step
                const summaryPrompt = `Concisely summarize the following text in 1-2 sentences for a project log:\n\n${currentExp.stepData[i].output}`;
                const summaryResponse = await gemini.models.generateContent({model: 'gemini-2.5-flash', contents: summaryPrompt});
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
        let currentOutput = '';
        
        try {
            const context = getStepContext(activeExperiment, activeStep);
            const { basePrompt, config } = getPromptForStep(activeStep, stepData.input || '', context, fineTuneSettings, regenerateFeedback);
            
            const stream = await gemini.models.generateContentStream({model: 'gemini-2.5-flash', contents: basePrompt, config});
            
            let buffer = '';
            for await (const chunk of stream) {
                buffer += chunk.text;
                // Update the state in a non-persisted way for live display
                setActiveExperiment(exp => ({...exp, stepData: {...exp.stepData, [activeStep]: {...exp.stepData[activeStep], output: buffer}}}));
            }
            currentOutput = buffer;
            
        } catch (error) {
            currentOutput = `Error: ${parseGeminiError(error)}`;
            addToast(parseGeminiError(error), 'danger');
        } finally {
             const finalStepData = {
                ...stepData,
                output: currentOutput,
                provenance: [...(stepData.provenance || []), { timestamp: new Date().toISOString(), prompt: 'See prompt generation logic', config: {}, output: currentOutput }]
            };
             await updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, [activeStep]: finalStepData } });
            setIsLoading(false);
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

const DataAnalysisWorkspace = ({ onStepComplete }) => {
    const { activeExperiment, updateExperiment, gemini, setActiveExperiment } = useExperiment();
    const { addToast } = useToast();
    const [analysisStage, setAnalysisStage] = useState<'init' | 'suggest' | 'analyze' | 'complete'>('init');
    const [suggestedMethods, setSuggestedMethods] = useState<{name: string, description: string}[]>([]);
    const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    
    const stepData = activeExperiment.stepData[7] || {};

    useEffect(() => {
        if (stepData.output) {
            setAnalysisStage('complete');
        } else if (activeExperiment.automationMode === 'automated') {
            handlePerformAnalysis(null, { isAutomated: true });
        } else {
            setAnalysisStage('suggest');
            if (suggestedMethods.length === 0) {
                handleSuggestMethods();
            }
        }
    }, [activeExperiment.automationMode]);

    const handleSuggestMethods = async () => {
        setIsLoading(true);
        try {
            const context = getStepContext(activeExperiment, 7);
            const { basePrompt, config } = getPromptForStep(7, '', context, { analysisStage: 'suggest_methods' });
            const response = await gemini.models.generateContent({model: 'gemini-2.5-flash', contents: basePrompt, config});
            const sanitizedText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(sanitizedText);
            setSuggestedMethods(parsed.methods);
        } catch (error) {
            addToast(parseGeminiError(error, "Failed to suggest analysis methods."), 'danger');
        } finally {
            setIsLoading(false);
        }
    };
    
    // FIX: Explicitly type extraSettings to allow for the 'isAutomated' property.
    const handlePerformAnalysis = async (method: string | null, extraSettings: { isAutomated?: boolean } = {}) => {
        setSelectedMethod(method);
        setIsLoading(true);
        setAnalysisStage('analyze');
        
        let currentOutput = '';
        try {
            const context = getStepContext(activeExperiment, 7);
            const fineTuneSettings = { 
                ...activeExperiment.fineTuneSettings[7], 
                selectedMethod: method,
                ...extraSettings 
            };
            const { basePrompt, config } = getPromptForStep(7, stepData.input || '', context, fineTuneSettings);
            
            const stream = await gemini.models.generateContentStream({model: 'gemini-2.5-flash', contents: basePrompt, config});
            
            let buffer = '';
            for await (const chunk of stream) {
                buffer += chunk.text;
                // Live update for display without saving to DB yet
                setActiveExperiment(exp => ({...exp, stepData: {...exp.stepData, 7: {...exp.stepData[7], output: buffer}}}));
            }
            currentOutput = buffer;

        } catch (error) {
            currentOutput = `Error: ${parseGeminiError(error)}`;
            addToast(parseGeminiError(error), 'danger');
        } finally {
             const finalStepData = { ...stepData, output: currentOutput };
             await updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, 7: finalStepData } });
             setIsLoading(false);
             setAnalysisStage('complete');
             // If this was an automated run, we need to call onStepComplete
             if (extraSettings.isAutomated) {
                onStepComplete();
             }
        }
    };

    if (isLoading && analysisStage !== 'analyze') {
        return <div className="text-center p-4"><div className="spinner-border"></div><p className="mt-2">AI is working...</p></div>;
    }

    if (analysisStage === 'suggest') {
        return (
            <div>
                <h5 className="fw-bold">Suggest Analysis Methods</h5>
                <p className="text-white-50">Based on your data, the AI suggests the following methods. Please select one to proceed.</p>
                <div className="list-group">
                    {suggestedMethods.map((method, index) => (
                        <button key={index} type="button" className="list-group-item list-group-item-action" onClick={() => handlePerformAnalysis(method.name)}>
                            <div className="d-flex w-100 justify-content-between">
                                <h6 className="mb-1 text-primary-glow">{method.name}</h6>
                            </div>
                            <p className="mb-1 small text-white-50">{method.description}</p>
                        </button>
                    ))}
                </div>
            </div>
        );
    }
    
    return (
        <div>
            {analysisStage === 'analyze' && isLoading && (
                <div className="text-center p-5">
                    <div className="spinner-border mb-3" role="status"></div>
                    <h5>AI is performing the analysis {selectedMethod ? `using "${selectedMethod}"` : ''}...</h5>
                    <p className="text-white-50">This may take a moment.</p>
                </div>
            )}
            <GeneratedOutput stepId={7} onGenerate={() => handlePerformAnalysis(selectedMethod)} isLoading={isLoading} />
             {analysisStage === 'complete' && activeExperiment.automationMode !== 'automated' && (
                 <div className="card-footer d-flex justify-content-end align-items-center bottom-nav">
                    <button className="btn btn-success" onClick={onStepComplete} disabled={isLoading || !stepData?.output}>
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


const FinalPublicationView = ({ publicationText, experimentTitle, experimentId }) => {
    const { addToast } = useToast();
    const contentRef = useRef(null);

    useEffect(() => {
        if (contentRef.current) {
            // This is necessary because React's dangerouslySetInnerHTML doesn't re-render on prop change alone sometimes
            contentRef.current.innerHTML = marked(publicationText);
        }
    }, [publicationText]);

    const handleDownload = (format: 'md' | 'doc' | 'pdf') => {
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
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 20px auto; padding: 25px; } 
                        h1, h2, h3 { color: #000; } hr { border: 0; border-top: 1px solid #eee; margin: 20px 0; }
                        code { background-color: #f3f3f3; padding: .2em .4em; font-size: .85em; border-radius: 3px; }
                        pre { background-color: #f3f3f3; padding: 1em; border-radius: 5px; overflow-x: auto; }
                        img { max-width: 100%; height: auto; border-radius: 5px; margin-top: 1em; margin-bottom: 1em; }
                        @media print {
                            body { margin: 0; padding: 0; }
                            img { break-inside: avoid; }
                        }
                    </style>
                </head>
                <body>
                    <h1>${experimentTitle}</h1>
                    <hr>
                    ${printContent}
                </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 250);
            return;
        }

        let blob;
        let filename = `publication_${experimentId}.${format}`;

        if (format === 'md') {
            blob = new Blob([publicationText], { type: 'text/markdown;charset=utf-8' });
        } else if (format === 'doc') {
            const content = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${experimentTitle}</title></head><body>${marked(publicationText)}</body></html>`;
            blob = new Blob([content], { type: 'application/vnd.ms-word' });
        }

        if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    return (
        <div>
            <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                <h5 className="fw-bold mb-0">Publication Draft</h5>
                 <div>
                     <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => handleDownload('md')}><i className="bi bi-markdown me-1"></i> Download .md</button>
                     <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => handleDownload('doc')}><i className="bi bi-file-earmark-word me-1"></i> Download .doc</button>
                     <button className="btn btn-sm btn-outline-secondary" onClick={() => handleDownload('pdf')}><i className="bi bi-file-earmark-pdf me-1"></i> Download .pdf</button>
                 </div>
             </div>
             <hr/>
             <div ref={contentRef} className="generated-text-container" />
        </div>
    );
};

const PublicationExporter = () => {
    const { activeExperiment, updateExperiment, gemini } = useExperiment();
    const { addToast } = useToast();
    
    const [generationState, setGenerationState] = useState<'tuning' | 'generating' | 'complete'>('tuning');
    const [tuningSettings, setTuningSettings] = useState({
        length: '5 pages',
        referenceFormat: 'APA'
    });
    const [progress, setProgress] = useState({ percent: 0, section: '', iteration: 0, status: '' });
    const [publicationText, setPublicationText] = useState('');

    useEffect(() => {
        const draft = activeExperiment.stepData[10]?.output;
        if (draft) {
            setPublicationText(draft);
            setGenerationState('complete');
        }
    }, [activeExperiment]);

    const renderChartsAsBase64 = async (chartConfigs) => {
        if (!Array.isArray(chartConfigs)) {
            return [];
        }
        const imagePromises = chartConfigs.map(config => {
            return new Promise((resolve) => {
                try {
                    const offscreenCanvas = document.createElement('canvas');
                    offscreenCanvas.width = 600;
                    offscreenCanvas.height = 400;
                    
                    const chartConfig = {
                        ...config, 
                        options: {
                            ...(config.options || {}), 
                            animation: false, 
                            responsive: false, 
                            maintainAspectRatio: false 
                        }
                    };

                    new Chart(offscreenCanvas, chartConfig);
                    
                    setTimeout(() => {
                        resolve(offscreenCanvas.toDataURL('image/png'));
                    }, 200); // Timeout to allow chart to render before capture
                } catch (error) {
                    console.error("Failed to render chart for export:", error);
                    addToast('A chart could not be rendered and was skipped.', 'warning');
                    resolve(''); // Resolve with an empty string so Promise.all doesn't reject.
                }
            });
        });
        return Promise.all(imagePromises);
    };

    const injectChartsIntoMarkdown = async (markdown, chartData) => {
        if (!chartData?.chartSuggestions?.length) return markdown;

        addToast("Rendering data visualizations...", "info");
        const base64Images = await renderChartsAsBase64(chartData.chartSuggestions);
        let updatedMarkdown = markdown;

        base64Images.forEach((imgData, index) => {
            if (!imgData) return; // Skip if the chart failed to render
            const placeholderRegex = new RegExp(`\\[CHART_${index + 1}:(.*?)\\]`, 'gi');
            updatedMarkdown = updatedMarkdown.replace(placeholderRegex, (match, caption) => {
                const trimmedCaption = caption.trim();
                return `\n![${trimmedCaption}](${imgData})\n*Figure ${index + 1}: ${trimmedCaption}*\n`;
            });
        });
        
        return updatedMarkdown;
    };
    
    const handleGeneratePublication = async () => {
        if (!gemini) {
            addToast("Gemini is not initialized.", "danger");
            return;
        }
        setGenerationState('generating');
        setPublicationText('');
        
        const paperSections = ['Abstract', 'Introduction', 'Methodology', 'Results', 'Discussion', 'Conclusion', 'References'];
        let fullPaper = `# ${activeExperiment.title}\n\n`;
        const totalSteps = paperSections.length;
        let completedSteps = 0;
        
        try {
            const context = getStepContext(activeExperiment, 10);
            const { basePrompt, config } = getPromptForStep(10, '', context, tuningSettings);

            setProgress({
                percent: 10,
                section: 'Drafting',
                status: 'Agent [Writer] is drafting the full paper...'
            });

            const response = await gemini.models.generateContent({ model: 'gemini-2.5-flash', contents: basePrompt, config });
            fullPaper = `# ${activeExperiment.title}\n\n${response.text}`;
            setPublicationText(fullPaper);

            setProgress({ percent: 90, section: 'Complete', iteration: 1, status: 'Injecting visualizations...' });

            let finalPaperWithCharts = fullPaper;
            const analysisOutput = activeExperiment.stepData[7]?.output;
            if (analysisOutput) {
                try {
                    const sanitizedText = analysisOutput.replace(/```json/g, '').replace(/```/g, '').trim();
                    const chartData = JSON.parse(sanitizedText);
                    finalPaperWithCharts = await injectChartsIntoMarkdown(fullPaper, chartData);
                } catch(e) {
                    console.error("Could not parse chart data, skipping injection.", e);
                    addToast("Could not parse chart data; skipping chart injection.", "warning");
                }
            }
            
            setPublicationText(finalPaperWithCharts);
            setGenerationState('complete');
            addToast("Publication draft generated successfully!", "success");

            const updatedStepData = { ...activeExperiment.stepData, 10: { ...activeExperiment.stepData[10], output: finalPaperWithCharts, summary: "Publication draft generated." }};
            await updateExperiment({ ...activeExperiment, stepData: updatedStepData, currentStep: 11 });

        } catch (error) {
            addToast(parseGeminiError(error, "An error occurred during paper generation."), 'danger');
            setGenerationState('tuning');
        }
    };
    
    const renderTuningScreen = () => (
        <div className="text-center p-4">
            <h5 className="fw-bold">Prepare for Publication</h5>
            <p className="text-white-50">Set the tuning parameters for the AI agents to generate your scientific paper draft.</p>
            <div className="card my-3 text-start">
                <div className="card-body">
                    <div className="mb-3">
                        <label className="form-label">Desired Paper Length</label>
                        <input 
                            type="text" 
                            className="form-control" 
                            value={tuningSettings.length} 
                            onChange={(e) => setTuningSettings(p => ({...p, length: e.target.value}))} 
                        />
                         <div className="form-text">e.g., "approx. 3000 words", "5-7 pages"</div>
                    </div>
                    <div className="mb-3">
                        <label className="form-label">Reference Format</label>
                        <select 
                            className="form-select"
                            value={tuningSettings.referenceFormat}
                            onChange={(e) => setTuningSettings(p => ({...p, referenceFormat: e.target.value}))} 
                        >
                            <option>APA</option>
                            <option>MLA</option>
                            <option>Chicago</option>
                            <option>IEEE</option>
                        </select>
                    </div>
                </div>
            </div>
            <button className="btn btn-primary btn-lg" onClick={handleGeneratePublication}>
                <i className="bi bi-stars me-1"></i> Generate Paper with AI Agents
            </button>
        </div>
    );

    const renderGeneratingScreen = () => (
        <div className="p-4">
            <h5 className="fw-bold text-center">AI Agents at Work...</h5>
            <p className="text-white-50 text-center">An agentic workflow is simulating writing and refining your paper.</p>
            <div className="progress my-3" style={{height: '20px'}}>
                <div 
                    className="progress-bar progress-bar-striped progress-bar-animated" 
                    style={{ width: `${progress.percent}%` }}
                >{Math.round(progress.percent)}%</div>
            </div>
            <p className="text-center fw-bold">{progress.status}</p>
            <div className="generated-text-container mt-3" style={{minHeight: '200px', maxHeight: '400px', overflowY: 'auto'}}>
                 <div dangerouslySetInnerHTML={{ __html: marked(publicationText) }} />
            </div>
        </div>
    );

    const renderCompleteScreen = () => (
        <FinalPublicationView 
            publicationText={publicationText}
            experimentTitle={activeExperiment.title}
            experimentId={activeExperiment.id}
        />
    );

    switch (generationState) {
        case 'generating': return renderGeneratingScreen();
        case 'complete': return renderCompleteScreen();
        case 'tuning':
        default: return renderTuningScreen();
    }
};

const FineTuneModal = ({ stepId, onClose }) => {
    const { activeExperiment, updateExperiment } = useExperiment();
    const params = STEP_SPECIFIC_TUNING_PARAMETERS[stepId] || [];
    const [settings, setSettings] = useState(activeExperiment.fineTuneSettings[stepId] || {});

    useEffect(() => {
        // Initialize Bootstrap tooltips
        const tooltipTriggerList = Array.from(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        const tooltipList = tooltipTriggerList.map(tooltipTriggerEl => new (window as any).bootstrap.Tooltip(tooltipTriggerEl));

        // Cleanup function to destroy tooltips when the modal closes
        return () => {
            tooltipList.forEach(tooltip => tooltip.dispose());
        };
    }, []); // Empty dependency array ensures this runs only once when the modal mounts


    const handleSave = () => {
        const updatedFineTuneSettings = { ...activeExperiment.fineTuneSettings, [stepId]: settings };
        updateExperiment({ ...activeExperiment, fineTuneSettings: updatedFineTuneSettings });
        onClose();
    };

    const handleChange = (name, value) => {
        setSettings(prev => ({ ...prev, [name]: value }));
    };

    const renderInput = (param) => {
        const value = settings[param.name] ?? param.default;
        switch (param.type) {
            case 'select':
                return <select className="form-select" value={value} onChange={e => handleChange(param.name, e.target.value)}>{param.options.map(o => <option key={o} value={o}>{o}</option>)}</select>;
            case 'range':
                return <div className="d-flex align-items-center"><input type="range" className="form-range" {...param} value={value} onChange={e => handleChange(param.name, parseFloat(e.target.value))} /><span className="temperature-slider-label">{value}</span></div>;
            case 'boolean':
                return <div className="form-check form-switch"><input className="form-check-input" type="checkbox" role="switch" checked={!!value} onChange={e => handleChange(param.name, e.target.checked)} /></div>;
            default:
                return <input type="text" className="form-control" value={value} onChange={e => handleChange(param.name, e.target.value)} />;
        }
    };
    
    return (
        <div className="modal" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">Fine-Tune AI for "{WORKFLOW_STEPS[stepId - 1].title}"</h5>
                        <button type="button" className="btn-close" onClick={onClose}></button>
                    </div>
                    <div className="modal-body">
                         {params.length > 0 ? params.map(param => (
                            <div className="mb-3" key={param.name}>
                                <label className="form-label fw-bold d-flex align-items-center">
                                    {param.label}
                                    <i 
                                        className="bi bi-question-circle-fill ms-2 text-white-50" 
                                        style={{ cursor: 'pointer', fontSize: '0.9rem' }}
                                        data-bs-toggle="tooltip" 
                                        data-bs-placement="right" 
                                        title={param.description}>
                                    </i>
                                </label>
                                {renderInput(param)}
                            </div>
                        )) : <p>No specific tuning parameters available for this step.</p>}
                         <div className="mb-3">
                             <label className="form-label fw-bold d-flex align-items-center">
                                Temperature
                                 <i 
                                    className="bi bi-question-circle-fill ms-2 text-white-50" 
                                    style={{ cursor: 'pointer', fontSize: '0.9rem' }}
                                    data-bs-toggle="tooltip" 
                                    data-bs-placement="right" 
                                    title="Controls randomness in the AI's response. Lower values (e.g., 0.2) make the output more deterministic and focused, while higher values (e.g., 0.8) make it more creative and diverse.">
                                </i>
                            </label>
                             <div className="d-flex align-items-center">
                                 <input type="range" className="form-range" min="0" max="1" step="0.1" value={settings.temperature ?? 0.5} onChange={e => handleChange('temperature', parseFloat(e.target.value))} />
                                 <span className="temperature-slider-label">{settings.temperature ?? 0.5}</span>
                             </div>
                         </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={handleSave}>Save Settings</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ProjectCompletionView = () => {
    const { activeExperiment } = useExperiment();
    const { addToast } = useToast();
    const finalPublication = activeExperiment.stepData[10]?.output;

    const handleDownload = () => {
        let fullReport = `# ${activeExperiment.title}\n\n`;
        fullReport += `**Field:** ${activeExperiment.field}\n`;
        fullReport += `**Description:** ${activeExperiment.description}\n\n---\n\n`;

        WORKFLOW_STEPS.forEach(step => {
            const stepData = activeExperiment.stepData[step.id];
            fullReport += `## Step ${step.id}: ${step.title}\n\n`;
            if (stepData?.output) {
                // For JSON steps, stringify it nicely for the markdown file
                if ([1, 2, 7].includes(step.id)) {
                    try {
                        const parsed = JSON.parse(stepData.output.replace(/```json/g, '').replace(/```/g, '').trim());
                        fullReport += "```json\n" + JSON.stringify(parsed, null, 2) + "\n```\n\n";
                    } catch (e) {
                        fullReport += `${stepData.output}\n\n`; // fallback to raw text
                    }
                } else {
                    fullReport += `${stepData.output}\n\n`;
                }
            } else {
                fullReport += `*No output generated for this step.*\n\n`;
            }
        });

        const blob = new Blob([fullReport], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${activeExperiment.title.replace(/\s+/g, '_')}_Full_Project_Report.md`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        addToast("Full project report downloaded!", "success");
    };

    const renderStepOutput = (stepId) => {
        const output = activeExperiment.stepData[stepId]?.output;
        if (!output) return <p className="text-white-50">No output was generated for this step.</p>;

        if ([1, 2, 7].includes(stepId)) {
            // Reuse the parser logic from GeneratedOutput for consistent display
            try {
                const sanitizedText = output.replace(/```json/g, '').replace(/```/g, '').trim();
                const data = JSON.parse(sanitizedText);
                if (stepId === 1) return <div><div dangerouslySetInnerHTML={{ __html: marked(data.research_question) }} /><UniquenessMeter score={data.uniqueness_score} justification={data.justification} /></div>;
                if (stepId === 2) return <div><div dangerouslySetInnerHTML={{ __html: marked(data.summary) }} /><h5>References</h5>...</div>; // Abridged for brevity
                if (stepId === 7) return <DataAnalysisView analysisData={data} />;
            } catch (e) {
                return <pre><code>{output}</code></pre>;
            }
        }
        return <div dangerouslySetInnerHTML={{ __html: marked(output) }} />;
    };

    return (
        <div className="p-4">
            <div className="text-center">
                <h3><i className="bi bi-award-fill text-warning me-2"></i>Project Complete!</h3>
                <p className="text-white-50">Congratulations on completing your research project. You can review all generated content below or download a full report.</p>
                <button className="btn btn-primary" onClick={handleDownload}>
                    <i className="bi bi-download me-2"></i> Download Full Project Report (Markdown)
                </button>
            </div>
            
            {finalPublication && (
                <div className="card mt-4">
                    <div className="card-body">
                        <FinalPublicationView 
                            publicationText={finalPublication} 
                            experimentTitle={activeExperiment.title}
                            experimentId={activeExperiment.id}
                        />
                    </div>
                </div>
            )}

            <div className="text-start mt-4">
                <h4 className="text-center mb-3">Full Project Log</h4>
                <div className="accordion" id="projectSummaryAccordion">
                    {WORKFLOW_STEPS.map(step => (
                        <div className="accordion-item" key={step.id}>
                            <h2 className="accordion-header" id={`heading-${step.id}`}>
                                <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target={`#collapse-${step.id}`}>
                                    Step {step.id}: {step.title}
                                </button>
                            </h2>
                            <div id={`collapse-${step.id}`} className="accordion-collapse collapse" data-bs-parent="#projectSummaryAccordion">
                                <div className="accordion-body generated-text-container">
                                    {renderStepOutput(step.id)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};


// --- MAIN RENDER ---
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
    <React.StrictMode>
        <ToastProvider>
            <App />
        </ToastProvider>
    </React.StrictMode>
);