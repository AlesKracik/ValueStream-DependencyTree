import React from 'react';

/** Shared props for all form field components */
interface FormFieldBaseProps {
    /** Label text displayed above the input */
    label: string;
    /** Optional React node rendered inline after the label text */
    labelSuffix?: React.ReactNode;
    /** Helper text displayed below the label */
    helperText?: string;
    /** Whether the field is read-only */
    readOnly?: boolean;
    /** Additional CSS styles for the wrapping label element */
    style?: React.CSSProperties;
    /** Additional CSS styles applied directly to the input/select element */
    inputStyle?: React.CSSProperties;
}

/* ─── FormTextField ──────────────────────────────────────────────── */

interface FormTextFieldProps extends FormFieldBaseProps {
    value: string | number;
    onChange: (value: string) => void;
    placeholder?: string;
}

export const FormTextField: React.FC<FormTextFieldProps> = ({
    label, labelSuffix, helperText, readOnly, style, inputStyle,
    value, onChange, placeholder
}) => (
    <label style={style}>
        <span>{label}{labelSuffix}</span>
        {helperText && <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '-2px', marginBottom: '4px' }}>{helperText}</span>}
        <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            readOnly={readOnly}
            style={{
                ...(readOnly ? { backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' } : {}),
                ...inputStyle
            }}
        />
    </label>
);

/* ─── FormNumberField ────────────────────────────────────────────── */

interface FormNumberFieldProps extends FormFieldBaseProps {
    value: number | string;
    onChange: (value: number | undefined) => void;
    placeholder?: string;
    min?: number;
    max?: number;
    /** Use parseFloat instead of parseInt (default: false = parseInt) */
    float?: boolean;
}

export const FormNumberField: React.FC<FormNumberFieldProps> = ({
    label, labelSuffix, helperText, readOnly, style, inputStyle,
    value, onChange, placeholder, min, max, float
}) => (
    <label style={style}>
        <span>{label}{labelSuffix}</span>
        {helperText && <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '-2px', marginBottom: '4px' }}>{helperText}</span>}
        <input
            type="number"
            value={value}
            onChange={e => {
                if (e.target.value === '') {
                    onChange(undefined);
                } else {
                    const parsed = float ? parseFloat(e.target.value) : parseInt(e.target.value);
                    if (!isNaN(parsed)) onChange(parsed);
                }
            }}
            placeholder={placeholder}
            min={min}
            max={max}
            readOnly={readOnly}
            style={{
                ...(readOnly ? { backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' } : {}),
                ...inputStyle
            }}
        />
    </label>
);

/* ─── FormDateField ──────────────────────────────────────────────── */

interface FormDateFieldProps extends FormFieldBaseProps {
    value: string;
    onChange: (value: string) => void;
}

export const FormDateField: React.FC<FormDateFieldProps> = ({
    label, labelSuffix, helperText, readOnly, style, inputStyle,
    value, onChange
}) => (
    <label style={style}>
        <span>{label}{labelSuffix}</span>
        {helperText && <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '-2px', marginBottom: '4px' }}>{helperText}</span>}
        <input
            type="date"
            value={value}
            onChange={e => onChange(e.target.value)}
            readOnly={readOnly}
            style={{
                ...(readOnly ? { backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)' } : {}),
                ...inputStyle
            }}
        />
    </label>
);

/* ─── FormSelectField ────────────────────────────────────────────── */

export interface SelectOption {
    value: string | number;
    label: string;
}

interface FormSelectFieldProps extends FormFieldBaseProps {
    value: string | number;
    onChange: (value: string) => void;
    options: SelectOption[];
}

export const FormSelectField: React.FC<FormSelectFieldProps> = ({
    label, labelSuffix, helperText, readOnly, style, inputStyle,
    value, onChange, options
}) => (
    <label style={style}>
        <span>{label}{labelSuffix}</span>
        {helperText && <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '-2px', marginBottom: '4px' }}>{helperText}</span>}
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            disabled={readOnly}
            style={inputStyle}
        >
            {options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
        </select>
    </label>
);

/* ─── FormTextArea ───────────────────────────────────────────────── */

interface FormTextAreaProps extends FormFieldBaseProps {
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    placeholder?: string;
    rows?: number;
    /** Additional CSS styles for the textarea (merged with inputStyle) */
    textareaStyle?: React.CSSProperties;
}

export const FormTextArea: React.FC<FormTextAreaProps> = ({
    label, labelSuffix, helperText, readOnly, style, inputStyle,
    value, onChange, onBlur, placeholder, rows, textareaStyle
}) => (
    <label style={style}>
        <span>{label}{labelSuffix}</span>
        {helperText && <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '-2px', marginBottom: '4px' }}>{helperText}</span>}
        <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            onBlur={onBlur}
            placeholder={placeholder}
            rows={rows}
            readOnly={readOnly}
            style={{ ...inputStyle, ...textareaStyle }}
        />
    </label>
);
