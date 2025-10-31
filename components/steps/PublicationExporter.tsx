
import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import {
    Chart,
    LineController,
    BarController,
    LineElement,
    BarElement,
    PointElement,
    CategoryScale,
    LinearScale,
    Legend,
    Tooltip,
    Title
} from 'chart.js';
import { useExperiment } from '../../context/ExperimentContext';
import { useToast } from '../../toast';
import { runPublicationAgent, parseGeminiError } from '../../be_gemini';
import { AgenticAnalysisView } from '../common/AgenticAnalysisView';
import { ensureChartStyling } from '../../utils/chartUtils';

// Register all the necessary components for Chart.js
Chart.register(
    LineController,
    BarController,
    LineElement,
    BarElement,
    PointElement,
    CategoryScale,
    LinearScale,
    Legend,
    Tooltip,
    Title
);

export const FinalPublicationView = ({ publicationText, onRegenerate, showRegenerate = true }) => {
    const { addToast } = useToast();
    const { activeExperiment } = useExperiment();
    const contentRef = useRef(null);

    useEffect(() => {
        const renderContent = async () => {
            if (!publicationText || !contentRef.current) return;
    
            contentRef.current.innerHTML = "Processing document and rendering charts...";
    
            let processedText = publicationText;
            const chartPlaceholders = publicationText.match(/\[CHART_(\d+):([\s\S]*?)\]/g) || [];
            
            if (chartPlaceholders.length > 0) {
                const analysisData = JSON.parse(activeExperiment.stepData[7]?.output || '{}');
                const chartConfigs = analysisData.chartSuggestions || [];
    
                for (const placeholder of chartPlaceholders) {
                    const match = placeholder.match(/\[CHART_(\d+):([\s\S]*?)\]/);
                    if (!match) continue;
    
                    const chartIndex = parseInt(match[1], 10) - 1;
                    const caption = match[2];
    
                    if (chartConfigs[chartIndex]) {
                        const canvas = document.createElement('canvas');
                        canvas.width = 800;
                        canvas.height = 450;
                        document.body.appendChild(canvas);
                        canvas.style.display = 'none';

                        try {
                            const dataUrl = await new Promise((resolve, reject) => {
                                try {
                                    const chartConfig = chartConfigs[chartIndex];
                                    const styledConfig = ensureChartStyling(chartConfig);
        
                                    // Inject onComplete callback to know when rendering is done
                                    styledConfig.options.animation = {
                                        ...(styledConfig.options.animation || {}),
                                        onComplete: (context) => {
                                            resolve(context.chart.toBase64Image('image/png'));
                                        },
                                    };
                                    new Chart(canvas, styledConfig);
                                } catch (e) {
                                    reject(e);
                                }
                            });
    
                            const imgTag = `<figure style="text-align: center;"><img src="${dataUrl}" alt="${caption}" style="max-width: 80%; height: auto; display: block; margin: 1rem auto;" /><figcaption style="font-size: 0.9em; color: #aaa; margin-top: 0.5em;">${caption}</figcaption></figure>`;
                            processedText = processedText.replace(placeholder, imgTag);
                        } catch (e) {
                             console.error("Chart rendering for placeholder failed:", placeholder, e);
                             processedText = processedText.replace(placeholder, `<p class="text-danger">[Error rendering chart: ${e.message}]</p>`);
                        } finally {
                            canvas.remove();
                        }
                    } else {
                         processedText = processedText.replace(placeholder, `<p class="text-warning">[Chart data for placeholder not found.]</p>`);
                    }
                }
            }
    
            contentRef.current.innerHTML = marked(processedText);
        };
    
        renderContent();
    }, [publicationText, activeExperiment]);
    

    const handleDownload = (format: 'md' | 'doc' | 'pdf' | 'txt') => {
        const { title, id } = activeExperiment;
        if (format === 'pdf') {
            addToast("Preparing a print-friendly view...", "info");
            const printContent = contentRef.current.innerHTML;
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                addToast("Could not open a new window. Please check your browser's pop-up blocker.", 'warning');
                return;
            }
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Print - ${title}</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 20px auto; }
                        h1, h2, h3, h4 { color: #000; }
                        pre, code { background-color: #f4f4f4; padding: 2px 4px; border-radius: 4px; font-family: monospace; }
                        pre { padding: 1em; overflow: auto; }
                        img { max-width: 100%; height: auto; }
                        figure { page-break-inside: avoid; }
                    </style>
                </head>
                <body>
                    ${printContent}
                    <script>
                        setTimeout(() => {
                            window.print();
                            window.close();
                        }, 500);
                    </script>
                </body>
                </html>
            `);
            printWindow.document.close();
            return;
        }

        let blob;
        let filename = `${title.replace(/ /g, '_')}_${id}`;
        if (format === 'doc') {
            const htmlContent = `
                <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
                <head><meta charset='utf-8'><title>${title}</title></head>
                <body>${contentRef.current.innerHTML}</body>
                </html>`;
            blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
            filename += '.doc';
        } else {
            const content = format === 'md' ? publicationText : contentRef.current?.innerText || publicationText;
            blob = new Blob([content], { type: 'text/plain' });
            filename += `.${format}`;
        }
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div>
            <div className="d-flex justify-content-end mb-2">
                {showRegenerate && 
                    <button className="btn btn-sm btn-outline-secondary me-auto" onClick={onRegenerate}>
                        <i className="bi bi-arrow-clockwise me-1"></i> Regenerate with Agents
                    </button>
                }
                <div className="btn-group">
                    <button type="button" className="btn btn-sm btn-secondary dropdown-toggle" data-bs-toggle="dropdown">
                       <i className="bi bi-download me-1"></i> Download As
                    </button>
                    <ul className="dropdown-menu dropdown-menu-end">
                        <li><a className="dropdown-item" href="#" onClick={() => handleDownload('md')}>Markdown (.md)</a></li>
                        <li><a className="dropdown-item" href="#" onClick={() => handleDownload('txt')}>Plain Text (.txt)</a></li>
                        <li><a className="dropdown-item" href="#" onClick={() => handleDownload('doc')}>Word Document (.doc)</a></li>
                         <li><a className="dropdown-item" href="#" onClick={() => handleDownload('pdf')}>PDF (Print)</a></li>
                    </ul>
                </div>
            </div>
            <div ref={contentRef} className="generated-text-container" style={{ minHeight: '50vh' }}>
                {/* Content is rendered here via useEffect */}
            </div>
        </div>
    );
};

export const PublicationExporter = () => {
    const { activeExperiment, updateExperiment, gemini } = useExperiment();
    const { addToast } = useToast();
    const [agenticRun, setAgenticRun] = useState({ logs: [], status: 'idle', iterations: 0 });
    const stepData = activeExperiment.stepData[10] || {};
    const publicationText = stepData.output || '';

    const startPublicationGeneration = async () => {
        if (agenticRun.status === 'running') return;

        setAgenticRun({ logs: [], status: 'running', iterations: 0 });

        try {
            const finalDoc = await runPublicationAgent({
                experiment: activeExperiment,
                gemini,
                updateLog: (agent, message) => {
                    setAgenticRun(prev => ({ ...prev, logs: [...prev.logs, { agent, message }] }));
                }
            });
            updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, 10: { ...stepData, output: finalDoc } } });
            setAgenticRun(prev => ({ ...prev, status: 'success' }));
            addToast("Publication generated successfully!", "success");

        } catch (error) {
            addToast(parseGeminiError(error, "Agentic publication generation failed."), 'danger');
            setAgenticRun(prev => ({ ...prev, status: 'failed' }));
        }
    };
    
    if (agenticRun.status === 'running') {
        return <AgenticAnalysisView agenticRun={{...agenticRun, maxIterations: 7}} />;
    }

    if (!publicationText) {
        return (
            <div className="text-center p-5">
                <h5 className="fw-bold">Assemble Your Publication</h5>
                <p className="text-white-50">Use the agentic workflow to build your final paper. The AI will outline, write, and format the entire document, including charts and references.</p>
                <div className="d-flex justify-content-center gap-2">
                    <button className="btn btn-primary" onClick={startPublicationGeneration}>
                        <i className="bi bi-robot me-1"></i> Generate Publication with Agents
                    </button>
                </div>
            </div>
        );
    }
    
    return (
        <FinalPublicationView 
            publicationText={publicationText}
            onRegenerate={startPublicationGeneration}
        />
    );
};
