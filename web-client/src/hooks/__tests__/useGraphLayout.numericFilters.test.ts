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
        { id: 'c1', name: 'High TCV Customer', existing_tcv: 50, potential_tcv: 500 },
        { id: 'c2', name: 'Low TCV Customer', existing_tcv: 0, potential_tcv: 20 },
    ],
    features: [
        {
            id: 'f1',
            name: 'High Score Feature',
            total_effort_mds: 1, // score = 500 / 1 = 500
            customer_targets: [
                { customer_id: 'c1', tcv_type: 'potential', priority: 'Must-have' }
            ]
        },
        {
            id: 'f2',
            name: 'Low Score Feature',
            total_effort_mds: 10, // score = 20 / 10 = 2
            customer_targets: [
                { customer_id: 'c2', tcv_type: 'potential', priority: 'Must-have' }
            ]
        }
    ],
    epics: [],
    teams: [],
    sprints: []
};

describe('useGraphLayout - Numeric Filters', () => {
    it('should filter out customers with potential TCV strictly lower than minTcv', () => {
        // minTcv = 100, minScore = 0
        const { result } = renderHook(() => useGraphLayout(mockData, null, 0, '', '', '', '', true, 100, 0));

        const nodes = result.current.nodes;
        const hasC1 = nodes.some(n => n.id === 'customer-c1'); // TCV 500
        const hasC2 = nodes.some(n => n.id === 'customer-c2'); // TCV 20

        expect(hasC1).toBe(true);
        expect(hasC2).toBe(false);
    });

    it('should filter out features with calculated score strictly lower than minScore', () => {
        // minTcv = 0, minScore = 100
        const { result } = renderHook(() => useGraphLayout(mockData, null, 0, '', '', '', '', true, 0, 100));

        const nodes = result.current.nodes;
        // f1 score = 500, f2 score = 2
        const hasF1 = nodes.some(n => n.id === 'feature-f1');
        const hasF2 = nodes.some(n => n.id === 'feature-f2');

        expect(hasF1).toBe(true);
        expect(hasF2).toBe(false);
    });

    it('should correctly divide Score across multiple Should-have features', () => {
        // We inject a specialized mock payload to test "Should-have" division
        const sharedCustomer = { id: 'c-shared', name: 'Shared', existing_tcv: 0, potential_tcv: 1000 };
        const shouldHaveData: DashboardData = {
            ...mockData,
            customers: [sharedCustomer],
            features: [
                {
                    id: 'f-should-1',
                    name: 'Should Have 1',
                    total_effort_mds: 1, // Max score if alone = 1000
                    customer_targets: [{ customer_id: 'c-shared', tcv_type: 'potential', priority: 'Should-have' }]
                },
                {
                    id: 'f-should-2',
                    name: 'Should Have 2',
                    total_effort_mds: 1, // Shared divisor = 2 -> Score = 500
                    customer_targets: [{ customer_id: 'c-shared', tcv_type: 'potential', priority: 'Should-have' }]
                }
            ]
        };

        // If Min Score is 600, both should be filtered out (their score is 500)
        const { result: filteredOut } = renderHook(() => useGraphLayout(shouldHaveData, null, 0, '', '', '', '', true, 0, 600));
        expect(filteredOut.current.nodes.some(n => n.id.startsWith('feature-f-should'))).toBe(false);

        // If Min Score is 400, both should be visible (their score is 500)
        const { result: passed } = renderHook(() => useGraphLayout(shouldHaveData, null, 0, '', '', '', '', true, 0, 400));
        expect(passed.current.nodes.some(n => n.id === 'feature-f-should-1')).toBe(true);
        expect(passed.current.nodes.some(n => n.id === 'feature-f-should-2')).toBe(true);
    });

    it('should apply both minTcv and minScore simultaneously', () => {
        // minTcv = 500, minScore = 500
        const { result } = renderHook(() => useGraphLayout(mockData, null, 0, '', '', '', '', true, 500, 500));

        const nodes = result.current.nodes;
        const hasC1 = nodes.some(n => n.id === 'customer-c1');
        const hasC2 = nodes.some(n => n.id === 'customer-c2');
        const hasF1 = nodes.some(n => n.id === 'feature-f1');
        const hasF2 = nodes.some(n => n.id === 'feature-f2');

        expect(hasC1).toBe(true);
        expect(hasF1).toBe(true);

        expect(hasC2).toBe(false);
        expect(hasF2).toBe(false);
    });
});
