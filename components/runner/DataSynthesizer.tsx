
import React, { useState } from 'react';
import { useExperiment } from '../../context/ExperimentContext';
import { useToast } from '../../toast';
import { parseGeminiError } from '../../be_gemini';

export const DataSynthesizer = ({ onComplete, context }) => {
    const { gemini } = useExperiment();
    const [result, setResult] = useState<{ summary: string, csv: string } | null>(null);
    const [isSynthesizing, setIsSynthesizing] = useState(false);
    const { addToast } = useToast();

    const handleSynthesize = async () => {
        if (!gemini) return;
        setIsSynthesizing(true);
        setResult(null);

        const prompt = `Based on the methodology summary: "${context.methodology_summary}" and data plan summary: "${context.data_collection_plan_summary}", generate a plausible, estimated, synthetic dataset in CSV format. Output ONLY the CSV data and a brief, one-sentence summary of what the data represents. Separate the summary and the CSV data with '---'.`;
        
        try {
            const response = await gemini.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            const [summary, csv] = response.text.split('---').map(s => s.trim());
            if (!summary || !csv) throw new Error("AI response format was incorrect.");
            setResult({ summary, csv });
            addToast("AI has generated a synthetic dataset.", "success");
        } catch (err) {
            addToast(parseGeminiError(err, "Data synthesis failed."), "danger");
        } finally {
            setIsSynthesizing(false);
        }
    };

    return (
        <div className="text-center">
            <h6 className="fw-bold">AI-Powered Data Synthesis</h6>
            <p className="text-white-50">The AI will estimate results based on your research plan and generate a synthetic dataset for analysis.</p>
            <button className="btn btn-primary" onClick={handleSynthesize} disabled={isSynthesizing}>
                {isSynthesizing ? <><span className="spinner-border spinner-border-sm me-2"></span>Generating...</> : <><i className="bi bi-stars me-1"></i> Generate Synthetic Dataset</>}
            </button>
            
            {result && (
                <div className="mt-4 text-start">
                    <div className="card">
                        <div className="card-header fw-bold">Generated Result</div>
                        <div className="card-body">
                            <p className="card-text"><strong>Summary:</strong> {result.summary}</p>
                            <h6 className="fw-bold">Data Preview:</h6>
                            <textarea className="form-control" readOnly rows={8} value={result.csv} />
                            <button className="btn btn-success mt-3" onClick={() => onComplete(result.csv, result.summary)}>
                                Use This Data and Complete Step
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
