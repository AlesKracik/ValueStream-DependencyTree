import { parseISO, isWeekend } from 'date-fns';
import Holidays from 'date-holidays';

/**
 * Calculates working days (Mon-Fri) and public holidays in a date range.
 */
export const calculateWorkingDays = (startStr: string, endStr: string, countryCode?: string): { workDays: number; holidayCount: number } => {
    const start = parseISO(startStr);
    const end = parseISO(endStr);
    if (start > end) return { workDays: 0, holidayCount: 0 };

    const hd = countryCode ? new Holidays(countryCode as any) : null;
    let workDays = 0;
    let holidayCount = 0;
    const current = new Date(start);
    while (current <= end) {
        const isWknd = isWeekend(current);
        const dayHolidays = hd ? hd.isHoliday(current) : false;

        // Only count as holiday if it's a public holiday and not on a weekend
        const isPublicHoliday = Array.isArray(dayHolidays) 
            ? dayHolidays.some(h => h.type === 'public')
            : (dayHolidays && (dayHolidays as any).type === 'public');

        if (!isWknd && !isPublicHoliday) {
            workDays++;
        } else if (!isWknd && isPublicHoliday) {
            holidayCount++;
        }
        current.setDate(current.getDate() + 1);
    }
    return { workDays, holidayCount };
};

/**
 * Calculates the man-day (MD) impact of holidays for a team in a given period.
 */
export const getHolidayImpact = (totalCapacityMd: number, holidayCount: number): number => {
    // Assuming 10 MDs per standard 2-week sprint (this could be parameterized if needed)
    // The proportion is (totalCapacityMd / 10) per holiday
    return (totalCapacityMd / 10) * holidayCount;
};

/**
 * Counts business days (Mon-Fri, excluding public holidays) between two dates inclusive.
 * Updated to use the refined public holiday logic.
 */
export const countBusinessDays = (startStr: string, endStr: string, countryCode?: string): number => {
    return calculateWorkingDays(startStr, endStr, countryCode).workDays;
};

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

/**
 * Returns a list of supported countries for the holiday calculation.
 */
export const getCountryOptions = (): { id: string; label: string }[] => {
    const hd = new Holidays();
    const countries = hd.getCountries();
    return Object.entries(countries).map(([code, name]) => ({
        id: code,
        label: `${name} (${code})`
    })).sort((a, b) => a.label.localeCompare(b.label));
};
