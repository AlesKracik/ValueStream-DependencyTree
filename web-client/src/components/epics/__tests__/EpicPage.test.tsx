import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EpicPage } from '../EpicPage';
import { ValueStreamProvider, NotificationProvider, useValueStreamContext } from '../../../contexts/ValueStreamContext';
import type { ValueStreamData, Epic } from '../../../types/models';
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
        jira: { base_url: 'https://jira', api_version: '3' },
        ai: { provider: 'openai' }
    },
    customers: [],
    workItems: [],
    teams: [{ id: 't1', name: 'Team 1', total_capacity_mds: 10 }],
    sprints: [
        { id: 's_past', name: 'Past', start_date: '2026-01-01', end_date: '2026-01-14' },
        { id: 's_curr', name: 'Active', start_date: '2026-02-15', end_date: '2026-02-28' }
    ],
    epics: [
        {
            id: 'e1',
            name: 'Epic 1',
            jira_key: 'J-1',
            team_id: 't1',
            effort_md: 10,
            target_start: '2026-01-05',
            target_end: '2026-02-25',
            sprint_effort_overrides: { 's_past': 5 }
        }
    ]
};

describe('EpicPage', () => {
    const updateEpicSpy = vi.fn();
    const mockShowConfirm = vi.fn().mockResolvedValue(true);
    const mockShowAlert = vi.fn().mockResolvedValue(undefined);
    
    const defaultProps = {
        data: mockData,
        loading: false,
        updateEpic: updateEpicSpy,
        deleteEpic: vi.fn()
    };

    const renderEpicPage = (props = defaultProps, epicId = 'e1') => {
        return render(
            <MemoryRouter initialEntries={[`/epic/${epicId}`]}>
                <NotificationProvider>
                    <ValueStreamProvider value={{ data: props.data || mockData, updateEpic: updateEpicSpy }}>
                        <Routes>
                            <Route path="/epic/:id" element={<EpicPage {...props} />} />
                        </Routes>
                    </ValueStreamProvider>
                </NotificationProvider>
            </MemoryRouter>
        );
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (useValueStreamContext as any).mockReturnValue({
            showConfirm: mockShowConfirm,
            showAlert: mockShowAlert,
            data: mockData,
            updateEpic: updateEpicSpy
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
            renderEpicPage();
            const startInput = screen.getByLabelText(/Target Start/i);
            fireEvent.change(startInput, { target: { value: '2026-01-10' } });
            
            expect(mockShowConfirm).toHaveBeenCalledWith('Historical Work Warning', expect.any(String));
            
            await act(async () => {
                await Promise.resolve();
            });

            expect(updateEpicSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
                target_start: '2026-01-10',
                sprint_effort_overrides: undefined
            }));
        });

        it('aborts date shift if user cancels the confirmation', async () => {
            mockShowConfirm.mockResolvedValueOnce(false);
            renderEpicPage();
            const startInput = screen.getByLabelText(/Target Start/i);
            fireEvent.change(startInput, { target: { value: '2026-01-10' } });
            
            expect(mockShowConfirm).toHaveBeenCalledWith('Historical Work Warning', expect.any(String));
            
            await act(async () => {
                await Promise.resolve();
            });

            expect(updateEpicSpy).not.toHaveBeenCalled();
        });

        it('does NOT prompt when shifting end date into the future', async () => {
            renderEpicPage();
            const endInput = screen.getByLabelText(/Target End/i);
            fireEvent.change(endInput, { target: { value: '2026-03-15' } });
            
            expect(mockShowConfirm).not.toHaveBeenCalled();
            expect(updateEpicSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
                target_end: '2026-03-15'
            }));
        });

        it('shows an alert and prevents update if start date is not before end date', async () => {
            renderEpicPage();
            const startInput = screen.getByLabelText(/Target Start/i);
            fireEvent.change(startInput, { target: { value: '2026-02-26' } });
            expect(mockShowAlert).toHaveBeenCalledWith('Invalid Dates', 'The Start Date must be before the End Date.');
            expect(updateEpicSpy).not.toHaveBeenCalled();
        });

        it('shows an alert and prevents update if start date is equal to end date', async () => {
            renderEpicPage();
            const startInput = screen.getByLabelText(/Target Start/i);
            fireEvent.change(startInput, { target: { value: '2026-02-25' } });
            expect(mockShowAlert).toHaveBeenCalledWith('Invalid Dates', expect.any(String));
            expect(updateEpicSpy).not.toHaveBeenCalled();
        });
    });

    describe('Jira Sync', () => {
        it('shows error alert when handleSync fails', async () => {
            (api.syncJiraIssue as any).mockRejectedValueOnce(new Error('Jira API Error'));
            renderEpicPage();
            const syncButton = screen.getByText('Sync from Jira');
            await act(async () => {
                fireEvent.click(syncButton);
            });
            await waitFor(() => {
                expect(mockShowAlert).toHaveBeenCalledWith('Sync Failed', 'Jira API Error');
            }, { timeout: 2000 });
        });

        it('shows error alert when handleSync throws exception', async () => {
            (api.syncJiraIssue as any).mockRejectedValueOnce(new Error('Network Failure'));
            renderEpicPage();
            const syncButton = screen.getByText('Sync from Jira');
            await act(async () => {
                fireEvent.click(syncButton);
            });
            await waitFor(() => {
                expect(mockShowAlert).toHaveBeenCalledWith('Sync Failed', 'Network Failure');
            }, { timeout: 2000 });
        });

        it('passes correct jira settings to syncJiraIssue', async () => {
            (api.syncJiraIssue as any).mockResolvedValueOnce({ 
                fields: { 
                    summary: 'Synced Epic',
                    customfield_10005: 80 
                } 
            });
            renderEpicPage();
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
            renderEpicPage();
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
            (useValueStreamContext as any).mockReturnValue({
                showConfirm: mockShowConfirm,
                showAlert: mockShowAlert,
                data: extendedData,
                updateEpic: updateEpicSpy
            });
            renderEpicPage({ ...defaultProps, data: extendedData });
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
            epics: [
                {
                    ...mockData.epics[0],
                    work_item_id: 'wi1'
                }
            ]
        };

        it('renders the current Work Item name', () => {
            (useValueStreamContext as any).mockReturnValue({
                showConfirm: mockShowConfirm,
                showAlert: mockShowAlert,
                data: dataWithWorkItems,
                updateEpic: updateEpicSpy
            });
            renderEpicPage({ ...defaultProps, data: dataWithWorkItems });
            const workItemInput = screen.getByPlaceholderText('Search for a work item...') as HTMLInputElement;
            expect(workItemInput.value).toBe('Work Item 1');
        });

        it('updates the Work Item when selecting from dropdown', async () => {
            (useValueStreamContext as any).mockReturnValue({
                showConfirm: mockShowConfirm,
                showAlert: mockShowAlert,
                data: dataWithWorkItems,
                updateEpic: updateEpicSpy
            });
            renderEpicPage({ ...defaultProps, data: dataWithWorkItems });
            const workItemInput = screen.getByPlaceholderText('Search for a work item...');
            fireEvent.change(workItemInput, { target: { value: '' } });
            fireEvent.change(workItemInput, { target: { value: 'Work Item 2' } });
            const option = await screen.findByText('Work Item 2');
            fireEvent.click(option);
            expect(updateEpicSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
                work_item_id: 'wi2'
            }));
        });

        it('updates to undefined when selecting Unassigned', async () => {
            (useValueStreamContext as any).mockReturnValue({
                showConfirm: mockShowConfirm,
                showAlert: mockShowAlert,
                data: dataWithWorkItems,
                updateEpic: updateEpicSpy
            });
            renderEpicPage({ ...defaultProps, data: dataWithWorkItems });
            const workItemInput = screen.getByPlaceholderText('Search for a work item...');
            fireEvent.change(workItemInput, { target: { value: '' } });
            fireEvent.change(workItemInput, { target: { value: 'Unassigned' } });
            const option = await screen.findByText('--- Unassigned ---');
            fireEvent.click(option);
            expect(updateEpicSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
                work_item_id: undefined
            }));
        });
    });

    describe('Epic Management', () => {
        it('deletes the epic after confirmation', async () => {
            const deleteEpicSpy = vi.fn();
            (useValueStreamContext as any).mockReturnValue({
                showConfirm: mockShowConfirm,
                showAlert: mockShowAlert,
                data: mockData,
                updateEpic: vi.fn()
            });
            renderEpicPage({ ...defaultProps, deleteEpic: deleteEpicSpy });
            const deleteBtn = screen.getByText('Delete Epic');
            fireEvent.click(deleteBtn);
            expect(mockShowConfirm).toHaveBeenCalledWith('Delete Epic', expect.stringContaining('Epic 1'));
            await waitFor(() => {
                expect(deleteEpicSpy).toHaveBeenCalledWith('e1');
                expect(mockNavigate).toHaveBeenCalledWith(-1);
            });
        });

        it('adds and removes manual effort overrides', () => {
            renderEpicPage();
            const table = screen.getByRole('table');
            const tableInputs = within(table).getAllByRole('spinbutton');
            const pastInput = tableInputs[0]; 
            fireEvent.change(pastInput, { target: { value: '8' } });
            expect(updateEpicSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
                sprint_effort_overrides: expect.objectContaining({ 's_past': 8 })
            }));
            const removeBtns = screen.getAllByTitle('Remove Override');
            fireEvent.click(removeBtns[0]);
            expect(updateEpicSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
                sprint_effort_overrides: {} 
            }));
        });
    });
});
