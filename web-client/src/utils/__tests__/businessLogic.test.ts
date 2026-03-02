import { describe, it, expect } from 'vitest';
import { calculateWorkItemEffort, calculateWorkItemTcv } from '../businessLogic';
import type { WorkItem, Epic, Customer } from '../../types/models';

describe('businessLogic', () => {
    describe('calculateWorkItemEffort', () => {
        const mockWorkItem: WorkItem = {
            id: 'f1',
            name: 'Test Feature',
            total_effort_mds: 10,
            score: 0,
            customer_targets: []
        };

        it('uses workItem effort when no epics are present', () => {
            expect(calculateWorkItemEffort(mockWorkItem, [])).toBe(10);
        });

        it('uses workItem effort when epic effort sum is 0', () => {
            const epics: Epic[] = [
                { id: 'e1', work_item_id: 'f1', team_id: 't1', effort_md: 0 }
            ];
            expect(calculateWorkItemEffort(mockWorkItem, epics)).toBe(10);
        });

        it('prioritizes epic effort sum when it is greater than 0', () => {
            const epics: Epic[] = [
                { id: 'e1', work_item_id: 'f1', team_id: 't1', effort_md: 5 },
                { id: 'e2', work_item_id: 'f1', team_id: 't2', effort_md: 7 }
            ];
            // Epic sum (12) > WorkItem effort (10)
            expect(calculateWorkItemEffort(mockWorkItem, epics)).toBe(12);
        });

        it('uses epic effort sum even if it is smaller than workItem effort (as long as it is > 0)', () => {
            const epics: Epic[] = [
                { id: 'e1', work_item_id: 'f1', team_id: 't1', effort_md: 5 }
            ];
            // Epic sum (5) is taken because it's > 0, even though WorkItem effort is 10
            expect(calculateWorkItemEffort(mockWorkItem, epics)).toBe(5);
        });

        it('ignores epics for other work items', () => {
            const epics: Epic[] = [
                { id: 'e1', work_item_id: 'f2', team_id: 't1', effort_md: 50 }
            ];
            expect(calculateWorkItemEffort(mockWorkItem, epics)).toBe(10);
        });
    });

    describe('calculateWorkItemTcv', () => {
        const mockCustomers: Customer[] = [
            { id: 'c1', name: 'Cust 1', existing_tcv: 100, potential_tcv: 50, tcv_history: [
                { id: 'h1', value: 80, valid_from: '2025-01-01' }
            ]},
            { id: 'c2', name: 'Cust 2', existing_tcv: 200, potential_tcv: 0 }
        ];

        it('calculates TCV for specific customer targets (existing)', () => {
            const workItem: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 0,
                score: 0,
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'existing' }
                ]
            };
            expect(calculateWorkItemTcv(workItem, mockCustomers)).toBe(100);
        });

        it('calculates TCV for specific customer targets (potential)', () => {
            const workItem: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 0,
                score: 0,
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'potential' }
                ]
            };
            expect(calculateWorkItemTcv(workItem, mockCustomers)).toBe(50);
        });

        it('calculates TCV for specific customer targets (historical)', () => {
            const workItem: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 0,
                score: 0,
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'existing', tcv_history_id: 'h1' }
                ]
            };
            expect(calculateWorkItemTcv(workItem, mockCustomers)).toBe(80);
        });

        it('sums TCV across multiple customers', () => {
            const workItem: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 0,
                score: 0,
                customer_targets: [
                    { customer_id: 'c1', tcv_type: 'existing' },
                    { customer_id: 'c2', tcv_type: 'existing' }
                ]
            };
            expect(calculateWorkItemTcv(workItem, mockCustomers)).toBe(300);
        });

        it('calculates TCV for global work items (all customers)', () => {
            const workItem: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 0,
                score: 0,
                customer_targets: [],
                all_customers_target: { tcv_type: 'existing', priority: 'Must-have' }
            };
            // 100 + 200 = 300
            expect(calculateWorkItemTcv(workItem, mockCustomers)).toBe(300);
        });

        it('returns 0 if no customers match', () => {
            const workItem: WorkItem = {
                id: 'f1',
                name: 'F1',
                total_effort_mds: 0,
                score: 0,
                customer_targets: [
                    { customer_id: 'non-existent', tcv_type: 'existing' }
                ]
            };
            expect(calculateWorkItemTcv(workItem, mockCustomers)).toBe(0);
        });
    });
});
