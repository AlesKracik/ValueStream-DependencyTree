import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ValueStreamEditPage } from '../ValueStreamEditPage';
import { ValueStreamProvider, NotificationProvider } from '../../contexts/ValueStreamContext';
import type { ValueStreamData } from '../../types/models';

const mockData: ValueStreamData = {
    valueStreams: [
        { id: 'd1', name: 'Existing Value Stream', description: 'Desc', parameters: { customerFilter: '', workItemFilter: '', releasedFilter: 'all', minTcvFilter: '', minScoreFilter: '', teamFilter: '', epicFilter: '', startSprintId: '', endSprintId: '' } }
    ],
    settings: { jira_base_url: '', jira_api_version: '3' },
    customers: [],
    workItems: [],
    teams: [],
    epics: [],
    sprints: [
        { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14' },
        { id: 's2', name: 'Sprint 2', start_date: '2026-01-15', end_date: '2026-01-28' }
    ]
};

describe('ValueStreamEditPage', () => {
    const defaultProps = {
        onBack: vi.fn(),
        data: mockData,
        loading: false,
        error: null,
        addValueStream: vi.fn(),
        updateValueStream: vi.fn(),
        deleteValueStream: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders "Create Value Stream" when ValueStreamId is "new"', () => {
        render(
            <NotificationProvider>
                <ValueStreamProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <ValueStreamEditPage {...defaultProps} valueStreamId="new" />
                </ValueStreamProvider>
            </NotificationProvider>
        );

        expect(screen.getByText('New Value Stream')).toBeDefined(); // The header shows "New Value Stream"
        const nameInput = screen.getByLabelText(/Name:/i) as HTMLInputElement;
        expect(nameInput.value).toBe('');
        expect(nameInput.placeholder).toBe('New Value Stream');
    });

    it('calls addValueStream when Create button is clicked', () => {
        render(
            <NotificationProvider>
                <ValueStreamProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <ValueStreamEditPage {...defaultProps} valueStreamId="new" />
                </ValueStreamProvider>
            </NotificationProvider>
        );

        const nameInput = screen.getByLabelText(/Name:/i);
        fireEvent.change(nameInput, { target: { value: 'My Brand New Value Stream' } });

        const createBtn = screen.getByText('Create');
        fireEvent.click(createBtn);

        expect(defaultProps.addValueStream).toHaveBeenCalledWith(expect.objectContaining({
            name: 'My Brand New Value Stream'
        }));
        expect(defaultProps.onBack).toHaveBeenCalled();
    });

    it('renders edit mode for existing Value Stream', () => {
        render(
            <NotificationProvider>
                <ValueStreamProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <ValueStreamEditPage {...defaultProps} valueStreamId="d1" />
                </ValueStreamProvider>
            </NotificationProvider>
        );

        expect(screen.getByText('Edit: Existing Value Stream')).toBeDefined();
        expect(screen.queryByText('Create')).toBeNull();
    });

    it('shows error if ValueStream not found', () => {
        render(
            <NotificationProvider>
                <ValueStreamProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <ValueStreamEditPage {...defaultProps} valueStreamId="invalid" />
                </ValueStreamProvider>
            </NotificationProvider>
        );

        expect(screen.getByText('ValueStream not found.')).toBeDefined();
    });

    it('renders Time Range sprint selects', () => {
        render(
            <NotificationProvider>
                <ValueStreamProvider value={{ data: mockData, updateEpic: vi.fn() }}>
                    <ValueStreamEditPage {...defaultProps} valueStreamId="new" />
                </ValueStreamProvider>
            </NotificationProvider>
        );

        expect(screen.getByLabelText(/Start Sprint:/i)).toBeDefined();
        expect(screen.getByLabelText(/End Sprint:/i)).toBeDefined();
        
        // Check options (using getAllByText because they appear in both selects)
        expect(screen.getAllByText('Sprint 1 (2026-01-01)').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Sprint 2 (2026-01-15)').length).toBeGreaterThan(0);
    });
});




