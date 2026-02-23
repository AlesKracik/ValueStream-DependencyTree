import { renderHook } from '@testing-library/react';
import { useGraphLayout } from '../useGraphLayout';
import type { DashboardData } from '../../types/models';
import { describe, it, expect } from 'vitest';

const mockData: DashboardData = {
    settings: {
        jira_base_url: '',
        jira_api_token: '',
        jira_api_version: '3'
    },
    customers: [
        { id: 'c1', name: 'Customer With Feature', existing_tcv: 100, potential_tcv: 200 },
        { id: 'c2', name: 'Customer Without Feature', existing_tcv: 0, potential_tcv: 0 },
    ],
    features: [
        {
            id: 'f1',
            name: 'Feature A',
            total_effort_mds: 10,
            customer_targets: [
                { customer_id: 'c1', tcv_type: 'potential', priority: 'Must-have' }
            ]
        }
    ],
    epics: [],
    teams: [],
    sprints: []
};

describe('useGraphLayout - Featureless Customer filters', () => {
    it('should show all customers including those without features when no filter is active', () => {
        const { result } = renderHook(() => useGraphLayout(mockData));

        const nodes = result.current.nodes;

        const hasC1 = nodes.some(n => n.id === 'customer-c1');
        const hasC2 = nodes.some(n => n.id === 'customer-c2');

        expect(hasC1).toBe(true);
        expect(hasC2).toBe(true);
    });

    it('should show featureless customers if they match the active customer filter', () => {
        const { result } = renderHook(() => useGraphLayout(mockData, null, 0, 'without'));

        const nodes = result.current.nodes;
        const hasC1 = nodes.some(n => n.id === 'customer-c1');
        const hasC2 = nodes.some(n => n.id === 'customer-c2');

        // 'without' matches c2 but not c1
        expect(hasC1).toBe(false);
        expect(hasC2).toBe(true);
    });
});
