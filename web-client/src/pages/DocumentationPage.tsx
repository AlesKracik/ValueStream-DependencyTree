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
        <div className={styles.pageContainer} style={{ width: '100%' }}>
            <div style={{ lineHeight: '1.6', color: 'var(--text-secondary)', fontSize: '15px' }}>
                <ReactMarkdown
                    components={{
                        img: ({ src, alt, ...props }) => (
                            <img
                                {...props}
                                alt={alt || ''}
                                src={src && !src.startsWith('/') ? `/${src}` : src}
                                style={{ maxWidth: '100%', borderRadius: '6px', margin: '8px 0' }}
                            />
                        )
                    }}
                >{content}</ReactMarkdown>
            </div>
        </div>
    );
};
