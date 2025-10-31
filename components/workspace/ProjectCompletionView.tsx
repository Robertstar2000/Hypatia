
import React from 'react';
import { useExperiment } from '../../context/ExperimentContext';
import { WORKFLOW_STEPS } from '../../config';
import { marked } from 'marked';
import { FinalPublicationView } from '../steps/PublicationExporter';

export const ProjectCompletionView = () => {
    const { activeExperiment } = useExperiment();
    
    const publicationText = activeExperiment?.stepData[10]?.output;
    const stepData = activeExperiment?.stepData;

    if (!activeExperiment) {
        return <div>Loading...</div>;
    }
    
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
                            experimentTitle={activeExperiment.title}
                            experimentId={activeExperiment.id}
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
                                            <div className="generated-text-container" dangerouslySetInnerHTML={{ __html: marked(summary) }}></div>
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
