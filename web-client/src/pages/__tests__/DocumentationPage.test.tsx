import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { DocumentationPage } from '../DocumentationPage';
import { renderWithProviders } from '../../test/testUtils';

describe('DocumentationPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})));
    });

    it('shows loading message initially', () => {
        (fetch as any).mockResolvedValue({
            text: () => new Promise(() => {}) // never resolves
        });

        renderWithProviders(<DocumentationPage />);
        expect(screen.getByText('Loading documentation...')).toBeDefined();
    });

    it('renders markdown content on success', async () => {
        const mockMarkdown = '# User Guide\n\nThis is the documentation.';
        (fetch as any).mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(mockMarkdown)
        });

        renderWithProviders(<DocumentationPage />);

        await waitFor(() => {
            expect(screen.getByText('User Guide')).toBeDefined();
            expect(screen.getByText('This is the documentation.')).toBeDefined();
        });
    });

    it('shows error message on failure', async () => {
        (fetch as any).mockRejectedValue(new Error('Fetch failed'));

        renderWithProviders(<DocumentationPage />);

        await waitFor(() => {
            expect(screen.getByText(/Failed to load documentation/i)).toBeDefined();
        });
    });
});
