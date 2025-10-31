
import React, { useState } from 'react';
import { marked } from 'marked';
import { Experiment } from '../../config';
import { useToast } from '../../toast';
import { getStepContext, getPromptForStep, parseGeminiError } from '../../be_gemini';

export const DeployModal = ({ experiment, onClose, onUpdateExperiment, onExportExperiment, gemini }) => {
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
                    {/* Fix: Changed rows="10" to rows={10} to satisfy TypeScript's type checking for the 'rows' attribute. */}
                    <textarea className="form-control" rows={10} value={generatedContent} readOnly></textarea>
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
