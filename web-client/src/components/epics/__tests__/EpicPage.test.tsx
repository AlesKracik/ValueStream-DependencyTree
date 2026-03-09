import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EpicPage } from '../EpicPage';
import { ValueStreamProvider, NotificationProvider } from '../../../contexts/ValueStreamContext';
import type { ValueStreamData } from '../../../types/models';
import * as api from '../../../utils/api';

vi.mock('../../../utils/api', async () => {
    const actual = await vi.importActual('../../../utils/api');
    return {
        ...actual,
        authorizedFetch: vi.fn(),
        syncJiraIssue: vi.fn()
    };
});

const mockData: ValueStreamData = {
    valueStreams: [], settings: { jira_base_url: 'https://jira', jira_api_version: '3' },
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
    
    const defaultProps = {
        epicId: 'e1',
        onBack: vi.fn(),
        data: mockData,
        loading: false,
        error: null,
        updateEpic: updateEpicSpy,
        deleteEpic: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-02-20')); // Middle of s_curr
    });

    describe('Date Shift Logic', () => {
        it('prompts user and clears past work when shifting dates if they confirm', async () => {
            render(
                <NotificationProvider>
                    <ValueStreamProvider value={{ data: mockData, updateEpic: updateEpicSpy }}>
                        <EpicPage {...defaultProps} />
                    </ValueStreamProvider>
                </NotificationProvider>
            );
            
            const startInput = screen.getByLabelText(/Target Start:/i);
            // Shift start from 2026-01-05 to 2026-01-10 (still before end 2026-02-25)
            fireEvent.change(startInput, { target: { value: '2026-01-10' } });
            
            // Custom modal should be visible
            expect(screen.getByText('Historical Work Warning')).toBeDefined();
            
            // Confirm
            fireEvent.click(screen.getByText('Confirm'));
            
            // Wait for the async function to continue after the promise resolves
            await act(async () => {
                await Promise.resolve();
            });

            expect(updateEpicSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
                target_start: '2026-01-10',
                sprint_effort_overrides: undefined
            }));
        });

        it('aborts date shift if user cancels the confirmation', async () => {
            render(
                <NotificationProvider>
                    <ValueStreamProvider value={{ data: mockData, updateEpic: updateEpicSpy }}>
                        <EpicPage {...defaultProps} />
                    </ValueStreamProvider>
                </NotificationProvider>
            );
            
            const startInput = screen.getByLabelText(/Target Start:/i);
            // Shift start from 2026-01-05 to 2026-01-10 (still before end 2026-02-25)
            fireEvent.change(startInput, { target: { value: '2026-01-10' } });
            
            expect(screen.getByText('Historical Work Warning')).toBeDefined();
            
            // Cancel
            fireEvent.click(screen.getByText('Cancel'));
            
            expect(updateEpicSpy).not.toHaveBeenCalled();
        });

        it('does NOT prompt when shifting end date into the future', async () => {
            render(
                <NotificationProvider>
                    <ValueStreamProvider value={{ data: mockData, updateEpic: updateEpicSpy }}>
                        <EpicPage {...defaultProps} />
                    </ValueStreamProvider>
                </NotificationProvider>
            );
            
            const endInput = screen.getByLabelText(/Target End:/i);
            // Current end is 2026-02-25. Shift to 2026-03-15 (future).
            fireEvent.change(endInput, { target: { value: '2026-03-15' } });
            
            // Custom modal should NOT be visible
            expect(screen.queryByText('Historical Work Warning')).toBeNull();
            
            expect(updateEpicSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
                target_end: '2026-03-15'
            }));
        });

        it('shows an alert and prevents update if start date is not before end date', async () => {
            render(
                <NotificationProvider>
                    <ValueStreamProvider value={{ data: mockData, updateEpic: updateEpicSpy }}>
                        <EpicPage {...defaultProps} />
                    </ValueStreamProvider>
                </NotificationProvider>
            );
            
            const startInput = screen.getByLabelText(/Target Start:/i);
            // Current end is 2026-02-25. Setting start to 2026-02-26 (after end).
            fireEvent.change(startInput, { target: { value: '2026-02-26' } });
            
            expect(screen.getByText('Invalid Dates')).toBeDefined();
            expect(screen.getByText('The Start Date must be before the End Date.')).toBeDefined();
            
            expect(updateEpicSpy).not.toHaveBeenCalled();
        });

        it('shows an alert and prevents update if start date is equal to end date', async () => {
            render(
                <NotificationProvider>
                    <ValueStreamProvider value={{ data: mockData, updateEpic: updateEpicSpy }}>
                        <EpicPage {...defaultProps} />
                    </ValueStreamProvider>
                </NotificationProvider>
            );
            
            const startInput = screen.getByLabelText(/Target Start:/i);
            // Current end is 2026-02-25. Setting start to 2026-02-25.
            fireEvent.change(startInput, { target: { value: '2026-02-25' } });
            
            expect(screen.getByText('Invalid Dates')).toBeDefined();
            
            expect(updateEpicSpy).not.toHaveBeenCalled();
        });
    });

    describe('Jira Sync', () => {
        beforeEach(() => {
            vi.useRealTimers();
        });

        it('shows error alert when handleSync fails', async () => {
            // Mock syncJiraIssue to return an error
            (api.syncJiraIssue as any).mockRejectedValueOnce(new Error('Jira API Error'));

            render(
                <NotificationProvider>
                    <ValueStreamProvider value={{ data: mockData, updateEpic: updateEpicSpy }}>
                        <EpicPage {...defaultProps} />
                    </ValueStreamProvider>
                </NotificationProvider>
            );

            // Click Sync button
            const syncButton = screen.getByText('Sync from Jira');
            await act(async () => {
                fireEvent.click(syncButton);
            });

            // Should show alert
            await waitFor(() => {
                expect(screen.queryByText('Sync Failed')).not.toBeNull();
                expect(screen.queryByText('Jira API Error')).not.toBeNull();
            }, { timeout: 2000 });
        });

        it('shows error alert when handleSync throws exception', async () => {
            // Mock syncJiraIssue to throw
            (api.syncJiraIssue as any).mockRejectedValueOnce(new Error('Network Failure'));

            render(
                <NotificationProvider>
                    <ValueStreamProvider value={{ data: mockData, updateEpic: updateEpicSpy }}>
                        <EpicPage {...defaultProps} />
                    </ValueStreamProvider>
                </NotificationProvider>
            );

            // Click Sync button
            const syncButton = screen.getByText('Sync from Jira');
            await act(async () => {
                fireEvent.click(syncButton);
            });

            // Should show alert
            await waitFor(() => {
                expect(screen.queryByText('Sync Failed')).not.toBeNull();
                expect(screen.queryByText('Network Failure')).not.toBeNull();
            }, { timeout: 2000 });
        });
    });

    describe('General Rendering', () => {
        it('filters the sprint effort distribution table to only show overlapping sprints', () => {
            const extendedData: ValueStreamData = {
                ...mockData,
                sprints: [
                    ...mockData.sprints,
                    { id: 's_future', name: 'Future', start_date: '2026-05-01', end_date: '2026-05-14' }
                ]
            };

            render(
                <NotificationProvider>
                    <ValueStreamProvider value={{ data: extendedData, updateEpic: updateEpicSpy }}>
                        <EpicPage {...defaultProps} data={extendedData} />
                    </ValueStreamProvider>
                </NotificationProvider>
            );

            // Epic dates: 2026-01-05 to 2026-02-25
            // Sprints: 
            // s_past (2026-01-01 to 2026-01-14) - Overlaps
            // s_curr (2026-02-15 to 2026-02-28) - Overlaps
            // s_future (2026-05-01 to 2026-05-14) - Does NOT overlap

            expect(screen.getByText('Past')).toBeDefined();
            expect(screen.getByText('Active')).toBeDefined();
            expect(screen.queryByText('Future')).toBeNull();
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });
});



