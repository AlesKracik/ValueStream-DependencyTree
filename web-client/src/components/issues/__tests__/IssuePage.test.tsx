import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IssuePage } from '../IssuePage';
import { ValueStreamProvider, NotificationProvider, useValueStreamContext } from '../../../contexts/ValueStreamContext';
import type { ValueStreamData } from '../../../types/models';
import * as api from '../../../utils/api';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate
    };
});

vi.mock('../../../contexts/ValueStreamContext', async (importOriginal) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actual = await importOriginal() as any;
    return {
        ...actual,
        useValueStreamContext: vi.fn()
    };
});

vi.mock('../../../utils/api', async () => {
    const actual = await vi.importActual('../../../utils/api');
    return {
        ...actual,
        authorizedFetch: vi.fn(),
        syncJiraIssue: vi.fn()
    };
});

const mockData: ValueStreamData = {
    valueStreams: [], 
    settings: { 
        general: { fiscal_year_start_month: 1, sprint_duration_days: 14 },
        persistence: { 
            mongo: { 
                app: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false },
                customer: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false }
            }
        },
        jira: { base_url: '', api_version: '3', customer: { jql_new: '', jql_in_progress: '', jql_noop: '' } },
        ai: { provider: 'openai', support: { prompt: '' } },
        aha: { subdomain: "", api_key: "" }
    },
    customers: [],
    workItems: [],
    teams: [{ id: 't1', name: 'Team 1', total_capacity_mds: 10 }],
    sprints: [
        { id: 's_past', name: 'Past', start_date: '2026-01-01', end_date: '2026-01-14' },
        { id: 's_curr', name: 'Active', start_date: '2026-02-15', end_date: '2026-02-28' }
    ],
    issues: [
        {
            id: 'e1',
            name: 'Issue 1',
            jira_key: 'J-1',
            team_id: 't1',
            effort_md: 10,
            target_start: '2026-01-05',
            target_end: '2026-02-25',
            sprint_effort_overrides: { 's_past': 5 }
        }
    ],
    metrics: { maxScore: 100, maxRoi: 10 }
};

describe('IssuePage', () => {
    const updateIssueSpy = vi.fn();
    const mockShowConfirm = vi.fn().mockResolvedValue(true);
    const mockShowAlert = vi.fn().mockResolvedValue(undefined);
    
    const defaultProps = {
        data: mockData,
        loading: false,
        updateIssue: updateIssueSpy,
        deleteIssue: vi.fn()
    };

    const renderIssuePage = (props = defaultProps, issueId = 'e1') => {
        return render(
            <MemoryRouter initialEntries={[`/issue/${issueId}`]}>
                <NotificationProvider>
                    <ValueStreamProvider value={{ data: props.data || mockData, updateIssue: updateIssueSpy, addIssue: vi.fn(), deleteIssue: vi.fn() }}>
                        <Routes>
                            <Route path="/issue/:id" element={<IssuePage {...props} />} />
                        </Routes>
                    </ValueStreamProvider>
                </NotificationProvider>
            </MemoryRouter>
        );
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            showAlert: mockShowAlert,
            data: mockData,
            updateIssue: updateIssueSpy
        });
    });

    describe('Date Shift Logic', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-02-20'));
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('prompts user and clears past work when shifting dates if they confirm', async () => {
            renderIssuePage();
            const startInput = screen.getByLabelText(/Target Start/i);
            fireEvent.change(startInput, { target: { value: '2026-01-10' } });
            
            expect(mockShowConfirm).toHaveBeenCalledWith('Historical Work Warning', expect.any(String));
            
            await act(async () => {
                await Promise.resolve();
            });

            expect(updateIssueSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
                target_start: '2026-01-10',
                sprint_effort_overrides: undefined
            }));
        });

        it('aborts date shift if user cancels the confirmation', async () => {
            mockShowConfirm.mockResolvedValueOnce(false);
            renderIssuePage();
            const startInput = screen.getByLabelText(/Target Start/i);
            fireEvent.change(startInput, { target: { value: '2026-01-10' } });
            
            expect(mockShowConfirm).toHaveBeenCalledWith('Historical Work Warning', expect.any(String));
            
            await act(async () => {
                await Promise.resolve();
            });

            expect(updateIssueSpy).not.toHaveBeenCalled();
        });

        it('does NOT prompt when shifting end date into the future', async () => {
            renderIssuePage();
            const endInput = screen.getByLabelText(/Target End/i);
            fireEvent.change(endInput, { target: { value: '2026-03-15' } });
            
            expect(mockShowConfirm).not.toHaveBeenCalled();
            expect(updateIssueSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
                target_end: '2026-03-15'
            }));
        });

        it('shows an alert and prevents update if start date is not before end date', async () => {
            renderIssuePage();
            const startInput = screen.getByLabelText(/Target Start/i);
            fireEvent.change(startInput, { target: { value: '2026-02-26' } });
            expect(mockShowAlert).toHaveBeenCalledWith('Invalid Dates', 'The Start Date must be before the End Date.');
            expect(updateIssueSpy).not.toHaveBeenCalled();
        });

        it('shows an alert and prevents update if start date is equal to end date', async () => {
            renderIssuePage();
            const startInput = screen.getByLabelText(/Target Start/i);
            fireEvent.change(startInput, { target: { value: '2026-02-25' } });
            expect(mockShowAlert).toHaveBeenCalledWith('Invalid Dates', expect.any(String));
            expect(updateIssueSpy).not.toHaveBeenCalled();
        });
    });

    describe('Jira Sync', () => {
        it('shows error alert when handleSync fails', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (api.syncJiraIssue as any).mockRejectedValueOnce(new Error('Jira API Error'));
            renderIssuePage();
            const syncButton = screen.getByText('Sync from Jira');
            await act(async () => {
                fireEvent.click(syncButton);
            });
            await waitFor(() => {
                expect(mockShowAlert).toHaveBeenCalledWith('Sync Failed', 'Jira API Error');
            }, { timeout: 2000 });
        });

        it('shows error alert when handleSync throws exception', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (api.syncJiraIssue as any).mockRejectedValueOnce(new Error('Network Failure'));
            renderIssuePage();
            const syncButton = screen.getByText('Sync from Jira');
            await act(async () => {
                fireEvent.click(syncButton);
            });
            await waitFor(() => {
                expect(mockShowAlert).toHaveBeenCalledWith('Sync Failed', 'Network Failure');
            }, { timeout: 2000 });
        });

        it('updates issue with data from parseJiraIssue on successful sync', async () => {
            // Mock syncJiraIssue to return data that parseJiraIssue understands (timeestimate in seconds)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (api.syncJiraIssue as any).mockResolvedValueOnce({ 
                fields: { 
                    summary: 'Synced Issue',
                    timeestimate: 28800 * 5 // 28800s = 8h = 1MD, so 5 MDs
                } 
            });
            renderIssuePage();
            const syncButton = screen.getByText('Sync from Jira');
            await act(async () => {
                fireEvent.click(syncButton);
            });
            await waitFor(() => {
                expect(updateIssueSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
                    name: 'Synced Issue',
                    effort_md: 5
                }));
            });
        });

        it('passes correct jira settings to syncJiraIssue', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (api.syncJiraIssue as any).mockResolvedValueOnce({ 
                fields: { 
                    summary: 'Synced Issue'
                } 
            });
            renderIssuePage();
            const syncButton = screen.getByText('Sync from Jira');
            await act(async () => {
                fireEvent.click(syncButton);
            });
            await waitFor(() => {
                expect(api.syncJiraIssue).toHaveBeenCalledWith('J-1', mockData.settings.jira);
            });
        });
    });

    describe('General Rendering', () => {
        it('renders Jira Key correctly', () => {
            renderIssuePage();
            const jiraKeyInput = screen.getByLabelText(/Jira Key/i) as HTMLInputElement;
            expect(jiraKeyInput.value).toBe('J-1');
        });

        it('filters the sprint effort distribution table to only show overlapping sprints', () => {
            const extendedData: ValueStreamData = {
                ...mockData,
                sprints: [
                    ...mockData.sprints,
                    { id: 's_future', name: 'Future', start_date: '2026-05-01', end_date: '2026-05-14' }
                ]
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (useValueStreamContext as any).mockReturnValue({
                showConfirm: mockShowConfirm,
                showAlert: mockShowAlert,
                data: extendedData,
                updateIssue: updateIssueSpy
            });
            renderIssuePage({ ...defaultProps, data: extendedData });
            expect(screen.getByText('Past')).toBeDefined();
            expect(screen.getByText('Active')).toBeDefined();
            expect(screen.queryByText('Future')).toBeNull();
        });
    });

    describe('Work Item Selection', () => {
        const dataWithWorkItems: ValueStreamData = {
            ...mockData,
            workItems: [
                { id: 'wi1', name: 'Work Item 1', total_effort_mds: 10, score: 50, customer_targets: [] },
                { id: 'wi2', name: 'Work Item 2', total_effort_mds: 20, score: 30, customer_targets: [] }
            ],
            issues: [
                {
                    ...mockData.issues[0],
                    work_item_id: 'wi1'
                }
            ]
        };

        it('renders the current Work Item name', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (useValueStreamContext as any).mockReturnValue({
                showConfirm: mockShowConfirm,
                showAlert: mockShowAlert,
                data: dataWithWorkItems,
                updateIssue: updateIssueSpy
            });
            renderIssuePage({ ...defaultProps, data: dataWithWorkItems });
            const workItemInput = screen.getByPlaceholderText('Search for a work item...') as HTMLInputElement;
            expect(workItemInput.value).toBe('Work Item 1');
        });

        it('updates the Work Item when selecting from dropdown', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (useValueStreamContext as any).mockReturnValue({
                showConfirm: mockShowConfirm,
                showAlert: mockShowAlert,
                data: dataWithWorkItems,
                updateIssue: updateIssueSpy
            });
            renderIssuePage({ ...defaultProps, data: dataWithWorkItems });
            const workItemInput = screen.getByPlaceholderText('Search for a work item...');
            fireEvent.change(workItemInput, { target: { value: '' } });
            fireEvent.change(workItemInput, { target: { value: 'Work Item 2' } });
            const option = await screen.findByText('Work Item 2');
            fireEvent.click(option);
            expect(updateIssueSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
                work_item_id: 'wi2'
            }));
        });

        it('updates to undefined when selecting Unassigned', async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (useValueStreamContext as any).mockReturnValue({
                showConfirm: mockShowConfirm,
                showAlert: mockShowAlert,
                data: dataWithWorkItems,
                updateIssue: updateIssueSpy
            });
            renderIssuePage({ ...defaultProps, data: dataWithWorkItems });
            const workItemInput = screen.getByPlaceholderText('Search for a work item...');
            fireEvent.change(workItemInput, { target: { value: '' } });
            fireEvent.change(workItemInput, { target: { value: 'Unassigned' } });
            const option = await screen.findByText('--- Unassigned ---');
            fireEvent.click(option);
            expect(updateIssueSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
                work_item_id: undefined
            }));
        });
    });

    describe('Issue Management', () => {
        it('deletes the issue after confirmation', async () => {
            const deleteIssueSpy = vi.fn();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (useValueStreamContext as any).mockReturnValue({
                showConfirm: mockShowConfirm,
                showAlert: mockShowAlert,
                data: mockData,
                updateIssue: vi.fn()
            });
            renderIssuePage({ ...defaultProps, deleteIssue: deleteIssueSpy });
            const deleteBtn = screen.getByText('Delete Issue');
            fireEvent.click(deleteBtn);
            expect(mockShowConfirm).toHaveBeenCalledWith('Delete Issue', expect.stringContaining('Issue 1'));
            await waitFor(() => {
                expect(deleteIssueSpy).toHaveBeenCalledWith('e1');
                expect(mockNavigate).toHaveBeenCalledWith(-1);
            });
        });

        it('adds and removes manual effort overrides', () => {
            renderIssuePage();
            const table = screen.getByRole('table');
            const tableInputs = within(table).getAllByRole('spinbutton');
            const pastInput = tableInputs[0]; 
            fireEvent.change(pastInput, { target: { value: '8' } });
            expect(updateIssueSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
                sprint_effort_overrides: expect.objectContaining({ 's_past': 8 })
            }));
            const removeBtns = screen.getAllByTitle('Remove Override');
            fireEvent.click(removeBtns[0]);
            expect(updateIssueSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
                sprint_effort_overrides: {} 
            }));
        });
    });
});



