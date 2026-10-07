import { describe, it, expect } from 'vitest';
import { EFFORT_SIZE_OPTIONS, effortSizeUpdate } from '../effortSize';

describe('effortSize', () => {
    it('offers "Not estimated" then XS–XL with their MDs', () => {
        expect(EFFORT_SIZE_OPTIONS.map(o => o.label)).toEqual([
            'Not estimated', 'XS (1 MD)', 'S (10 MD)', 'M (40 MD)', 'L (120 MD)', 'XL (360 MD)',
        ]);
    });

    it('maps a size to its MDs and anything else to not estimated (0 MDs)', () => {
        expect(effortSizeUpdate('XS')).toEqual({ effort_size: 'XS', total_effort_mds: 1 });
        expect(effortSizeUpdate('XL')).toEqual({ effort_size: 'XL', total_effort_mds: 360 });
        expect(effortSizeUpdate('')).toEqual({ effort_size: null, total_effort_mds: 0 });
        expect(effortSizeUpdate('XXL')).toEqual({ effort_size: null, total_effort_mds: 0 });
    });
});
