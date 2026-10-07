import { describe, it, expect } from 'vitest';
import type { WorkItem } from '@valuestream/shared-types';
import { workItemOrigin, isOwnedField, ahaScore, htmlToText, withAhaLink, ahaRecordTypeForKey, isParentOwned } from '../workItemOrigin';

const base: WorkItem = { id: 'w1', name: 'Local name', status: 'Backlog', total_effort_mds: 0, score: 0, customer_targets: [] };
const link = { external_id: '42', key: 'PROD-42', data: { name: 'Aha name', description: '<p>Aha <b>text</b></p>', score: 7 } };

describe('workItemOrigin utils', () => {
    it('reads a missing origin as local; only an Aha! item owns name and description', () => {
        expect(workItemOrigin(base)).toBe('local');
        expect(isOwnedField(base, 'name')).toBe(false);
        expect(isOwnedField({ ...base, origin: 'aha' }, 'name')).toBe(true);
        expect(isOwnedField({ ...base, origin: 'aha' }, 'description')).toBe(true);
    });

    it('reads Product Value from the Aha! link', () => {
        expect(ahaScore({ ...base, links: { aha: link } })).toBe(7);
        expect(ahaScore(base)).toBeUndefined();
    });

    it('converts HTML to text like the server', () => {
        expect(htmlToText('<h3>Title</h3><ul><li>A</li></ul><p>x&nbsp;&amp;&lt;y&gt;</p>')).toBe('Title\n- A\nx &<y>');
    });

    it('a synced link makes the item aha and copies the owned fields', () => {
        expect(withAhaLink(base, link)).toEqual({
            links: { aha: link }, origin: 'aha', name: 'Aha name', description: 'Aha text',
        });
    });

    it('a key-only link or an unlink keeps the item local and its values', () => {
        expect(withAhaLink(base, { key: 'PROD-1' })).toEqual({ links: { aha: { key: 'PROD-1' } }, origin: 'local' });
        expect(withAhaLink({ ...base, links: { aha: link } }, null)).toEqual({ links: { aha: null }, origin: 'local' });
    });

    it('merges new data onto the same feature: missing keeps, present (even null, empty, 0) overwrites', () => {
        const stored = { ...base, links: { aha: { ...link, data: { ...link.data, estimate_mds: 3 } } } };
        const updates = withAhaLink(stored, { external_id: '42', key: 'PROD-42', data: { name: undefined, score: 0, description: '', estimate_mds: null } });
        expect(updates.links?.aha?.data).toEqual({ name: 'Aha name', score: 0, description: '', estimate_mds: null });
        expect(updates).toMatchObject({ name: 'Aha name', description: '' });
    });

    it('does not merge data across different features', () => {
        const stored = { ...base, links: { aha: link } };
        expect(withAhaLink(stored, { external_id: '99', key: 'PROD-99', data: { name: 'Other' } }).links?.aha?.data)
            .toEqual({ name: 'Other' });
    });

    it('tells Aha! epics from features by reference number', () => {
        expect(ahaRecordTypeForKey('DR-E-12')).toBe('epic');
        expect(ahaRecordTypeForKey('dr-e-3 ')).toBe('epic');
        expect(ahaRecordTypeForKey('DR-12')).toBe('feature');
    });

    it('Aha! owns the parent only of a feature that has an epic', () => {
        const feature = { ...base, origin: 'aha' as const, links: { aha: { ...link, data: { epic_id: '900' } } } };
        expect(isParentOwned(feature)).toBe(true);
        expect(isParentOwned({ ...feature, links: { aha: { ...link, data: { epic_id: null } } } })).toBe(false);
        expect(isParentOwned({ ...feature, links: { aha: { ...link } } })).toBe(false);
        expect(isParentOwned({ ...feature, links: { aha: { ...link, record_type: 'epic' as const, data: { epic_id: '900' } } } })).toBe(false);
        expect(isParentOwned(base)).toBe(false);
    });

    it('resolves a feature\'s epic to its parent work item, or none', () => {
        const epicWi: WorkItem = { ...base, id: 'wi-epic', links: { aha: { external_id: '900', key: 'DR-E-1', record_type: 'epic' } } };
        expect(withAhaLink(base, { ...link, data: { epic_id: '900' } }, [epicWi]).parent_id).toBe('wi-epic');
        expect(withAhaLink(base, { ...link, data: { epic_id: '901' } }, [epicWi]).parent_id).toBeNull();
        expect(withAhaLink(base, link, [epicWi])).not.toHaveProperty('parent_id');
    });

    it('a feature without an epic keeps its local parent; leaving an epic leaves its work item', () => {
        const epicWi: WorkItem = { ...base, id: 'wi-epic', links: { aha: { external_id: '900', key: 'DR-E-1', record_type: 'epic' } } };
        const local = { ...base, parent_id: 'wi-local', origin: 'aha' as const, links: { aha: { ...link, data: { epic_id: null } } } };
        expect(withAhaLink(local, { ...link, data: { epic_id: null } }, [epicWi])).not.toHaveProperty('parent_id');
        const inEpic = { ...base, parent_id: 'wi-epic', origin: 'aha' as const, links: { aha: { ...link, data: { epic_id: '900' } } } };
        expect(withAhaLink(inEpic, { ...link, data: { epic_id: null } }, [epicWi]).parent_id).toBeNull();
    });
});
