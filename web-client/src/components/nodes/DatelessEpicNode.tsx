import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

export interface DatelessEpicNodeData {
    label: string;
    epicId: string;
    jiraKey?: string;
    jiraBaseUrl?: string;
}

export const DatelessEpicNode = memo(({ data }: { data: DatelessEpicNodeData }) => {
    return (
        <div
            style={{
                width: '150px',
                height: '40px',
                backgroundColor: '#334155',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                padding: '0 12px',
                color: '#f87171',
                fontWeight: 'bold',
                fontSize: '11px',
                boxShadow: '0 2px 4px -1px rgb(0 0 0 / 0.1)',
                border: '2px dashed #ef4444',
                boxSizing: 'border-box',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                position: 'relative'
            }}
            title={`${data.label} (No Dates Set)`}
        >
            <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span style={{ fontSize: '14px', marginRight: '6px' }}>⚠️</span>
                {data.label}
            </div>

            {/* Dummy handles to maintain edge connectivity if any */}
            <Handle type="target" position={Position.Left} id="target-start" style={{ opacity: 0 }} />
            <Handle type="source" position={Position.Right} id="source-finish" style={{ opacity: 0 }} />
        </div>
    );
});

export default DatelessEpicNode;
