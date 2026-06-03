import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkItemIssuesTab } from './WorkItemIssuesTab';
import { NotificationProvider } from '../../../contexts/ValueStreamContext';
import type { Issue, ValueStreamData } from '@valuestream/shared-types';

const baseData = (issues: Issue[]): ValueStreamData => ({
    valueStreams: [],
    // Only the fields the component reads are needed.
    settings: { jira: { base_url: '' } },
    customers: [],
    workItems: [],
    issues,
    teams: [{ id: 't1', name: 'Team 1' }],
    sprints: [],
    metrics: { maxScore: 0, maxRoi: 0 }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);

const renderTab = (props: Partial<React.ComponentProps<typeof WorkItemIssuesTab>> & { data: ValueStreamData }) =>
    render(
        <MemoryRouter>
            <NotificationProvider>
                <WorkItemIssuesTab
                    isNew={false}
                    workItemId="wi1"
                    issues={[]}
                    updateIssue={vi.fn()}
                    addIssue={vi.fn()}
                    deleteIssue={vi.fn()}
                    setNewWorkItemIssues={vi.fn()}
                    {...props}
                />
            </NotificationProvider>
        </MemoryRouter>
    );

describe('WorkItemIssuesTab — manual Jira dedup on blur', () => {
    beforeEach(() => vi.clearAllMocks());

    const blankRow: Issue = { id: 'eBlank', jira_key: 'ABC-1', name: '', effort_md: 0, team_id: 't1', work_item_id: 'wi1' };
    const existingElsewhere: Issue = { id: 'eExisting', jira_key: 'ABC-1', name: 'Existing', effort_md: 3, team_id: 't1', work_item_id: 'wiOther' };

    it('links the existing issue and drops the blank row when typed key already exists', () => {
        const updateIssue = vi.fn();
        const deleteIssue = vi.fn();
        renderTab({
            data: baseData([blankRow, existingElsewhere]),
            issues: [blankRow],
            updateIssue,
            deleteIssue
        });

        const keyInput = screen.getByDisplayValue('ABC-1');
        fireEvent.blur(keyInput, { target: { value: 'ABC-1' } });

        // Existing issue reassigned to this work item, blank row removed.
        expect(updateIssue).toHaveBeenCalledWith('eExisting', { work_item_id: 'wi1' });
        expect(deleteIssue).toHaveBeenCalledWith('eBlank');
    });

    it('matches case-insensitively and ignoring surrounding whitespace', () => {
        const updateIssue = vi.fn();
        const deleteIssue = vi.fn();
        const row: Issue = { ...blankRow, jira_key: 'typing' };
        renderTab({
            data: baseData([row, existingElsewhere]),
            issues: [row],
            updateIssue,
            deleteIssue
        });

        fireEvent.blur(screen.getByDisplayValue('typing'), { target: { value: '  abc-1 ' } });

        expect(updateIssue).toHaveBeenCalledWith('eExisting', { work_item_id: 'wi1' });
        expect(deleteIssue).toHaveBeenCalledWith('eBlank');
    });

    it('does nothing when the typed key is unique', () => {
        const updateIssue = vi.fn();
        const deleteIssue = vi.fn();
        const row: Issue = { ...blankRow, jira_key: 'NEW-9' };
        renderTab({
            data: baseData([row, existingElsewhere]),
            issues: [row],
            updateIssue,
            deleteIssue
        });

        fireEvent.blur(screen.getByDisplayValue('NEW-9'), { target: { value: 'NEW-9' } });

        expect(deleteIssue).not.toHaveBeenCalled();
        // No reassignment of any other issue.
        expect(updateIssue).not.toHaveBeenCalledWith('eExisting', expect.anything());
    });

    it('ignores empty and TBD keys', () => {
        const updateIssue = vi.fn();
        const deleteIssue = vi.fn();
        const row: Issue = { ...blankRow, jira_key: 'TBD' };
        renderTab({
            data: baseData([row, { ...existingElsewhere, jira_key: 'TBD' }]),
            issues: [row],
            updateIssue,
            deleteIssue
        });

        fireEvent.blur(screen.getByDisplayValue('TBD'), { target: { value: 'TBD' } });

        expect(deleteIssue).not.toHaveBeenCalled();
    });
});
