
import React, { useState } from 'react';
import { useToast } from '../../toast';

export const DataUploader = ({ onComplete }) => {
    const [file, setFile] = useState<File | null>(null);
    const [fileContent, setFileContent] = useState('');
    const { addToast } = useToast();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            if (selectedFile.type === 'text/csv' || selectedFile.name.endsWith('.csv')) {
                setFile(selectedFile);
                const reader = new FileReader();
                reader.onload = (event) => {
                    const content = event.target?.result as string;
                    setFileContent(content);
                };
                reader.onerror = () => {
                    addToast('Error reading file.', 'danger');
                };
                reader.readAsText(selectedFile);
            } else {
                addToast('Please upload a valid .csv file.', 'warning');
                e.target.value = ''; // Reset file input
            }
        }
    };

    const handleSubmit = () => {
        if (!file || !fileContent) {
            addToast('Please select a file to upload.', 'warning');
            return;
        }
        const summary = `Data uploaded from file: ${file.name}`;
        onComplete(fileContent, summary);
    };

    return (
        <div>
            <h6 className="fw-bold">Upload Your Dataset</h6>
            <p className="text-white-50 small">Please select a CSV file from your computer.</p>
            <div className="mb-3">
                <input type="file" className="form-control" accept=".csv" onChange={handleFileChange} />
            </div>
            {fileContent && (
                <div className="mb-3">
                    <label className="form-label small">File Preview:</label>
                    <textarea className="form-control" readOnly rows={8} value={fileContent} />
                </div>
            )}
            <button className="btn btn-success" onClick={handleSubmit} disabled={!fileContent}>
                <i className="bi bi-check-circle-fill me-1"></i> Submit Uploaded Data
            </button>
        </div>
    );
};
