import { memo, useState, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import { addDays, format, parseISO } from 'date-fns';
import { useDashboardContext } from '../../contexts/DashboardContext';

export interface GanttBarNodeData {
    label: string;
    width: number;
    color: string;
    jiraKey?: string;
    jiraBaseUrl?: string;
    epicId: string;
    targetStart: string;
    targetEnd: string;
    segments?: { 
        startOffsetPixels: number, 
        widthPixels: number, 
        intensity: number, 
        color: string, 
        isFrozen: boolean 
    }[];
}

const PIXELS_PER_DAY = 20;

export const GanttBarNode = memo(({ data }: { data: GanttBarNodeData }) => {
    const { updateEpic } = useDashboardContext();
    const [dragState, setDragState] = useState<{ active: 'left' | 'right' | null, startX: number, currentDelta: number }>({
        active: null,
        startX: 0,
        currentDelta: 0
    });

    const nodeRef = useRef<HTMLDivElement>(null);

    const onPointerDown = (type: 'left' | 'right') => (e: React.PointerEvent) => {
        e.stopPropagation(); // prevent ReactFlow panning
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragState({
            active: type,
            startX: e.clientX,
            currentDelta: 0
        });
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (!dragState.active) return;
        setDragState(prev => ({
            ...prev,
            currentDelta: e.clientX - prev.startX
        }));
    };

    const onPointerUp = (e: React.PointerEvent) => {
        if (!dragState.active) return;
        e.currentTarget.releasePointerCapture(e.pointerId);

        // Finalize state change
        const deltaDays = Math.round(dragState.currentDelta / PIXELS_PER_DAY);
        if (deltaDays !== 0) {
            const startStr = data.targetStart;
            const endStr = data.targetEnd;
            const sDate = parseISO(startStr);
            const eDate = parseISO(endStr);

            if (dragState.active === 'left') {
                const newStart = addDays(sDate, deltaDays);
                if (newStart <= eDate) {
                    updateEpic(data.epicId, { target_start: format(newStart, 'yyyy-MM-dd') });
                }
            } else if (dragState.active === 'right') {
                const newEnd = addDays(eDate, deltaDays);
                if (newEnd >= sDate) {
                    updateEpic(data.epicId, { target_end: format(newEnd, 'yyyy-MM-dd') });
                }
            }
        }

        setDragState({ active: null, startX: 0, currentDelta: 0 });
    };

    // Calculate visual dimensions based on drag state
    let visualWidth = data.width;
    let visualLeft = 0;

    if (dragState.active === 'left') {
        visualWidth = Math.max(PIXELS_PER_DAY, data.width - dragState.currentDelta);
        visualLeft = dragState.currentDelta;
    } else if (dragState.active === 'right') {
        visualWidth = Math.max(PIXELS_PER_DAY, data.width + dragState.currentDelta);
    }

    return (
        <div
            ref={nodeRef}
            style={{
                width: `${visualWidth}px`,
                transform: `translateX(${visualLeft}px)`,
                height: '40px',
                backgroundColor: data.color || '#8b5cf6',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                padding: '0 12px',
                color: '#fff',
                fontWeight: 'bold',
                fontSize: '12px',
                boxShadow: '0 2px 4px -1px rgb(0 0 0 / 0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                boxSizing: 'border-box',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                position: 'relative',
                transition: dragState.active ? 'none' : 'width 0.1s, transform 0.1s'
            }}
            title={data.label}
        >
            {/* Render Intensity Segments */}
            {data.segments && data.segments.map((seg, idx) => {
                let intensityColor = 'transparent';
                let intensityOpacity = 0;

                // seg.intensity is now a Ratio relative to mathematical uniform baseline (1.0 = Default)
                if (seg.intensity > 1) {
                    // Lighter (White glow)
                    intensityColor = 'rgba(255, 255, 255, 1)';
                    intensityOpacity = Math.min((seg.intensity - 1) * 0.4, 0.6);
                } else if (seg.intensity < 1) {
                    // Darker (Black shade)
                    intensityColor = 'rgba(0, 0, 0, 1)';
                    intensityOpacity = Math.min((1 - seg.intensity) * 0.8, 0.8);
                }

                return (
                    <div
                        key={idx}
                        style={{
                            position: 'absolute',
                            left: `${seg.startOffsetPixels}px`,
                            width: `${seg.widthPixels}px`,
                            top: 0,
                            bottom: 0,
                            backgroundColor: seg.color || data.color,
                            backgroundImage: seg.isFrozen 
                                ? 'linear-gradient(45deg, rgba(255,255,255,0.1) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.1) 75%, transparent 75%, transparent)' 
                                : 'none',
                            backgroundSize: '10px 10px',
                            zIndex: 1,
                            boxSizing: 'border-box',
                            borderRight: idx < (data.segments?.length || 0) - 1 ? '1px dashed rgba(255,255,255,0.3)' : 'none'
                        }}
                    >
                        {/* Intensity Overlay */}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            backgroundColor: intensityColor,
                            opacity: intensityOpacity,
                            pointerEvents: 'none'
                        }} />
                    </div>
                );
            })}

            {/* Entry Handles for Dependencies */}
            <Handle type="target" position={Position.Left} id="target-start" style={{ opacity: 0 }} />
            <Handle type="target" position={Position.Right} id="target-finish" style={{ top: '30%', opacity: 0 }} />

            {/* Left Drag Handle */}
            <div
                onPointerDown={onPointerDown('left')}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '8px',
                    cursor: 'ew-resize',
                    background: dragState.active === 'left' ? 'rgba(255,255,255,0.4)' : 'transparent',
                    zIndex: 10
                }}
            />

            <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none', zIndex: 5 }}>
                {data.jiraKey && data.jiraBaseUrl ? (
                    <a
                        href={`${data.jiraBaseUrl}/browse/${data.jiraKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'white', textDecoration: 'underline', width: '100%', pointerEvents: 'auto' }}
                    >
                        {data.label}
                    </a>
                ) : (
                    data.label
                )}
            </div>

            {/* Right Drag Handle */}
            <div
                onPointerDown={onPointerDown('right')}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: '8px',
                    cursor: 'ew-resize',
                    background: dragState.active === 'right' ? 'rgba(255,255,255,0.4)' : 'transparent',
                    zIndex: 10
                }}
            />

            {/* Exit/Standard Handles */}
            <Handle type="source" position={Position.Right} id="source-finish" style={{ top: '70%', opacity: 0 }} />
            <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
        </div>
    );
});

export default GanttBarNode;
