import React from 'react';

export const AddFeatureNode = ({ data }: { data: any }) => {
    return (
        <div style={data.style}>
            {data.label}
        </div>
    );
};
