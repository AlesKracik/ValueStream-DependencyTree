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

    it('strips HTML tags from the description for the tooltip', () => {
        const dataWithHtml = {
            ...mockData,
            description: '<p>Line 1</p><br/><ul><li>Item 1</li></ul>'
        };
        render(<WorkItemNode data={dataWithHtml} />);
        
        // Tooltip should have tags removed
        const container = screen.getByTitle('Line 1Item 1');
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
        expect(indicator.style.color).toBe('var(--status-warning)');
    });

    it('renders the dateless issues warning icon when hasDatelessIssues is true', () => {
        render(<WorkItemNode data={{ ...mockData, hasDatelessIssues: true }} />);
        
        const indicator = screen.getByTitle(/Has issues without target dates/i);
        expect(indicator).toBeDefined();
        expect(indicator.textContent).toContain('🕒');
        expect(indicator.style.color).toBe('var(--status-danger)');
    });

    it('does not render the unestimated effort warning icon when hasUnestimatedEffort is false', () => {
        render(<WorkItemNode data={{ ...mockData, hasUnestimatedEffort: false }} />);
        
        expect(screen.queryByTitle(/Effort is not estimated/i)).toBeNull();
    });
});
