import { EFFORT_SIZES, EFFORT_SIZE_MDS } from '@valuestream/shared-types';
import type { WorkItem, EffortSize } from '@valuestream/shared-types';

/**
 * Baseline effort as a T-shirt size. The server derives `total_effort_mds`
 * from `effort_size` (backend/src/utils/effortSize.ts); PATCH answers with
 * `_version` only, so the client sends and keeps the same derived number.
 */

/** Select options: "not estimated" first, then the sizes smallest first. */
export const EFFORT_SIZE_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'Not estimated' },
    ...EFFORT_SIZES.map(size => ({ value: size, label: `${size} (${EFFORT_SIZE_MDS[size]} MD)` })),
];

/** The update for picking a size from EFFORT_SIZE_OPTIONS ('' clears it). */
export const effortSizeUpdate = (value: string): Pick<WorkItem, 'effort_size' | 'total_effort_mds'> => {
    const size = (EFFORT_SIZES as readonly string[]).includes(value) ? value as EffortSize : null;
    return { effort_size: size, total_effort_mds: size ? EFFORT_SIZE_MDS[size] : 0 };
};
