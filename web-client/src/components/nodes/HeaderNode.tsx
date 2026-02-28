import { memo } from 'react';

interface HeaderNodeData {
  label: string;
}

export const HeaderNode = memo(({ data }: { data: HeaderNodeData }) => {
  return (
    <div style={{
      padding: '10px 20px',
      borderRadius: '8px',
      backgroundColor: 'transparent',
      color: '#94a3b8',
      fontSize: '18px',
      fontWeight: 'bold',
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      textAlign: 'center',
      width: '220px',
      boxSizing: 'border-box',
      borderBottom: '2px solid #334155'
    }}>
      {data.label}
    </div>
  );
});
