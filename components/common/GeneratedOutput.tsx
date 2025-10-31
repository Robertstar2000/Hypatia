
import React, { useState, useEffect } from 'react';
import { marked } from 'marked';
import { useExperiment } from '../../context/ExperimentContext';
import { useToast } from '../../toast';
import { UniquenessMeter } from './UniquenessMeter';
import { DataAnalysisView } from './DataAnalysisView';

export const GeneratedOutput: React.FC<{
    stepId: number;
    onGenerate: (regenerateFeedback?: string) => Promise<void>;
    isLoading: boolean;
}> = ({ stepId, onGenerate, isLoading }) => {
    const { activeExperiment, updateExperiment } = useExperiment();
    const { addToast } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState('');
    const [showRegenInput, setShowRegenInput] = useState(false);
    const [regenFeedback, setRegenFeedback] = useState('');

    const stepData = activeExperiment.stepData[stepId] || {};
    const output = stepData.output || '';

    useEffect(() => {
        setEditText(output);
    }, [output]);

    const handleSave = () => {
        const updatedStepData = { ...activeExperiment.stepData,
            [stepId]: { ...stepData, output: editText }
        };
        // Use the context update function to ensure data is persisted
        updateExperiment({ ...activeExperiment, stepData: updatedStepData });
        setIsEditing(false);
        addToast("Changes saved.", "success");
    };

    const handleRegenerate = () => {
        onGenerate(regenFeedback);
        setShowRegenInput(false);
        setRegenFeedback('');
    }

    const jsonParser = (text) => {
        let data;
        try {
            const sanitizedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            if (!sanitizedText) throw new Error("AI response was empty.");
            if (!sanitizedText.startsWith('{') || !sanitizedText.endsWith('}')) {
                 throw new Error("Sanitized text is not a JSON object.");
            }
            data = JSON.parse(sanitizedText);
            
            // Step 1: Research Question
            if (stepId === 1 && data.research_question && data.uniqueness_score !== undefined) {
                 return (
                    <div>
                        <div dangerouslySetInnerHTML={{ __html: marked(data.research_question) }} />
                        <UniquenessMeter score={data.uniqueness_score} justification={data.justification} />
                    </div>
                );
            }

            // Step 2: Literature Review
            if (stepId === 2 && data.summary && Array.isArray(data.references)) {
                return (
                    <div>
                        <div className="generated-text-container" dangerouslySetInnerHTML={{ __html: marked(data.summary) }} />
                        <h5 className="mt-4">References</h5>
                        <ul className="reference-list">
                            {data.references.map((ref, i) => (
                                <li key={i} className="reference-item">
                                    <div className="reference-title">{ref.title}</div>
                                    <div className="reference-meta">
                                        <em>{ref.authors.join(', ') || 'N/A'}</em> ({ref.year || 'N/A'}). {ref.journal || ''}
                                        {ref.url && <a href={ref.url} target="_blank" rel="noopener noreferrer" className="ms-2">[Source]</a>}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            }

            // Step 7: Data Analyzer (Robust parsing)
            if (stepId === 7) {
                 const summary = data.summary || '';
                 const chartSuggestions = (Array.isArray(data.chartSuggestions) ? data.chartSuggestions : [])
                    .filter(c => c && typeof c === 'object' && c.type && c.data && Array.isArray(c.data.datasets));
                 
                 if (!summary && chartSuggestions.length === 0) {
                    throw new Error("Parsed JSON for Step 7 is missing both 'summary' and 'chartSuggestions'.");
                 }
                 
                 const hadChartsInitially = Array.isArray(data.chartSuggestions) && data.chartSuggestions.length > 0;
                 const hasValidCharts = chartSuggestions.length > 0;

                 return (
                     <div>
                         {hadChartsInitially && !hasValidCharts &&
                             <div className="alert alert-info small mb-3">
                                 The AI suggested visualizations, but they were in an invalid format and could not be rendered. The summary is displayed below.
                             </div>
                         }
                         <DataAnalysisView analysisData={{ summary, chartSuggestions }} />
                     </div>
                 );
            }
            throw new Error("JSON format is valid, but does not match expected structure for this step.");
        } catch (error) {
            console.error("JSON Parse Error:", error);
            // Fallback for ANY error: render raw text with a warning. This prevents getting stuck.
            return (
                <div>
                    <div className="alert alert-warning">
                        <p className="fw-bold">AI response could not be parsed as structured data.</p>
                        <p className="small mb-1">You can still review the raw text below and complete the step. The raw text will be used as the step's output.</p>
                    </div>
                    <pre className="p-2 bg-dark text-white rounded small" style={{whiteSpace: 'pre-wrap'}}><code>{text}</code></pre>
                </div>
            );
        }
    };

    if (isLoading) {
        return (
            <div className="text-center p-5">
                 <div className="spinner-border mb-3" role="status"></div>
                <h5>AI is generating content...</h5>
                <p className="text-white-50">This may take a moment, especially for complex steps.</p>
            </div>
        );
    }

    if (!output) {
        return (
            <div className="text-center p-5">
                <p>Ready to generate content for this step.</p>
                <button className="btn btn-primary" onClick={() => onGenerate()}>
                    <i className="bi bi-stars me-1"></i> Generate
                </button>
            </div>
        );
    }
    
    // Check if the output is meant to be JSON
    const expectJson = (stepId === 1 || stepId === 2 || stepId === 7);

    return (
        <div className="generated-text-container">
             <div className="edit-controls">
                {isEditing ? (
                    <>
                        <button className="btn btn-sm btn-success me-1" onClick={handleSave}><i className="bi bi-check-lg"></i></button>
                        <button className="btn btn-sm btn-secondary" onClick={() => setIsEditing(false)}><i className="bi bi-x-lg"></i></button>
                    </>
                ) : (
                    <>
                        <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => setShowRegenInput(p => !p)} title="Regenerate">
                           <i className="bi bi-arrow-clockwise"></i>
                        </button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => { setIsEditing(true); setEditText(output); }} title="Edit">
                            <i className="bi bi-pencil-square"></i>
                        </button>
                    </>
                )}
            </div>
             {showRegenInput && (
                <div className="input-group mb-3">
                    <input type="text" className="form-control" placeholder="Optional: Provide feedback for regeneration..." value={regenFeedback} onChange={e => setRegenFeedback(e.target.value)} />
                    <button className="btn btn-primary" onClick={handleRegenerate}>Regenerate</button>
                </div>
            )}
            {isEditing ? (
                 <textarea className="editable-textarea" value={editText} onChange={(e) => setEditText(e.target.value)} />
            ) : (
                expectJson ? jsonParser(output) : <div dangerouslySetInnerHTML={{ __html: marked(output) }} />
            )}
        </div>
    );
};
