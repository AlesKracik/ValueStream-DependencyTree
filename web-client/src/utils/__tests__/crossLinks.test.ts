import { describe, it, expect } from 'vitest';
import type { Issue, Settings, WorkItem } from '@valuestream/shared-types';
import {
    ahaJiraKeys, jiraAhaRefs, crossLinksAvailable, crossLinksEnabled,
    resolveCrossLink, planCrossLinks, crossLinkNote,
} from '../crossLinks';
import { parseAhaFeature } from '../businessLogic';

// Shapes observed on the live pair DRAAS-49689 ↔ DR-133.
const INTEGRATION = '7694707249561474905';
const ahaFeature = {
    id: '7693569679294215793',
    reference_num: 'DR-133',
    integration_fields: [
        { name: 'id', value: '10533769', integration_id: INTEGRATION, service_name: 'jira' },
        { name: 'key', value: 'DRAAS-49689', integration_id: INTEGRATION, service_name: 'jira' },
        { name: 'url', value: 'https://x.atlassian.net/browse/DRAAS-49689', integration_id: INTEGRATION, service_name: 'jira' },
        { name: 'key', value: 'OTHER-1', integration_id: '1', service_name: 'tfs' },
    ],
};
const jiraIssue = {
    key: 'DRAAS-49689',
    properties: { aha: { [INTEGRATION]: { record_type: 'feature', reference_num: 'DR-133' } } },
};

const workItem = (id: string, key: string, jiraKeys?: string[]): WorkItem => ({
    id, name: id, status: 'Backlog', total_effort_mds: 0, score: 0, customer_targets: [],
    links: { aha: { key, external_id: `x-${id}`, data: jiraKeys ? { jira_keys: jiraKeys } : {} } },
});

const issue = (id: string, jira_key: string, work_item_id?: string): Issue => ({
    id, jira_key, team_id: '', effort_md: 0, ...(work_item_id ? { work_item_id } : {}),
});

describe('ahaJiraKeys / jiraAhaRefs', () => {
    it('reads the Jira keys from Aha! integration fields', () => {
        expect(ahaJiraKeys(ahaFeature)).toEqual(['DRAAS-49689']);
        expect(ahaJiraKeys({})).toEqual([]);
    });
    it('reads the Aha! references from the Jira `aha` property', () => {
        expect(jiraAhaRefs(jiraIssue)).toEqual(['DR-133']);
        expect(jiraAhaRefs({ key: 'X-1' })).toEqual([]);
        expect(jiraAhaRefs({ properties: { aha: 'junk' } })).toEqual([]);
    });
    it('parseAhaFeature stores the Jira keys only when integration fields were returned', () => {
        expect(parseAhaFeature(ahaFeature).data?.jira_keys).toEqual(['DRAAS-49689']);
        expect(parseAhaFeature({ id: 1, reference_num: 'DR-1' }).data?.jira_keys).toBeUndefined();
    });
});

describe('crossLinksAvailable / crossLinksEnabled', () => {
    const both = {
        jira: { base_url: 'https://x.atlassian.net', api_token: 't' },
        aha: { subdomain: 'acme', api_key: 'k' },
    } as unknown as Settings;
    it('needs both Jira and Aha! configured', () => {
        expect(crossLinksAvailable(both)).toBe(true);
        expect(crossLinksAvailable({ ...both, aha: { subdomain: 'acme' } } as Settings)).toBe(false);
        expect(crossLinksAvailable({ ...both, aha: { subdomain: 'acme' } } as Settings, both)).toBe(true);
    });
    it('is enabled only when switched on and available', () => {
        expect(crossLinksEnabled(both)).toBe(false);
        expect(crossLinksEnabled({ ...both, aha: { ...both.aha, use_jira_cross_links: true } })).toBe(true);
        expect(crossLinksEnabled({ jira: both.jira, aha: { subdomain: '', use_jira_cross_links: true } } as Settings)).toBe(false);
    });
});

describe('resolveCrossLink', () => {
    const wis = [workItem('w1', 'DR-133', ['DRAAS-49689']), workItem('w2', 'DR-2')];
    it('assigns an unassigned issue through either side of the link', () => {
        expect(resolveCrossLink({ jira_key: 'draas-49689' }, [], wis)).toEqual({ kind: 'assign', workItemId: 'w1' });
        expect(resolveCrossLink({ jira_key: 'J-1' }, ['dr-2'], wis)).toEqual({ kind: 'assign', workItemId: 'w2' });
    });
    it('keeps an existing assignment', () => {
        expect(resolveCrossLink({ jira_key: 'DRAAS-49689', work_item_id: 'w1' }, [], wis).kind).toBe('linked');
        expect(resolveCrossLink({ jira_key: 'DRAAS-49689', work_item_id: 'w9' }, [], wis).kind).toBe('kept');
    });
    it('leaves an issue linked to several work items untouched', () => {
        expect(resolveCrossLink({ jira_key: 'DRAAS-49689' }, ['DR-2'], wis))
            .toEqual({ kind: 'ambiguous', workItemIds: ['w1', 'w2'] });
    });
    it('ignores issues without a link or key', () => {
        expect(resolveCrossLink({ jira_key: 'J-9' }, [], wis).kind).toBe('none');
        expect(resolveCrossLink({ jira_key: 'TBD' }, ['DR-2'], wis).kind).toBe('none');
    });
});

describe('planCrossLinks / crossLinkNote', () => {
    it('plans assignments and summarizes them', () => {
        const wis = [workItem('w1', 'DR-1', ['J-1', 'J-2', 'J-3']), workItem('w2', 'DR-2', ['J-3'])];
        const plan = planCrossLinks(
            [issue('i1', 'J-1'), issue('i2', 'J-2', 'w9'), issue('i3', 'J-3'), issue('i4', 'J-4')],
            wis,
            new Map([['J-4', ['DR-2']]]),
        );
        expect(plan.assign).toEqual([{ issueId: 'i1', workItemId: 'w1' }, { issueId: 'i4', workItemId: 'w2' }]);
        expect(plan.counts).toEqual({ assigned: 2, kept: 1, ambiguous: ['J-3'] });
        expect(crossLinkNote(plan.counts)).toBe(
            ' Cross links: 2 assigned, 1 kept their existing work item, 1 linked to several work items (J-3).',
        );
        expect(crossLinkNote({ assigned: 0, kept: 0, ambiguous: [] })).toBe('');
    });
});
