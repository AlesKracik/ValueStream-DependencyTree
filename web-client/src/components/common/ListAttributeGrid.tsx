import React from 'react';

interface ListAttributeProps {
    label: string;
    value: React.ReactNode;
}

export const ListAttribute: React.FC<ListAttributeProps> = ({ label, value }) => (
    <div style={{ display: 'flex', gap: '4px' }}>
        <span style={{ color: '#60a5fa', fontWeight: 'bold', flexShrink: 0 }}>{label}:</span>
        <span style={{ color: '#cbd5e1' }}>{value}</span>
    </div>
);

interface ListAttributeGridProps {
    children: React.ReactNode;
    columns?: number;
    columnWidth?: string;
}

export const ListAttributeGrid: React.FC<ListAttributeGridProps> = ({ 
    children, 
    columns = 2, 
    columnWidth = '220px' 
}) => (
    <div style={{ 
        display: 'grid', 
        gridTemplateColumns: `repeat(${columns}, ${columnWidth})`, 
        fontSize: '13px', 
        color: '#94a3b8',
        marginTop: '8px'
    }}>
        {children}
    </div>
);
