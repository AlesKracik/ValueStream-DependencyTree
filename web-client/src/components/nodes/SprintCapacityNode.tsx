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
    let textColor = '#cbd5e1';
    let bgColor = '#1f2937';
    let fontWeight = '500';

    if (isOverallocated) {
        borderColor = '#ef4444';
        textColor = '#fca5a5';
        bgColor = 'rgba(127, 29, 29, 0.4)';
        fontWeight = 'bold';
    } else if (isAllocated) {
        borderColor = '#22c55e';
        textColor = '#86efac';
        bgColor = 'rgba(20, 83, 45, 0.4)';
        fontWeight = 'bold';
    }

    return (
        <div
            style={{
                width: `${data.width}px`,
                height: '45px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderBottom: `2px solid ${borderColor}`,
                borderLeft: '1px solid #374151',
                borderRight: '1px solid #374151',
                color: textColor,
                fontSize: '14px',
                fontWeight: fontWeight as any,
                backgroundColor: bgColor,
                transition: 'all 0.2s ease',
                boxSizing: 'border-box'
            }}
            title={`${data.sprintLabel}: ${data.usedMds} / ${data.totalCapacityMds} MDs${data.holidayCount ? ` (${data.holidayCount} public holidays)` : ''}`}
        >
            <div style={{ marginBottom: '2px', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#f3f4f6' }}>
                    {data.sprintLabel} {data.isOverridden && '*'}
                </span>
                <span style={{ fontSize: '11px', opacity: 0.6, color: '#9ca3af' }}>{data.startDate} - {data.endDate}</span>
            </div>
            <div style={{ fontSize: '12px', opacity: 0.9 }}>
                <span style={{ color: isOverallocated ? '#f87171' : (isAllocated ? '#4ade80' : '#9ca3af') }}>{data.usedMds}</span>
                <span style={{ margin: '0 4px', opacity: 0.5 }}>/</span>
                <span>{data.totalCapacityMds} MDs</span>
                {data.isOverridden && <span style={{ marginLeft: '4px', fontSize: '10px', color: '#fbbf24' }}>(Fixed)</span>}
                {hasHolidays && <span style={{ marginLeft: '4px', fontSize: '10px', color: '#fbbf24' }}>(-{data.holidayCount}d 🏝️)</span>}
            </div>
        </div>
    );
});

export default SprintCapacityNode;
