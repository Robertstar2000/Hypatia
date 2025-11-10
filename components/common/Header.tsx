import React, { useState } from 'react';
import { useExperiment } from '../../services';
import { HelpModal } from './HelpModal';
import { useToast } from '../../toast';

export const Header = ({ setView, activeView, onToggleNotebook }) => {
    const [showHelp, setShowHelp] = useState(false);
    const { gemini, activeExperiment, updateExperiment } = useExperiment();
    const { addToast } = useToast();

    const handleHelpClick = (e: React.MouseEvent) => {
        e.preventDefault();
        setShowHelp(true);
    };
    
    const handleSaveProject = async () => {
        if (!activeExperiment) return;
        try {
            await updateExperiment({ ...activeExperiment, status: 'archived' });
            addToast(`Project "${activeExperiment.title}" saved successfully!`, 'success');
            setView('dashboard');
        } catch (error) {
            addToast('Failed to save project.', 'danger');
        }
    };

    return (
        <>
            <nav className="navbar navbar-expand-lg navbar-dark sticky-top">
                <div className="container-fluid">
                    <a className="navbar-brand fw-bold" href="#" onClick={(e) => { e.preventDefault(); setView('landing'); }}>
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
                             {activeView !== 'landing' && gemini && (
                                <>
                                {activeExperiment && activeView === 'experiment' && (
                                     <li className="nav-item">
                                        <a className="nav-link" href="#" onClick={(e) => { e.preventDefault(); handleSaveProject(); }}>
                                            <i className="bi bi-save-fill me-1"></i> Save Project
                                        </a>
                                    </li>
                                )}
                                <li className="nav-item">
                                    <a className="nav-link" href="#" onClick={(e) => { e.preventDefault(); onToggleNotebook(); }}>
                                        <i className="bi bi-journal-bookmark-fill me-1"></i> Lab Notebook
                                    </a>
                                </li>
                                </>
                            )}
                             <li className="nav-item">
                                <a className="nav-link" href="#" onClick={handleHelpClick}>
                                    <i className="bi bi-question-circle me-1"></i> Help
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>
            </nav>
            {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
        </>
    );
};