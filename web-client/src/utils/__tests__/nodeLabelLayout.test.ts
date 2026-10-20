import { describe, it, expect } from 'vitest';
import {
    estimateLabelLines,
    estimateLabelHeight,
    stackNodeCenters,
    NODE_ROW_PITCH_PX,
    NODE_ROW_GAP_PX,
} from '../nodeLabelLayout';

describe('estimateLabelLines', () => {
    it('returns 0 for empty labels', () => {
        expect(estimateLabelLines(undefined)).toBe(0);
        expect(estimateLabelLines('   ')).toBe(0);
    });

    it('keeps short labels on one line', () => {
        expect(estimateLabelLines('Acme Corp')).toBe(1);
    });

    it('wraps long labels onto several lines', () => {
        const label = 'Support for asynchronous replication across multiple regions with failover';
        expect(estimateLabelLines(label)).toBeGreaterThanOrEqual(3);
    });

    it('breaks a single word longer than a line', () => {
        expect(estimateLabelLines('x'.repeat(50))).toBeGreaterThanOrEqual(3);
    });
});

describe('stackNodeCenters', () => {
    it('uses the default pitch for short labels', () => {
        const centers = stackNodeCenters(
            [{ size: 100, label: 'A' }, { size: 100, label: 'B' }, { size: 100, label: 'C' }],
            200
        );
        expect(centers).toEqual([200, 200 + NODE_ROW_PITCH_PX, 200 + 2 * NODE_ROW_PITCH_PX]);
    });

    it('pushes the next node below a long wrapped label', () => {
        const longLabel = 'A very long work item name that wraps across many lines in the graph view for sure';
        const items = [{ size: 140, label: longLabel }, { size: 140, label: 'Next' }];
        const [first, second] = stackNodeCenters(items, 200);

        const firstLabelBottom = first + 70 + estimateLabelHeight(longLabel);
        const secondTop = second - 70;
        expect(secondTop - firstLabelBottom).toBeGreaterThanOrEqual(NODE_ROW_GAP_PX);
        expect(second - first).toBeGreaterThan(NODE_ROW_PITCH_PX);
    });
});
