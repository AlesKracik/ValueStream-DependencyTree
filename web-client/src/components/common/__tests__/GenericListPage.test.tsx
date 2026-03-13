import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GenericListPage } from '../GenericListPage';
import { MemoryRouter } from 'react-router-dom';
import { ValueStreamProvider, NotificationProvider } from '../../../contexts/ValueStreamContext';
import React from 'react';

const mockItems = [
    { id: '1', name: 'Zebra', value: 10 },
    { id: '2', name: 'Apple', value: 50 },
    { id: '3', name: 'Monkey', value: 20 },
];

const sortOptions = [
    { label: 'Name', key: 'name', getValue: (i: any) => i.name },
    { label: 'Value', key: 'value', getValue: (i: any) => i.value },
];

const columns = [
    { header: 'Name', render: (i: any) => i.name, sortKey: 'name' },
    { header: 'Value', render: (i: any) => i.value, sortKey: 'value' },
];

const filterPredicate = (i: any, q: string) => i.name.toLowerCase().includes(q.toLowerCase());

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <ValueStreamProvider value={{ 
        data: null, 
        updateEpic: vi.fn(), 
        addEpic: vi.fn(), 
        deleteEpic: vi.fn() 
    }}>
        <MemoryRouter>
            {children}
        </MemoryRouter>
    </ValueStreamProvider>
);

describe('GenericListPage State Persistence', () => {
    it('remembers sorting and filter across re-renders when pageId is provided', () => {
        const TestApp = () => {
            const [show, setShow] = React.useState(true);
            return (
                <NotificationProvider>
                    <ValueStreamProvider value={{ 
                        data: null, 
                        updateEpic: vi.fn(), 
                        addEpic: vi.fn(), 
                        deleteEpic: vi.fn() 
                    }}>
                        <button onClick={() => setShow(!show)}>Toggle</button>
                        {show && (
                            <GenericListPage
                                pageId="test-page"
                                title="Test"
                                items={mockItems}
                                loading={false}
                                filterPredicate={filterPredicate}
                                sortOptions={sortOptions}
                                columns={columns}
                                onItemClick={vi.fn()}
                            />
                        )}
                    </ValueStreamProvider>
                </NotificationProvider>
            );
        };

        const { container } = render(
            <MemoryRouter>
                <TestApp />
            </MemoryRouter>
        );

        // 1. Initial state (sorted by name: Apple, Monkey, Zebra)
        let items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Apple');

        // 2. Change sort to Value (asc): Zebra (10), Monkey (20), Apple (50)
        const valueHeader = screen.getByRole('button', { name: /Value/i });
        fireEvent.click(valueHeader);

        items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Zebra');

        // 3. Set filter
        const filterInput = screen.getByPlaceholderText('Filter items...');
        fireEvent.change(filterInput, { target: { value: 'Monkey' } });
        expect(screen.getByText('Monkey')).toBeDefined();
        expect(screen.queryByText('Zebra')).toBeNull();

        // 4. "Navigate away" (unmount component but keep provider)
        const toggleBtn = screen.getByText('Toggle');
        fireEvent.click(toggleBtn);
        expect(screen.queryByPlaceholderText('Filter items...')).toBeNull();

        // 5. "Navigate back" (remount component)
        fireEvent.click(toggleBtn);

        // 6. Verify state is restored
        const restoredFilterInput = screen.getByPlaceholderText('Filter items...') as HTMLInputElement;
        expect(restoredFilterInput.value).toBe('Monkey');
        
        items = container.querySelectorAll('[class*="listItem"]');
        expect(items.length).toBe(1);
        expect(items[0].textContent).toContain('Monkey');

        // Clear filter to check sorting
        fireEvent.change(restoredFilterInput, { target: { value: '' } });
        items = container.querySelectorAll('[class*="listItem"]');
        expect(items[0].textContent).toContain('Zebra');
        expect(items[1].textContent).toContain('Monkey');
        expect(items[2].textContent).toContain('Apple');
    });
});
