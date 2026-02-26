import { memo } from 'react';

export interface SprintCapacityNodeData {
    sprintLabel: string;
    startDate: string;
    endDate: string;
    usedMds: number;
    totalCapacityMds: number;
    isOverridden?: boolean;
    holidayCount?: number;
    width: number;
}

export const SprintCapacityNode = memo(({ data }: { data: SprintCapacityNodeData }) => {
    const isOverallocated = data.usedMds > data.totalCapacityMds;
    const isAllocated = data.usedMds > 0;
    const hasHolidays = (data.holidayCount || 0) > 0;

    let borderColor = '#374151';
    let textColor = '#9ca3af';
    let bgColor = 'transparent';
    let fontWeight = 'normal';

    if (isOverallocated) {
        borderColor = '#ef4444';
        textColor = '#ef4444';
        bgColor = 'rgba(239, 68, 68, 0.1)';
        fontWeight = 'bold';
    } else if (isAllocated) {
        borderColor = '#22c55e';
        textColor = '#22c55e';
        bgColor = 'rgba(34, 197, 94, 0.1)';
        fontWeight = 'bold';
    }

    return (
        <div
            style={{
                width: `${data.width}px`,
                height: '40px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderBottom: `2px solid ${borderColor}`,
                color: textColor,
                fontSize: '13px',
                fontWeight: fontWeight as any,
                backgroundColor: bgColor,
                transition: 'all 0.2s ease'
            }}
            title={`${data.sprintLabel}: ${data.usedMds} / ${data.totalCapacityMds} MDs${data.holidayCount ? ` (${data.holidayCount} public holidays)` : ''}`}
        >
            <div style={{ marginBottom: '4px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold' }}>
                    {data.sprintLabel} {data.isOverridden && '*'} {hasHolidays && '🏝️'}
                </span>
                <span style={{ fontSize: '13px', opacity: 0.8 }}>({data.startDate} - {data.endDate})</span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: (data.isOverridden || hasHolidays) ? 'bold' : 'normal' }}>
                {data.usedMds} / {data.totalCapacityMds} MDs {data.isOverridden && '(Override)'} {hasHolidays && `(-${data.holidayCount}d)`}
            </div>
        </div>
    );
});

export default SprintCapacityNode;
