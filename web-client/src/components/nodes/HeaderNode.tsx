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
      color: 'var(--text-muted)',
      fontSize: '18px',
      fontWeight: 'bold',
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      textAlign: 'center',
      width: '220px',
      boxSizing: 'border-box',
      borderBottom: '2px solid var(--border-primary)'
    }}>
      {data.label}
    </div>
  );
});
