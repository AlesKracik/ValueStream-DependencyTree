import { describe, it, expect, vi } from 'vitest';
import {
  deriveOrigin, htmlToText, deriveForDocument, deriveForPatch,
  legacyAhaLink, migrateLegacyAhaFields, LEGACY_AHA_FILTER,
} from '../workItemOrigin';

const ahaLink = { external_id: '42', key: 'PROD-42', data: { name: 'Aha name', description: '<p>Aha <b>text</b></p>' } };

describe('workItemOrigin', () => {
  describe('deriveOrigin', () => {
    it('is aha when the Aha! link has an external_id', () => {
      expect(deriveOrigin({ aha: ahaLink })).toBe('aha');
    });

    it('is local without links, with a null link, or with a key-only link', () => {
      expect(deriveOrigin(undefined)).toBe('local');
      expect(deriveOrigin({ aha: null })).toBe('local');
      expect(deriveOrigin({ aha: { key: 'PROD-1' } })).toBe('local');
    });
  });

  describe('htmlToText', () => {
    it('turns block tags and breaks into newlines and lists into dashes', () => {
      expect(htmlToText('<h1>Title</h1><p>One<br/>Two</p><ul><li>A</li><li>B</li></ul>'))
        .toBe('Title\nOne\nTwo\n- A\n- B');
    });

    it('decodes entities, with &amp; last', () => {
      expect(htmlToText('a&nbsp;&lt;b&gt; &quot;c&quot; &#39;d&apos; &#65; &amp;lt;'))
        .toBe('a <b> "c" \'d\' A &lt;');
    });

    it('trims trailing spaces per line and collapses blank lines', () => {
      expect(htmlToText('<p>x  </p><p></p><p></p><p>y</p>  ')).toBe('x\n\ny');
    });
  });

  describe('deriveForDocument', () => {
    it('copies the owned values from the Aha! data', () => {
      expect(deriveForDocument({ links: { aha: ahaLink } }))
        .toEqual({ origin: 'aha', name: 'Aha name', description: 'Aha text' });
    });

    it('skips an empty name but keeps an empty description', () => {
      expect(deriveForDocument({ links: { aha: { ...ahaLink, data: { name: '', description: '' } } } }))
        .toEqual({ origin: 'aha', description: '' });
    });

    it('is local without a synced link', () => {
      expect(deriveForDocument({ links: { aha: { key: 'PROD-1', data: { name: 'x' } } } })).toEqual({ origin: 'local' });
    });
  });

  describe('deriveForPatch', () => {
    const stored = { id: 'w1', origin: 'aha', name: 'Aha name', links: { aha: ahaLink } };

    it('rejects a different value for an owned field', () => {
      expect(() => deriveForPatch(stored, { name: 'Local' }))
        .toThrow('"name" is owned by Aha! for this work item; change it in Aha!.');
    });

    it('accepts the same value as the source', () => {
      expect(deriveForPatch(stored, { name: 'Aha name', description: 'Aha text' })).toEqual({});
    });

    it('lets the source win when the patch also sets links', () => {
      expect(deriveForPatch(stored, { links: { aha: { ...ahaLink, data: { name: 'New' } } }, name: 'Local' }))
        .toEqual({ origin: 'aha', name: 'New' });
    });

    it('unlinking makes the item local', () => {
      expect(deriveForPatch(stored, { links: { aha: null } })).toEqual({ origin: 'local' });
    });

    it('leaves a local item editable', () => {
      expect(deriveForPatch({ id: 'w1', name: 'x' }, { name: 'y', description: 'z' })).toEqual({});
    });
  });

  // TODO(remove): with the legacy migration.
  describe('legacy migration', () => {
    it('maps the legacy fields onto an Aha! link', () => {
      expect(legacyAhaLink({
        aha_reference: { id: '42', reference_num: 'PROD-42', url: 'https://aha/42' },
        aha_synced_data: { name: 'N', total_effort_mds: 5, score: 8 },
      })).toEqual({
        external_id: '42', key: 'PROD-42', url: 'https://aha/42',
        data: { name: 'N', estimate_mds: 5, score: 8 },
      });
    });

    it('returns null without a reference number or id', () => {
      expect(legacyAhaLink({ aha_reference: null, aha_synced_data: { name: 'N' } })).toBeNull();
    });

    it('rewrites each legacy document under a version guard', async () => {
      const coll = {
        find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([
          { id: 'w1', _version: 3, name: 'Old', aha_reference: { id: '42', reference_num: 'PROD-42', url: 'u' }, aha_synced_data: { name: 'Aha name' } },
          { id: 'w2', aha_reference: null, aha_requirements: '' },
        ]) }),
        updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      };
      const db = { collection: vi.fn().mockReturnValue(coll) };

      expect(await migrateLegacyAhaFields(db as never)).toBe(2);
      expect(coll.find).toHaveBeenCalledWith(LEGACY_AHA_FILTER);
      const unset = { aha_reference: '', aha_synced_data: '', aha_requirements: '' };
      expect(coll.updateOne).toHaveBeenNthCalledWith(1, { id: 'w1', _version: 3 }, {
        $set: {
          links: { aha: { external_id: '42', key: 'PROD-42', url: 'u', data: { name: 'Aha name' } } },
          origin: 'aha', name: 'Aha name', _version: 4,
        },
        $unset: unset,
      });
      expect(coll.updateOne).toHaveBeenNthCalledWith(2, { id: 'w2', _version: { $exists: false } }, {
        $set: { links: {}, origin: 'local', _version: 1 },
        $unset: unset,
      });
    });
  });
});
