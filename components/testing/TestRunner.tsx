
import React, { useState, useEffect } from 'react';
import { appTests } from '../../index.test.tsx';

export const TestRunner = () => {
    const [results, setResults] = useState([]);
    const [isRunning, setIsRunning] = useState(false);

    const runTests = async () => {
        setIsRunning(true);
        const testResults = [];
        for (const test of appTests) {
            try {
                await test.fn();
                testResults.push({ name: test.name, passed: true });
            } catch (error) {
                testResults.push({ name: test.name, passed: false, error: error.message });
            }
        }
        setResults(testResults);
        setIsRunning(false);
    };

    useEffect(() => {
        runTests();
    }, []);

    return (
        <div>
            <h2>Application Self-Tests</h2>
            <p>This checks the core logic of the application to ensure everything is working as expected.</p>
            <button className="btn btn-primary mb-3" onClick={runTests} disabled={isRunning}>
                {isRunning ? 'Running...' : 'Re-run All Tests'}
            </button>
            <div>
                {results.map((result, index) => (
                    <div key={index} className={`test-result ${result.passed ? 'passed' : 'failed'}`}>
                        <div className="test-status">
                            {result.passed ? <i className="bi bi-check-circle-fill text-success"></i> : <i className="bi bi-x-circle-fill text-danger"></i>}
                        </div>
                        <div className="test-details">
                            <span className="fw-bold">{result.name}</span>
                            {!result.passed && <div className="test-error">{result.error}</div>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};