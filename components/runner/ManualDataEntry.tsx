
import React, { useState, useEffect } from 'react';
import { useExperiment } from '../../context/ExperimentContext';
import { useToast } from '../../toast';
import { parseGeminiError } from '../../be_gemini';
import { DYNAMIC_TABLE_SCHEMA } from '../../config';

export const ManualDataEntry = ({ onComplete, context }) => {
    const { gemini } = useExperiment();
    const [columns, setColumns] = useState<string[]>([]);
    const [rows, setRows] = useState<Record<string, string>[]>([]);
    const [isInitializing, setIsInitializing] = useState(true);
    const { addToast } = useToast();

    useEffect(() => {
        if (gemini) {
            const prompt = `Based on the data collection plan summary: "${context.data_collection_plan_summary}", generate a JSON array of objects. Each object should represent a column for a data entry table and have two keys: "columnName" (string) and "dataType" (string, e.g., 'number', 'string'). For example: [{"columnName": "time_seconds", "dataType": "number"}, {"columnName": "temperature_celsius", "dataType": "number"}]. Output only the raw JSON array.`;
            gemini.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config: { responseMimeType: "application/json", responseSchema: DYNAMIC_TABLE_SCHEMA } })
                .then(response => {
                    const schemaArray = JSON.parse(response.text);
                    if (!Array.isArray(schemaArray)) throw new Error("AI response was not a JSON array.");
                    const newColumns = schemaArray.map(col => col.columnName);
                    
                    setColumns(newColumns);
                    setRows([Object.fromEntries(newColumns.map(c => [c, '']))]);
                })
                .catch(err => {
                    addToast(parseGeminiError(err, "AI failed to create a data entry form."), "danger");
                    setColumns(['Column 1', 'Column 2']);
                    setRows([{'Column 1': '', 'Column 2': ''}]);
                })
                .finally(() => setIsInitializing(false));
        }
    }, [gemini, context, addToast]);

    const handleRowChange = (index, col, value) => {
        const newRows = [...rows];
        newRows[index][col] = value;
        setRows(newRows);
    };

    const addRow = () => setRows([...rows, Object.fromEntries(columns.map(c => [c, '']))]);
    const removeRow = (index) => setRows(rows.filter((_, i) => i !== index));

    const handleSubmit = () => {
        const header = columns.join(',');
        const body = rows.map(row => columns.map(col => `"${(row[col] || '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const csvData = `${header}\n${body}`;
        onComplete(csvData, "Manually entered data.");
    };

    if (isInitializing) return <div className="text-center p-4"><div className="spinner-border"></div><p className="mt-2">AI is building your data entry form...</p></div>;

    return (
        <div>
             <h6 className="fw-bold">Manual Data Entry Form</h6>
             <div className="table-responsive">
                <table className="table table-bordered">
                    <thead><tr>{columns.map(c => <th key={c}>{c}</th>)}<th>Actions</th></tr></thead>
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                                {columns.map(col => <td key={col}><input type="text" className="form-control" value={row[col]} onChange={e => handleRowChange(rowIndex, col, e.target.value)} /></td>)}
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
