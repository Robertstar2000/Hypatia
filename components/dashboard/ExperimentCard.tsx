
import React from 'react';
import { Experiment } from '../../config';

export const ExperimentCard: React.FC<{
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
