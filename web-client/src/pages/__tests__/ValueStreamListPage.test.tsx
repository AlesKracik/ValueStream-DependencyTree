import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { ValueStreamListPage } from '../ValueStreamListPage';
import { renderWithProviders } from '../../test/testUtils';
import type { ValueStreamData } from '../../types/models';

const mockedNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockedNavigate
    };
});

const mockData: ValueStreamData = {
    settings: {
        general: { fiscal_year_start_month: 1, sprint_duration_days: 14 },
        persistence: { 
            mongo: { 
                app: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false },
                customer: { uri: '', db: '', auth: { method: 'scram' }, use_proxy: false }
            }
        },
        jira: { base_url: '', api_version: '3' },
        ai: { provider: 'openai' }
    },
    customers: [],
    workItems: [],
    teams: [],
    epics: [],
    sprints: [],
    valueStreams: [
        { id: 'v1', name: 'Alpha VS', description: 'Desc A', parameters: {} as any },
        { id: 'v2', name: 'Beta VS', description: 'Desc B', parameters: {} as any }
    ]
};

describe('ValueStreamListPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the list of value streams', () => {
        renderWithProviders(
            <ValueStreamListPage data={mockData} loading={false} />
        );

        expect(screen.getByText('Alpha VS')).toBeDefined();
        expect(screen.getByText('Beta VS')).toBeDefined();
        expect(screen.getByText('Desc A')).toBeDefined();
        expect(screen.getByText('Desc B')).toBeDefined();
    });

    it('filters value streams by name', () => {
        renderWithProviders(
            <ValueStreamListPage data={mockData} loading={false} />
        );

        const filterInput = screen.getByPlaceholderText('Filter Value Streams...');
        fireEvent.change(filterInput, { target: { value: 'Alpha' } });

        expect(screen.getByText('Alpha VS')).toBeDefined();
        expect(screen.queryByText('Beta VS')).toBeNull();
    });

    it('navigates to value stream detail page when a value stream is clicked', () => {
        renderWithProviders(
            <ValueStreamListPage data={mockData} loading={false} />
        );

        const row = screen.getByText('Alpha VS').closest('[class*="listItem"]')!;
        fireEvent.click(row);

        expect(mockedNavigate).toHaveBeenCalledWith('/valueStream/v1');
    });

    it('navigates to new value stream page when "+ New Value Stream" is clicked', () => {
        renderWithProviders(
            <ValueStreamListPage data={mockData} loading={false} />
        );

        const newBtn = screen.getByText('+ New Value Stream');
        fireEvent.click(newBtn);

        expect(mockedNavigate).toHaveBeenCalledWith('/valueStream/new');
    });

    it('shows loading message when loading is true', () => {
        renderWithProviders(
            <ValueStreamListPage data={null} loading={true} />
        );

        expect(screen.getByText('Loading Value Streams...')).toBeDefined();
    });

    it('shows empty message when no value streams are found', () => {
        renderWithProviders(
            <ValueStreamListPage data={{ ...mockData, valueStreams: [] }} loading={false} />
        );

        expect(screen.getByText('No Value Streams found.')).toBeDefined();
    });
});
