import { parseISO } from 'date-fns';

/**
 * Calculates the fiscal year and quarter for a given date string.
 * Quarters are based on the fiscal start month.
 * e.g. If fiscal start is April (4), then April-June is Q1.
 */
export const calculateQuarter = (dateStr: string, fiscalStartMonth: number) => {
    const date = parseISO(dateStr);
    const month = date.getMonth() + 1; // 1-12
    const year = date.getFullYear();

    // Shift month based on fiscal start
    let shiftedMonth = month - fiscalStartMonth + 1;
    let fiscalYear = year;
    if (shiftedMonth <= 0) {
        shiftedMonth += 12;
        fiscalYear -= 1;
    } else if (shiftedMonth > 12) {
        // This case shouldn't normally happen with 1-12 range, 
        // but for completeness if fiscalStartMonth was 1, shiftedMonth is month.
    }

    // If month is >= fiscalStartMonth, it's already the next fiscal year in some conventions,
    // but usually FY is named after the year it ENDS in.
    // If July 2026 is the start of FY2027:
    // month = 7, fiscalStartMonth = 7. shiftedMonth = 1. fiscalYear should be 2027.
    
    // Let's re-verify the requirement. Usually if FY starts in July 2026, it is FY2027.
    // My previous logic: month 7, fiscalStart 7 -> shifted 1, fiscalYear 2026.
    // If we want it to be FY2027:
    if (fiscalStartMonth > 1) {
        fiscalYear += 1;
    }
    // Wait, if fiscalStartMonth is 1, then Jan 2026 is FY2026. Correct.
    // If fiscalStartMonth is 7, then July 2026 is FY2027. 
    // If fiscalStartMonth is 7, then June 2026 is FY2026.
    // June 2026: month 6, fiscalStart 7. shiftedMonth = 6 - 7 + 1 = 0.
    // shiftedMonth becomes 12, fiscalYear becomes 2025. 
    // Then fiscalYear += 1 -> 2026. Correct.

    const quarter = Math.ceil(shiftedMonth / 3);
    return `FY${fiscalYear} Q${quarter}`;
};
