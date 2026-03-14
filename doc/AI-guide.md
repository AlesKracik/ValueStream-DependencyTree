# AI Context & Project Orientation (AI-guide.md)

This document provides a high-level map of the ValueStream Dependency Tree project to help AI assistants orient quickly and compartmentalize tasks without exhaustive codebase scanning.

## 1. Core Purpose
A React-based visualization tool that maps value from **Customers** (Demand) through **Work Items** (Strategy) to **Epics/Teams** (Execution) on a **Gantt Timeline**.

## 2. Domain Entities & Relations
Defined in: `web-client/src/types/models.ts`

### Entities
- **Customer**: Root nodes. Have TCV (Total Contract Value), TCV History, and Support Issues.
- **WorkItem**: Strategy nodes. Linked to multiple Customers via `customer_targets` or a global `all_customers_target`.
- **Epic**: Execution nodes. Linked to ONE WorkItem and ONE Team. Contains Effort (man-days) and Dependencies (FS/FF).
- **Team**: Capacity nodes. Have total capacity and per-sprint overrides.
- **Sprint**: Time nodes. Define the Gantt scale and release targets.

### Reports
- **ValueStream**: A saved set of filters/parameters for viewing a specific slice of the data.
- **Support**: A list of active support items to review, aggregated from all customers.

### Relationship Graph
`Customer` <--[targets]-- `WorkItem` <--[fulfills]-- `Epic` --[assigned to]--> `Team`
`Sprint` --[release target]--> `WorkItem`
`Sprint` --[contains]--> `Epic`
`Epic` --[depends on]--> `Epic` (FS/FF)

## 3. Architecture & Code Map

### Backend & Persistence
- **API Entry Point**: `web-client/vite.config.ts` (Embedded Vite Plugin).
- **Database**: MongoDB (App data + External Customer data).
- **Core Logic**: `web-client/src/utils/mongoServer.ts` (Queries) and `web-client/src/utils/businessLogic.ts` (RICE scoring, metrics).

### Available APIs
The backend is implemented as a Vite middleware in `web-client/vite.config.ts`. All endpoints require authorization via `ADMIN_SECRET`.

#### Core Data
- `GET /api/loadData`: Fetches the entire workspace state. Calculates global scaling metrics (`maxScore`, `maxRoi`) and ensures settings migration.
- `POST /api/settings`: Updates `settings.json`. Handles masking/unmasking of sensitive credentials (e.g., API tokens).
- `POST /api/entity/{collection}/{id}`: Upserts or deletes documents in MongoDB.
- `POST /api/mongo/query`: Executes JSON-based queries (find/aggregate) against the customer or app database.

#### Integrations
- `POST /api/jira/issue`: Fetches details for a specific Jira key.
- `POST /api/jira/search`: Executes a JQL search.
- `POST /api/llm/generate`: Generates text using OpenAI, Gemini, or Augment.
- `POST /api/aws/sso/*`: Manages AWS SSO authentication for secure MongoDB tunneling.

### Business Logic & Metrics
Centralized in `web-client/src/utils/businessLogic.ts`:

- **Effort Management**:
    - **Work Items**: Effort is the maximum of its manual `total_effort_mds` or the sum of its linked Epics.
    - **Epic Distribution**: `calculateEpicEffortPerSprint()` distributes total effort across overlapping Sprints based on business days, respecting manual overrides.

- **Value & Scoring (RICE/ROI)**:
    - **TCV Calculation**: 
        - **Must-have**: 100% of Customer TCV.
        - **Should-have**: Shared portion (`Customer TCV / Count of all Should-have targets for this customer`).
        - **Nice-to-have**: 0%.
    - **ROI Score**: `Total Impact (TCV) / Effort (min 1 MD)`.

- **Global Scaling**: `maxScore` and `maxRoi` are calculated during `loadData` to normalize node sizes and edge thicknesses in the visualization.

### State Management
- **Primary Hook**: `web-client/src/hooks/useValueStreamData.ts`.
- **Optimistic Updates**: UI updates immediately; persistence is debounced (1s) to prevent excessive writes.
- **Cascading Updates**: Handles referential integrity (e.g., deleting a Customer removes its targets from all Work Items).

### Visualization & Layout
- **Engine**: `web-client/src/hooks/useGraphLayout.ts`.
- **Logic**: Deterministic coordinate calculation (X-axis fixed by entity type, Y-axis calculated to minimize edge crossings).
- **Components**: `web-client/src/components/nodes/` (CustomerNode, WorkItemNode, TeamNode, GanttBarNode, etc.).

## 4. Common Workflows for AI

### List & Detail Pattern
- **GenericListPage**: Used for all list views (Support, ValueStreams, etc.). Supports persistence of filters/sorts and robust scroll restoration.
- **GenericDetailPage**: Used for all entity details.
    - **CustomerPage**: TCV management (Actual vs Potential), Promotion (Potential -> Actual), Support linking to Jira issues, and Custom Field fetching.
    - **WorkItemPage**: Global targeting, ROI metrics, and Epic management with Jira synchronization.

### Support Workflow
- **Aggregation**: `SupportPage` flattens issues from all customers.
- **Health Tracking**: `useCustomerHealth` hook fetches real-time Jira data.
- **Cleanup**: Automatic expiration of support issues based on `expiration_date`.

### Modifying the Visualization
- **Layout**: Update `useGraphLayout.ts`.
- **Visuals**: Update node components in `src/components/nodes/` or CSS variables in `index.css`.

## 5. Key Constants & Locations
- **Layout X-Coordinates**: `COL_CUSTOMER_X`, `COL_WORKITEM_X`, etc., in `useGraphLayout.ts`.
- **Types**: `web-client/src/types/models.ts`.
- **API Utilities**: `web-client/src/utils/api.ts`.
- **Test Utils**: `web-client/src/test/testUtils.tsx`.
