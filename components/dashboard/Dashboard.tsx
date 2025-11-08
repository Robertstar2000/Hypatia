import React, { useState, useMemo } from 'react';
import { useExperiment } from '../../services';
import { Experiment } from '../../config';
import { ExperimentCard } from '../steps/ExperimentCard';
import { DeployModal } from './DeployModal';

export const Dashboard = ({ setView }) => {
    const { experiments, selectExperiment, deleteExperiment, updateExperiment, importExperiment, gemini } = useExperiment();
    const [showDeployModal, setShowDeployModal] = useState(false);
    const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null);

    const activeExperiments = useMemo(() => experiments.filter(e => !e.status || e.status === 'active'), [experiments]);
    const archivedExperiments = useMemo(() => experiments.filter(e => e.status === 'archived'), [experiments]);

    const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const imported = JSON.parse(e.target.result as string);
                    importExperiment(imported);
                } catch (err) {
                    alert("Failed to parse experiment file. Is it a valid JSON export?");
                }
            };
            reader.readAsText(file);
        }
    };
    
    const handleExport = (experiment: Experiment) => {
        const dataStr = JSON.stringify(experiment, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `hypatia_export_${experiment.id}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleDeployClick = (experiment: Experiment) => {
        setSelectedExperiment(experiment);
        setShowDeployModal(true);
    };
    
    const handleArchive = async (exp: Experiment) => {
        if (window.confirm("Are you sure you want to archive this project? It will be moved to a separate section.")) {
            await updateExperiment({ ...exp, status: 'archived' });
        }
    };

    const handleUnarchive = async (exp: Experiment) => {
        await updateExperiment({ ...exp, status: 'active' });
    };
    
    return (
        <div className="container">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h2 className="section-title mb-0">Research Dashboard</h2>
                <div>
                     <label className="btn btn-secondary me-2">
                        <i className="bi bi-upload me-1"></i> Import Project
                        <input type="file" accept=".json" onChange={handleFileImport} style={{display: 'none'}} />
                    </label>
                    <button className="btn btn-primary" onClick={() => setView('landing')}>+ New Project</button>
                </div>
            </div>

            {activeExperiments.length === 0 && archivedExperiments.length === 0 && (
                 <div className="text-center p-5 dashboard-empty-state">
                    <i className="bi bi-journal-plus" style={{fontSize: '3rem'}}></i>
                    <h4 className="mt-3">No research projects yet.</h4>
                    <p className="text-white-50">Start a new project to begin your discovery journey.</p>
                    <button className="btn btn-primary mt-2" onClick={() => setView('landing')}>Create Your First Project</button>
                </div>
            )}
            
            {activeExperiments.length > 0 && <div className="row">
                {activeExperiments.map(exp => <ExperimentCard key={exp.id} exp={exp} onArchive={handleArchive} onUnarchive={handleUnarchive} deleteExperiment={deleteExperiment} selectExperiment={selectExperiment} handleDeployClick={handleDeployClick} handleExport={handleExport} />)}
            </div>}
            
            {archivedExperiments.length > 0 && (
                <>
                    <hr className="my-5" />
                    <h3 className="section-title mb-4">Archived Projects</h3>
                    <div className="row">
                        {archivedExperiments.map(exp => <ExperimentCard key={exp.id} exp={exp} isArchived={true} onArchive={handleArchive} onUnarchive={handleUnarchive} deleteExperiment={deleteExperiment} selectExperiment={selectExperiment} handleDeployClick={handleDeployClick} handleExport={handleExport} />)}
                    </div>
                </>
            )}

            {showDeployModal && selectedExperiment && (
                <DeployModal
                    experiment={selectedExperiment}
                    onClose={() => setShowDeployModal(false)}
                    onUpdateExperiment={updateExperiment}
                    onExportExperiment={handleExport}
                    gemini={gemini}
                />
            )}
        </div>
    );
};