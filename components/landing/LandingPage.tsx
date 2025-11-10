
import React, { useState, useMemo } from 'react';
import { useToast } from '../../toast';
import { useExperiment } from '../../services';
import { ApiKeySection } from './ApiKeySection';
import { ResearchSummary } from './ResearchSummary';
import { SCIENTIFIC_FIELDS, WORKFLOW_STEPS } from '../../config';

export const LandingPage = ({ setView }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [field, setField] = useState<string>('');
    const { addToast } = useToast();
    const { gemini, createNewExperiment, handleAuthentication, experiments, selectExperiment, deleteExperiment } = useExperiment();

    const savedProjects = useMemo(() => experiments.filter(e => e.status === 'archived'), [experiments]);

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
                                     <textarea className="form-control" placeholder="Briefly describe your research idea..." value={description} onChange={e => setDescription(e.target.value)} required rows={8}></textarea>
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
                                       <option value="" disabled>Select Scientific Discipline</option>
                                       {SCIENTIFIC_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                                   </select>
                               </div>
                                 <button type="submit" className="btn btn-primary btn-lg w-100">
                                    <i className="bi bi-play-circle me-2"></i> Begin Research
                                 </button>
                             </form>
                             <p className="mt-3 text-warning small">
                                Be sure to read and edit AI output to keep the project aligned with your needs. This tool works best for teaching, ideation, trying new ideas, creating content for grants, and proofing research projects before engaging in expensive and time-consuming research. For best results, use manual mode and review and edit each step, as that will better focus all subsequent steps. Depending on project complexity, agentic AI generation can take several minutes per step—please be patient.
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

                    {savedProjects.length > 0 && (
                        <>
                            <div className="row mb-5">
                                <div className="col-lg-8 mx-auto">
                                    <h2 className="section-title text-center mb-4">Load a Saved Project</h2>
                                    <ul className="saved-project-list">
                                        {savedProjects.map(project => (
                                            <li key={project.id} className="saved-project-list-item">
                                                <div>
                                                    <h6 className="mb-0 text-primary-glow">{project.title}</h6>
                                                    <small className="text-white-50">{project.field} - Saved on {new Date(project.updatedAt || project.createdAt).toLocaleDateString()}</small>
                                                </div>
                                                <div className="btn-group">
                                                    <button className="btn btn-sm btn-primary" onClick={() => selectExperiment(project.id)}>
                                                        <i className="bi bi-box-arrow-in-right me-1"></i> Load
                                                    </button>
                                                    <button className="btn btn-sm btn-outline-danger" onClick={() => deleteExperiment(project.id)}>
                                                        <i className="bi bi-trash"></i>
                                                    </button>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                            <hr className="landing-divider" />
                        </>
                    )}

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