import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ValueStreamProvider, NotificationProvider } from '../contexts/ValueStreamContext';
import { UIStateProvider } from '../contexts/UIStateContext';
import { vi } from 'vitest';
import type { ValueStreamData, Issue } from '@valuestream/shared-types';

interface RenderOptions {
    route?: string;
    data?: ValueStreamData | null;
    updateIssue?: (id: string, updates: Partial<Issue>, immediate?: boolean) => Promise<void>;
    addIssue?: (issue: Issue) => void;
    deleteIssue?: (id: string) => void;
}

export function renderWithProviders(
    ui: React.ReactElement,
    {
        route = '/',
        data = null,
        updateIssue = vi.fn().mockResolvedValue(undefined),
        addIssue = vi.fn(),
        deleteIssue = vi.fn()
    }: RenderOptions = {}
) {
    return render(
        <NotificationProvider>
            <UIStateProvider>
                <ValueStreamProvider value={{ data, updateIssue, addIssue, deleteIssue }}>
                    <MemoryRouter initialEntries={[route]}>
                        {ui}
                    </MemoryRouter>
                </ValueStreamProvider>
            </UIStateProvider>
        </NotificationProvider>
    );
}
