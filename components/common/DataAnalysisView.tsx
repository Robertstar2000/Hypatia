
import React, { useRef, useEffect } from 'react';
import { Chart } from 'chart.js';
import { marked } from 'marked';
import { ensureChartStyling } from '../../utils/chartUtils';

/**
 * @component DataAnalysisView
 * A robust component for rendering Chart.js visualizations.
 */
export const DataAnalysisView = ({ analysisData }) => {
    const chartRefs = useRef({});
    const chartInstances = useRef(new Map());

    useEffect(() => {
        const instances = chartInstances.current;
        // Always clean up previous charts before creating new ones.
        instances.forEach(chart => chart.destroy());
        instances.clear();

        if (analysisData?.chartSuggestions && Array.isArray(analysisData.chartSuggestions)) {
            // Defer chart creation to allow the DOM (e.g., accordions in the summary view)
            // to finish animating and become visible. This prevents Chart.js from rendering
            // into a zero-size canvas, which results in a blank chart.
            const renderTimeout = setTimeout(() => {
                analysisData.chartSuggestions.forEach((config, index) => {
                    const canvas = chartRefs.current[index];
                    // Double-check that the canvas element is in the DOM and visible.
                    if (canvas && canvas.offsetParent !== null) {
                        try {
                            const styledConfig = ensureChartStyling(config);
                            const newChart = new Chart(canvas, styledConfig);
                            instances.set(index, newChart);
                        } catch (error) {
                            console.error(`Failed to render chart ${index}:`, error, config);
                        }
                    }
                });
            }, 300); // A 300ms delay is generally sufficient for standard UI animations.

            // The return function from useEffect serves as the cleanup function.
            // It runs when the component unmounts or when `analysisData` changes.
            return () => {
                clearTimeout(renderTimeout);
                instances.forEach(chart => chart.destroy());
                instances.clear();
            };
        }
    }, [analysisData]); // Effect runs only when the data changes.

    if (!analysisData || analysisData.summary === undefined) {
        return <div className="alert alert-info">Awaiting analysis results...</div>;
    }

    const hasCharts = Array.isArray(analysisData.chartSuggestions) && analysisData.chartSuggestions.length > 0;

    return (
        <div>
            {analysisData.summary && <div className="generated-text-container" dangerouslySetInnerHTML={{ __html: marked(analysisData.summary) }} />}
            {hasCharts && (
                <div className="mt-4">
                    <h5 className="fw-bold">Data Visualizations</h5>
                    <div className="row">
                        {analysisData.chartSuggestions.map((_config, index) => (
                            <div className="col-md-6 mb-3" key={index}>
                                <div className="card h-100">
                                    <div className="card-body" style={{ minHeight: '300px', position: 'relative' }}>
                                        {/* Canvas needs to be inside a relatively positioned container for responsive sizing */}
                                        <canvas ref={el => { chartRefs.current[index] = el; }}></canvas>
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
