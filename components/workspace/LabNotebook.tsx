
import React, { useState, useEffect } from 'react';
import { useExperiment } from '../../services';
import { useToast } from '../../toast';

export const LabNotebook = ({ isOpen, onClose }) => {
    const { activeExperiment, updateExperiment } = useExperiment();
    const [content, setContent] = useState(activeExperiment?.labNotebook || '');
    const { addToast } = useToast();

    const colabTemplate = `\n\n### Google Colab Experiment Notes\n\n*   **Colab Notebook Link:** [https://colab.research.google.com/](https://colab.research.google.com/)\n*   **Anvil Uplink Key:** \`PASTE_YOUR_KEY_HERE\`\n*   **Setup Instructions:**\n    1.  In your Anvil web app, enable the "Server Uplink" service to get an Uplink key.\n    2.  In your Colab notebook, install the anvil-uplink library: \`!pip install anvil-uplink\`.\n    3.  Connect your notebook to Anvil: \`import anvil.server; anvil.server.connect("YOUR_UPLINK_KEY")\`.\n    4.  You can now call functions defined in your Colab notebook from your Anvil web app.\n\n---\n\n`;

    useEffect(() => {
        setContent(activeExperiment?.labNotebook || '');
    }, [activeExperiment?.labNotebook, isOpen]);

    const handleInsertTemplate = () => {
        setContent(prev => prev + colabTemplate);
        addToast("Colab template added.", "info");
    };

    const handleSave = () => {
        if (activeExperiment) {
            updateExperiment({ ...activeExperiment, labNotebook: content });
            addToast("Lab notebook saved.", "success");
            onClose();
        }
    };
    
    return (
         <div className={`lab-notebook-drawer ${isOpen ? 'open' : ''}`}>
            <div className="lab-notebook-header d-flex justify-content-between align-items-center">
                <h5 className="mb-0"><i className="bi bi-journal-bookmark-fill me-2"></i>Lab Notebook</h5>
                <div>
                    <button className="btn btn-outline-info btn-sm me-2" onClick={handleInsertTemplate} title="Insert Google Colab connection template">
                        <i className="bi bi-google me-1"></i> Colab Template
                    </button>
                    <button className="btn btn-primary btn-sm me-2" onClick={handleSave}>Save & Close</button>
                    <button className="btn btn-secondary btn-sm" onClick={onClose}><i className="bi bi-x-lg"></i></button>
                </div>
            </div>
            <div className="lab-notebook-body">
                <textarea 
                    className="form-control lab-notebook-textarea" 
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Record your thoughts, observations, and notes here..."
                />
            </div>
        </div>
    );
};