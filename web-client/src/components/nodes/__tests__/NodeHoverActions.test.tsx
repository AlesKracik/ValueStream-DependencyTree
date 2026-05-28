import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NodeHoverChips } from '../NodeHoverActions';
import { NodeHoverActionsProvider, useNodeHoverActions } from '../nodeHoverActionsContext';

describe('NodeHoverChips', () => {
    it('renders nothing for an empty action list', () => {
        const { container } = render(<NodeHoverChips actions={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders one button per action with accessible labels', () => {
        const onClick = vi.fn();
        render(
            <NodeHoverChips actions={[
                { label: 'Focus subtree', icon: '🎯', onClick },
            ]} />
        );
        const btn = screen.getByRole('button', { name: 'Focus subtree' });
        expect(btn.getAttribute('title')).toBe('Focus subtree');
    });

    it('invokes the onClick when chip is clicked and stops propagation', () => {
        const chipClick = vi.fn();
        const outerClick = vi.fn();
        render(
            <div onClick={outerClick}>
                <NodeHoverChips actions={[
                    { label: 'Focus', icon: '🎯', onClick: chipClick },
                ]} />
            </div>
        );
        fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
        expect(chipClick).toHaveBeenCalledTimes(1);
        expect(outerClick).not.toHaveBeenCalled();
    });

    it('reflects active state via aria-pressed', () => {
        render(
            <NodeHoverChips actions={[
                { label: 'Clear focus', icon: '✕', onClick: vi.fn(), active: true },
            ]} />
        );
        expect(screen.getByRole('button', { name: 'Clear focus' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('stops contextmenu propagation so right-click on chip does not refit graph', () => {
        const outerContext = vi.fn();
        render(
            <div onContextMenu={outerContext}>
                <NodeHoverChips actions={[
                    { label: 'Focus', icon: '🎯', onClick: vi.fn() },
                ]} />
            </div>
        );
        const wrapper = screen.getByRole('button').parentElement!;
        fireEvent.contextMenu(wrapper);
        expect(outerContext).not.toHaveBeenCalled();
    });
});

describe('NodeHoverActionsProvider / useNodeHoverActions', () => {
    function Probe() {
        const ctx = useNodeHoverActions();
        if (!ctx) return <span>none</span>;
        return <span>focused={ctx.focusedNodeId ?? 'null'}</span>;
    }

    it('returns null when no provider is present', () => {
        render(<Probe />);
        expect(screen.getByText('none')).toBeDefined();
    });

    it('exposes focusedNodeId and onFocusNode through context', () => {
        const onFocusNode = vi.fn();
        render(
            <NodeHoverActionsProvider value={{ onFocusNode, focusedNodeId: 'work-item-42' }}>
                <Probe />
            </NodeHoverActionsProvider>
        );
        expect(screen.getByText('focused=work-item-42')).toBeDefined();
    });
});
