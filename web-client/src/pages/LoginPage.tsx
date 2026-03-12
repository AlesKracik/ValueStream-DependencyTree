import React, { useState } from 'react';
import { authorizedFetch } from '../utils/api';

interface LoginPageProps {
    onLogin: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await authorizedFetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });

            if (response.ok) {
                onLogin();
            } else {
                setError('Invalid password');
            }
        } catch (err) {
            setError('Connection error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            width: '100vw',
            backgroundColor: 'var(--bg-primary)',
        }}>
            <div style={{
                padding: '40px',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '8px',
                width: '100%',
                maxWIdth: '400px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px'
            }}>
                <h1 style={{ margin: 0, fontSize: '24px', color: 'var(--text-highlight)', textAlign: 'center' }}>Value Stream</h1>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center' }}>
                    Enter password to access the dependency tree
                </p>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        autoFocus
                    />
                    {error && <p style={{ color: 'var(--status-danger-text)', fontSize: '12px', margin: 0 }}>{error}</p>}
                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={loading}
                        style={{ width: '100%' }}
                    >
                        {loading ? 'Logging in...' : 'Login'}
                    </button>
                </form>
            </div>
        </div>
    );
};
