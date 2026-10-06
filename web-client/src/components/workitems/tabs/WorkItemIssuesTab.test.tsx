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

describe('WorkItemIssuesTab — Jira key saved on blur', () => {
    beforeEach(() => vi.clearAllMocks());

    const row: Issue = { id: 'e1', jira_key: 'OLD-1', name: 'Row', effort_md: 0, team_id: 't1', work_item_id: 'wi1' };
    const imported: Issue = { id: 'eImported', jira_key: 'ABC-1', name: 'Imported', effort_md: 3, team_id: 't1' };

    it('saves the typed key once, when the field loses focus', () => {
        const updateIssue = vi.fn();
        renderTab({ data: baseData([row]), issues: [row], updateIssue });

        const keyInput = screen.getByDisplayValue('OLD-1');
        fireEvent.change(keyInput, { target: { value: 'NEW' } });
        fireEvent.change(keyInput, { target: { value: 'NEW-2' } });
        expect(updateIssue).not.toHaveBeenCalled();
        expect(screen.getByDisplayValue('NEW-2')).toBeDefined();

        fireEvent.blur(keyInput);
        expect(updateIssue).toHaveBeenCalledTimes(1);
        expect(updateIssue).toHaveBeenCalledWith('e1', { jira_key: 'NEW-2' });
    });

    it('never saves a typed key that an existing issue holds; links that issue instead', () => {
        const updateIssue = vi.fn();
        const deleteIssue = vi.fn();
        renderTab({ data: baseData([row, imported]), issues: [row], updateIssue, deleteIssue });

        const keyInput = screen.getByDisplayValue('OLD-1');
        fireEvent.change(keyInput, { target: { value: 'abc-1' } });
        fireEvent.blur(keyInput);

        expect(updateIssue).not.toHaveBeenCalledWith('e1', expect.objectContaining({ jira_key: expect.anything() }));
        expect(updateIssue).toHaveBeenCalledWith('eImported', { work_item_id: 'wi1' });
        expect(deleteIssue).toHaveBeenCalledWith('e1');
    });

    it('saves nothing when focus leaves without an edit', () => {
        const updateIssue = vi.fn();
        renderTab({ data: baseData([row]), issues: [row], updateIssue });

        fireEvent.blur(screen.getByDisplayValue('OLD-1'));
        expect(updateIssue).not.toHaveBeenCalled();
    });
});
