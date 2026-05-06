import React from 'react';

interface PaginationProps {
    /** 1-based page index. */
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
}

const buttonStyle: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: '13px',
};

/**
 * Compact pagination control: Prev / "Page X of Y (N items)" / Next.
 * Hides itself when there is only one page (total <= pageSize).
 */
export const Pagination: React.FC<PaginationProps> = ({ page, pageSize, total, onPageChange }) => {
    if (pageSize <= 0) return null;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (totalPages <= 1) return null;

    const clamped = Math.min(Math.max(1, page), totalPages);
    const goTo = (next: number) => {
        const target = Math.min(Math.max(1, next), totalPages);
        if (target !== clamped) onPageChange(target);
    };

    return (
        <div
            role="navigation"
            aria-label="Pagination"
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '12px',
                padding: '16px',
                borderTop: '1px solid var(--border-secondary)',
                marginTop: '8px',
            }}
        >
            <button
                type="button"
                className="btn-secondary"
                onClick={() => goTo(clamped - 1)}
                disabled={clamped <= 1}
                style={buttonStyle}
                aria-label="Previous page"
            >
                ‹ Prev
            </button>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Page {clamped} of {totalPages} <span style={{ color: 'var(--text-muted)' }}>({total} items)</span>
            </span>
            <button
                type="button"
                className="btn-secondary"
                onClick={() => goTo(clamped + 1)}
                disabled={clamped >= totalPages}
                style={buttonStyle}
                aria-label="Next page"
            >
                Next ›
            </button>
        </div>
    );
};
