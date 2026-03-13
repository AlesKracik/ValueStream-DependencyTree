import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ValueStreamProvider, NotificationProvider } from '../contexts/ValueStreamContext';
import { vi } from 'vitest';
import type { ValueStreamData, Epic } from '../types/models';

interface RenderOptions {
    route?: string;
    data?: ValueStreamData | null;
    updateEpic?: (id: string, updates: Partial<Epic>, immediate?: boolean) => Promise<void>;
    addEpic?: (epic: Epic) => void;
    deleteEpic?: (id: string) => void;
}

export function renderWithProviders(
    ui: React.ReactElement,
    {
        route = '/',
        data = null,
        updateEpic = vi.fn().mockResolvedValue(undefined),
        addEpic = vi.fn(),
        deleteEpic = vi.fn()
    }: RenderOptions = {}
) {
    return render(
        <NotificationProvider>
            <ValueStreamProvider value={{ data, updateEpic, addEpic, deleteEpic }}>
                <MemoryRouter initialEntries={[route]}>
                    {ui}
                </MemoryRouter>
            </ValueStreamProvider>
        </NotificationProvider>
    );
}
