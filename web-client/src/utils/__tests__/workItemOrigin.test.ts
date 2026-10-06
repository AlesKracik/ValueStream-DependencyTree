import { describe, it, expect } from 'vitest';
import type { WorkItem } from '@valuestream/shared-types';
import { workItemOrigin, isOwnedField, ahaScore, htmlToText, withAhaLink } from '../workItemOrigin';

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
});
