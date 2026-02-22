import React from 'react';

export const AddCustomerNode = ({ data }: { data: any }) => {
    return (
        <div style={data.style}>
            {data.label}
        </div>
    );
};
