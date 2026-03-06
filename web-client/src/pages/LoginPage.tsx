import React, { useState } from 'react';
import { setAdminSecret } from '../utils/api';

interface LoginPageProps {
    onLogin: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
    const [secret, setSecret] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Try to fetch auth status with this secret to verify it
        try {
            const res = await fetch('/api/auth/status', {
                headers: { 'Authorization': `Bearer ${secret}` }
            });
            if (res.ok) {
                setAdminSecret(secret);
                onLogin();
            } else {
                setError('Invalid Admin Secret');
            }
        } catch (err) {
            setError('Failed to connect to server');
        }
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            backgroundColor: '#111827',
            color: 'white',
            fontFamily: 'sans-serif'
        }}>
            <form onSubmit={handleSubmit} style={{
                backgroundColor: '#1f2937',
                padding: '32px',
                borderRadius: '8px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                width: '320px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
            }}>
                <h1 style={{ margin: 0, fontSize: '20px', textAlign: 'center' }}>ValueStream Login</h1>
                <p style={{ margin: 0, fontSize: '14px', color: '#9ca3af', textAlign: 'center' }}>
                    Please enter the Admin Secret to continue.
                </p>
                
                <input
                    type="password"
                    placeholder="Admin Secret"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    style={{
                        padding: '10px',
                        borderRadius: '4px',
                        border: '1px solid #374151',
                        backgroundColor: '#374151',
                        color: 'white',
                        outline: 'none'
                    }}
                    autoFocus
                />

                {error && <p style={{ color: '#f87171', fontSize: '12px', margin: 0 }}>{error}</p>}

                <button type="submit" style={{
                    padding: '10px',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                }}>
                    Login
                </button>
            </form>
        </div>
    );
};


