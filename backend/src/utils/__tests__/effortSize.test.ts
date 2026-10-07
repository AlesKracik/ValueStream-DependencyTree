import { describe, it, expect, vi } from 'vitest';
import { sizeForMds, deriveEffort, migrateLegacyEffort, LEGACY_EFFORT_FILTER } from '../effortSize';

describe('effortSize', () => {
  describe('sizeForMds', () => {
    it('maps exact size values to their size', () => {
      expect([1, 10, 40, 120, 360].map(sizeForMds)).toEqual(['XS', 'S', 'M', 'L', 'XL']);
    });

    it('picks the nearest size on a log scale (boundary = geometric mean)', () => {
      expect(sizeForMds(3)).toBe('XS');   // < √10 ≈ 3.16
      expect(sizeForMds(4)).toBe('S');
      expect(sizeForMds(19)).toBe('S');   // < √400 = 20
      expect(sizeForMds(20)).toBe('M');
      expect(sizeForMds(69)).toBe('M');   // < √4800 ≈ 69.3
      expect(sizeForMds(70)).toBe('L');
      expect(sizeForMds(207)).toBe('L');  // < √43200 ≈ 207.8
      expect(sizeForMds(208)).toBe('XL');
      expect(sizeForMds(5000)).toBe('XL');
      expect(sizeForMds(0.5)).toBe('XS');
    });

    it('treats 0, negative, missing or non-numeric as not estimated', () => {
      for (const v of [0, -5, undefined, null, '', 'abc', NaN]) expect(sizeForMds(v)).toBeNull();
    });
  });

  describe('deriveEffort', () => {
    it('stamps total_effort_mds from effort_size, ignoring a client number', () => {
      const data = { effort_size: 'L', total_effort_mds: 7 };
      deriveEffort(data);
      expect(data).toEqual({ effort_size: 'L', total_effort_mds: 120 });
    });

    it('a cleared size means 0 MDs', () => {
      const data: Record<string, unknown> = { effort_size: null };
      deriveEffort(data);
      expect(data).toEqual({ effort_size: null, total_effort_mds: 0 });
    });

    it('converts a number-only write to the nearest size', () => {
      const data: Record<string, unknown> = { total_effort_mds: 25 };
      deriveEffort(data);
      expect(data).toEqual({ effort_size: 'M', total_effort_mds: 40 });
      const zero: Record<string, unknown> = { total_effort_mds: 0 };
      deriveEffort(zero);
      expect(zero).toEqual({ effort_size: null, total_effort_mds: 0 });
    });

    it('leaves a write touching neither field alone', () => {
      const data: Record<string, unknown> = { name: 'x' };
      deriveEffort(data);
      expect(data).toEqual({ name: 'x' });
    });
  });

  // TODO(remove): with the legacy migration.
  it('migrates numeric baselines to sizes under a version guard', async () => {
    const coll = {
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([
        { id: 'w1', _version: 2, total_effort_mds: 25 },
        { id: 'w2', total_effort_mds: 400 },
      ]) }),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const db = { collection: vi.fn().mockReturnValue(coll) };

    expect(await migrateLegacyEffort(db as never)).toBe(2);
    expect(coll.find).toHaveBeenCalledWith(LEGACY_EFFORT_FILTER);
    expect(coll.updateOne).toHaveBeenNthCalledWith(1, { id: 'w1', _version: 2 },
      { $set: { effort_size: 'M', total_effort_mds: 40, _version: 3 } });
    expect(coll.updateOne).toHaveBeenNthCalledWith(2, { id: 'w2', _version: { $exists: false } },
      { $set: { effort_size: 'XL', total_effort_mds: 360, _version: 1 } });
  });
});
