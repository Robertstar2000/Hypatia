import React from 'react';
import { renderMarkdown } from '../../utils/markdownRenderer';

/**
 * @component DataAnalysisView
 * A robust component for rendering the output of the data analysis step,
 * which includes a summary and pre-rendered chart images.
 */
export const DataAnalysisView = ({ analysisData }) => {

    if (!analysisData || analysisData.summary === undefined) {
        return <div className="alert alert-info">Awaiting analysis results...</div>;
    }

    const hasCharts = Array.isArray(analysisData.charts) && analysisData.charts.length > 0;

    return (
        <div>
            {analysisData.summary && <div className="generated-text-container" dangerouslySetInnerHTML={{ __html: renderMarkdown(analysisData.summary) }} />}
            
            {hasCharts && (
                <div className="mt-4">
                    <h5 className="fw-bold">Data Visualizations</h5>
                    <div className="row">
                        {analysisData.charts.map((chart, index) => (
                            <div className="col-lg-6 mb-3" key={index}>
                                <div className="card h-100">
                                    <div className="card-header fw-bold">{chart.title}</div>
                                    <div className="card-body d-flex align-items-center justify-content-center p-2" style={{minHeight: '300px'}}>
                                        <img
                                            src={`data:image/png;base64,${chart.imageData}`}
                                            alt={chart.title}
                                            style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};