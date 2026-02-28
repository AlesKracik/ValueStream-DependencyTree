import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchableDropdown } from '../SearchableDropdown';

const options = [
    { id: '1', label: 'Apple' },
    { id: '2', label: 'Banana' },
    { id: '3', label: 'Cherry' },
];

describe('SearchableDropdown', () => {
    it('renders with placeholder', () => {
        render(
            <SearchableDropdown 
                options={options} 
                onSelect={vi.fn()} 
                placeholder="Search fruit..." 
            />
        );
        expect(screen.getByPlaceholderText('Search fruit...')).toBeDefined();
    });

    it('shows options when focused', () => {
        render(
            <SearchableDropdown 
                options={options} 
                onSelect={vi.fn()} 
                placeholder="Search fruit..." 
            />
        );
        const input = screen.getByPlaceholderText('Search fruit...');
        fireEvent.focus(input);
        
        expect(screen.getByText('Apple')).toBeDefined();
        expect(screen.getByText('Banana')).toBeDefined();
        expect(screen.getByText('Cherry')).toBeDefined();
    });

    it('filters options based on search term', () => {
        render(
            <SearchableDropdown 
                options={options} 
                onSelect={vi.fn()} 
                placeholder="Search fruit..." 
            />
        );
        const input = screen.getByPlaceholderText('Search fruit...');
        fireEvent.change(input, { target: { value: 'ap' } });
        
        expect(screen.getByText('Apple')).toBeDefined();
        expect(screen.queryByText('Banana')).toBeNull();
        expect(screen.queryByText('Cherry')).toBeNull();
    });

    it('calls onSelect and closes list when option is clicked', () => {
        const onSelect = vi.fn();
        render(
            <SearchableDropdown 
                options={options} 
                onSelect={onSelect} 
                placeholder="Search fruit..." 
            />
        );
        const input = screen.getByPlaceholderText('Search fruit...');
        fireEvent.focus(input);
        
        fireEvent.click(screen.getByText('Banana'));
        
        expect(onSelect).toHaveBeenCalledWith('2');
        expect(screen.queryByText('Apple')).toBeNull();
    });

    it('clears search term after selection if clearOnSelect is true', () => {
        render(
            <SearchableDropdown 
                options={options} 
                onSelect={vi.fn()} 
                placeholder="Search fruit..." 
                clearOnSelect={true}
            />
        );
        const input = screen.getByPlaceholderText('Search fruit...') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'Apple' } });
        fireEvent.click(screen.getByText('Apple'));
        
        expect(input.value).toBe('');
    });

    it('does not clear search term after selection if clearOnSelect is false', () => {
        render(
            <SearchableDropdown 
                options={options} 
                onSelect={vi.fn()} 
                placeholder="Search fruit..." 
                clearOnSelect={false}
            />
        );
        const input = screen.getByPlaceholderText('Search fruit...') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'App' } });
        fireEvent.click(screen.getByText('Apple'));
        
        expect(input.value).toBe('Apple');
    });

    it('shows "No options found" when no match', () => {
        render(
            <SearchableDropdown 
                options={options} 
                onSelect={vi.fn()} 
                placeholder="Search fruit..." 
            />
        );
        const input = screen.getByPlaceholderText('Search fruit...');
        fireEvent.change(input, { target: { value: 'Zzz' } });
        
        expect(screen.getByText('No options found')).toBeDefined();
    });

    it('updates search term when initialValue changes and not open', () => {
        const { rerender } = render(
            <SearchableDropdown 
                options={options} 
                onSelect={vi.fn()} 
                placeholder="Search fruit..." 
                initialValue="Initial"
            />
        );
        const input = screen.getByPlaceholderText('Search fruit...') as HTMLInputElement;
        expect(input.value).toBe('Initial');

        rerender(
            <SearchableDropdown 
                options={options} 
                onSelect={vi.fn()} 
                placeholder="Search fruit..." 
                initialValue="Updated"
            />
        );
        expect(input.value).toBe('Updated');
    });
});
