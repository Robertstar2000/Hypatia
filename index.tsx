

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { marked } from 'marked';
import { appTests } from './index.test.tsx';
import { Chart, registerables } from 'chart.js';
import { mtiLogoBase64 } from './assets';
import {
    Experiment,
    SCIENTIFIC_FIELDS,
    WORKFLOW_STEPS,
    STEP_SPECIFIC_TUNING_PARAMETERS
} from './config';
import {
    db,
    initializeGemini,
    getStepContext,
    getPromptForStep,
    getPromptForInputSuggestion
} from './services';
import { ToastProvider, useToast } from './toast';
import { ExperimentRunner } from './experimentRunner';


Chart.register(...registerables);

declare var bootstrap: any;

// Configure marked for better markdown rendering
marked.setOptions({
    gfm: true,
    breaks: true,
});

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
                             {activeView !== 'landing' && (
                                <li className="nav-item">
                                    <a className="nav-link" href="#" onClick={() => setShowHelp(true)}>
                                        <i className="bi bi-question-circle me-1"></i> Help
                                    </a>
                                </li>
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


const LandingPage = ({ setView, createNewExperiment }) => {
     const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [field, setField] = useState<(typeof SCIENTIFIC_FIELDS)[number]>(SCIENTIFIC_FIELDS[0]);

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
                    <h1 className="display-4 landing-title">Project Hypatia</h1>
                    <p className="lead landing-subtitle mb-4">Project Hypatia is your AI-powered partner in scientific research, guiding you from initial question to the mock publication of a draft scientific paper.</p>

                    <div className="d-flex align-items-center justify-content-center gap-4 my-4">
                        <img src={mtiLogoBase64} alt="Mars Technology Institute Logo" style={{ width: '100px', height: '100px', borderRadius: '50%' }} />
                        <p className="lead mb-0 text-white-50" style={{maxWidth: '300px', textAlign: 'left'}}>
                            This application created by{' '}
                            <span style={{color: '#00f2fe', fontWeight: 'bold'}}>M</span>
                            <span style={{color: '#ff00ff', fontWeight: 'bold'}}>I</span>
                            <span style={{color: '#ffff00', fontWeight: 'bold'}}>F</span>
                            <span style={{color: '#00ff00', fontWeight: 'bold'}}>E</span>
                            <span style={{color: '#ff8c00', fontWeight: 'bold'}}>C</span>
                            <span style={{color: '#a64aff', fontWeight: 'bold'}}>O</span>
                            {' '}a Mars Technology Institute (MTI) affiliate.
                        </p>
                    </div>

                     <div className="getting-started-fields mx-auto">
                         <form onSubmit={handleStart}>
                             <p className="fw-bold text-light">Start a New Experiment</p>
                            <div className="mb-3">
                                <input type="text" className="form-control" placeholder="Experiment Title" value={title} onChange={e => setTitle(e.target.value)} required />
                            </div>
                            <div className="mb-3">
                                 <textarea className="form-control" placeholder="Briefly describe your research idea..." value={description} onChange={e => setDescription(e.target.value)} required rows={2}></textarea>
                            </div>
                            <div className="mb-3">
                                 <select className="form-select" value={field} onChange={e => setField(e.target.value as (typeof SCIENTIFIC_FIELDS)[number])}>
                                    {SCIENTIFIC_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                            </div>
                             <button type="submit" className="btn btn-primary btn-lg w-100">
                                <i className="bi bi-play-circle me-2"></i> Begin Research
                            </button>
                         </form>
                    </div>

                    <p className="mt-4 text-white-50 small">
                        An Application for ideation and to be used by Students, Scientists, Engineers, Lay Scientists and Anyone who wants to explore new ideas.
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
                         <div className="col-lg-6 text-center order-lg-2">
                            <img src="https://images.unsplash.com/photo-1554475901-4538ddfbccc2?q=80&w=2072&auto=format&fit=crop" alt="Scientist in a dark lab examining glowing blue liquids in test tubes" className="researcher-image" />
                        </div>
                        <div className="col-lg-6 order-lg-1">
                             <h2 className="section-title mb-3">From Idea to Publication</h2>
                             <p className="text-white-50 mb-4">Project Hypatia provides all the tools you need to take your research from a nascent idea to a polished, publication-ready paper. The integrated workflow ensures that each step logically builds on the last, creating a cohesive and comprehensive research narrative.</p>
                             <ul className="list-unstyled">
                                <li className="mb-3 d-flex align-items-center"><i className="bi bi-check-circle-fill text-primary-glow me-2"></i><span>Maintain full control with editable AI outputs.</span></li>
                                <li className="mb-3 d-flex align-items-center"><i className="bi bi-check-circle-fill text-primary-glow me-2"></i><span>Get up-to-date sources with Google Search grounding.</span></li>
                                <li className="mb-3 d-flex align-items-center"><i className="bi bi-check-circle-fill text-primary-glow me-2"></i><span>Simulate peer review to strengthen your arguments.</span></li>
                             </ul>
                        </div>
                    </div>

                    <hr className="landing-divider" />

                    <div className="row align-items-center">
                        <div className="col-lg-6 text-center">
                           <i className="bi bi-person-gear display-1 text-primary-glow" style={{fontSize: '6rem'}}></i>
                        </div>
                        <div className="col-lg-6">
                            <h2 className="section-title mb-3">Our Research Philosophy</h2>
                            <p className="lead fw-bold text-white">Human-Mediated Agentic Process (HMAP)</p>
                            <p className="text-white-50 mb-4">
                                A systematic framework for structuring collaboration between human researchers and AI agents throughout the complete research lifecycle, enhancing quality while preserving human agency.
                            </p>
                            <a href="https://github.com/Robertstar2000/HMAP?tab=readme-ov-file" target="_blank" rel="noopener noreferrer" className="btn btn-outline-light">
                                <i className="bi bi-box-arrow-up-right me-2"></i> Learn More about HMAP
                            </a>
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
    const [field, setField] = useState<(typeof SCIENTIFIC_FIELDS)[number]>(SCIENTIFIC_FIELDS[0]);

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
                <div className="modal show" style={{ display: 'block' }} tabIndex={-1}>
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
                                             <select className="form-select" value={field} onChange={e => setField(e.target.value as (typeof SCIENTIFIC_FIELDS)[number])}>
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

interface ExperimentWorkspaceProps {
    experiment: Experiment;
    onUpdate: (updatedExperiment: Experiment) => Promise<void>;
}

// Fix: Explicitly typing as React.FC resolves a TypeScript error where the 'key' prop was being incorrectly checked against the component's props.
const ExperimentWorkspace: React.FC<ExperimentWorkspaceProps> = ({ experiment: initialExperiment, onUpdate }) => {
    const [experiment, setExperiment] = useState(initialExperiment);
    const [activeStep, setActiveStep] = useState(initialExperiment.currentStep);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
    const [streamingOutput, setStreamingOutput] = useState("");
    const [isFineTuneModalOpen, setFineTuneModalOpen] = useState(false);

    const gemini = useMemo(() => initializeGemini(), []);
    const { addToast } = useToast();

    // Effect for handling step changes and generating initial input suggestions
    useEffect(() => {
        const currentStepData = experiment.stepData[activeStep];
        setStreamingOutput(""); // Clear streaming output when step changes

        // If the user navigates to the current, uncompleted step, and there's no output yet,
        // generate a suggestion for the input.
        if (activeStep === experiment.currentStep && !currentStepData?.output && !currentStepData?.suggestedInput) {
             const generateSuggestedInput = async () => {
                if (!gemini) return;
                setIsLoadingSuggestion(true);
                try {
                    const context = getStepContext(experiment, activeStep);
                    const { basePrompt, config } = getPromptForInputSuggestion(activeStep, context);

                    if (!basePrompt) { // Some steps might not need a suggestion
                        setUserInput(currentStepData?.input || '');
                        return;
                    }

                    const response = await gemini.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: basePrompt,
                        config: config
                    });
                    const suggestion = response.text;
                    setUserInput(suggestion);

                    // Save the suggestion to the experiment state
                    const updatedStepData = {
                        ...experiment.stepData,
                        [activeStep]: {
                            ...experiment.stepData[activeStep],
                            suggestedInput: suggestion,
                            input: suggestion // Pre-fill input with suggestion
                        }
                    };
                    handleUpdate({ stepData: updatedStepData }, true); // silent update
                } catch (error) {
                    console.error("Failed to generate suggested input:", error);
                    addToast("Could not generate an AI suggestion for the input.", 'warning');
                    setUserInput(currentStepData?.input || ''); // Fallback to existing input or empty
                } finally {
                    setIsLoadingSuggestion(false);
                }
            };
            generateSuggestedInput();
        } else {
            // Otherwise, just load the existing input for the step.
            setUserInput(currentStepData?.input || '');
        }

    }, [activeStep, experiment.currentStep, gemini]);


    const handleUpdate = (updatedData, silent = false) => {
        const updatedExperiment = { ...experiment, ...updatedData };
        setExperiment(updatedExperiment);
        onUpdate(updatedExperiment);
        if (!silent) {
            addToast("Progress saved!", "success");
        }
    };

    const handleSaveFineTune = (settings) => {
        const updatedSettings = {
            ...experiment.fineTuneSettings,
            [activeStep]: settings
        };
        handleUpdate({ fineTuneSettings: updatedSettings });
    };

    const handleGenerate = async () => {
        if (!gemini) {
            addToast("Gemini API not initialized. Check your API Key.", 'danger');
            return;
        }
        if (!userInput.trim() && ![2, 5, 6, 10].includes(activeStep)) {
             addToast("Please provide input for this step.", 'warning');
             return;
        }

        setIsLoading(true);
        setStreamingOutput("");

        const stepData = experiment.stepData[activeStep] || {};
        const oldHistory = stepData.history || [];

        // Save previous output to history if it exists
        if (stepData.output) {
            const lastTimestamp = stepData.history?.[oldHistory.length - 1]?.timestamp || experiment.createdAt;
            oldHistory.push({ timestamp: lastTimestamp, output: stepData.output });
        }

        const context = getStepContext(experiment, activeStep);
        const fineTuneSettings = experiment.fineTuneSettings[activeStep] || {};
        const { basePrompt, expectJson, config } = getPromptForStep(activeStep, userInput, context, fineTuneSettings);

        try {
            const updatedStepData = {
                ...experiment.stepData,
                [activeStep]: {
                    ...stepData,
                    input: userInput, // Always save the latest input used for generation
                    history: oldHistory
                }
            };

            if (expectJson) {
                const response = await gemini.models.generateContent({ model: 'gemini-2.5-flash', contents: basePrompt, config });
                const text = response.text;
                setStreamingOutput(text);
                updatedStepData[activeStep].output = text;

            } else {
                const responseStream = await gemini.models.generateContentStream({ model: 'gemini-2.5-flash', contents: basePrompt, config });
                let fullResponse = "";
                for await (const chunk of responseStream) {
                    const chunkText = chunk.text;
                    fullResponse += chunkText;
                    setStreamingOutput(prev => prev + chunkText);
                }
                updatedStepData[activeStep].output = fullResponse;
            }
            
            // Update experiment state after generation is complete, without advancing the step
            handleUpdate({ stepData: updatedStepData }, true); // Silent update

        } catch (error) {
            console.error("Gemini API Error:", error);
            addToast(`An error occurred: ${error.message}`, 'danger');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveOutput = (newOutput) => {
        const updatedStepData = {
            ...experiment.stepData,
            [activeStep]: {
                ...experiment.stepData[activeStep],
                output: newOutput
            }
        };
        handleUpdate({ stepData: updatedStepData });
    };

    const handleCompleteStep = () => {
        if (activeStep < WORKFLOW_STEPS.length) {
            handleUpdate({ currentStep: activeStep + 1 });
            setActiveStep(activeStep + 1);
            addToast(`Step ${activeStep} completed. Moving to Step ${activeStep + 1}.`, 'success');
        } else {
            addToast("Congratulations! You have completed the final step.", 'success');
        }
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
                        {activeStep === 6 ? (
                           <ExperimentRunner
                                experiment={experiment}
                                onExperimentUpdate={handleUpdate}
                                onStepComplete={handleCompleteStep}
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
                                        rows={4}
                                        value={userInput}
                                        onChange={(e) => setUserInput(e.target.value)}
                                        placeholder={isLoadingSuggestion ? "AI is suggesting an initial input..." : (isStepCompleted ? "This step is completed. Input is locked." : "Enter your notes, data, or prompt for this step...")}
                                        disabled={isStepCompleted || isLoading || isLoadingSuggestion}
                                    />
                                </div>

                                <div className="d-flex justify-content-end align-items-center">
                                     <button
                                        className="btn btn-primary"
                                        onClick={handleGenerate}
                                        disabled={isLoading || isLoadingSuggestion || isStepCompleted}
                                    >
                                        {isLoading ? (
                                            <>
                                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                                Generating...
                                            </>
                                        ) : (
                                            <><i className="bi bi-stars me-2"></i>Generate</>
                                        )}
                                    </button>
                                     {!isStepCompleted && (
                                        <button
                                            className="btn btn-success ms-2"
                                            onClick={handleCompleteStep}
                                            disabled={!output || isLoading || isLoadingSuggestion}
                                        >
                                            <i className="bi bi-check-circle-fill me-2"></i>
                                            Complete Step & Continue
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                    {(output || isLoading) && activeStep !== 6 && activeStep !== 10 && (
                        <div className="card-footer">
                            <h5 className="fw-bold">AI Output</h5>
                            {isLoading && !streamingOutput && <div className="d-flex justify-content-center p-5"><div className="spinner-border" role="status"><span className="visually-hidden">Loading...</span></div></div>}
                            {output && <GeneratedOutput output={output} stepId={activeStep} onSave={handleSaveOutput} isEditable={!isLoading && !isStepCompleted} />}
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
                const numericValue = parseFloat(String(value)); // Ensure value is a string before parsing for robustness.
                const displayValue = isNaN(numericValue) ? param.min : numericValue;
                return (
                    <div className="d-flex align-items-center">
                        <input
                            type="range"
                            className="form-range"
                            min={param.min} max={param.max} step={param.step}
                            value={displayValue}
                            onChange={e => setTempSettings(s => ({ ...s, [param.name]: parseFloat(e.target.value) }))}
                        />
                        <span className="ms-3 fw-bold">{displayValue}</span>
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
        <>
            <div className="modal show" style={{ display: 'block' }} tabIndex={-1} onClick={onClose}>
                <div className="modal-dialog modal-dialog-centered modal-lg" onClick={e => e.stopPropagation()}>
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
            </div>
            <div className="modal-backdrop fade show"></div>
        </>
    );
};

const GeneratedOutput = ({ output, stepId, onSave, isEditable }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedOutput, setEditedOutput] = useState(output);
    const [analysis, setAnalysis] = useState(null);
    const [parseError, setParseError] = useState(null);
    const [selectedChartIndex, setSelectedChartIndex] = useState(0);
    const chartCanvasRef = useRef(null);
    const chartInstanceRef = useRef(null);

    useEffect(() => {
        setEditedOutput(output); // Sync with external changes
    }, [output]);

    const handleSaveClick = () => {
        onSave(editedOutput);
        setIsEditing(false);
    };

    // Effect for parsing Step 7 (Data Analyzer) output
    useEffect(() => {
        if (stepId !== 7) {
            // Clear analysis state if we move away from step 7
            if (analysis) setAnalysis(null);
            return;
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

            // Validate the new structure of the parsed JSON.
            if (!parsedData.summary || typeof parsedData.summary !== 'string') {
                throw new Error("The 'summary' field is missing or not a string.");
            }
            if (!parsedData.chartSuggestions || !Array.isArray(parsedData.chartSuggestions) || parsedData.chartSuggestions.length === 0) {
                 throw new Error("The 'chartSuggestions' field is missing, not an array, or is empty.");
            }

            setAnalysis(parsedData);
            setSelectedChartIndex(0); // Reset to the first suggested chart
            setParseError(null);
        } catch (error) {
            console.error("Data Analyzer Parse Error:", error);
            setAnalysis(null);
            setParseError(`Failed to render analysis. The AI's response was not in the correct JSON format or was missing required fields. Details: ${error.message}`);
        }
    }, [output, stepId]);

    // Effect for rendering the Chart.js chart for Step 7
    useEffect(() => {
        // Always clean up the previous chart instance first.
        if (chartInstanceRef.current) {
            chartInstanceRef.current.destroy();
            chartInstanceRef.current = null;
        }
        
        if (stepId !== 7 || !analysis || !chartCanvasRef.current) {
            return;
        }

        try {
            const chartConfig = JSON.parse(JSON.stringify(analysis.chartSuggestions[selectedChartIndex]));
            
            if (!chartConfig) {
                 throw new Error(`Selected chart configuration (index ${selectedChartIndex}) is invalid or missing.`);
            }
            
            if (chartConfig.data?.datasets) {
                chartConfig.data.datasets.forEach(dataset => {
                    if (dataset.data) {
                        dataset.data = dataset.data.map(d => parseFloat(d)).filter(d => !isNaN(d));
                    }
                    if (dataset.borderWidth != null) {
                        const newBorderWidth = parseFloat(dataset.borderWidth);
                        if (!isNaN(newBorderWidth)) {
                            dataset.borderWidth = newBorderWidth;
                        }
                    }
                });
            }
            chartInstanceRef.current = new Chart(chartCanvasRef.current, chartConfig);
        } catch (chartError) {
            console.error("Chart.js Error:", chartError);
            setParseError(`The chart configuration from the AI was invalid. Details: ${chartError.message}`);
        }
        
    }, [analysis, selectedChartIndex, stepId]);


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

                {analysis && (
                    <>
                        <div dangerouslySetInnerHTML={{ __html: marked(analysis.summary) }} />
                        <div className="my-4 d-flex justify-content-center align-items-center flex-wrap gap-2">
                             <span className="me-2 text-white-50 small">Suggested Visualizations:</span>
                             {analysis.chartSuggestions.map((chart, index) => (
                                <button
                                    key={index}
                                    type="button"
                                    className={`btn btn-sm text-capitalize ${selectedChartIndex === index ? 'btn-primary' : 'btn-outline-secondary'}`}
                                    onClick={() => setSelectedChartIndex(index)}
                                    aria-pressed={selectedChartIndex === index}
                                >
                                    {chart.type} Chart
                                </button>
                            ))}
                        </div>
                        <div className="mt-2">
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

const CommentsModal = ({ experiment, onClose }) => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        comments: '',
        rating: 'useful',
    });
    const { addToast } = useToast();

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const subject = `Feedback on Hypatia Experiment: ${experiment.title}`;
        const body = `
Experiment Title: ${experiment.title}
Experiment Description: ${experiment.description}
Date: ${new Date().toLocaleDateString()}
-----------------------------------------

Name: ${formData.name}
Email: ${formData.email}
Phone: ${formData.phone}

Overall Rating: ${formData.rating}

Comments:
${formData.comments}
        `;

        const mailtoLink = `mailto:mifecoinc@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.trim())}`;
        
        try {
            window.location.href = mailtoLink;
            addToast("Your email client has been opened to send feedback.", 'info');
        } catch (error) {
            console.error("Failed to open mailto link:", error);
            addToast("Could not open email client. Please copy the details manually.", 'danger');
        }

        onClose();
    };

    return (
        <div className="modal show" style={{ display: 'block' }} tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content">
                    <form onSubmit={handleSubmit}>
                        <div className="modal-header">
                            <h5 className="modal-title">Send Comments & Feedback</h5>
                            <button type="button" className="btn-close" onClick={onClose}></button>
                        </div>
                        <div className="modal-body">
                            <div className="mb-3">
                                <label className="form-label small text-white-50">Experiment Title</label>
                                <input type="text" className="form-control" value={experiment.title} readOnly disabled />
                            </div>
                             <div className="mb-3">
                                <label className="form-label small text-white-50">Experiment Description</label>
                                <textarea className="form-control" value={experiment.description} readOnly disabled rows={2}></textarea>
                            </div>
                            <hr />
                            <div className="mb-3">
                                <label className="form-label">Overall Rating</label>
                                <div className="d-flex justify-content-around flex-wrap pt-2">
                                    {['worthless', 'just OK', 'useful', 'fabulous'].map(val => (
                                        <div className="form-check" key={val}>
                                            <input
                                                className="form-check-input"
                                                type="radio"
                                                name="rating"
                                                id={`rating-${val}`}
                                                value={val}
                                                checked={formData.rating === val}
                                                onChange={handleChange}
                                            />
                                            <label className="form-check-label text-capitalize" htmlFor={`rating-${val}`}>
                                                {val}
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                             <div className="mb-3">
                                <label className="form-label">Your Name</label>
                                <input type="text" className="form-control" name="name" value={formData.name} onChange={handleChange} required />
                            </div>
                            <div className="mb-3">
                                <label className="form-label">Your Email</label>
                                <input type="email" className="form-control" name="email" value={formData.email} onChange={handleChange} required />
                            </div>
                            <div className="mb-3">
                                <label className="form-label">Your Phone (Optional)</label>
                                <input type="tel" className="form-control" name="phone" value={formData.phone} onChange={handleChange} />
                            </div>
                             <div className="mb-3">
                                <label className="form-label">Comments / Feedback</label>
                                <textarea className="form-control" name="comments" value={formData.comments} onChange={handleChange} required rows={4}></textarea>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                            <button type="submit" className="btn btn-primary">
                                <i className="bi bi-send me-2"></i>Send via Email Client
                            </button>
                        </div>
                    </form>
                </div>
            </div>
            <div className="modal-backdrop fade show"></div>
        </div>
    );
};


const PublicationExporter = ({ experiment, onGenerate, isLoading, output, onSaveOutput }) => {
    const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false);

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
                    <div className="d-flex justify-content-end flex-wrap gap-2 mb-3">
                         <button className="btn btn-sm btn-outline-light" onClick={() => handleExport('markdown')}>
                            <i className="bi bi-filetype-md me-1"></i> Export as Markdown
                        </button>
                         <button className="btn btn-sm btn-outline-light" onClick={() => handleExport('text')}>
                            <i className="bi bi-file-text me-1"></i> Export as Text
                        </button>
                        <button className="btn btn-sm btn-outline-info" onClick={() => setIsCommentsModalOpen(true)}>
                            <i className="bi bi-chat-right-text me-1"></i> Send Comments
                        </button>
                    </div>
                     <GeneratedOutput output={output} stepId={10} onSave={onSaveOutput} isEditable={!isLoading} />
                </>
            )}
            {isCommentsModalOpen && <CommentsModal experiment={experiment} onClose={() => setIsCommentsModalOpen(false)} />}
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