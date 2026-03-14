import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { DocumentationModal } from '../DocumentationModal';

describe('DocumentationModal', () => {
    const onClose = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        // Ensure fetch always returns something that has .then, .catch
        const mockFetch = vi.fn().mockImplementation(() => new Promise(() => {})); 
        vi.stubGlobal('fetch', mockFetch);
    });

    it('shows loading message initially', () => {
        render(<DocumentationModal onClose={onClose} />);
        expect(screen.getByText('Loading documentation...')).toBeDefined();
    });

    it('renders markdown content on success', async () => {
        const mockMarkdown = '# User Guide\n\nThis is the guide.';
        (fetch as any).mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(mockMarkdown)
        });

        render(<DocumentationModal onClose={onClose} />);

        await waitFor(() => {
            expect(screen.getByText('User Guide')).toBeDefined();
            expect(screen.getByText('This is the guide.')).toBeDefined();
        });
    });

    it('shows error message on failure', async () => {
        (fetch as any).mockRejectedValue(new Error('Fetch failed'));

        render(<DocumentationModal onClose={onClose} />);

        await waitFor(() => {
            expect(screen.getByText(/Failed to load documentation/i)).toBeDefined();
        });
    });

    it('calls onClose when Close button is clicked', async () => {
        render(<DocumentationModal onClose={onClose} />);
        
        const closeBtn = screen.getByText('Close');
        await act(async () => {
            fireEvent.click(closeBtn);
        });
        expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when backdrop is clicked', async () => {
        const { container } = render(<DocumentationModal onClose={onClose} />);
        
        // The first div is the backdrop
        const backdrop = container.firstChild as HTMLElement;
        await act(async () => {
            fireEvent.click(backdrop);
        });
        expect(onClose).toHaveBeenCalled();
    });

    it('does NOT call onClose when modal content is clicked', async () => {
        render(<DocumentationModal onClose={onClose} />);
        
        const modalContent = screen.getByText('Documentation').parentElement!;
        await act(async () => {
            fireEvent.click(modalContent);
        });
        expect(onClose).not.toHaveBeenCalled();
    });
});
