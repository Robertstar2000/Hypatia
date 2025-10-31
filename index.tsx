
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ToastProvider } from './toast';
import { App } from './App';

// --- RENDER APPLICATION ---
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
    <React.StrictMode>
        <ToastProvider>
            <App />
        </ToastProvider>
    </React.StrictMode>
);
