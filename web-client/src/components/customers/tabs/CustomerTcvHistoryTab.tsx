import React from 'react';
import type { Customer } from '@valuestream/shared-types';
import customerStyles from '../CustomerPage.module.css';

interface Props {
    customer: Customer | undefined;
    updateCustomer: (id: string, updates: Partial<Customer>, immediate?: boolean) => Promise<void>;
}

export const CustomerTcvHistoryTab: React.FC<Props> = ({ customer, updateCustomer }) => {
    return (
        <table className={customerStyles.table}>
            <thead>
                <tr>
                    <th>Valid From</th>
                    <th>Value ($)</th>
                    <th>Duration (mo)</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {customer?.tcv_history?.map(entry => (
                    <tr key={entry.id}>
                        <td>{entry.valid_from}</td>
                        <td>{entry.value.toLocaleString()}</td>
                        <td>{entry.duration_months || '-'}</td>
                        <td>
                            <button
                                className="btn-danger"
                                onClick={() => {
                                    if (customer) {
                                        const newHistory = customer.tcv_history?.filter(h => h.id !== entry.id);
                                        updateCustomer(customer.id, { tcv_history: newHistory });
                                    }
                                }}
                            >
                                Delete
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};
