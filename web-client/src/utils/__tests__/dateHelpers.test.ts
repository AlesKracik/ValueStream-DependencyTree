import { describe, it, expect } from 'vitest';
import { calculateQuarter } from '../dateHelpers';

describe('dateHelpers', () => {
    describe('calculateQuarter', () => {
        it('calculates correctly for standard calendar year (Jan start)', () => {
            expect(calculateQuarter('2026-01-15', 1)).toBe('FY2026 Q1');
            expect(calculateQuarter('2026-04-10', 1)).toBe('FY2026 Q2');
            expect(calculateQuarter('2026-07-20', 1)).toBe('FY2026 Q3');
            expect(calculateQuarter('2026-10-05', 1)).toBe('FY2026 Q4');
        });

        it('calculates correctly for April fiscal start', () => {
            // Jan is now Q4 of previous year
            expect(calculateQuarter('2026-01-15', 4)).toBe('FY2026 Q4');
            // April is now Q1 of current year
            expect(calculateQuarter('2026-04-10', 4)).toBe('FY2027 Q1');
            // Oct is Q3
            expect(calculateQuarter('2026-10-05', 4)).toBe('FY2027 Q3');
        });

        it('calculates correctly for July fiscal start', () => {
            // Jan is Q3
            expect(calculateQuarter('2026-01-15', 7)).toBe('FY2026 Q3');
            // June is Q4
            expect(calculateQuarter('2026-06-30', 7)).toBe('FY2026 Q4');
            // July is Q1 of NEXT fiscal year
            expect(calculateQuarter('2026-07-01', 7)).toBe('FY2027 Q1');
        });

        it('handles December fiscal start', () => {
            // Dec 2025 starts FY2026
            expect(calculateQuarter('2025-12-01', 12)).toBe('FY2026 Q1');
            // Jan 2026 is still Q1
            expect(calculateQuarter('2026-01-15', 12)).toBe('FY2026 Q1');
            // Feb 2026 is Q1
            expect(calculateQuarter('2026-02-28', 12)).toBe('FY2026 Q1');
            // March 2026 starts Q2
            expect(calculateQuarter('2026-03-01', 12)).toBe('FY2026 Q2');
        });

        it('handles year transitions correctly', () => {
            // If FY starts in Oct (10), then Oct 2025 is FY2026 Q1
            expect(calculateQuarter('2025-10-01', 10)).toBe('FY2026 Q1');
            expect(calculateQuarter('2026-09-30', 10)).toBe('FY2026 Q4');
        });
    });
});
