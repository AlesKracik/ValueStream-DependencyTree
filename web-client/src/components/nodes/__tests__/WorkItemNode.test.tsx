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
    description: 'A test description',
    effortMds: 10,
    score: 1500,
    maxScore: 5000,
    baseSize: 100,
};

describe('WorkItemNode', () => {
    it('renders the label and formatted score', () => {
        render(<WorkItemNode data={mockData} />);
        
        expect(screen.getByText('Test Work Item')).toBeDefined();
        expect(screen.getByText('1.5k')).toBeDefined();
    });

    it('renders the description as a tooltip', () => {
        render(<WorkItemNode data={mockData} />);
        
        // The container div should have the title attribute
        const container = screen.getByTitle('A test description');
        expect(container).toBeDefined();
    });

    it('renders the global icon when isGlobal is true', () => {
        render(<WorkItemNode data={{ ...mockData, isGlobal: true }} />);
        
        expect(screen.getByTitle(/Relates to all existing customers/i)).toBeDefined();
    });

    it('renders the release icon when releasedInSprintId is provided', () => {
        const releasedInSprintId = 's1';
        render(<WorkItemNode data={{ ...mockData, releasedInSprintId }} />);
        
        const indicator = screen.getByTitle(/Released in Sprint s1/i);
        expect(indicator).toBeDefined();
        expect(indicator.textContent).toContain('📦');
    });

    it('does not render the release icon when releasedInSprintId is absent', () => {
        render(<WorkItemNode data={mockData} />);
        
        expect(screen.queryByTitle(/Released in Sprint/i)).toBeNull();
    });

    it('renders the unestimated effort warning icon when hasUnestimatedEffort is true', () => {
        render(<WorkItemNode data={{ ...mockData, hasUnestimatedEffort: true }} />);
        
        const indicator = screen.getByTitle(/Effort is not estimated/i);
        expect(indicator).toBeDefined();
        expect(indicator.textContent).toContain('📏');
        expect(indicator.style.color).toBe('rgb(251, 191, 36)'); // #fbbf24
    });

    it('renders the dateless epics warning icon when hasDatelessEpics is true', () => {
        render(<WorkItemNode data={{ ...mockData, hasDatelessEpics: true }} />);
        
        const indicator = screen.getByTitle(/Has epics without target dates/i);
        expect(indicator).toBeDefined();
        expect(indicator.textContent).toContain('🕒');
        expect(indicator.style.color).toBe('rgb(248, 113, 113)'); // #f87171
    });

    it('does not render the unestimated effort warning icon when hasUnestimatedEffort is false', () => {
        render(<WorkItemNode data={{ ...mockData, hasUnestimatedEffort: false }} />);
        
        expect(screen.queryByTitle(/Effort is not estimated/i)).toBeNull();
    });
});
