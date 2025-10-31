
import React, { useState } from 'react';
import { useToast } from '../../toast';

export const ApiKeySection = ({ onAuthenticate }) => {
    const [apiKey, setApiKey] = useState('');
    const [promoCode, setPromoCode] = useState('');
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const { addToast } = useToast();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!apiKey && !promoCode) {
            addToast('Please enter an API key or a promo code.', 'warning');
            return;
        }
        setIsAuthenticating(true);
        if (promoCode) {
            await onAuthenticate('promo', promoCode);
        } else {
            await onAuthenticate('key', apiKey);
        }
        setIsAuthenticating(false);
    };

    return (
        <div className="getting-started-fields mx-auto api-key-section">
            <form onSubmit={handleSubmit}>
                <p className="fw-bold text-light">Authenticate to Begin</p>
                <p className="small text-white-50 mb-3">
                    Please provide your Google Gemini API key to activate AI features. Your key is used only for this session and is not stored. You can get your free Gemini API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-primary-glow">Google AI Studio</a>.
                </p>
                <div className="mb-3">
                    <input
                        type="password"
                        className="form-control"
                        placeholder="Enter your Gemini API Key"
                        value={apiKey}
                        onChange={(e) => { setApiKey(e.target.value); setPromoCode(''); }}
                        disabled={isAuthenticating || !!promoCode}
                        aria-label="Gemini API Key"
                    />
                </div>
                <div className="text-center text-white-50 my-2">OR</div>
                <div className="mb-3">
                    <input
                        type="text"
                        className="form-control"
                        placeholder="Enter a Promo Code"
                        value={promoCode}
                        onChange={(e) => { setPromoCode(e.target.value); setApiKey(''); }}
                        disabled={isAuthenticating || !!apiKey}
                        aria-label="Promo Code"
                    />
                </div>
                <button type="submit" className="btn btn-primary btn-lg w-100" disabled={isAuthenticating}>
                    {isAuthenticating ? 'Validating...' : 'Unlock Hypatia'}
                </button>
            </form>
        </div>
    );
};
