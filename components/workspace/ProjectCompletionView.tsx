import React, { useState } from 'react';
import { useExperiment } from '../../context/ExperimentContext';
import { WORKFLOW_STEPS } from '../../config';
import { renderMarkdown } from '../../utils/markdownRenderer';
import { FinalPublicationView } from '../steps/PublicationExporter';
import { useToast } from '../../toast';
import { DataAnalysisView } from '../common/DataAnalysisView';
import JSZip from 'jszip';
import { getStepContext, getPromptForStep, callGeminiWithRetry, parseGeminiError } from '../../services';

export const ProjectCompletionView = () => {
    const { activeExperiment, updateExperiment, gemini } = useExperiment();
    const { addToast } = useToast();
    const [isGenerating, setIsGenerating] = useState(false);
    
    if (!activeExperiment) {
        return <div>Loading...</div>;
    }
    
    const { title: experimentTitle, stepData } = activeExperiment;
    const publicationText = stepData[10]?.output;
    const experimentalData = stepData[7]?.input;
    const analysisJson = stepData[7]?.output;
    const explanationText = stepData[13]?.output;
    
    let analysisData;
    try {
        analysisData = analysisJson ? JSON.parse(analysisJson) : null;
    } catch (e) {
        analysisData = null;
    }
    const charts = analysisData?.charts || [];

    const handleGenerateExplanation = async () => {
        if (!gemini || !publicationText || isGenerating) return;
        
        setIsGenerating(true);
        try {
            const context = getStepContext(activeExperiment, 13);
            const { basePrompt, config } = getPromptForStep(13, '', context, {});
            const response = await callGeminiWithRetry(gemini, 'gemini-2.5-flash', { contents: basePrompt, config });
            const newContent = response.text;

            const updatedStepData = {
                ...activeExperiment.stepData,
                13: { ...(activeExperiment.stepData[13] || {}), output: newContent }
            };
            await updateExperiment({ ...activeExperiment, stepData: updatedStepData });
            addToast("Explanation generated and saved.", "success");
        } catch (error) {
            addToast(parseGeminiError(error, "Failed to generate explanation."), 'danger');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownloadPaper = (format: 'md' | 'txt' | 'doc' | 'pdf') => {
        if (!publicationText) {
            addToast("No publication text to download.", "warning");
            return;
        }

        const tempContainer = document.createElement('div');
        tempContainer.style.visibility = 'hidden';
        tempContainer.style.position = 'absolute';
        document.body.appendChild(tempContainer);

        // Render markdown with math formulas for accurate HTML content
        const htmlContent = renderMarkdown(publicationText);
        tempContainer.innerHTML = htmlContent;

        if (format === 'pdf') {
            addToast("Preparing a print-friendly view...", "info");
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                addToast("Could not open a new window. Please check your browser's pop-up blocker.", 'warning');
                return;
            }
            printWindow.document.write(`
                <!DOCTYPE html><html><head><title>Print - ${experimentTitle}</title>
                <style>body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 20px auto; } img { max-width: 100%; height: auto; }</style>
                </head><body>${htmlContent}
                <script>setTimeout(() => { window.print(); window.close(); }, 500);</script>
                </body></html>`);
            printWindow.document.close();
            document.body.removeChild(tempContainer);
            return;
        }

        let blob;
        let filename = `${experimentTitle.replace(/ /g, '_')}_publication`;
        if (format === 'doc') {
             const docContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
                <head><meta charset='utf-8'><title>${experimentTitle}</title></head>
                <body>${htmlContent}</body></html>`;
             blob = new Blob(['\ufeff', docContent], { type: 'application/msword' });
             filename += '.doc';
        } else {
            const content = format === 'md' ? publicationText : tempContainer.innerText;
            blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            filename += `.${format}`;
        }
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(tempContainer);
        addToast(`Paper downloaded as .${format}`, 'success');
    };
    
    const handleDownloadAll = async () => {
        addToast("Preparing zip file... This may take a moment.", 'info');
        try {
            const zip = new JSZip();
            const projectFolder = zip.folder(experimentTitle.replace(/\s+/g, '_'));

            if (publicationText) projectFolder.file('publication.md', publicationText);

            const rawOutputsFolder = projectFolder.folder('raw_outputs');
            WORKFLOW_STEPS.forEach(step => {
                const output = stepData[step.id]?.output;
                if (output) rawOutputsFolder.file(`step_${step.id}_${step.title.replace(/\s+/g, '_')}.md`, output);
            });

            if (experimentalData) projectFolder.file('experimental_data/data.csv', experimentalData);

            if (charts.length > 0) {
                const vizFolder = projectFolder.folder('visualizations');
                for (let i = 0; i < charts.length; i++) {
                    const chart = charts[i];
                    if (chart.imageData) {
                        const filename = `chart_${i + 1}_${(chart.title || 'Untitled').replace(/[^\w.-]/g, '_')}.png`;
                        vizFolder.file(filename, chart.imageData, { base64: true });
                    }
                }
            }
            
            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${experimentTitle.replace(/\s+/g, '_')}_project_archive.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            addToast('Project archive downloaded!', 'success');
        } catch (error) {
            console.error("Failed to create zip file:", error);
            addToast(`Failed to create zip file: ${error.message}`, 'danger');
        }
    };

    const handleDownloadRawOutput = (stepId, stepTitle) => {
        const content = stepData[stepId]?.output;
        if (!content) return;
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `raw_output_step_${stepId}_${stepTitle.replace(/\s+/g, '_')}.txt`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleDownloadData = () => {
        if (!experimentalData) return;
        const blob = new Blob([experimentalData], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `experimental_data.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleDownloadChart = async (chartIndex) => {
        try {
            const chart = charts[chartIndex];
            if (!chart || !chart.imageData) throw new Error("Image data not found.");
            const dataUrl = `data:image/png;base64,${chart.imageData}`;
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `visualization_${chartIndex + 1}_${(chart.title || 'Untitled').replace(/[^\w.-]/g, '_')}.png`;
            link.click();
        } catch (e) { addToast("Failed to download chart image.", 'danger'); }
    };

    return (
        <div className="p-3 completion-view-wrapper">
            <div className="text-center mb-4">
                <i className="bi bi-award-fill" style={{fontSize: '3rem', color: 'var(--primary-glow)'}}></i>
                <h3 className="mt-3">Research Project Complete</h3>
                <p className="text-white-50">Congratulations on completing your project. Review and download your assets below.</p>
            </div>
            
            <div className="card mb-4">
                <div className="card-body d-flex justify-content-center align-items-center gap-3 flex-wrap p-3">
                    <button className="btn btn-primary" onClick={handleDownloadAll}><i className="bi bi-file-zip-fill me-2"></i> Download All (.zip)</button>
                    <div className="btn-group">
                        <button type="button" className="btn btn-secondary dropdown-toggle" data-bs-toggle="dropdown" disabled={!publicationText}><i className="bi bi-download me-2"></i> Download Paper</button>
                        <ul className="dropdown-menu dropdown-menu-end">
                            <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); handleDownloadPaper('md'); }}>Markdown (.md)</a></li>
                            <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); handleDownloadPaper('txt'); }}>Plain Text (.txt)</a></li>
                            <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); handleDownloadPaper('doc'); }}>Word Document (.doc)</a></li>
                            <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); handleDownloadPaper('pdf'); }}>PDF (Print)</a></li>
                        </ul>
                    </div>
                </div>
            </div>

            <ul className="nav nav-tabs" id="completionTabs" role="tablist">
                <li className="nav-item" role="presentation"><button className="nav-link active" id="pub-tab" data-bs-toggle="tab" data-bs-target="#pub-pane">Publication</button></li>
                <li className="nav-item" role="presentation"><button className="nav-link" id="explain-tab" data-bs-toggle="tab" data-bs-target="#explain-pane">Explain</button></li>
                <li className="nav-item" role="presentation"><button className="nav-link" id="raw-tab" data-bs-toggle="tab" data-bs-target="#raw-pane">Raw Outputs</button></li>
                <li className="nav-item" role="presentation"><button className="nav-link" id="data-tab" data-bs-toggle="tab" data-bs-target="#data-pane">Experimental Data</button></li>
                <li className="nav-item" role="presentation"><button className="nav-link" id="viz-tab" data-bs-toggle="tab" data-bs-target="#viz-pane">Visualizations</button></li>
            </ul>
            
            <div className="tab-content card" id="completionTabsContent">
                <div className="tab-pane fade show active" id="pub-pane" role="tabpanel">
                     {publicationText ? <div className="p-3"><FinalPublicationView publicationText={publicationText} showRegenerate={false} onRegenerate={() => {}} /></div> : <div className="alert alert-warning m-3">The final publication draft has not been generated yet.</div>}
                </div>
                <div className="tab-pane fade" id="explain-pane" role="tabpanel">
                    <div className="p-3">
                        {isGenerating ? (
                            <div className="text-center p-5">
                                <div className="spinner-border mb-3" role="status"></div>
                                <h5>AI is generating the explanation...</h5>
                            </div>
                        ) : explanationText ? (
                            <div className="generated-text-container" dangerouslySetInnerHTML={{ __html: renderMarkdown(explanationText) }}></div>
                        ) : (
                            <div className="text-center p-5">
                                <h5 className="fw-bold">Explain This Paper</h5>
                                <p className="text-white-50">Generate a plain-English summary of the final paper, written at a 12th-grade reading level with minimal jargon.</p>
                                <button className="btn btn-primary" onClick={handleGenerateExplanation} disabled={!publicationText}>
                                    <i className="bi bi-stars me-1"></i> Generate Explanation
                                </button>
                                {!publicationText && <p className="text-warning small mt-2">The publication must be generated first.</p>}
                            </div>
                        )}
                    </div>
                </div>
                <div className="tab-pane fade" id="raw-pane" role="tabpanel">
                     <div className="accordion accordion-flush p-3" id="rawOutputsAccordion">
                        {WORKFLOW_STEPS.map(step => (
                            <div className="accordion-item bg-transparent" key={step.id}>
                                <h2 className="accordion-header"><button className="accordion-button collapsed bg-transparent text-white" type="button" data-bs-toggle="collapse" data-bs-target={`#collapse-raw-${step.id}`}>{step.id}. {step.title}</button></h2>
                                <div id={`collapse-raw-${step.id}`} className="accordion-collapse collapse" data-bs-parent="#rawOutputsAccordion">
                                    <div className="accordion-body">
                                        {stepData[step.id]?.output ? <>
                                            <button className="btn btn-sm btn-outline-secondary float-end mb-2" onClick={() => handleDownloadRawOutput(step.id, step.title)}><i className="bi bi-download me-1"></i> Download</button>
                                            <pre className="p-2 bg-dark text-white rounded small" style={{whiteSpace: 'pre-wrap'}}><code>{stepData[step.id].output}</code></pre>
                                        </> : <p className="text-white-50">No output for this step.</p>}
                                    </div>
                                </div>
                            </div>
                        ))}
                     </div>
                </div>
                <div className="tab-pane fade p-3" id="data-pane" role="tabpanel">
                    {experimentalData ? <>
                        <button className="btn btn-sm btn-outline-secondary float-end mb-2" onClick={handleDownloadData}><i className="bi bi-download me-1"></i> Download CSV</button>
                        <h5 className="mb-2">Raw Experimental Data</h5>
                        <textarea className="form-control" readOnly rows={15} value={experimentalData}></textarea>
                    </> : <div className="alert alert-info">No experimental data was generated or uploaded for this project.</div>}
                </div>
                <div className="tab-pane fade p-3" id="viz-pane" role="tabpanel">
                    {charts.length > 0 ? (
                        <div className="row">
                            {charts.map((chart, index) => (
                                <div className="col-lg-6 mb-3" key={index}>
                                    <div className="card h-100">
                                        <div className="card-header fw-bold">{chart.title}</div>
                                        <div className="card-body d-flex align-items-center justify-content-center p-2" style={{minHeight: '300px'}}>
                                             <img
                                                src={`data:image/png;base64,${chart.imageData}`}
                                                alt={chart.title}
                                                style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain' }}
                                            />
                                        </div>
                                        <div className="card-footer bg-transparent text-end">
                                            <button className="btn btn-sm btn-secondary" onClick={() => handleDownloadChart(index)}><i className="bi bi-image me-1"></i> Download PNG</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : <div className="alert alert-info">No visualizations were generated for this project.</div>}
                </div>
            </div>
        </div>
    );
};