# Customers (Demand Layer)

## Overview
Customers represent the root drivers of value in the system. They are the source of Total Contract Value (TCV), which fuels the prioritization of Work Items.

## Data Model
```typescript
export interface TcvHistoryEntry {
  id: string;
  value: number;
  valid_from: string; // ISO date
}

export interface Customer {
  id: string;
  name: string;
  existing_tcv: number;  // Latest "Actual" realized value
  existing_tcv_valid_from?: string; // Date from which the current Actual value is valid
  potential_tcv: number; // Growth opportunity
  tcv_history?: TcvHistoryEntry[]; // Historical records of Existing TCV
}
```

## TCV History & Lifecycle
The system maintains a robust audit trail of **Existing TCV** evolution. 

### 1. Actual TCV
The `existing_tcv` and `existing_tcv_valid_from` fields represent the current state of the customer's contract. In the UI, these fields are protected to ensure data integrity.

### 2. The "Archive-and-Set" Update Process
To change a customer's Actual TCV, the system uses a lifecycle-aware update process:
1. **Archive:** The current "Actual" value and its "Valid From" date are moved into the `tcv_history` array as a new historical entry.
2. **Set:** The user provides a new Man-Day value and a new "Valid From" date, which become the new "Actual" state.
3. **Strategic Impact:** This allows the system to tie Work Items to specific points in time, showing how an initiative delivered value against a specific contract value rather than just the latest one.

## Visual Representation
In the dashboard, customers are rendered as `CustomerNode` types:
- **Inner Circle:** Solid blue, representing the latest `existing_tcv`.
- **Outer Ring:** Dashed blue, representing `total_tcv` (`existing + potential`).
- **Scaling:** The diameter scales proportionally based on the maximum TCV across all customers in the dataset.

## Relationships
- **Work Items:** Customers are linked to Work Items via `customer_targets`. This relationship defines the ROI impact of a Work Item. Users can manage these targets from either the Work Item page or the Customer page. On the Customer page, the "Targeted Work Items" tab allows adding new work item targets to both new and existing customers via a searchable dropdown, and choosing whether to target the "Latest Actual" TCV or a specific entry from the history.

```mermaid
erDiagram
    CUSTOMER ||--o{ WORK_ITEM_TARGET : "is targeted by"
    WORK_ITEM_TARGET }o--|| WORK_ITEM : "contributes value to"
    CUSTOMER {
        string id
        string name
        number existing_tcv
        string existing_tcv_valid_from
        number potential_tcv
    }
```

## Logic & Filtering
- **Min TCV Filter:** Global filter that hides customers (and their downstream trees) if their total TCV is below the threshold.
- **Standalone Visibility:** Customers with no linked Work Items are only visible if no Work Item, Team, or Epic filters are active.
