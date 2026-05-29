import { describe, it, expect } from 'vitest';
import { mergeForRetry, findContestedKeys } from '../entityMerge';

describe('mergeForRetry', () => {
    it('overlays client changes onto the server document', () => {
        const current = { id: 'c1', _version: 5, name: 'Server name', status: 'open', age: 10 };
        const ours = { name: 'Local name' };

        const merged = mergeForRetry(current, ours);

        expect(merged).toEqual({
            id: 'c1',
            _version: 5,
            name: 'Local name',  // client wins on edited field
            status: 'open',       // server preserved
            age: 10,              // server preserved
        });
    });

    it('uses the server _version, not the client _version', () => {
        const current = { id: 'c1', _version: 9 };
        const ours = { _version: 3, name: 'New' };

        const merged = mergeForRetry(current, ours);

        expect(merged._version).toBe(9);
    });

    it('defaults to _version 0 when server doc has no version', () => {
        const current = { id: 'c1', name: 'Legacy' };
        const ours = { description: 'x' };

        const merged = mergeForRetry(current, ours);

        expect(merged._version).toBe(0);
    });
});

describe('findContestedKeys', () => {
    it('returns empty when no baseline is available', () => {
        const current = { id: 'c1', name: 'A' };
        const ours = { name: 'B' };
        expect(findContestedKeys(current, ours)).toEqual([]);
    });

    it('returns empty when server only changed fields we did not touch', () => {
        const baseline = { id: 'c1', name: 'Original', status: 'open' };
        const current = { id: 'c1', name: 'Original', status: 'closed' };
        const ours = { name: 'My edit' };
        expect(findContestedKeys(current, ours, baseline)).toEqual([]);
    });

    it('flags a key when both sides changed the same field', () => {
        const baseline = { id: 'c1', name: 'Original' };
        const current = { id: 'c1', name: 'Server change' };
        const ours = { name: 'My change' };
        expect(findContestedKeys(current, ours, baseline)).toEqual(['name']);
    });

    it('ignores _version in our changes', () => {
        const baseline = { id: 'c1', _version: 0, name: 'A' };
        const current = { id: 'c1', _version: 1, name: 'A' };
        const ours = { _version: 0, name: 'A' };
        expect(findContestedKeys(current, ours, baseline)).toEqual([]);
    });

    it('detects structural changes inside nested objects/arrays', () => {
        const baseline = { id: 'c1', tags: ['a', 'b'] };
        const current = { id: 'c1', tags: ['a', 'b', 'c'] };
        const ours = { tags: ['a', 'b', 'x'] };
        expect(findContestedKeys(current, ours, baseline)).toEqual(['tags']);
    });
});
