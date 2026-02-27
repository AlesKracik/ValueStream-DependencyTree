import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WorkItemNode } from '../WorkItemNode';

// Mock React Flow components
vi.mock('@xyflow/react', () => ({
    Handle: () => <div data-testid="handle" />,
    Position: { Left: 'left', Right: 'right' }
}));

const mockData = {
    label: 'Test Work Item',
    effortMds: 10,
    score: 150,
    maxScore: 500,
    baseSize: 100,
};

describe('WorkItemNode', () => {
    it('renders the label and score', () => {
        render(<WorkItemNode data={mockData} />);
        
        expect(screen.getByText('Test Work Item')).toBeDefined();
        expect(screen.getByText('150')).toBeDefined();
    });

    it('renders the global icon when isGlobal is true', () => {
        render(<WorkItemNode data={{ ...mockData, isGlobal: true }} />);
        
        expect(screen.getByTitle(/Relates to all existing customers/i)).toBeDefined();
    });

    it('renders the release link rocket icon when releaseLink is provided', () => {
        const releaseLink = 'https://github.com/releases/v1.0.0';
        render(<WorkItemNode data={{ ...mockData, releaseLink }} />);
        
        const link = screen.getByTitle(/View Release/i);
        expect(link).toBeDefined();
        expect(link.getAttribute('href')).toBe(releaseLink);
        expect(link.textContent).toContain('🚀');
    });

    it('does not render the release link icon when releaseLink is absent', () => {
        render(<WorkItemNode data={mockData} />);
        
        expect(screen.queryByTitle(/View Release/i)).toBeNull();
    });
});
