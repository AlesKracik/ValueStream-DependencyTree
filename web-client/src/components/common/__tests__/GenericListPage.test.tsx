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
    it('remembers sorting, filter, and scroll position across re-renders when pageId is provided', async () => {
        vi.useFakeTimers();
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
                        <button onClick={() => setShow(prev => !prev)}>Toggle</button>
                        {show && (
                            <GenericListPage
                                pageId="test-page-scroll"
                                title="Test Scroll"
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

        // 1. Find the list container and simulate scrolling
        const listContainer = container.querySelector('[class*="list"]') as HTMLDivElement;
        Object.defineProperty(listContainer, 'scrollTop', { value: 123, writable: true });
        
        // Trigger a state change to ensure the scroll position is saved (filter change is easiest)
        const filterInput = screen.getByPlaceholderText('Filter items...');
        fireEvent.change(filterInput, { target: { value: 'Apple' } });

        // 2. Unmount
        const toggleBtn = screen.getByText('Toggle');
        fireEvent.click(toggleBtn);
        expect(screen.queryByPlaceholderText('Filter items...')).toBeNull();

        // 3. Remount
        fireEvent.click(toggleBtn);

        // 4. Fast-forward timers to allow for the restoration delay
        await vi.runAllTimersAsync();

        // 5. Verify scroll position is restored
        const restoredListContainer = container.querySelector('[class*="list"]') as HTMLDivElement;
        expect(restoredListContainer.scrollTop).toBe(123);
        
        vi.useRealTimers();
    });
});
