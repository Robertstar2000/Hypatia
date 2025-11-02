
import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Experiment } from './config';
import { db } from './be_db';
import { testApiKey, parseGeminiError } from './services';
import { useToast } from './toast';
import { ExperimentContext } from './services';

import { Header } from './components/common/Header';
import { Footer } from './components/common/Footer';
import { LandingPage } from './components/landing/LandingPage';
import { Dashboard } from './components/dashboard/Dashboard';
import { ExperimentWorkspace } from './components/workspace/ExperimentWorkspace';
import { TestRunner } from './components/testing/TestRunner';
import { LabNotebook } from './components/workspace/LabNotebook';

/**
 * @component App
 * The root component that manages the overall application state and routing.
 */
export const App = () => {
    const [view, setView] = useState('landing'); // 'landing', 'dashboard', 'experiment'
    const [experiments, setExperiments] = useState<Experiment[]>([]);
    const [activeExperiment, setActiveExperiment] = useState<Experiment | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [gemini, setGemini] = useState(null);
    const [isLabNotebookOpen, setLabNotebookOpen] = useState(false);

    const { addToast } = useToast();

    // Load experiments from Dexie on initial mount. Gemini is initialized by user action.
    useEffect(() => {
        const loadData = async () => {
            try {
                // Load experiments
                const storedExperiments = await db.experiments.orderBy('createdAt').reverse().toArray();
                setExperiments(storedExperiments);
                if (storedExperiments.length > 0) {
                    setActiveExperiment(storedExperiments[0]);
                }
            } catch (error) {
                console.error("Failed to load data:", error);
                addToast("Could not load saved experiments.", 'danger');
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, [addToast]);
    
    // Scroll to top after successful authentication
    useEffect(() => {
        if (gemini && view === 'landing') {
             setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
        }
    }, [gemini, view]);

    const handleAuthentication = async (type: 'promo' | 'key', value: string) => {
        let keyToUse: string | undefined = undefined;
    
        if (type === 'promo' && value.toUpperCase() === 'MTI') {
            keyToUse = process.env.API_KEY;
            if (!keyToUse) {
                addToast("Promo code is valid, but no default API key is configured for this session.", 'danger');
                return;
            }
        } else if (type === 'key' && value) {
            keyToUse = value;
        } else {
            addToast("Invalid input. Please try again.", 'warning');
            return;
        }
    
        try {
            const isValid = await testApiKey(keyToUse);
            if (isValid) {
                const geminiInstance = new GoogleGenAI({ apiKey: keyToUse });
                setGemini(geminiInstance);
                addToast("Authentication successful! Welcome to Project Hypatia.", 'success');
            } else {
                throw new Error("Invalid API Key provided.");
            }
        } catch (error) {
            setGemini(null);
            addToast(parseGeminiError(error, "Authentication failed. The key or code is not valid."), 'danger');
        }
    };


    // Handlers for experiment management
    const createNewExperiment = async (title: string, description: string, field: string) => {
        const newId = `exp_${Date.now()}`;
        const newExperiment: Experiment = {
            id: newId,
            title,
            description,
            field,
            currentStep: 1,
            stepData: {
                1: {
                    input: `Title: ${title}\n\nDescription: ${description}`,
                    history: [],
                    provenance: [],
                }
            },
            fineTuneSettings: {},
            createdAt: new Date().toISOString(),
            labNotebook: '',
            automationMode: null,
            status: 'active',
        };
        try {
            await db.experiments.add(newExperiment);
            setExperiments(prev => [newExperiment, ...prev]);
            setActiveExperiment(newExperiment);
            setView('experiment');
            addToast("New research project created successfully!", 'success');
        } catch (error) {
            console.error("Failed to save new experiment:", error);
            addToast("Failed to create project.", 'danger');
        }
    };
    
    const importExperiment = async (experimentData: Experiment) => {
        try {
            if (!experimentData.id || !experimentData.title || !experimentData.createdAt) {
                throw new Error("Invalid experiment file format.");
            }
            const existing = await db.experiments.get(experimentData.id);
            if(existing) {
                if(!window.confirm("An experiment with this ID already exists. Overwrite it?")) {
                    return;
                }
                await db.experiments.put(experimentData);
            } else {
                await db.experiments.add(experimentData);
            }
            const storedExperiments = await db.experiments.orderBy('createdAt').reverse().toArray();
            setExperiments(storedExperiments);
            addToast(`Project "${experimentData.title}" imported successfully!`, 'success');

        } catch(error) {
             addToast(`Failed to import project: ${error.message}`, 'danger');
        }
    }


    const updateExperiment = async (updatedExperiment: Experiment) => {
        try {
            await db.experiments.put(updatedExperiment);
            setExperiments(prev => prev.map(e => e.id === updatedExperiment.id ? updatedExperiment : e));
            if (activeExperiment?.id === updatedExperiment.id) {
                setActiveExperiment(updatedExperiment);
            }
        } catch (error) {
            console.error("Failed to update experiment:", error);
            addToast("Failed to save progress.", 'danger');
        }
    };

    const deleteExperiment = async (id: string) => {
        if (window.confirm("Are you sure you want to delete this project? This action cannot be undone.")) {
            try {
                await db.experiments.delete(id);
                const updatedExperiments = experiments.filter(e => e.id !== id);
                setExperiments(updatedExperiments);
                if (activeExperiment?.id === id) {
                    setActiveExperiment(updatedExperiments.length > 0 ? updatedExperiments[0] : null);
                    if(updatedExperiments.length > 0) {
                        setView('dashboard');
                    } else {
                        setView('landing');
                    }
                }
                addToast("Project deleted.", 'success');
            } catch (error) {
                console.error("Failed to delete experiment:", error);
                addToast("Failed to delete project.", 'danger');
            }
        }
    };

    const selectExperiment = (id: string) => {
        const experiment = experiments.find(e => e.id === id);
        if (experiment) {
            setActiveExperiment(experiment);
            setView('experiment');
        }
    };

    const contextValue = {
        experiments,
        activeExperiment,
        gemini,
        createNewExperiment,
        updateExperiment,
        deleteExperiment,
        selectExperiment,
        setActiveExperiment,
        importExperiment,
        handleAuthentication,
    };

    // Render logic
    if (isLoading) {
        return <div className="d-flex justify-content-center align-items-center vh-100"><div className="spinner-border" role="status"><span className="visually-hidden">Loading...</span></div></div>;
    }

    return (
        <ExperimentContext.Provider value={contextValue}>
            <Header setView={setView} activeView={view} onToggleNotebook={() => setLabNotebookOpen(p => !p)} />
            <main className="container-fluid mt-4">
                {view === 'landing' && <LandingPage 
                    setView={setView}
                />}
                {view === 'dashboard' && <Dashboard setView={setView} />}
                {view === 'experiment' && activeExperiment && <ExperimentWorkspace key={activeExperiment.id} />}
                {view === 'testing' && <TestRunner />}
            </main>
            {activeExperiment && gemini && (
                <LabNotebook 
                    isOpen={isLabNotebookOpen} 
                    onClose={() => setLabNotebookOpen(false)}
                />
            )}
            <Footer />
        </ExperimentContext.Provider>
    );
};