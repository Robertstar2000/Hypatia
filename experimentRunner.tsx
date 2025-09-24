
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Experiment } from './config';
import { useToast } from './toast';
import { getStepContext } from './services';

interface ExperimentRunnerProps {
    experiment: Experiment;
    onExperimentUpdate: (updatedData: Partial<Experiment>, silent?: boolean) => void;
    onStepComplete: () => void;
    gemini: GoogleGenAI | null;
}

type ExperimentMode = 'simulate' | 'manual' | 'synthesize';

export const ExperimentRunner = ({ experiment, onExperimentUpdate, onStepComplete, gemini }: ExperimentRunnerProps) => {
    const [mode, setMode] = useState<ExperimentMode | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const { addToast } = useToast();

    const handleDataSubmission = (data: string, summary: string) => {
        const newStepData = {
            ...experiment.stepData,
            '6': { ...experiment.stepData['6'], output: summary },
            '7': { ...experiment.stepData['7'], input: data }
        };
        onExperimentUpdate({ stepData: newStepData }, true);
        addToast("Data submitted successfully! You can now complete this step.", "success");
        onStepComplete();
    };
    
    const context = useMemo(() => getStepContext(experiment, 6), [experiment]);

    if (isLoading) {
        return (
            <div className="text-center p-5">
                <div className="spinner-border mb-3" role="status"></div>
                <h5>Initializing Mode...</h5>
                <p className="text-white-50">The AI is preparing the workspace for you.</p>
            </div>
        );
    }
    
    if (!mode) {
        return (
            <ModeSelection onSelect={setMode} />
        );
    }

    return (
        <div>
            <button className="btn btn-sm btn-outline-secondary mb-3" onClick={() => setMode(null)}>
                <i className="bi bi-arrow-left me-1"></i> Change Data Generation Mode
            </button>
            {mode === 'simulate' && (
                <CodeSimulator 
                    experiment={experiment} 
                    onExperimentUpdate={onExperimentUpdate} 
                    onComplete={handleDataSubmission}
                    gemini={gemini}
                    context={context}
                />
            )}
            {mode === 'manual' && (
                <ManualDataEntry 
                    onComplete={handleDataSubmission}
                    gemini={gemini}
                    context={context}
                />
            )}
            {mode === 'synthesize' && (
                <DataSynthesizer 
                    onComplete={handleDataSubmission}
                    gemini={gemini}
                    context={context}
                />
            )}
        </div>
    );
};

const ModeSelection = ({ onSelect }) => (
    <div className="container">
        <div className="text-center mb-4">
            <h5 className="fw-bold">Choose Your Data Generation Method</h5>
            <p className="text-white-50">Select one of the following methods to provide data for your experiment.</p>
        </div>
        <div className="row g-3">
            <div className="col-md-4">
                <div className="card h-100 feature-card p-0">
                    <div className="card-body d-flex flex-column">
                        <div className="feature-icon"><i className="bi bi-code-slash"></i></div>
                        <h6 className="card-title fw-bold">AI-Generated Simulation</h6>
                        <p className="card-text small text-white-50 flex-grow-1">Have the AI write a JavaScript simulation based on your methodology. You can then run, debug, and edit the code to generate your dataset.</p>
                        <button className="btn btn-primary mt-auto" onClick={() => onSelect('simulate')}>Select Code Simulation</button>
                    </div>
                </div>
            </div>
            <div className="col-md-4">
                 <div className="card h-100 feature-card p-0">
                    <div className="card-body d-flex flex-column">
                        <div className="feature-icon"><i className="bi bi-table"></i></div>
                        <h6 className="card-title fw-bold">Manual Data Entry</h6>
                        <p className="card-text small text-white-50 flex-grow-1">The AI will create a data entry form based on your data collection plan. You can then manually input your results row by row.</p>
                        <button className="btn btn-primary mt-auto" onClick={() => onSelect('manual')}>Select Manual Entry</button>
                    </div>
                </div>
            </div>
            <div className="col-md-4">
                 <div className="card h-100 feature-card p-0">
                     <div className="card-body d-flex flex-column">
                        <div className="feature-icon"><i className="bi bi-magic"></i></div>
                        <h6 className="card-title fw-bold">AI Data Synthesis</h6>
                        <p className="card-text small text-white-50 flex-grow-1">Let the AI estimate and generate a complete, plausible dataset based on your experiment's context. Ideal for theoretical exploration.</p>
                        <button className="btn btn-primary mt-auto" onClick={() => onSelect('synthesize')}>Select AI Synthesis</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
);


const CodeSimulator = ({ experiment, onExperimentUpdate, onComplete, gemini, context }) => {
    const [code, setCode] = useState(experiment.simulationCode || '');
    const [isInitializing, setIsInitializing] = useState(false);
    const [isFixing, setIsFixing] = useState(false);
    const [output, setOutput] = useState<{logs: string[], error: string | null}>({ logs: [], error: null });
    const { addToast } = useToast();

    useEffect(() => {
        if (!experiment.simulationCode && gemini) {
            setIsInitializing(true);
            const prompt = `Based on the following methodology and data collection plan, write a JavaScript simulation. The code must use \`hypatia.finish(csvData, summary)\` to return its results. The data should be in CSV format. Output ONLY the raw JavaScript code without any explanations or markdown backticks.\n\nMethodology:\n${context.methodology}\n\nData Collection Plan:\n${context.data_collection_plan}`;
            
            gemini.models.generateContent({model: 'gemini-2.5-flash', contents: prompt})
                .then(response => {
                    const generatedCode = response.text.trim();
                    setCode(generatedCode);
                    onExperimentUpdate({ simulationCode: generatedCode }, true);
                })
                .catch(err => {
                    console.error("Code generation failed:", err);
                    addToast("AI failed to generate initial simulation code.", "danger");
                })
                .finally(() => setIsInitializing(false));
        }
    }, [gemini, context]);

    const handleCodeChange = (newCode: string) => {
        setCode(newCode);
        onExperimentUpdate({ simulationCode: newCode }, true);
    };

    const runCode = () => {
        setOutput({ logs: [], error: null });
        const logs: string[] = [];
        let finished = false;

        const hypatia = {
            finish: (data, summary) => {
                if (typeof data !== 'string' || typeof summary !== 'string') {
                    throw new Error("hypatia.finish() requires two string arguments: data (CSV format) and summary.");
                }
                logs.push(`✅ Simulation Finished. Data passed to next step.`);
                onComplete(data, summary);
                finished = true;
            }
        };

        const consoleProxy = { log: (...args) => logs.push(args.map(arg => String(arg)).join(' ')) };

        try {
            new Function('console', 'hypatia', code)(consoleProxy, hypatia);
            if (!finished) logs.push("🔵 Simulation ended without calling hypatia.finish().");
            setOutput({ logs, error: null });
        } catch (e) {
            setOutput({ logs, error: `[${e.name}] ${e.message}` });
        }
    };
    
     const handleAiFixCode = async () => {
        if (!gemini || !output.error) return;
        setIsFixing(true);
        const prompt = `Fix this JavaScript code. The error was: "${output.error}".\n\nCode:\n${code}\n\nReturn ONLY the corrected code.`;
        try {
            const response = await gemini.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            const fixedCode = response.text.trim();
            handleCodeChange(fixedCode);
            addToast("AI suggested a fix.", 'success');
            setOutput(prev => ({ ...prev, error: null }));
        } catch (err) { addToast("AI fix failed.", 'danger'); } finally { setIsFixing(false); }
    };

    if(isInitializing) return <div className="text-center p-4"><div className="spinner-border"></div><p className="mt-2">AI is writing your simulation code...</p></div>

    return (
        <div>
            <h6 className="fw-bold">AI-Generated Simulation Code</h6>
            <textarea className="form-control" id="code-editor" value={code} onChange={e => handleCodeChange(e.target.value)} rows={15} />
            <button className="btn btn-success mt-2" onClick={runCode}><i className="bi bi-play-fill me-1"></i> Run</button>
            <h6 className="fw-bold mt-3">Output</h6>
            <div className={`code-output ${output.error ? 'error' : ''}`}>
                {output.logs.map((log, i) => <div key={i}>{'>'} {log}</div>)}
                {output.error && (
                    <div className="d-flex justify-content-between align-items-center">
                        <span className="fw-bold">{output.error}</span>
                        <button className="btn btn-sm btn-warning" onClick={handleAiFixCode} disabled={isFixing}>{isFixing ? 'Fixing...' : 'Auto-Fix with AI'}</button>
                    </div>
                )}
            </div>
        </div>
    );
};

const ManualDataEntry = ({ onComplete, gemini, context }) => {
    const [columns, setColumns] = useState<string[]>([]);
    const [rows, setRows] = useState<Record<string, string>[]>([]);
    const [isInitializing, setIsInitializing] = useState(true);
    const { addToast } = useToast();

    useEffect(() => {
        if (gemini) {
            const prompt = `Based on the data collection plan: "${context.data_collection_plan}", generate a simple JSON object where keys are the column headers (as strings) and values are a suggested data type (e.g., 'number', 'string'). For example: {"time_seconds": "number", "temperature_celsius": "number"}. Output only the raw JSON.`;
            gemini.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config: { responseMimeType: "application/json" } })
                .then(response => {
                    const schema = JSON.parse(response.text);
                    const newColumns = Object.keys(schema);
                    setColumns(newColumns);
                    setRows([Object.fromEntries(newColumns.map(c => [c, '']))]);
                })
                .catch(err => {
                    addToast("AI failed to create a data entry form.", "danger");
                    setColumns(['Column 1', 'Column 2']); // Fallback
                    setRows([{'Column 1': '', 'Column 2': ''}]);
                })
                .finally(() => setIsInitializing(false));
        }
    }, [gemini, context]);

    const handleRowChange = (index, col, value) => {
        const newRows = [...rows];
        newRows[index][col] = value;
        setRows(newRows);
    };

    const addRow = () => setRows([...rows, Object.fromEntries(columns.map(c => [c, '']))]);
    const removeRow = (index) => setRows(rows.filter((_, i) => i !== index));

    const handleSubmit = () => {
        const header = columns.join(',');
        const body = rows.map(row => columns.map(col => `"${row[col].replace(/"/g, '""')}"`).join(',')).join('\n');
        const csvData = `${header}\n${body}`;
        onComplete(csvData, "Manually entered data.");
    };

    if (isInitializing) return <div className="text-center p-4"><div className="spinner-border"></div><p className="mt-2">AI is building your data entry form...</p></div>;

    return (
        <div>
             <h6 className="fw-bold">Manual Data Entry Form</h6>
             <div className="table-responsive">
                <table className="table table-bordered">
                    <thead>
                        <tr>
                            {columns.map(c => <th key={c}>{c}</th>)}
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                                {columns.map(col => (
                                    <td key={col}><input type="text" className="form-control" value={row[col]} onChange={e => handleRowChange(rowIndex, col, e.target.value)} /></td>
                                ))}
                                <td><button className="btn btn-sm btn-outline-danger" onClick={() => removeRow(rowIndex)}><i className="bi bi-trash"></i></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <button className="btn btn-secondary me-2" onClick={addRow}><i className="bi bi-plus-lg me-1"></i> Add Row</button>
            <button className="btn btn-success" onClick={handleSubmit}><i className="bi bi-check-circle-fill me-1"></i> Submit Data</button>
        </div>
    );
};

const DataSynthesizer = ({ onComplete, gemini, context }) => {
    const [result, setResult] = useState<{ summary: string, csv: string } | null>(null);
    const [isSynthesizing, setIsSynthesizing] = useState(false);
    const { addToast } = useToast();

    const handleSynthesize = async () => {
        if (!gemini) return;
        setIsSynthesizing(true);
        setResult(null);

        const prompt = `Based on the methodology: "${context.methodology}" and data plan: "${context.data_collection_plan}", generate a plausible, estimated, synthetic dataset in CSV format. Output ONLY the CSV data and a brief, one-sentence summary of what the data represents. Separate the summary and the CSV data with '---'.`;
        
        try {
            const response = await gemini.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            const [summary, csv] = response.text.split('---').map(s => s.trim());
            if (!summary || !csv) throw new Error("AI response format was incorrect.");
            setResult({ summary, csv });
            addToast("AI has generated a synthetic dataset.", "success");
        } catch (err) {
            addToast("Data synthesis failed. Please try again.", "danger");
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
