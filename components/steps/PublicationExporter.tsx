
import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import { Chart } from 'chart.js';
import { useExperiment } from '../../context/ExperimentContext';
import { useToast } from '../../toast';
import { getStepContext, getPromptForStep, parseGeminiError } from '../../be_gemini';
import { AgenticAnalysisView } from '../common/AgenticAnalysisView';
import { ensureChartStyling } from '../../utils/chartUtils';

export const FinalPublicationView = ({ publicationText, experimentTitle, experimentId, onRegenerate, showRegenerate = true }) => {
    const { addToast } = useToast();
    const contentRef = useRef(null);

    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.innerHTML = marked(publicationText);
        }
    }, [publicationText]);

    const handleDownload = (format: 'md' | 'doc' | 'pdf' | 'txt') => {
        if (format === 'pdf') {
            addToast("Preparing a print-friendly view...", "info");
            const printContent = marked(publicationText);
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                addToast("Could not open a new window. Please check your browser's pop-up blocker.", 'warning');
                return;
            }
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Print - ${experimentTitle}</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 20px auto; }
                        h1, h2, h3, h4 { color: #000; }
                        pre, code { background-color: #f4f4f4; padding: 2px 4px; border-radius: 4px; font-family: monospace; }
                        pre { padding: 1em; overflow: auto; }
                        img { max-width: 100%; height: auto; }
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
        let filename = `${experimentTitle.replace(/ /g, '_')}_${experimentId}`;
        if (format === 'doc') {
            const htmlContent = `
                <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
                <head><meta charset='utf-8'><title>${experimentTitle}</title></head>
                <body>${marked(publicationText)}</body>
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
    const [isLoading, setIsLoading] = useState(false);
    const [agenticRun, setAgenticRun] = useState({ logs: [], status: 'idle', iterations: 0 });
    const stepData = activeExperiment.stepData[10] || {};
    const publicationText = stepData.output || '';

    const handleManualGenerate = async (regenerateFeedback = '') => {
        setIsLoading(true);
        try {
            const context = getStepContext(activeExperiment, 10);
            const { basePrompt, config } = getPromptForStep(10, '', context, activeExperiment.fineTuneSettings[10], regenerateFeedback);
            const stream = await gemini.models.generateContentStream({ model: 'gemini-2.5-flash', contents: basePrompt, config });
            let buffer = '';
            for await (const chunk of stream) {
                buffer += chunk.text;
                updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, 10: { ...stepData, output: buffer } } });
            }
        } catch (error) {
            addToast(parseGeminiError(error), 'danger');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleAgenticGeneration = async () => {
        setIsLoading(true);
        setAgenticRun({ logs: [], status: 'running', iterations: 0 });
        let currentDraft = '';

        try {
            const addLog = (agent, message) => setAgenticRun(prev => ({ ...prev, logs: [...prev.logs, { agent, message }] }));

            // 1. Get Context
            const initialContext = getStepContext(activeExperiment, 10);
            addLog('System', 'Project context compiled.');

            // 2. Author Agent
            setAgenticRun(prev => ({ ...prev, iterations: 1 }));
            addLog('Author', 'Drafting initial paper...');
            const authorPrompt = `You are the Author agent. Based on the following project log, write the complete content for a scientific paper in Markdown format, including all sections from Abstract to Conclusion. The paper should be written for an expert audience in ${initialContext.experimentField}. It is of **critical importance** that when you write the 'Discussion' section, you MUST explicitly and thoroughly address the feedback provided in the 'Peer Review Simulation' (Step 9) of the log. Explain in detail how the research accounts for or counters the critiques. Your source material is this project log:\n\n${initialContext.full_project_summary_log}`;
            const authorResponse = await gemini.models.generateContent({ model: 'gemini-flash-lite-latest', contents: authorPrompt });
            currentDraft = authorResponse.text;
            addLog('Author', 'Initial draft complete.');

            // 3. Editor Agent
            setAgenticRun(prev => ({ ...prev, iterations: 2 }));
            addLog('Editor', 'Reviewing and editing draft...');
            const editorPrompt = `You are the Editor agent, a meticulous proofreader and scientific editor. You will be given a draft written by the Author agent and the full project log for context. Your job is to improve the draft by correcting grammar, enhancing clarity, and ensuring a formal, academic tone. **YOUR MOST IMPORTANT TASK:** Rigorously verify that the Author has adequately addressed all points from the simulated peer review (Step 9) within the 'Discussion' section. If the response is weak, evasive, or missing, you MUST revise it to be more robust and scientifically sound. Your output must be ONLY the full, corrected Markdown text of the paper.`;
            const editorResponse = await gemini.models.generateContent({ model: 'gemini-flash-lite-latest', contents: `${editorPrompt}\n\nProject Log:\n${initialContext.full_project_summary_log}\n\nAuthor's Draft:\n${currentDraft}` });
            currentDraft = editorResponse.text;
            addLog('Editor', 'Editing complete.');

            // 4. Formatter & Chart Placer Agent
            setAgenticRun(prev => ({ ...prev, iterations: 3 }));
            addLog('Formatter', 'Formatting and embedding chart placeholders...');
            const analysisData = JSON.parse(activeExperiment.stepData[7]?.output || '{}');
            const charts = analysisData.chartSuggestions || [];
            
            if (charts.length > 0) {
                const generateAndEmbedCharts = async (text, chartConfigs) => {
                    let newText = text;
                    const chartPromises = chartConfigs.map(async (config, index) => {
                        const canvas = document.createElement('canvas');
                        canvas.width = 800;
                        canvas.height = 450;
                        const styledConfig = ensureChartStyling(config);
                        new Chart(canvas, styledConfig);
                        // Wait for chart to render
                        await new Promise(resolve => setTimeout(resolve, 500));
                        return { dataUrl: canvas.toDataURL('image/png'), index };
                    });
                    
                    const dataUrls = await Promise.all(chartPromises);

                    dataUrls.forEach(({ dataUrl, index }) => {
                        const placeholder = `[CHART_${index + 1}]`;
                        const imgTag = `<img src="${dataUrl}" alt="Chart ${index + 1}" style="max-width: 80%; height: auto; display: block; margin: 1rem auto;" />`;
                        newText = newText.replace(placeholder, imgTag);
                    });
                    return newText;
                };

                const placeholderPrompt = `You are the Formatter agent. The user's research paper draft is below. Your task is to identify the best places in the 'Results' section to insert placeholders for ${charts.length} chart(s). Use the format [CHART_1], [CHART_2], etc. Do not add captions. Only output the modified Markdown text.\n\nDraft:\n${currentDraft}`;
                const placeholderResponse = await gemini.models.generateContent({ model: 'gemini-flash-lite-latest', contents: placeholderPrompt });
                currentDraft = await generateAndEmbedCharts(placeholderResponse.text, charts);

            }
            addLog('Formatter', 'Final document prepared.');
            setAgenticRun(prev => ({ ...prev, status: 'success', iterations: 4 }));
        
        } catch (error) {
            addToast(parseGeminiError(error, "Agentic generation failed."), 'danger');
            setAgenticRun(prev => ({ ...prev, status: 'failed' }));
        } finally {
            if (currentDraft) {
                updateExperiment({ ...activeExperiment, stepData: { ...activeExperiment.stepData, 10: { ...stepData, output: currentDraft } } });
            }
            setIsLoading(false);
        }
    };
    
    if (isLoading) {
        return <AgenticAnalysisView agenticRun={{...agenticRun, maxIterations: 4}} />;
    }

    if (!publicationText) {
        return (
            <div className="text-center p-5">
                <h5 className="fw-bold">Ready to Assemble Your Publication</h5>
                <p className="text-white-50">Choose a method to generate your final paper.</p>
                <div className="d-flex justify-content-center gap-2">
                    <button className="btn btn-primary" onClick={() => handleManualGenerate()}>
                        <i className="bi bi-person-fill me-1"></i> Manual Generation
                    </button>
                    <button className="btn btn-secondary" onClick={handleAgenticGeneration}>
                        <i className="bi bi-robot me-1"></i> Use Agentic Workflow
                    </button>
                </div>
            </div>
        );
    }
    
    return (
        <FinalPublicationView 
            publicationText={publicationText} 
            experimentTitle={activeExperiment.title}
            experimentId={activeExperiment.id}
            onRegenerate={handleAgenticGeneration}
        />
    );
};
