import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export const HelpModal = ({ onClose }) => {
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchHelpContent = async () => {
            try {
                const response = await fetch('/help.md');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const text = await response.text();
                setContent(text);
                setError(null);
            } catch (e) {
                console.error("Failed to fetch help content:", e);
                setError("Could not load the help documentation. Please check your network connection and try again.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchHelpContent();
    }, []);

    const renderBodyContent = () => {
        if (isLoading) {
            return (
                <div className="text-center p-5">
                    <div className="spinner-border" role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                </div>
            );
        }
        if (error) {
            return <div className="alert alert-danger">{error}</div>;
        }
        return (
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.9rem' }}>
                {content}
            </pre>
        );
    };

    const modalContent = (
        <div className="help-modal" style={{display: 'flex'}} onClick={onClose}>
            <div className="help-modal-dialog" onClick={e => e.stopPropagation()}>
                <div className="help-modal-content">
                    <div className="help-modal-header">
                        <h5 className="modal-title">Project Hypatia Help</h5>
                        <button type="button" className="btn-close" onClick={onClose}></button>
                    </div>
                    <div className="help-modal-body">
                        {renderBodyContent()}
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};