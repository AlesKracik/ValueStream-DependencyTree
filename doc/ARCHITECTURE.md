# High-Level Technical Architecture

## Overview
The Value Stream Dependency Tree is a React-based Single Page Application (SPA) designed to visualize the flow of value from customer demand to engineering execution. It uses a custom mathematical layout engine to map entities across a 4-stage pipeline: Customers, Work Items, Teams, and a Gantt Timeline.

## System Components

```mermaid
graph TD
    Client[Web Client - React/Vite]
    Proxy[Vite Dev Server Proxy]
    Mongo[(MongoDB)]
    Jira[Atlassian Jira API]

    Client -->|API Requests| Proxy
    Proxy -->|Persistence| Mongo
    Proxy -->|Integration| Jira
    Client -->|Local Fallback| Static[staticImport.json]
```

### 1. Web Client (React + TypeScript)
- **Framework:** React 19 with Vite.
- **State Management:** Custom `DashboardContext` and `useDashboardData` hook.
- **Visualization:** `@xyflow/react` (React Flow) for graph rendering.
- **Layout Engine:** `useGraphLayout.ts` - a deterministic engine that calculates X/Y coordinates based on logical relationships rather than force-directed algorithms.

### 2. Backend & Persistence
- **Mock Persistence Plugin:** A Vite server-side plugin (`vite.config.ts`) that intercepts `/api` calls. It includes a True Backend engine that performs complex data joins and numeric calculations.
- **Database:** MongoDB for persistent storage of all entities. It utilizes MongoDB Aggregation Pipelines for high-performance score calculation.
- **Schema Validation:** Draft-07 JSON schema at `public/schema.json`.
- **Seeding:** Automatically seeds from `public/staticImport.json` if the database is empty.

## Data Flow & State Management

The application utilizes a hybrid state management strategy that combines server-side aggregation with client-side optimistic updates, primarily orchestrated via the `useDashboardData.ts` hook.

### 1. Authentication & Authorization
The system supports an optional security layer via the `ADMIN_SECRET` environment variable.
- **Middleware:** If `ADMIN_SECRET` is set, the Vite middleware requires a `Bearer` token in the `Authorization` header for all `/api/*` requests (except `/api/auth/status`).
- **Frontend Flow:** The `App.tsx` component checks the auth status on load. If required and not authenticated, it presents a `LoginPage`.
- **Authorized Fetch:** A custom `authorizedFetch` utility centrally manages the injection of the secret and handles session expiration (401 errors).

### 2. Hydration & Hybrid Filtering
1.  **Global Hydration:** The top-level `App.tsx` calls `useDashboardData()` without filters to hydrate the entire system and injects the resulting `data` and mutation functions into the `DashboardProvider`.
2.  **Scoped Re-fetching:** Visual components (like the Dashboard) call `useDashboardData(id, filters)` to trigger a server-side filtered re-fetch scoped to specific dashboard parameters.
3.  **Hybrid Filter Logic:**
    -   **Base Filters:** Heavy searches and persistent dashboard parameters are applied at the database level to minimize network payload.
    -   **Transient Filters:** Live-typing search in the UI is applied client-side for instantaneous feedback on the already-filtered dataset.

### 3. Server-Side Processing
The backend fetches raw entities and performs the "heavy lifting":
-   **Joins:** It joins Work Items with Epics to calculate effort and with Customers to calculate RICE scores.
-   **Metrics:** It returns a `metrics` object with global maximums (e.g., `maxScore`) to ensure consistent visual scaling across all filtered views.

### 4. Mutations & Reactivity
User actions (updates, deletes, adds) trigger local state changes via mutation functions (`addEpic`, `updateWorkItem`, etc.) which:
-   **Optimistic Updates:** Immediately execute a local update on the React state array for zero-latency UI feedback.
-   **Asynchronous Persistence:** Fire off background background `fetch` requests (via `authorizedFetch`) to the `/api/entity` endpoints.
-   **Non-Blocking:** These operations do not block the UI thread waiting for server confirmation.

```mermaid
sequenceDiagram
    participant UI as Browser (React App)
    participant Vite as Vite Server Middleware (Plugin)
    participant FS as File System (settings.json)
    participant DB as MongoDB
    participant Jira as Atlassian Jira API

    Note over UI, Jira: Scenario 1: Initial Dashboard Load
    UI->>Vite: GET /api/loadData?dashboardId=main
    Vite->>FS: Read settings.json (Mongo URI)
    Vite->>DB: Fetch Dashboards, Customers, WorkItems, Epics
    DB-->>Vite: Raw Data
    Note right of Vite: Calculate RICE Scores & Global Metrics
    Vite-->>UI: JSON Data (Aggregated & Scored)

    Note over UI, Jira: Scenario 2: Save Entity Change
    UI->>Vite: POST /api/entity/customers (ID: c1, {name: "New Name"})
    Vite->>FS: Read settings.json
    Vite->>DB: updateOne({id: "c1"}, {$set: {name: "New Name"}})
    DB-->>Vite: Ack
    Vite-->>UI: { success: true }

    Note over UI, Jira: Scenario 3: Jira Synchronization
    UI->>Vite: POST /api/jira/issue { jira_key: "PROJ-123" }
    Vite->>FS: Read settings.json (API Token)
    Vite->>Jira: GET /rest/api/3/issue/PROJ-123
    Jira-->>Vite: Jira Issue Data (Summary, Dates, Team)
    Vite-->>UI: { success: true, data: JiraData }
```

## Directory Structure

```mermaid
graph TD
    src[src/]
    components[components/]
    pages[pages/]
    hooks[hooks/]
    contexts[contexts/]
    types[types/]

    src --> components
    src --> pages
    src --> hooks
    src --> contexts
    src --> types

    components --> common["common/ - Shared UI"]
    components --> nodes["nodes/ - React Flow Custom Nodes"]
    components --> layout["layout/ - App Shell"]
    components --> entity["Entity Folders (customers, epics, etc.)"]
```

## Architectural Code Patterns

The following patterns outline how components and logic are structurally decoupled across the frontend.

### 1. The Graph Layout Engine (`useGraphLayout.ts`)
The core visualization is not physics-based (like traditional force-directed graphs) but is instead a highly deterministic layout engine.
1. **Column Mapping:** The layout establishes fixed X-coordinates (`COL_CUSTOMER_X`, `COL_WORKITEM_X`, `COL_TEAM_X`) forming a left-to-right flow pipeline.
2. **Hybrid Filtering (Logical AND):** The hook merges Base Parameters (persisted dashboard rules) and Transient Filters (live-typing from the UI) before determining node inclusion.
3. **Array Mutation:** It parses the `data` arrays into valid generic sets (`validCustomers`, `validWorkItems`, `validEpics`).
4. **Coordinate Placement:** It dynamically loops through the sets, generating React Flow nodes (`{ id, position: {x,y}, data }`) and calculating specific Y offsets so nodes do not overlap, particularly protecting Epic Gantt bars within expanding Team vertical bounds.

### 2. React Flow Custom Nodes
The dashboard relies on custom React Flow nodes (`src/components/nodes/`). All nodes follow a specific geometric and mathematical rendering pattern.

**Pattern Template:**
1. **Memoization:** Nodes are always exported wrapped in `React.memo` to prevent unnecessary re-renders during panning/zooming.
2. **Size Calculations:** Node dimensions are dynamically calculated using a base size and a ratio derived from the entity's relative metric weight against a global maximum provided by the backend (e.g., `data.maxScore`, `data.maxTcv`).
3. **Inline Styling:** Most structural, shape, and shadow logic is applied via inline React `style={{}}` objects to support dynamic dimension calculation (`outerSize`, `innerSize`).
4. **Handles:** Invisible `<Handle>` components (from `@xyflow/react`) are positioned absolutely on the left/right edges to allow for programmatic edge connections.

```mermaid
graph LR
    Props[Node Props] --> Memo[React.memo]
    Memo --> Calc[Ratio / Size Math]
    Calc --> DOM[Wrapper Div]
    DOM --> HandleL[Left Handle - Target]
    DOM --> Visual[Circular/Bar SVG or CSS Shape]
    DOM --> HandleR[Right Handle - Source]
    DOM --> Label[Absolute Bottom Label]
```

### 3. Page Component Pattern
Most route-level components in the `src/pages/` and `src/components/{entity}/` directories follow a consistent pattern for handling asynchronous data fetching, loading states, and layout containment.

**Pattern Template:**
```tsx
import React, { useState } from 'react';
import styles from './MyPage.module.css';

interface Props {
    data: DashboardData | null;
    loading: boolean;
    error?: Error | null;
}

export const MyEntityPage: React.FC<Props> = ({ data, loading, error }) => {
    const navigate = useNavigate();
    const [draft, setDraft] = useState<Partial<Entity>>({});

    // Early Returns for Async States
    if (loading) return <div className={styles.pageContainer}>Loading...</div>;
    if (error) return <div className={styles.pageContainer}>Error: {error.message}</div>;
    if (!data) return <div className={styles.pageContainer}>No data available.</div>;

    // Entity Resolution
    const entity = isNew ? draft : data.entities.find(e => e.id === id);
    if (!entity) return <div className={styles.pageContainer}>Not found.</div>;

    return (
        <div className={styles.pageContainer}>
             {/* Header, Forms, Lists */}
        </div>
    );
};
```
*Note: The duplication of this boilerplate across pages is a known technical debt item.*

### 4. ID Generation
When creating new entities (Work Items, Customers, Epics, Sprints), the frontend utilizes a secure `generateId` utility (`src/utils/security.ts`). This ensures IDs are globally unique and cryptographically strong, preventing collisions and predictable ID attacks.

**Example Pattern:**
```typescript
const newId = generateId('f'); // f for Feature/WorkItem
const newEpicId = generateId('e'); // e for Epic
```

## Deployment Modes

The application can be deployed in various environments. Security is enforced via the `ADMIN_SECRET` environment variable; if set, the application will require authentication before granting access to data or settings.

### 1. Standalone (Local Development)
Ideal for individual developers or small teams running everything on a single machine.    
- **Requirements:** Node.js 22+, MongoDB (local or remote).
- **How-to:**
  1. Navigate to the client: `cd web-client`
  2. Install dependencies: `npm install`
  3. Set authentication (Optional): `$env:ADMIN_SECRET="your-secure-password"`
  4. Start the server: `npm run dev`
- **Configuration:** 
    - Application settings are stored in `web-client/settings.json` (git-ignored).
    - Update App Settings to `mongodb://localhost:27017` via the UI after login.

### 2. Docker (Containerized Environment)
Recommended for consistent environments and simplified setup using pre-configured containers.
- **Requirements:** Docker and Docker Compose.
- **How-to:**
  1. Define your secrets in `docker-compose.yml` or a `.env` file (e.g., `ADMIN_SECRET=prod-secret`).
  2. From the project root, run: `docker-compose up --build`
  3. Access the app at `http://localhost:5173`.
- **Configuration:** Update App Settings to `mongodb://mongodb:27017` (this utilizes the internal Docker bridge network).

### 3. Kubernetes (Cluster Deployment)
Best for production-grade scaling, high availability, and multi-user environments.        
- **Architecture:** Decoupled Pods for the Web App and MongoDB with automated orchestration.
- **Secrets Management:** 
    - Store the `ADMIN_SECRET` in a Kubernetes Secret object and inject it as an environment variable into the app container.
    - Persist the `settings.json` file using a PersistentVolumeClaim (PVC) mounted at the app root to ensure configuration survives pod restarts.
- **Workflow:**
  1. Build and push the image to a container registry.
  2. Deploy storage and database manifests first.
  3. Deploy the application manifest, ensuring it points to the stable MongoDB service name.

## Logical Blocks

The system is composed of several core entities. The following Entity Relationship Diagram (ERD) illustrates the data model structure, including key attributes and the cardinality of relationships.

```mermaid
erDiagram
    CUSTOMER {
        string id
        string name
        number existing_tcv
        number potential_tcv
    }
    WORK-ITEM {
        string id
        string name
        number total_effort_mds
        number score
    }
    EPIC {
        string id
        string jira_key
        number effort_md
        date target_start
        date target_end
    }
    TEAM {
        string id
        string name
        number total_capacity_mds
    }
    SPRINT {
        string id
        string name
        date start_date
        date end_date
    }
    DASHBOARD {
        string id
        string name
        object parameters
    }

    CUSTOMER ||--o{ WORK-ITEM : "targeted by"
    WORK-ITEM ||--o{ EPIC : "fulfilled by"
    TEAM ||--o{ EPIC : "assigned to"
    SPRINT ||--o{ WORK-ITEM : "release target"
    SPRINT ||--o{ EPIC : "contains"
    EPIC ||--o{ EPIC : "depends on"
    DASHBOARD ||--o{ CUSTOMER : "filters"
    DASHBOARD ||--o{ WORK-ITEM : "filters"
    DASHBOARD ||--o{ TEAM : "filters"
```

Detailed documentation for each system block:
- [Customers](CUSTOMERS.md)
- [Work Items](WORKITEMS.md)
- [Teams](TEAMS.md)
- [Epics](EPICS.md)
- [Sprints](SPRINTS.md)
- [Dashboards](DASHBOARDS.md)
- [Jira Integration](JIRA_INTEGRATION.md)
- [Persistence & Migration](PERSISTENCE.md)
