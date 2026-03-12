import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import styles from './List.module.css';

export const DocumentationPage: React.FC = () => {
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
        <div className={styles.pageContainer} style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <div style={{ lineHeight: '1.6', color: 'var(--text-secondary)', fontSize: '15px' }}>
                <ReactMarkdown>{content}</ReactMarkdown>
            </div>
        </div>
    );
};
