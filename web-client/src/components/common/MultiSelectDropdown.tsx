import React, { useEffect, useRef, useState } from 'react';

export interface MultiSelectOption {
    value: string;
    label: string;
}

interface Props {
    options: MultiSelectOption[];
    selected: string[];
    onChange: (next: string[]) => void;
    /** Label shown in the trigger when nothing is selected. */
    placeholder?: string;
    ariaLabel?: string;
    /** Trigger button width. Defaults to a sensible 200px. */
    width?: number | string;
    /**
     * Trigger sizing. 'standard' matches the global input style (8px/14px/6r),
     * for pages whose other filter fields are native inputs (e.g. Value Stream
     * dashboard). 'compact' (6px/13px/4r) matches the list-page custom input
     * pattern used on Work Items / Support.
     */
    size?: 'standard' | 'compact';
}

/**
 * Lightweight checkbox-list dropdown. The trigger button summarizes the current
 * selection ("3 selected" or the single label) and opens a panel of checkboxes
 * below. Clicks outside the component close it.
 */
export const MultiSelectDropdown: React.FC<Props> = ({
    options, selected, onChange, placeholder = 'Select...', ariaLabel, width = 200,
    size = 'standard',
}) => {
    const triggerPadding = size === 'compact' ? '6px 10px' : '8px 12px';
    const triggerFontSize = size === 'compact' ? '13px' : '14px';
    const triggerRadius = size === 'compact' ? '4px' : '6px';
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDocClick = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onEsc);
        };
    }, [open]);

    const toggleValue = (value: string) => {
        const next = selected.includes(value)
            ? selected.filter(v => v !== value)
            : [...selected, value];
        onChange(next);
    };

    const summary = (() => {
        if (selected.length === 0) return placeholder;
        if (selected.length === 1) {
            return options.find(o => o.value === selected[0])?.label ?? selected[0];
        }
        return `${selected.length} selected`;
    })();

    return (
        <div ref={rootRef} style={{ position: 'relative', width }}>
            <button
                type="button"
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%',
                    padding: triggerPadding,
                    borderRadius: triggerRadius,
                    border: '1px solid var(--border-primary)',
                    background: 'var(--bg-tertiary)',
                    color: selected.length === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                    fontSize: triggerFontSize,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '6px',
                }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>▾</span>
            </button>
            {open && (
                <div
                    role="listbox"
                    aria-multiselectable="true"
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        right: 0,
                        minWidth: '100%',
                        maxHeight: '260px',
                        overflowY: 'auto',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '4px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
                        zIndex: 50,
                        padding: '4px 0',
                    }}
                >
                    {options.length === 0 && (
                        <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '12px' }}>
                            No options
                        </div>
                    )}
                    {options.map(opt => {
                        const isSelected = selected.includes(opt.value);
                        return (
                            <label
                                key={opt.value}
                                role="option"
                                aria-selected={isSelected}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '6px 12px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    color: 'var(--text-primary)',
                                    background: isSelected ? 'var(--accent-primary-bg, transparent)' : 'transparent',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleValue(opt.value)}
                                    style={{ cursor: 'pointer' }}
                                />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {opt.label}
                                </span>
                            </label>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
