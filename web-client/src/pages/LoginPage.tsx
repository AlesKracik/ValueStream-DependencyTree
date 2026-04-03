import React, { useState, useEffect, useCallback } from 'react';
import { setAdminSecret } from '../utils/api';
import type { AuthMethod } from '@valuestream/shared-types';

interface LoginPageProps {
    onLogin: () => void;
}

const cardStyle: React.CSSProperties = {
    padding: '40px',
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: '8px',
    width: '100%',
    maxWidth: '360px',
    margin: '20px',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
};

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
    const [authMethod, setAuthMethod] = useState<AuthMethod | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        fetch('/api/auth/methods')
            .then(r => r.json())
            .then(data => setAuthMethod(data.method || 'local'))
            .catch(() => setAuthMethod('local'));
    }, []);

    const handleSuccess = useCallback((token: string) => {
        setAdminSecret(token);
        onLogin();
    }, [onLogin]);

    if (!authMethod) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: 'var(--bg-primary)' }}>
                <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
            </div>
        );
    }

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            width: '100vw',
            backgroundColor: 'var(--bg-primary)',
        }}>
            <div style={cardStyle}>
                <h1 style={{ margin: 0, fontSize: '24px', color: 'var(--text-highlight)', textAlign: 'center' }}>Value Stream</h1>

                {(authMethod === 'local' || authMethod === 'ldap') && (
                    <PasswordLogin method={authMethod} onSuccess={handleSuccess} error={error} setError={setError} />
                )}

                {authMethod === 'aws-sso' && (
                    <AwsSsoLogin onSuccess={handleSuccess} error={error} setError={setError} />
                )}

                {authMethod === 'okta' && (
                    <OktaLogin error={error} setError={setError} />
                )}

                {/* Always show admin password fallback */}
                {authMethod !== 'local' && (
                    <>
                        <div style={{ borderTop: '1px solid var(--border-secondary)', paddingTop: '16px' }}>
                            <p style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                                Or use admin password
                            </p>
                            <AdminPasswordLogin onSuccess={handleSuccess} />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

// ── Password Login (local / LDAP) ──────────────────────────────

const PasswordLogin: React.FC<{
    method: 'local' | 'ldap';
    onSuccess: (token: string) => void;
    error: string;
    setError: (e: string) => void;
}> = ({ method, onSuccess, error, setError }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json().catch(() => ({}));
            if (response.ok && data.token) {
                onSuccess(data.token);
            } else {
                setError(data.error || 'Invalid username or password');
            }
        } catch {
            setError('Connection error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center' }}>
                {method === 'ldap' ? 'Sign in with your LDAP credentials' : 'Sign in with your account'}
            </p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Username"
                    autoFocus
                    autoComplete="username"
                />
                <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Password"
                    autoComplete="current-password"
                />
                {error && <p style={{ color: 'var(--status-danger-text)', fontSize: '12px', margin: 0 }}>{error}</p>}
                <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%' }}>
                    {loading ? 'Signing in...' : 'Sign In'}
                </button>
            </form>
        </>
    );
};

// ── AWS SSO Login ──────────────────────────────────────────────

const AwsSsoLogin: React.FC<{
    onSuccess: (token: string) => void;
    error: string;
    setError: (e: string) => void;
}> = ({ onSuccess, error, setError }) => {
    const [loading, setLoading] = useState(false);
    const [verificationUrl, setVerificationUrl] = useState('');
    const [sessionId, setSessionId] = useState('');
    const [polling, setPolling] = useState(false);

    const startSsoLogin = async () => {
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/auth/aws-sso/start', { method: 'POST' });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setError(data.error || 'Failed to start SSO login');
                return;
            }

            setVerificationUrl(data.verification_url);
            setSessionId(data.session_id);

            // Open verification URL in new tab
            window.open(data.verification_url, '_blank');

            // Start polling
            setPolling(true);
        } catch {
            setError('Connection error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!polling || !sessionId) return;

        const interval = setInterval(async () => {
            try {
                const response = await fetch('/api/auth/aws-sso/poll', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: sessionId }),
                });

                const data = await response.json().catch(() => ({}));

                if (data.success && data.token) {
                    setPolling(false);
                    onSuccess(data.token);
                } else if (!data.pending) {
                    setPolling(false);
                    setError(data.error || 'SSO authentication failed');
                }
                // If pending, continue polling
            } catch {
                setPolling(false);
                setError('Connection lost during SSO login');
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [polling, sessionId, onSuccess, setError]);

    return (
        <>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Sign in with AWS SSO
            </p>

            {!verificationUrl ? (
                <button
                    className="btn-primary"
                    onClick={startSsoLogin}
                    disabled={loading}
                    style={{ width: '100%' }}
                >
                    {loading ? 'Starting SSO...' : 'Login via AWS SSO'}
                </button>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {polling ? 'Waiting for authorization...' : 'Click to authorize:'}
                    </p>
                    <a
                        href={verificationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--accent-primary)', fontSize: '13px', wordBreak: 'break-all' }}
                    >
                        Open authorization page
                    </a>
                    {polling && (
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                            Polling for approval...
                        </p>
                    )}
                </div>
            )}

            {error && <p style={{ color: 'var(--status-danger-text)', fontSize: '12px', margin: 0 }}>{error}</p>}
        </>
    );
};

// ── Okta Login ─────────────────────────────────────────────────

const OktaLogin: React.FC<{
    error: string;
    setError: (e: string) => void;
}> = ({ error, setError }) => {
    useEffect(() => {
        // Check for auth error from Okta callback redirect
        const params = new URLSearchParams(window.location.search);
        const authError = params.get('auth_error');
        if (authError) {
            setError(authError);
            // Clean up URL
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, [setError]);

    return (
        <>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Sign in with Okta
            </p>
            <button
                className="btn-primary"
                onClick={() => { window.location.href = '/api/auth/okta/login'; }}
                style={{ width: '100%' }}
            >
                Login with Okta
            </button>
            {error && <p style={{ color: 'var(--status-danger-text)', fontSize: '12px', margin: 0 }}>{error}</p>}
        </>
    );
};

// ── Admin Password Fallback ────────────────────────────────────

const AdminPasswordLogin: React.FC<{ onSuccess: (token: string) => void }> = ({ onSuccess }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });

            const data = await response.json().catch(() => ({}));
            if (response.ok && (data.success || data.token)) {
                onSuccess(data.token || password);
            } else {
                setError('Invalid password');
            }
        } catch {
            setError('Connection error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
            <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Admin password"
                style={{ flex: 1, fontSize: '13px' }}
            />
            <button type="submit" className="btn-primary" disabled={loading} style={{ fontSize: '13px', padding: '6px 12px' }}>
                {loading ? '...' : 'Go'}
            </button>
            {error && <p style={{ color: 'var(--status-danger-text)', fontSize: '11px', margin: 0, position: 'absolute' }}>{error}</p>}
        </form>
    );
};
