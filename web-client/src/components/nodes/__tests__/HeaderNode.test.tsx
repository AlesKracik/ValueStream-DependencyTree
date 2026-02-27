import { render, screen } from '@testing-library/react';
import { HeaderNode } from '../HeaderNode';
import { describe, it, expect } from 'vitest';

describe('HeaderNode', () => {
  it('renders the label correctly', () => {
    const data = { label: 'Test Header' };
    render(<HeaderNode data={data} />);
    
    expect(screen.getByText('Test Header')).toBeDefined();
  });

  it('has the correct styles for uppercase and centering', () => {
    const data = { label: 'Customers' };
    render(<HeaderNode data={data} />);
    
    const element = screen.getByText('Customers');
    const style = window.getComputedStyle(element);
    
    expect(style.textTransform).toBe('uppercase');
    expect(style.textAlign).toBe('center');
    expect(style.width).toBe('220px');
  });
});
