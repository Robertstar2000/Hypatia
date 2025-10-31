
import React, { useEffect, useRef } from 'react';
import { marked } from 'marked';

export const HelpModal = ({ content, onClose }) => {
    const modalBodyRef = useRef(null);

    useEffect(() => {
        if (modalBodyRef.current) {
            modalBodyRef.current.innerHTML = marked(content);
        }
    }, [content]);

    return (
        <div className="help-modal" style={{display: 'flex'}} onClick={onClose}>
            <div className="help-modal-dialog" onClick={e => e.stopPropagation()}>
                <div className="help-modal-content">
                    <div className="help-modal-header">
                        <h5 className="modal-title">Project Hypatia Help</h5>
                        <button type="button" className="btn-close" onClick={onClose}></button>
                    </div>
                    <div className="help-modal-body" ref={modalBodyRef}>
                        {/* Content is rendered here via useEffect */}
                    </div>
                </div>
            </div>
        </div>
    );
};
