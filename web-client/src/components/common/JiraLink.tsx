import React from 'react';
import { sanitizeUrl } from '../../utils/security';

export type JiraLinkVariant = 'text' | 'pill' | 'icon';

interface JiraLinkProps {
    issueKey: string;
    baseUrl?: string;
    directUrl?: string;
    variant?: JiraLinkVariant;
    label?: React.ReactNode;
    status?: string;
    statusBg?: string;
    statusColor?: string;
    /** Override link color (for use on colored backgrounds like Gantt bars). */
    color?: string;
}

function buildHref(issueKey: string, baseUrl?: string, directUrl?: string): string {
    const raw = directUrl
        ? sanitizeUrl(directUrl)
        : baseUrl
            ? sanitizeUrl(`${baseUrl.replace(/\/$/, '')}/browse/${issueKey}`)
            : '';
    return raw === 'about:blank' ? '' : raw;
}

export const JiraLink: React.FC<JiraLinkProps> = ({
    issueKey,
    baseUrl,
    directUrl,
    variant = 'text',
    label,
    status,
    statusBg,
    statusColor,
    color,
}) => {
    const href = buildHref(issueKey, baseUrl, directUrl);
    const titleBase = `Open ${issueKey} in Jira`;
    const title = status ? `${titleBase} (status: ${status})` : titleBase;
    const displayLabel = label ?? issueKey;

    if (!href) {
        if (variant === 'pill') {
            return (
                <span
                    style={{
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        backgroundColor: 'var(--bg-tertiary)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-secondary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                    }}
                >
                    <span style={{ fontWeight: 'bold' }}>{displayLabel}</span>
                    {status && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{status}</span>
                    )}
                </span>
            );
        }
        return <span style={{ color: 'var(--text-muted)' }}>{displayLabel}</span>;
    }

    if (variant === 'icon') {
        return (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={title}
                aria-label={title}
                style={{
                    color: 'var(--text-link)',
                    textDecoration: 'none',
                    fontSize: '14px',
                    display: 'inline-flex',
                    alignItems: 'center',
                }}
            >
                ↗
            </a>
        );
    }

    if (variant === 'pill') {
        return (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={title}
                style={{
                    fontSize: '12px',
                    color: 'var(--text-link)',
                    backgroundColor: 'var(--accent-primary-bg)',
                    border: '1px solid var(--accent-primary-bg)',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    textDecoration: 'none',
                    cursor: 'pointer',
                }}
            >
                <span style={{ fontWeight: 'bold' }}>{displayLabel}</span>
                {status && (
                    <span
                        style={{
                            fontSize: '10px',
                            fontWeight: 'bold',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            backgroundColor: statusBg ?? 'var(--bg-tertiary)',
                            color: statusColor ?? 'var(--text-primary)',
                        }}
                    >
                        {status}
                    </span>
                )}
                <span aria-hidden="true" style={{ fontSize: '11px', opacity: 0.8 }}>↗</span>
            </a>
        );
    }

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={title}
            style={{
                color: color ?? 'var(--text-link)',
                textDecoration: 'underline',
                fontWeight: 'bold',
            }}
        >
            {displayLabel}
        </a>
    );
};
