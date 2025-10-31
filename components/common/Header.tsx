
import React, { useState, useEffect } from 'react';
import { useExperiment } from '../../context/ExperimentContext';
import { HelpModal } from './HelpModal';

export const Header = ({ setView, activeView, onToggleNotebook }) => {
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
