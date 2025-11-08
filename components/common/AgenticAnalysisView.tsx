

import React, { useRef, useEffect } from 'react';

export const AgenticAnalysisView = ({ agenticRun, title = "AI Agents at Work...", subtitle = "A multi-agent workflow is running." }) => {
    const logsEndRef = useRef(null);

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [agenticRun.logs]);
    
    return (
        <div className="p-4">
            <h5 className="fw-bold text-center">{title}</h5>
            <p className="text-white-50 text-center">{subtitle}</p>
            {agenticRun.maxIterations > 0 && (
                <div className="progress my-3" style={{height: '20px'}}>
                    <div 
                        className="progress-bar progress-bar-striped progress-bar-animated" 
                        style={{ width: `${(agenticRun.iterations / agenticRun.maxIterations) * 100}%` }}
                    >{`Iteration ${agenticRun.iterations}/${agenticRun.maxIterations}`}</div>
                </div>
            )}
            <div className="agent-log-container">
                {agenticRun.logs.map((log, index) => (
                    <div key={index} className={`agent-log-entry agent-log-${log.agent.toLowerCase().replace(/\s+/g, '-')}`}>
                        <span className="agent-log-agent">{log.agent}:</span>
                        <span className="agent-log-message">{log.message}</span>
                    </div>
                ))}
                <div ref={logsEndRef} />
            </div>
        </div>
    );
};