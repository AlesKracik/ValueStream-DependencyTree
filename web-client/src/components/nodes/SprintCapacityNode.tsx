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

    let borderColor = 'var(--node-sprint-border)';
    let textColor = 'var(--text-secondary)';
    let bgColor = 'var(--node-sprint-bg)';
    let fontWeight = '500';

    if (isOverallocated) {
        borderColor = 'var(--node-sprint-over-border)';
        textColor = 'var(--node-sprint-over-text)';
        bgColor = 'var(--node-sprint-over-bg)';
        fontWeight = 'bold';
    } else if (isAllocated) {
        borderColor = 'var(--node-sprint-allocated-border)';
        textColor = 'var(--node-sprint-allocated-text)';
        bgColor = 'var(--node-sprint-allocated-bg)';
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
                borderLeft: '1px solid var(--node-sprint-border)',
                color: textColor,
                fontSize: '13px',
                fontWeight: fontWeight as any,
                backgroundColor: bgColor,
                transition: 'all 0.2s ease',
                boxSizing: 'border-box'
            }}
            title={`${data.sprintLabel}: ${data.usedMds} / ${data.totalCapacityMds} MDs${data.holidayCount ? ` (${data.holidayCount} public holidays)` : ''}`}
        >
            <div style={{ marginBottom: '1px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--node-sprint-text)' }}>
                    {data.sprintLabel}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--node-sprint-text)', fontWeight: 'bold' }}>{data.startDate}</span>
            </div>
            <div style={{ fontSize: '11px' }}>
                <span style={{ color: isOverallocated ? 'var(--status-danger-text)' : (isAllocated ? 'var(--status-success)' : 'var(--text-muted)'), fontWeight: 'bold' }}>{data.usedMds}</span>
                <span style={{ margin: '0 2px', color: 'var(--text-muted)' }}>/</span>
                <span style={{ color: 'var(--text-secondary)' }}>{data.totalCapacityMds}</span>
                {data.isOverridden && <span title="Manual capacity override" style={{ marginLeft: '4px', cursor: 'help' }}>🔒</span>}
                {hasHolidays && <span title={`${data.holidayCount} holidays`} style={{ marginLeft: '4px', cursor: 'help' }}>🏝️</span>}
            </div>
        </div>
    );
});

export default SprintCapacityNode;
