import React from 'react';
import type { Customer } from '@valuestream/shared-types';

interface CustomFieldsState {
    data: Record<string, unknown>[];
    loading: boolean;
    error: string | null;
}

interface Props {
    customer: Customer | undefined;
    customFields: CustomFieldsState;
}

const isUrl = (s: string): boolean => /^https?:\/\/\S+$/i.test(s.trim());

const renderString = (s: string): React.ReactNode => {
    const trimmed = s.trim();
    if (isUrl(trimmed)) {
        return (
            <a
                href={trimmed}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--link-color, #0969da)', textDecoration: 'underline', wordBreak: 'break-all' }}
            >
                {s}
            </a>
        );
    }
    return s;
};

const renderValue = (val: unknown): React.ReactNode => {
    if (val === null || val === undefined) return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>null</span>;
    if (typeof val === 'string') return renderString(val);
    if (Array.isArray(val)) {
        if (val.length === 0) return <span style={{ color: 'var(--text-muted)' }}>[]</span>;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px', width: '100%' }}>
                {val.map((item, idx) => (
                    <div key={idx} style={{
                        padding: '12px',
                        backgroundColor: 'var(--bg-page-muted)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '6px'
                    }}>
                        {renderValue(item)}
                    </div>
                ))}
            </div>
        );
    }
    if (typeof val === 'object') {
        const obj = val as Record<string, unknown>;
        return (
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '12px 24px',
                width: '100%'
            }}>
                {Object.entries(obj)
                    .filter(([k]) => {
                        const lower = k.toLowerCase();
                        const isId = lower === 'id' ||
                                     lower === '_id' ||
                                     lower.endsWith('_id') ||
                                     (k.endsWith('Id') && k.length > 2);
                        return !isId;
                    })
                    .map(([k, v]) => {
                        const isComplex = v !== null && typeof v === 'object';
                        return (
                            <div key={k} style={{
                                display: 'flex',
                                flexDirection: isComplex ? 'column' : 'row',
                                gap: isComplex ? '4px' : '8px',
                                alignItems: isComplex ? 'flex-start' : 'baseline',
                                gridColumn: isComplex ? '1 / -1' : 'auto',
                                marginTop: isComplex ? '8px' : '0'
                            }}>
                                <div style={{ fontWeight: 'bold', color: 'var(--text-muted)', fontSize: '13px', whiteSpace: 'nowrap' }}>{k}:</div>
                                <div style={{
                                    fontSize: '14px',
                                    wordBreak: 'break-all',
                                    marginLeft: isComplex ? '20px' : '0',
                                    width: isComplex ? 'calc(100% - 20px)' : 'auto'
                                }}>
                                    {renderValue(v)}
                                </div>
                            </div>
                        );
                    })}
            </div>
        );
    }
    return String(val);
};

export const CustomerCustomFieldsTab: React.FC<Props> = ({ customer, customFields }) => {
    return (
        <>
            {customFields.loading && <div style={{ color: 'var(--text-muted)' }}>Loading custom fields...</div>}
            {customFields.error && (
                <div style={{ color: 'var(--status-danger)', textAlign: 'center', padding: '40px', backgroundColor: 'var(--status-danger-bg)', borderRadius: '8px', border: '1px dashed var(--status-danger)' }}>
                    <div style={{ fontSize: '16px', marginBottom: '8px', color: 'var(--status-danger)', fontWeight: 'bold' }}>Query Error</div>
                    <p style={{ margin: 0, fontSize: '14px' }}>{customFields.error}</p>
                </div>
            )}
            {!customFields.loading && !customFields.error && (
                <>
                    {!customer?.customer_id ? (
                        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px dashed var(--border-primary)' }}>
                            <div style={{ fontSize: '16px', marginBottom: '8px', color: 'var(--text-highlight)' }}>Customer ID Not Defined</div>
                            <p style={{ margin: 0, fontSize: '14px' }}>
                                Please set the Customer ID above to fetch data.
                            </p>
                        </div>
                    ) : customFields.data.length === 0 ? (
                        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px dashed var(--border-primary)' }}>
                            <div style={{ fontSize: '16px', marginBottom: '8px', color: 'var(--text-highlight)' }}>No Data Found</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            {customFields.data.map((item, idx) => (
                                <div key={idx} style={{
                                    padding: '20px',
                                    backgroundColor: 'var(--bg-page-muted)',
                                    border: '1px solid var(--border-primary)',
                                    borderRadius: '8px'
                                }}>
                                    {renderValue(item)}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </>
    );
};
