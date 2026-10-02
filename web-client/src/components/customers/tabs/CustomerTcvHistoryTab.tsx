import React from 'react';
import type { Customer } from '@valuestream/shared-types';
import customerStyles from '../CustomerPage.module.css';

interface Props {
    customer: Customer | undefined;
    deleteCustomerArrayItem: (customerId: string, arrayPath: 'tcv_history', itemId: string) => Promise<boolean>;
}

export const CustomerTcvHistoryTab: React.FC<Props> = ({ customer, deleteCustomerArrayItem }) => {
    // Entries are stored in the order they were added; show the newest first.
    const history = [...(customer?.tcv_history || [])].sort((a, b) => b.valid_from.localeCompare(a.valid_from));
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
                {history.map(entry => (
                    <tr key={entry.id}>
                        <td>{entry.valid_from}</td>
                        <td>{entry.value.toLocaleString()}</td>
                        <td>{entry.duration_months || '-'}</td>
                        <td>
                            <button
                                className="btn-danger"
                                onClick={() => {
                                    if (customer) deleteCustomerArrayItem(customer.id, 'tcv_history', entry.id);
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
