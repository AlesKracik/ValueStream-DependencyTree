import { memo } from 'react';

export interface TodayLineNodeData {
    height: number;
    dateStr: string;
}

export const TodayLineNode = memo(({ data }: { data: TodayLineNodeData }) => {
    return (
        <div
            style={{
                width: '2px',
                height: `${data.height}px`,
                backgroundColor: '#ef4444',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                zIndex: 50,
                pointerEvents: 'none'
            }}
        >
            <div style={{
                position: 'absolute',
                top: '-25px',
                backgroundColor: '#ef4444',
                color: 'white',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                pointerEvents: 'auto'
            }}
                title="Current Date"
            >
                Today ({data.dateStr})
            </div>
        </div>
    );
});

export default TodayLineNode;
