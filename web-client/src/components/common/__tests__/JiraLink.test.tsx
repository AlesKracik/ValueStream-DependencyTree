import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JiraLink } from '../JiraLink';

describe('JiraLink', () => {
    describe('text variant (default)', () => {
        it('builds href from baseUrl + issueKey', () => {
            render(<JiraLink issueKey="PROJ-123" baseUrl="https://jira.example.com" />);
            const link = screen.getByRole('link');
            expect(link.getAttribute('href')).toBe('https://jira.example.com/browse/PROJ-123');
        });

        it('strips trailing slash from baseUrl', () => {
            render(<JiraLink issueKey="PROJ-1" baseUrl="https://jira.example.com/" />);
            expect(screen.getByRole('link').getAttribute('href')).toBe('https://jira.example.com/browse/PROJ-1');
        });

        it('uses directUrl when provided, ignoring baseUrl', () => {
            render(
                <JiraLink
                    issueKey="PROJ-1"
                    baseUrl="https://jira.example.com"
                    directUrl="https://other.example/browse/PROJ-1"
                />
            );
            expect(screen.getByRole('link').getAttribute('href')).toBe('https://other.example/browse/PROJ-1');
        });

        it('opens in a new tab with safe rel', () => {
            render(<JiraLink issueKey="PROJ-1" baseUrl="https://jira.example.com" />);
            const link = screen.getByRole('link');
            expect(link.getAttribute('target')).toBe('_blank');
            expect(link.getAttribute('rel')).toBe('noopener noreferrer');
        });

        it('sets a descriptive title and aria-label', () => {
            render(<JiraLink issueKey="PROJ-1" baseUrl="https://jira.example.com" />);
            const link = screen.getByRole('link');
            expect(link.getAttribute('title')).toBe('Open PROJ-1 in Jira');
        });

        it('renders the issue key as the click target text by default', () => {
            render(<JiraLink issueKey="PROJ-1" baseUrl="https://jira.example.com" />);
            expect(screen.getByRole('link').textContent).toBe('PROJ-1');
        });

        it('renders a custom label when provided', () => {
            render(<JiraLink issueKey="PROJ-1" baseUrl="https://jira.example.com" label="My Work Item" />);
            expect(screen.getByRole('link').textContent).toBe('My Work Item');
        });

        it('falls back to non-link span when neither baseUrl nor directUrl present', () => {
            render(<JiraLink issueKey="PROJ-1" />);
            expect(screen.queryByRole('link')).toBeNull();
            expect(screen.getByText('PROJ-1')).toBeDefined();
        });
    });

    describe('pill variant', () => {
        it('renders as a link with the key and optional status', () => {
            render(
                <JiraLink
                    issueKey="PROJ-9"
                    baseUrl="https://jira.example.com"
                    variant="pill"
                    status="In Progress"
                />
            );
            const link = screen.getByRole('link');
            expect(link.textContent).toContain('PROJ-9');
            expect(link.textContent).toContain('In Progress');
            expect(link.getAttribute('title')).toContain('In Progress');
        });

        it('renders fallback span when no URL available', () => {
            render(<JiraLink issueKey="PROJ-9" variant="pill" status="Done" />);
            expect(screen.queryByRole('link')).toBeNull();
            expect(screen.getByText('PROJ-9')).toBeDefined();
            expect(screen.getByText('Done')).toBeDefined();
        });
    });

    describe('icon variant', () => {
        it('renders only the arrow glyph with aria-label and title', () => {
            render(<JiraLink issueKey="PROJ-3" baseUrl="https://jira.example.com" variant="icon" />);
            const link = screen.getByRole('link');
            expect(link.textContent).toBe('↗');
            expect(link.getAttribute('aria-label')).toBe('Open PROJ-3 in Jira');
            expect(link.getAttribute('target')).toBe('_blank');
        });
    });

    describe('security', () => {
        it('sanitizes a javascript: href to empty', () => {
            render(
                <JiraLink
                    issueKey="PROJ-1"
                    directUrl={'javascript:alert(1)' as string}
                />
            );
            expect(screen.queryByRole('link')).toBeNull();
        });
    });
});
