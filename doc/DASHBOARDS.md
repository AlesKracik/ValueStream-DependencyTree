# Persistent Dashboards

## Overview
The system allows users to create multiple "views" of the project data using persistent dashboard definitions. Each dashboard stores a set of filter parameters that define the visible scope of the value stream.

## Data Model
```typescript
export interface DashboardEntity {
  id: string;
  name: string;
  description: string;
  parameters: DashboardParameters;
}

export interface DashboardParameters {
  customerFilter: string;
  workItemFilter: string;
  releasedFilter: 'all' | 'released' | 'unreleased';
  minTcvFilter: string;
  minScoreFilter: string;
  teamFilter: string;
  epicFilter: string;
  startSprintId?: string; // Persistent Time Range
  endSprintId?: string;
}
```

## Filtration Architecture

The dashboard employs a multi-layered filtering system that combines **Server-Side Enforcement** (for persistent and heavy filters) and **Client-Side Transient Filters** (for live feedback).

### 1. The Hydration Phase (Server-Side)
When a dashboard is loaded, the client requests data using the `dashboardId`. The backend (MongoDB or the Vite proxy) applies the **Persistent Filters** directly to the database query:
- **Optimization:** Only the relevant subset of customers, work items, and epics is transmitted over the network.
- **Scoring:** RICE scores are calculated on the full dataset before filtering to ensure accuracy.
- **Global Metrics:** The server returns global max values (e.g., `maxScore`) so the UI remains consistently scaled even when only a few items are visible.

### 2. The Interaction Phase (Client-Side)
As users type in the filter bar, the `useGraphLayout` hook applies **Transient Filters** to the already-filtered dataset provided by the server:
- **Responsiveness:** Instant updates without additional network calls.
- **Combining Logic:** Transient filters are combined with server-side base parameters using Logical AND (strictest threshold wins).

### 3. Visibility Pipeline Summary

| Step | Enforcement | Logic |
| :--- | :--- | :--- |
| **Initial Load** | Database | Fetches items matching Persistent Dashboard Parameters. |
| **Numeric Thresholds** | Server & Client | `Math.max(Transient, Persistent)` - stricter wins. |
| **Text Searches** | Server & Client | Logical AND - must match persistent criteria AND transient search string. |
| **Intersection** | Client | Hides items that don't form a complete path (Customer -> WorkItem -> Epic). |

```mermaid
graph TD
    DB[(MongoDB)] -->|Persistent Filters| API[API /loadData]
    API -->|Metrics + Data Subset| UI[Web Client]
    UI -->|Transient Filters| Layout[Layout Engine]
    Layout --> Render[Visible Graph]
```

## Configuration
- Dashboards are managed via the **Dashboard List** page.
- Parameters are edited via the **Edit Parameters** button located in the top-right corner of the active dashboard.
- Parameters are stored in the MongoDB `dashboards` collection.
