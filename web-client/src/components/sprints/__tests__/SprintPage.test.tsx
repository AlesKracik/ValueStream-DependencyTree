import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SprintPage } from '../SprintPage';
import { ValueStreamProvider, NotificationProvider, useValueStreamContext } from '../../../contexts/ValueStreamContext';
import type { ValueStreamData } from '@valuestream/shared-types';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../../contexts/ValueStreamContext', async (importOriginal) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        jira: { base_url: '', api_version: '3', api_token: '', customer: { jql_new: '', jql_in_progress: '', jql_noop: '' } },
        aha: { subdomain: '', api_key: '' },
        ai: { provider: 'openai', support: { prompt: '' } },
        ldap: { url: '', bind_dn: '', team: { base_dn: '', search_filter: '' } }
    },    customers: [],
    workItems: [],
    teams: [],
    issues: [],
    sprints: [
        { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14', quarter: 'FY2026 Q1' }
    ],
    valueStreams: [],
    metrics: { maxScore: 100, maxRoi: 10 }
};

describe('SprintPage', () => {
    const updateSprintSpy = vi.fn();
    const addSprintSpy = vi.fn();
    const deleteSprintSpy = vi.fn();
    const archiveSprintSpy = vi.fn();
    const mockShowConfirm = vi.fn().mockResolvedValue(true);

    const defaultProps = {
        data: mockData,
        loading: false,
        updateSprint: updateSprintSpy,
        addSprint: addSprintSpy,
        deleteSprint: deleteSprintSpy,
        archiveSprint: archiveSprintSpy
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            data: mockData,
            updateIssue: vi.fn()
        });
    });

    const renderSprintPage = (props = defaultProps, id = 's1') => {
        return render(
            <MemoryRouter initialEntries={[`/sprint/${id}`]}>
                <NotificationProvider>
                    <ValueStreamProvider value={{ data: props.data || mockData, updateIssue: vi.fn(), addIssue: vi.fn(), deleteIssue: vi.fn() }}>
                        <Routes>
                            <Route path="/sprint/:id" element={<SprintPage {...props} error={null} />} />
                        </Routes>
                    </ValueStreamProvider>
                </NotificationProvider>
            </MemoryRouter>
        );
    };

    it('renders sprint header', () => {
        renderSprintPage();
        expect(screen.getByText('Sprint Management')).toBeDefined();
    });

    it('renders editable name field', () => {
        renderSprintPage();
        const nameInput = screen.getByDisplayValue('Sprint 1') as HTMLInputElement;
        expect(nameInput).toBeDefined();
    });

    it('calls updateSprint when name changes', () => {
        renderSprintPage();
        const nameInput = screen.getByDisplayValue('Sprint 1');
        fireEvent.change(nameInput, { target: { value: 'New Name' } });
        expect(updateSprintSpy).toHaveBeenCalledWith('s1', { name: 'New Name' });
    });

    it('starts sprint creation flow when + Create Next Sprint is clicked', () => {
        renderSprintPage();
        const nextBtn = screen.getByText('+ Create Next Sprint');
        fireEvent.click(nextBtn);

        expect(screen.getByText('NEW')).toBeDefined();
        expect(screen.getByText(/Draft/i)).toBeDefined();
        
        // Dates are in a div
        expect(screen.getByText(/2026-01-15/i)).toBeDefined();
        expect(screen.getByText(/2026-01-28/i)).toBeDefined();
    });

    it('calls addSprint when save button is clicked in creation flow', async () => {
        renderSprintPage();
        fireEvent.click(screen.getByText('+ Create Next Sprint'));
        
        const inputs = screen.getAllByRole('textbox');
        const nameInput = inputs[inputs.length - 1]; 
        fireEvent.change(nameInput, { target: { value: 'Sprint 2' } });
        
        const saveBtn = screen.getByText('Save');
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(addSprintSpy).toHaveBeenCalledWith(expect.objectContaining({
                name: 'Sprint 2',
                start_date: '2026-01-15'
            }));
        });
    });

    it('prompts for confirmation before deleting a sprint', async () => {
        renderSprintPage();
        const deleteBtn = screen.getByText('Delete');
        fireEvent.click(deleteBtn);

        expect(screen.queryByText(/Locked/i)).toBeNull();
    });

    it('calls deleteSprint after confirmation', async () => {
        renderSprintPage();

        const deleteBtn = screen.getByText('Delete');
        fireEvent.click(deleteBtn);

        expect(mockShowConfirm).toHaveBeenCalledWith('Delete Sprint', expect.stringContaining('Sprint 1'));
        
        await waitFor(() => {
            expect(deleteSprintSpy).toHaveBeenCalledWith('s1');
        });
    });

    it('shows archive button on the first sprint only if it is in the past', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-02-01')); 

        const pastData = {
            ...mockData,
            sprints: [
                { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14' },
                { id: 's2', name: 'Sprint 2', start_date: '2026-01-15', end_date: '2026-01-28' }
            ]
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            data: pastData,
            updateIssue: vi.fn()
        });

        renderSprintPage({ ...defaultProps, data: pastData }, 's1');

        expect(screen.getByText('Archive')).toBeDefined();
        
        vi.useRealTimers();
    });

    it('hides archive button if sprint is not the first past sprint', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-02-01')); 

        const pastData: ValueStreamData = {
            ...mockData,
            sprints: [
                { id: 's1', name: 'Sprint 1', start_date: '2026-01-01', end_date: '2026-01-14', quarter: 'Q1' },
                { id: 's2', name: 'Sprint 2', start_date: '2026-01-15', end_date: '2026-01-28', quarter: 'Q1' }
            ]
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            data: pastData,
            updateIssue: vi.fn()
        });

        renderSprintPage({ ...defaultProps, data: pastData }, 's2');

        const s2Item = screen.getByDisplayValue('Sprint 2').closest('[class*="listItem"]')!;
        expect(within(s2Item as HTMLElement).queryByText('Archive')).toBeNull();
        
        vi.useRealTimers();
    });

    it('renders quarter grouping correctly', () => {
        const { container } = renderSprintPage();
        const qHeader = container.querySelector('[class*="sectionHeader"]');
        expect(qHeader?.textContent).toBe('FY2026 Q1');
    });
});



