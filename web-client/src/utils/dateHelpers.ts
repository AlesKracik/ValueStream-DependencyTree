import { parseISO } from 'date-fns';

/**
 * Calculates the fiscal year and quarter for a given date string.
 * Quarters are based on the fiscal start month.
 * e.g. If fiscal start is April (4), then April-June is Q1.
 * FY is named after the year it ENDS in (e.g., if it starts in April 2026, it is FY2027).
 */
export const calculateQuarter = (dateStr: string, fiscalStartMonth: number) => {
    const date = parseISO(dateStr);
    const month = date.getMonth() + 1; // 1-12
    const year = date.getFullYear();

    // Shift month based on fiscal start
    let shiftedMonth = month - fiscalStartMonth + 1;
    if (shiftedMonth <= 0) {
        shiftedMonth += 12;
    }

    // Determine Fiscal Year
    // Standard: FY starts in Jan -> FY is current year
    // Non-standard: If we are in or after the start month, it's the next calendar year's FY
    let fiscalYear = year;
    if (fiscalStartMonth > 1 && month >= fiscalStartMonth) {
        fiscalYear += 1;
    }

    const quarter = Math.ceil(shiftedMonth / 3);
    return `FY${fiscalYear} Q${quarter}`;
};
