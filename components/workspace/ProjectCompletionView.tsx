
import React from 'react';
import { useExperiment } from '../../context/ExperimentContext';
import { WORKFLOW_STEPS } from '../../config';
import { marked } from 'marked';
import { FinalPublicationView } from '../steps/PublicationExporter';
import { useToast } from '../../toast';
import { DataAnalysisView } from '../common/DataAnalysisView';

export const ProjectCompletionView = () => {
    const { activeExperiment } = useExperiment();
    const { addToast } = useToast();
    
    const publicationText = activeExperiment?.stepData[10]?.output;
    const stepData = activeExperiment?.stepData;

    if (!activeExperiment) {
        return <div>Loading...</div>;
    }

    const handleDownloadStep = (step: { id: number; title: string }, format: 'md' | 'txt') => {
        if (!activeExperiment) return;

        const content = activeExperiment.stepData[step.id]?.output;
        if (!content) {
            addToast('No full content to download for this step.', 'warning');
            return;
        }

        const { title: experimentTitle } = activeExperiment;
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const filename = `hypatia_${experimentTitle.replace(/\s+/g, '_')}_step${step.id}_${step.title.replace(/\s+/g, '_')}.${format}`;
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        addToast(`Step ${step.id} content downloaded as .${format}`, 'success');
    };
    
    return (
        <div className="p-3">
            <div className="text-center mb-5">
                <i className="bi bi-award-fill" style={{fontSize: '3rem', color: 'var(--primary-glow)'}}></i>
                <h3 className="mt-3">Research Project Complete!</h3>
                <p className="text-white-50">Congratulations on completing all 10 steps of your research project. You can review the final paper and project log below.</p>
            </div>

            <ul className="nav nav-tabs" id="completionTabs" role="tablist">
                <li className="nav-item" role="presentation">
                    <button className="nav-link active" id="paper-tab" data-bs-toggle="tab" data-bs-target="#paper-tab-pane" type="button" role="tab">Final Paper</button>
                </li>
                <li className="nav-item" role="presentation">
                    <button className="nav-link" id="log-tab" data-bs-toggle="tab" data-bs-target="#log-tab-pane" type="button" role="tab">Project Log</button>
                </li>
            </ul>
            <div className="tab-content" id="completionTabsContent">
                <div className="tab-pane fade show active p-3" id="paper-tab-pane" role="tabpanel">
                    {publicationText ? (
                        <FinalPublicationView
                            publicationText={publicationText}
                            onRegenerate={() => {}}
                            showRegenerate={false}
                        />
                    ) : (
                        <div className="alert alert-warning">The final publication draft has not been generated yet. Please complete Step 10.</div>
                    )}
                </div>
                <div className="tab-pane fade p-3" id="log-tab-pane" role="tabpanel">
                    <div className="accordion" id="projectLogAccordion">
                        {WORKFLOW_STEPS.map(step => {
                            const data = stepData && stepData[step.id];
                            const summary = data?.summary || data?.output || 'No output for this step.';
                            const hasContent = !!data?.output;

                            const renderBody = () => {
                                if (!hasContent) return <p>No output for this step.</p>;

                                // For Step 7, try to render the full chart view
                                if (step.id === 7) {
                                    try {
                                        const analysisData = JSON.parse(data.output);
                                        return <DataAnalysisView analysisData={analysisData} />;
                                    } catch (e) {
                                        // Fallback to summary if parsing fails
                                        return <div className="generated-text-container" dangerouslySetInnerHTML={{ __html: marked(summary) }}></div>;
                                    }
                                }
                                
                                // For all other steps, render the summary
                                return <div className="generated-text-container" dangerouslySetInnerHTML={{ __html: marked(summary) }}></div>;
                            };

                            return (
                                <div className="accordion-item bg-dark" key={step.id}>
                                    <h2 className="accordion-header">
                                        <button 
                                            className="accordion-button collapsed bg-transparent text-white" 
                                            type="button" 
                                            data-bs-toggle="collapse" 
                                            data-bs-target={`#collapse${step.id}`}
                                            disabled={!hasContent}
                                        >
                                           <i className={`bi ${hasContent ? 'bi-check-circle-fill text-success' : 'bi-circle'} me-2`}></i>
                                           Step {step.id}: {step.title}
                                        </button>
                                    </h2>
                                    <div id={`collapse${step.id}`} className="accordion-collapse collapse" data-bs-parent="#projectLogAccordion">
                                        <div className="accordion-body">
                                            {hasContent && (
                                                <div className="text-end mb-2">
                                                    <div className="btn-group">
                                                        <button type="button" className="btn btn-sm btn-secondary dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                                                            <i className="bi bi-download me-1"></i> Download Output
                                                        </button>
                                                        <ul className="dropdown-menu dropdown-menu-end">
                                                            <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); handleDownloadStep(step, 'md'); }}>Markdown (.md)</a></li>
                                                            <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); handleDownloadStep(step, 'txt'); }}>Plain Text (.txt)</a></li>
                                                        </ul>
                                                    </div>
                                                </div>
                                            )}
                                            {renderBody()}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
