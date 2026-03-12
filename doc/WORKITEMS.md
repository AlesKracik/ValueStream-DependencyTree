# Work Items (Scope Layer)

## Overview
Work Items (also referred to as Features) are strategic initiatives that connect customer demand to engineering execution. They represent the "What" of the product strategy.

## Data Model
```typescript
export interface WorkItem {
  id: string;
  name: string;
  description?: string; // Detailed context/requirements
  total_effort_mds: number; // Estimated man-days
  score: number;            // Calculated RICE score
  customer_targets: {
    customer_id: string;
    tcv_type: 'existing' | 'potential';
    priority?: 'Must-have' | 'Should-have' | 'Nice-to-have';
    tcv_history_id?: string; // Reference to a specific historical TCV value
  }[];
  all_customers_target?: {
    tcv_type: 'existing' | 'potential';
    priority: 'Must-have' | 'Should-have' | 'Nice-to-have';
  };
  released_in_sprint_id?: string;
}
```

## Prioritization Logic (RICE Score / ROI)
The score is calculated server-side in the Vite backend plugin (`vite.config.ts`):
- **Formula:** `Score = Total Impact / Effort`.
- **Impact (Total TCV):** The contribution of a customer's TCV to a Work Item's Impact depends on the target priority:
    - **Must-have**: Contributes **100%** of the associated Customer TCV.
    - **Should-have**: Contributes a **shared portion** of the Customer TCV. Calculated as: `(Customer TCV) / (Total number of 'Should-have' Work Items for that particular Customer)`.
    - **Nice-to-have**: Contributes **0%** (does not add to the TCV/Impact).
- **Effort:** The `total_effort_mds` defined on the Work Item.
- **Safety:** To avoid division by zero, the effective effort used in the calculation has a floor of 1 Man-Day. Reach and Confidence are currently implicitly 1.0.

### Historical Targeting
When targeting **Existing TCV**, a Work Item can be tied to a specific historical value using `tcv_history_id`. 
- If linked to history, the calculation uses that specific historical dollar value.
- If not linked (or linked to "Latest Actual"), it uses the customer's current `existing_tcv`.
- **Global Work Items:** Initiatives that target all customers (e.g., core maintenance) **always** use the latest actual TCV for their impact calculation.

```mermaid
graph LR
    TCV[Customer TCV (Actual or History)] --> Impact
    Impact --> Score
    Effort[Man-Days] --> Score
    Score --> Scaling[Visual Node Size]
```

## Visual Representation
- **Node Type:** `WorkItemNode`.
- **Scaling:** Size scales based on the RICE score relative to the global maximum score.
- **Tooltip:** Hovering over the node displays the `description`.
- **Status Icons:**
    - `📦`: Released (linked to a sprint).
    - `🕒`: Missing dates in connected Epics.
    - `📏`: Effort Not Estimated (0 MDs on item or any connected epic).
    - `🌐`: Global (targets all customers).

## Relationships
- **Customers:** Linked via `customer_targets`.
- **Epics:** One Work Item can spawn multiple Epics (execution units) across different Teams.

```mermaid
erDiagram
    WORK_ITEM ||--o{ EPIC : "spawns"
    WORK_ITEM }o--o{ CUSTOMER : "delivers value to"
    EPIC {
        string id
        number effort_md
    }
```

