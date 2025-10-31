
import React from 'react';

export const AutomationModeSelector = ({ onSelect }) => {
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
