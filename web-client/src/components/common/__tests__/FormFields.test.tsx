import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormTextField, FormNumberField, FormDateField, FormSelectField, FormTextArea } from '../FormFields';

describe('FormTextField', () => {
    it('renders label and input with value', () => {
        render(<FormTextField label="Name" value="Alice" onChange={vi.fn()} />);
        expect(screen.getByText('Name')).toBeDefined();
        expect(screen.getByDisplayValue('Alice')).toBeDefined();
    });

    it('calls onChange with string value', () => {
        const onChange = vi.fn();
        render(<FormTextField label="Name" value="" onChange={onChange} />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Bob' } });
        expect(onChange).toHaveBeenCalledWith('Bob');
    });

    it('renders as read-only when specified', () => {
        render(<FormTextField label="Name" value="Alice" onChange={vi.fn()} readOnly />);
        expect(screen.getByRole('textbox').hasAttribute('readonly')).toBe(true);
    });

    it('renders helper text when provided', () => {
        render(<FormTextField label="Name" value="" onChange={vi.fn()} helperText="Enter your name" />);
        expect(screen.getByText('Enter your name')).toBeDefined();
    });

    it('renders placeholder', () => {
        render(<FormTextField label="Name" value="" onChange={vi.fn()} placeholder="Type here" />);
        expect(screen.getByPlaceholderText('Type here')).toBeDefined();
    });
});

describe('FormNumberField', () => {
    it('renders label and numeric input', () => {
        render(<FormNumberField label="Effort" value={42} onChange={vi.fn()} />);
        expect(screen.getByText('Effort')).toBeDefined();
        expect(screen.getByDisplayValue('42')).toBeDefined();
    });

    it('calls onChange with parsed integer by default', () => {
        const onChange = vi.fn();
        render(<FormNumberField label="Effort" value={0} onChange={onChange} />);
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '10' } });
        expect(onChange).toHaveBeenCalledWith(10);
    });

    it('calls onChange with parsed float when float prop is set', () => {
        const onChange = vi.fn();
        render(<FormNumberField label="Effort" value={0} onChange={onChange} float />);
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3.5' } });
        expect(onChange).toHaveBeenCalledWith(3.5);
    });

    it('calls onChange with undefined when input is cleared', () => {
        const onChange = vi.fn();
        render(<FormNumberField label="Effort" value={10} onChange={onChange} />);
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } });
        expect(onChange).toHaveBeenCalledWith(undefined);
    });

    it('respects min and max attributes', () => {
        render(<FormNumberField label="Days" value={5} onChange={vi.fn()} min={1} max={365} />);
        const input = screen.getByRole('spinbutton');
        expect(input.getAttribute('min')).toBe('1');
        expect(input.getAttribute('max')).toBe('365');
    });
});

describe('FormDateField', () => {
    it('renders label and date input with value', () => {
        render(<FormDateField label="Start Date" value="2024-01-15" onChange={vi.fn()} />);
        expect(screen.getByText('Start Date')).toBeDefined();
        expect(screen.getByDisplayValue('2024-01-15')).toBeDefined();
    });

    it('calls onChange with date string', () => {
        const onChange = vi.fn();
        render(<FormDateField label="Start Date" value="" onChange={onChange} />);
        fireEvent.change(screen.getByDisplayValue(''), { target: { value: '2024-06-01' } });
        expect(onChange).toHaveBeenCalledWith('2024-06-01');
    });

    it('renders as read-only when specified', () => {
        render(<FormDateField label="Start Date" value="2024-01-15" onChange={vi.fn()} readOnly />);
        const input = screen.getByDisplayValue('2024-01-15');
        expect(input.hasAttribute('readonly')).toBe(true);
    });
});

describe('FormSelectField', () => {
    const options = [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
        { value: 'c', label: 'Gamma' },
    ];

    it('renders label and select with options', () => {
        render(<FormSelectField label="Status" value="a" onChange={vi.fn()} options={options} />);
        expect(screen.getByText('Status')).toBeDefined();
        expect(screen.getByText('Alpha')).toBeDefined();
        expect(screen.getByText('Beta')).toBeDefined();
        expect(screen.getByText('Gamma')).toBeDefined();
    });

    it('calls onChange with selected value', () => {
        const onChange = vi.fn();
        render(<FormSelectField label="Status" value="a" onChange={onChange} options={options} />);
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } });
        expect(onChange).toHaveBeenCalledWith('b');
    });

    it('disables select when readOnly', () => {
        render(<FormSelectField label="Status" value="a" onChange={vi.fn()} options={options} readOnly />);
        expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
    });
});

describe('FormTextArea', () => {
    it('renders label and textarea with value', () => {
        render(<FormTextArea label="Description" value="Hello world" onChange={vi.fn()} />);
        expect(screen.getByText('Description')).toBeDefined();
        expect(screen.getByDisplayValue('Hello world')).toBeDefined();
    });

    it('calls onChange with text value', () => {
        const onChange = vi.fn();
        render(<FormTextArea label="Description" value="" onChange={onChange} />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New text' } });
        expect(onChange).toHaveBeenCalledWith('New text');
    });

    it('calls onBlur when focus is lost', () => {
        const onBlur = vi.fn();
        render(<FormTextArea label="Description" value="" onChange={vi.fn()} onBlur={onBlur} />);
        fireEvent.blur(screen.getByRole('textbox'));
        expect(onBlur).toHaveBeenCalledOnce();
    });

    it('renders with specified rows', () => {
        render(<FormTextArea label="Description" value="" onChange={vi.fn()} rows={8} />);
        expect(screen.getByRole('textbox').getAttribute('rows')).toBe('8');
    });
});
