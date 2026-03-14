import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ValueStreamEditPage } from '../ValueStreamEditPage';
import { useValueStreamContext } from '../../contexts/ValueStreamContext';
import type { ValueStreamData } from '../../types/models';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../contexts/ValueStreamContext', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        useValueStreamContext: vi.fn()
    };
});

const mockData: ValueStreamData = {
    settings: {
        general: { fiscal_year_start_month: 1, sprint_duration_days: 14 },
        persistence: { 
            mongo: { 
                app: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false },
                customer: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false }
            }
        },
        jira: { base_url: '', api_version: '3' },
        ai: { provider: 'openai' }
    },
    customers: [],
    workItems: [],
    teams: [],
    epics: [],
    sprints: [
        { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14' },
        { id: 's2', name: 'Sprint 2', start_date: '2026-01-15', end_date: '2026-01-28' }
    ],
    valueStreams: [
        { id: 'd1', name: 'Existing Value Stream', description: 'Desc', parameters: { customerFilter: 'c1' } as any }
    ]
};

describe('ValueStreamEditPage', () => {
    const onBack = vi.fn();
    const addValueStream = vi.fn();
    const updateValueStream = vi.fn();
    const deleteValueStream = vi.fn();
    const updateEpic = vi.fn();
    const mockShowConfirm = vi.fn().mockResolvedValue(true);

    const defaultProps = {
        onBack,
        data: mockData,
        loading: false,
        error: null,
        addValueStream,
        updateValueStream,
        deleteValueStream
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            data: mockData,
            updateEpic
        });
    });

    it('renders "Create Value Stream" when ValueStreamId is "new"', () => {
        render(
            <MemoryRouter>
                <ValueStreamEditPage {...defaultProps} valueStreamId="new" />
            </MemoryRouter>
        );

        expect(screen.getByText('New Value Stream')).toBeDefined();
        expect(screen.getByText('Create')).toBeDefined();
    });

    it('calls addValueStream when Create button is clicked', () => {
        render(
            <MemoryRouter>
                <ValueStreamEditPage {...defaultProps} valueStreamId="new" />
            </MemoryRouter>
        );

        const nameInput = screen.getByLabelText(/Name:/i);
        fireEvent.change(nameInput, { target: { value: 'New VS Name' } });

        const createBtn = screen.getByText('Create');
        fireEvent.click(createBtn);

        expect(addValueStream).toHaveBeenCalledWith(expect.objectContaining({
            name: 'New VS Name'
        }));
        expect(onBack).toHaveBeenCalled();
    });

    it('renders edit mode for existing Value Stream', () => {
        render(
            <MemoryRouter>
                <ValueStreamEditPage {...defaultProps} valueStreamId="d1" />
            </MemoryRouter>
        );

        expect(screen.getByText('Edit: Existing Value Stream')).toBeDefined();
        expect(screen.getByText('Delete Value Stream')).toBeDefined();
        expect(screen.getByDisplayValue('Existing Value Stream')).toBeDefined();
    });

    it('shows error if ValueStream not found', () => {
        render(
            <MemoryRouter>
                <ValueStreamEditPage {...defaultProps} valueStreamId="non-existent" />
            </MemoryRouter>
        );

        expect(screen.getByText('ValueStream not found.')).toBeDefined();
    });

    it('renders Time Range sprint selects', () => {
        render(
            <MemoryRouter>
                <ValueStreamEditPage {...defaultProps} valueStreamId="new" />
            </MemoryRouter>
        );

        expect(screen.getByLabelText(/Start Sprint:/i)).toBeDefined();
        expect(screen.getByLabelText(/End Sprint:/i)).toBeDefined();
        
        // Check options (using getAllByText because they appear in both selects)
        expect(screen.getAllByText('Sprint 1 (2026-01-01)').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Sprint 2 (2026-01-15)').length).toBeGreaterThan(0);
    });

    it('updates existing Value Stream on change', () => {
        render(
            <MemoryRouter>
                <ValueStreamEditPage {...defaultProps} valueStreamId="d1" />
            </MemoryRouter>
        );

        const nameInput = screen.getByLabelText(/Name:/i);
        fireEvent.change(nameInput, { target: { value: 'Updated Name' } });

        expect(updateValueStream).toHaveBeenCalledWith('d1', expect.objectContaining({
            name: 'Updated Name'
        }));

        const customerFilterInput = screen.getByLabelText(/Customer Filter:/i);
        fireEvent.change(customerFilterInput, { target: { value: 'New Filter' } });

        expect(updateValueStream).toHaveBeenCalledWith('d1', expect.objectContaining({
            parameters: expect.objectContaining({ customerFilter: 'New Filter' })
        }));
    });

    it('deletes Value Stream after confirmation', async () => {
        render(
            <MemoryRouter>
                <ValueStreamEditPage {...defaultProps} valueStreamId="d1" />
            </MemoryRouter>
        );

        const deleteBtn = screen.getByText('Delete Value Stream');
        fireEvent.click(deleteBtn);

        expect(mockShowConfirm).toHaveBeenCalledWith('Delete Value Stream', expect.stringContaining('Existing Value Stream'));
        
        // Wait for promise resolution
        await vi.waitFor(() => {
            expect(deleteValueStream).toHaveBeenCalledWith('d1');
            expect(onBack).toHaveBeenCalled();
        });
    });

    it('calls onBack when Back button is clicked', () => {
        render(
            <MemoryRouter>
                <ValueStreamEditPage {...defaultProps} valueStreamId="d1" />
            </MemoryRouter>
        );

        const backBtn = screen.getByText(/Back/i);
        fireEvent.click(backBtn);

        expect(onBack).toHaveBeenCalled();
    });

    it('shows loading message when loading is true', () => {
        render(
            <MemoryRouter>
                <ValueStreamEditPage {...defaultProps} data={null} loading={true} valueStreamId="new" />
            </MemoryRouter>
        );

        expect(screen.getByText('Loading ValueStream details...')).toBeDefined();
    });

    it('shows error message when error is provided', () => {
        const error = new Error('Failed to load');
        render(
            <MemoryRouter>
                <ValueStreamEditPage {...defaultProps} data={null} error={error} valueStreamId="new" />
            </MemoryRouter>
        );

        expect(screen.getByText(/Failed to load/i)).toBeDefined();
    });
});
