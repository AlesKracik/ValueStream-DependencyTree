import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from '../App';
import * as useDashboardDataHook from '../hooks/useDashboardData';

vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>();
    return {
        ...actual,
        BrowserRouter: actual.MemoryRouter,
    };
});

// Mock the components
vi.mock('../components/dashboard/Dashboard', () => ({
    Dashboard: ({ viewState, setViewState, onNavigateToCustomer, onNavigateToFeature, onNavigateToEpic, onNavigateToTeam }: any) => (
        <div data-testid="dashboard">
            <span data-testid="sprint-offset">{viewState.sprintOffset}</span>
            <span data-testid="customer-filter">{viewState.customerFilter}</span>
            <button
                data-testid="change-filter-btn"
                onClick={() => setViewState({ ...viewState, customerFilter: 'TestCustomer', sprintOffset: 2 })}
            >
                Change Filter
            </button>
            <button data-testid="nav-customer-btn" onClick={() => onNavigateToCustomer('cust-1')}>Nav Customer</button>
            <button data-testid="nav-feature-btn" onClick={() => onNavigateToFeature('feat-1')}>Nav Feature</button>
            <button data-testid="nav-epic-btn" onClick={() => onNavigateToEpic('epic-1')}>Nav Epic</button>
            <button data-testid="nav-team-btn" onClick={() => onNavigateToTeam('team-1')}>Nav Team</button>
        </div>
    )
}));

vi.mock('../components/customers/CustomerPage', () => ({
    CustomerPage: ({ onBack }: any) => (
        <div data-testid="customer-page">
            <button data-testid="back-btn" onClick={onBack}>Back</button>
        </div>
    )
}));

vi.mock('../components/features/FeaturePage', () => ({
    FeaturePage: ({ onBack }: any) => (
        <div data-testid="feature-page">
            <button data-testid="back-btn" onClick={onBack}>Back</button>
        </div>
    )
}));

vi.mock('../components/epics/EpicPage', () => ({
    EpicPage: ({ onBack }: any) => (
        <div data-testid="epic-page">
            <button data-testid="back-btn" onClick={onBack}>Back</button>
        </div>
    )
}));

vi.mock('../components/teams/TeamPage', () => ({
    TeamPage: ({ onBack }: any) => (
        <div data-testid="team-page">
            <button data-testid="back-btn" onClick={onBack}>Back</button>
        </div>
    )
}));

describe('App Component State Preservation', () => {
    beforeEach(() => {
        vi.spyOn(useDashboardDataHook, 'useDashboardData').mockReturnValue({
            data: null,
            loading: false,
            error: null,
            addCustomer: vi.fn(),
            deleteCustomer: vi.fn(),
            updateCustomer: vi.fn(),
            addFeature: vi.fn(),
            deleteFeature: vi.fn(),
            updateFeature: vi.fn(),
            updateTeam: vi.fn(),
            addEpic: vi.fn(),
            deleteEpic: vi.fn(),
            updateEpic: vi.fn(),
            updateSettings: vi.fn(),
            saveDashboardData: vi.fn().mockResolvedValue(undefined),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('preserves dashboard viewState when navigating to customer page and back', () => {
        render(<App />);

        // Initial state
        expect(screen.getByTestId('dashboard')).toBeDefined();
        expect(screen.getByTestId('sprint-offset').textContent).toBe('0');
        expect(screen.getByTestId('customer-filter').textContent).toBe('');

        // Change state
        fireEvent.click(screen.getByTestId('change-filter-btn'));
        expect(screen.getByTestId('sprint-offset').textContent).toBe('2');
        expect(screen.getByTestId('customer-filter').textContent).toBe('TestCustomer');

        // Navigate away to Customer Page
        fireEvent.click(screen.getByTestId('nav-customer-btn'));
        expect(screen.queryByTestId('dashboard')).toBeNull();
        expect(screen.getByTestId('customer-page')).toBeDefined();

        // Navigate back to Dashboard
        fireEvent.click(screen.getByTestId('back-btn'));
        expect(screen.getByTestId('dashboard')).toBeDefined();

        // State should be preserved
        expect(screen.getByTestId('sprint-offset').textContent).toBe('2');
        expect(screen.getByTestId('customer-filter').textContent).toBe('TestCustomer');
    });

    it('preserves dashboard viewState when navigating to feature page and back', () => {
        render(<App />);

        // Initial state
        expect(screen.getByTestId('dashboard')).toBeDefined();

        // Change state
        fireEvent.click(screen.getByTestId('change-filter-btn'));
        expect(screen.getByTestId('sprint-offset').textContent).toBe('2');

        // Navigate away to Feature Page
        fireEvent.click(screen.getByTestId('nav-feature-btn'));
        expect(screen.queryByTestId('dashboard')).toBeNull();
        expect(screen.getByTestId('feature-page')).toBeDefined();

        // Navigate back to Dashboard
        fireEvent.click(screen.getByTestId('back-btn'));
        expect(screen.getByTestId('dashboard')).toBeDefined();

        // State should be preserved
        expect(screen.getByTestId('sprint-offset').textContent).toBe('2');
        expect(screen.getByTestId('customer-filter').textContent).toBe('TestCustomer');
    });

    it('preserves dashboard viewState when navigating to epic page and back', () => {
        render(<App />);

        // Initial state
        expect(screen.getByTestId('dashboard')).toBeDefined();

        // Change state
        fireEvent.click(screen.getByTestId('change-filter-btn'));
        expect(screen.getByTestId('sprint-offset').textContent).toBe('2');

        // Navigate away to Epic Page
        fireEvent.click(screen.getByTestId('nav-epic-btn'));
        expect(screen.queryByTestId('dashboard')).toBeNull();
        expect(screen.getByTestId('epic-page')).toBeDefined();

        // Navigate back to Dashboard
        fireEvent.click(screen.getByTestId('back-btn'));
        expect(screen.getByTestId('dashboard')).toBeDefined();

        // State should be preserved
        expect(screen.getByTestId('sprint-offset').textContent).toBe('2');
        expect(screen.getByTestId('customer-filter').textContent).toBe('TestCustomer');
    });

    it('preserves dashboard viewState when navigating to team page and back', () => {
        render(<App />);

        // Initial state
        expect(screen.getByTestId('dashboard')).toBeDefined();

        // Change state
        fireEvent.click(screen.getByTestId('change-filter-btn'));
        expect(screen.getByTestId('sprint-offset').textContent).toBe('2');

        // Navigate away to Team Page
        fireEvent.click(screen.getByTestId('nav-team-btn'));
        expect(screen.queryByTestId('dashboard')).toBeNull();
        expect(screen.getByTestId('team-page')).toBeDefined();

        // Navigate back to Dashboard
        fireEvent.click(screen.getByTestId('back-btn'));
        expect(screen.getByTestId('dashboard')).toBeDefined();

        // State should be preserved
        expect(screen.getByTestId('sprint-offset').textContent).toBe('2');
        expect(screen.getByTestId('customer-filter').textContent).toBe('TestCustomer');
    });
});
