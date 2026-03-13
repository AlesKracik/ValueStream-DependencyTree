import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface DocumentationModalProps {
    onClose: () => void;
}

export function DocumentationModal({ onClose }: DocumentationModalProps) {
    const [content, setContent] = useState<string>('Loading documentation...');

    useEffect(() => {
        fetch('/USER_GUIDE.md')
            .then(res => res.text())
            .then(text => setContent(text))
            .catch(err => {
                console.error('Failed to load documentation', err);
                setContent('Failed to load documentation. Please check the README.md directly.');
            });
    }, []);

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--bg-shadow)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
            <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: '8px', padding: '24px', maxWidth: '800px', width: '90vw', maxHeight: '90vh', overflowY: 'auto', color: 'var(--text-primary)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '10px' }}>
                    <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text-highlight)' }}>Documentation</h2>
                    <button 
                        onClick={onClose}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px' }}
                    >
                        ✕
                    </button>
                </div>
                <div style={{ lineHeight: '1.6', color: 'var(--text-secondary)', fontSize: '14px' }}>
                    <ReactMarkdown>{content}</ReactMarkdown>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', borderTop: '1px solid var(--border-secondary)', paddingTop: '16px' }}>
                    <button type="button" onClick={onClose} className="btn-secondary">Close</button>
                </div>
            </div>
        </div>
    );
}
