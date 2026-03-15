import { render, screen, fireEvent } from '@testing-library/react';
import { GenericDetailPage, type DetailTab } from '../GenericDetailPage';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';

const mockTabs: DetailTab[] = [
    { id: 'tab1', label: 'Tab 1', content: <div data-testid="content-tab1">Content 1</div> },
    { id: 'tab2', label: 'Tab 2', content: <div data-testid="content-tab2">Content 2</div> },
];

describe('GenericDetailPage', () => {
    it('allows switching tabs when initialTabId is provided', () => {
        const { rerender } = render(
            <BrowserRouter>
                <GenericDetailPage
                    entityTitle="Test Entity"
                    onBack={() => {}}
                    mainDetails={<div>Main</div>}
                    tabs={mockTabs}
                    initialTabId="tab1"
                    data={{}}
                />
            </BrowserRouter>
        );

        // Initially Tab 1 is active
        expect(screen.getByTestId('content-tab1')).toBeDefined();
        expect(screen.queryByTestId('content-tab2')).toBeNull();

        // Click Tab 2
        const tab2Button = screen.getByText('Tab 2');
        fireEvent.click(tab2Button);

        // Now Tab 2 should be active
        expect(screen.getByTestId('content-tab2')).toBeDefined();
        expect(screen.queryByTestId('content-tab1')).toBeNull();

        // Rerender with the SAME initialTabId (simulating a parent rerender)
        rerender(
            <BrowserRouter>
                <GenericDetailPage
                    entityTitle="Test Entity"
                    onBack={() => {}}
                    mainDetails={<div>Main</div>}
                    tabs={mockTabs}
                    initialTabId="tab1"
                    data={{}}
                />
            </BrowserRouter>
        );

        // It should STAY on Tab 2
        expect(screen.getByTestId('content-tab2')).toBeDefined();
        expect(screen.queryByTestId('content-tab1')).toBeNull();
    });

    it('switches tabs when initialTabId CHANGES', () => {
        const { rerender } = render(
            <BrowserRouter>
                <GenericDetailPage
                    entityTitle="Test Entity"
                    onBack={() => {}}
                    mainDetails={<div>Main</div>}
                    tabs={mockTabs}
                    initialTabId="tab1"
                    data={{}}
                />
            </BrowserRouter>
        );

        expect(screen.getByTestId('content-tab1')).toBeDefined();

        // Rerender with DIFFERENT initialTabId
        rerender(
            <BrowserRouter>
                <GenericDetailPage
                    entityTitle="Test Entity"
                    onBack={() => {}}
                    mainDetails={<div>Main</div>}
                    tabs={mockTabs}
                    initialTabId="tab2"
                    data={{}}
                />
            </BrowserRouter>
        );

        // It should switch to Tab 2
        expect(screen.getByTestId('content-tab2')).toBeDefined();
    });
});
