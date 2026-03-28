# High-Level Technical Architecture

## Overview

The ValueStream Dependency Tree is a Single Page Application (SPA) designed to visualize the flow of value from customer demand to engineering execution. It uses a custom mathematical layout engine to map entities across a 4-stage pipeline: Customers, Work Items, Teams, and a Gantt Timeline. The system features a robust, standalone Fastify Node.js backend server that supports complex MongoDB aggregations, Jira integrations, and multi-provider AI capabilities.

## System Architecture & Components

```mermaid
graph TD
    Client[Web Client - React/Vite]
    Backend[Fastify Backend API]
    Mongo[(MongoDB)]
    Jira[Atlassian Jira API]
    AI[AI Providers - OpenAI, Gemini, Anthropic, Augment]
    LDAP[LDAP Server]

    Client -->|API Requests| Backend
    Backend -->|Persistence & Aggregation| Mongo
    Backend -->|Integration| Jira
    Backend -->|AI Generation| AI
    Backend -->|Member Sync| LDAP
    
    subgraph "Networking Infrastructure"
        Proxy[SOCKS5 Proxy / SSH Tunnel]
        Backend -.->|Optional Tunneling| Proxy
        Proxy -.-> Mongo
    end
```

### 1. Web Client (Frontend)
- **Framework:** React 19 with Vite (`web-client/` directory).
- **State Management:** Custom `ValueStreamContext` and `useValueStreamData` hook featuring optimistic updates and debounced persistence.
- **Visualization:** `@xyflow/react` (React Flow) for rendering the interactive dependency graph.
- **Layout Engine:** A deterministic engine split across three hooks: `useGraphFilters.ts` (filter/visible set logic), `useGraphBuilder.ts` (coordinate calculation, node/edge construction, highlight application), and `useGraphLayout.ts` (thin orchestrator / public API). Features reachability analysis for hover-based highlighting.

### 2. Backend API (Fastify)
- **Framework:** A standalone Fastify Node.js application (`backend/` directory).
- **Service Layer:** Isolates business logic into `services/` for calculating dynamic RICE scores, effort rollups, and evaluating Sprint capacities.
- **Data Helpers:** `utils/dbHelpers.ts` provides `fetchWithThreshold()` (413 protection per collection), `buildMongoQuery()` (maps query params to MongoDB queries including relational filters), and `applyValueStreamFilters()` (post-scoring hard filters from ValueStream parameters).
- **Schema Validation:** Draft-07 JSON schema at `web-client/public/schema.json` and Fastify JSON schemas for API payload validation.

### 3. Data & Persistence
- **Database:** MongoDB architecture supporting both primary Application storage and secondary Customer data integration.
- **Connectivity:** Systematic SOCKS5 proxy support for connecting to MongoDB clusters (like Atlas) behind secure SSH bastions.

### 4. External Integrations
- **Atlassian Jira:** Bidirectional synchronization for Issues, pulling effort, status, and dates.
- **LDAP:** Team member synchronization from LDAP groups. Configured via Settings (LDAP tab). Uses the `ldapts` library to bind, search for groups, and resolve member DNs to name/username pairs.
- **AI Integration:** Multi-provider support for LLMs including OpenAI, Gemini, Anthropic, and localized execution via the Augment (`auggie`) CLI.

## Data Model

The system is composed of several core entities that drive the visualization.

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
        string description
        number total_effort_mds
        number score
    }
    ISSUE {
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
        string ldap_team_name
        TeamMember[] members
    }
    SPRINT {
        string id
        string name
        date start_date
        date end_date
    }
    ValueStream {
        string id
        string name
        object parameters
    }

    CUSTOMER ||--o{ WORK-ITEM : "targeted by"
    WORK-ITEM ||--o{ ISSUE : "fulfilled by"
    TEAM ||--o{ ISSUE : "assigned to"
    SPRINT ||--o{ WORK-ITEM : "release target"
    SPRINT ||--o{ ISSUE : "contains"
    ISSUE ||--o{ ISSUE : "depends on"
    ValueStream ||--o{ CUSTOMER : "filters"
    ValueStream ||--o{ WORK-ITEM : "filters"
    ValueStream ||--o{ TEAM : "filters"
```

## Data Flow & State Management

The application utilizes a hybrid state management strategy that combines server-side aggregation with client-side optimistic updates.

### 1. Authentication & Security
The system supports an optional security layer via the `ADMIN_SECRET` environment variable.
- **Middleware:** If `ADMIN_SECRET` is set, the Fastify backend hook requires a `Bearer` token in the `Authorization` header for all `/api/*` requests (except login).
- **Frontend Flow:** The `App.tsx` component checks the auth status. If required and not authenticated, it presents the Login Page.
- **Authorized Fetch:** A custom `authorizedFetch` utility centrally manages the injection of the secret and handles session expiration.

### 2. Hydration & Lazy Loading
The frontend employs a sparse-context architecture.
1. **Lazy Granular Fetching:** Top-level components and detail pages only request the specific collections they need. The hook executes `Promise.all` across granular `/api/data/*` endpoints, reducing network payload.
2. **State Merging:** As the user navigates, fetched data is merged into the global `ValueStreamContext`. Previously fetched entities are retained, allowing instant back-navigation.
3. **Composite Graph Loading:** Visual components (like the Gantt tree) that require the entire dataset call a dedicated `/api/workspace` endpoint to hydrate the full dependency tree simultaneously.

### 3. Server-Side Processing
The backend calculates derived data on the fly:
- **Metrics Service:** Joins Work Items with Issues (for effort) and Customers (for TCV) to calculate dynamic RICE scores and return global scaling metadata.
- **Sprint Service:** Sprints are evaluated and tagged with a fiscal quarter based on the application settings.

### 4. Mutations & Reactivity
User actions trigger local state changes via mutation functions:
- **Optimistic Updates:** Immediately execute a local update on the React state array for zero-latency UI feedback.
- **Cascading Deletes:** Referential integrity is enforced **server-side** in `entity.ts`: deleting a Customer `$pull`s targets from Work Items, deleting a Work Item `$unset`s references from Issues, deleting a Team clears `team_id` from Issues. The frontend mirrors these cascades optimistically for instant UI feedback.
- **Debounced Persistence:** Update operations are debounced by 1000ms, bundling rapid changes into a single API call.

```mermaid
sequenceDiagram
    participant UI as Browser (React App)
    participant Fastify as Fastify Server (backend/)
    participant FS as File System (settings.json)
    participant DB as MongoDB
    participant Jira as Atlassian Jira API

    Note over UI, Jira: Scenario 1: Graph View Full Load
    UI->>Fastify: GET /api/workspace?ValueStreamId=dash123
    Fastify->>FS: Read settings.json (Mongo URI)
    Fastify->>DB: Fetch valueStreams, Customers, WorkItems, Issues
    DB-->>Fastify: Raw Data
    Note right of Fastify: Calculate RICE Scores & Global Metrics
    Fastify-->>UI: JSON Data (Aggregated & Scored)

    Note over UI, Jira: Scenario 2: Save Entity Change (Debounced)
    UI->>UI: User Types... (1000ms debounce)
    UI->>Fastify: POST /api/entity/customers/c1 {id: "c1", name: "New Name"}
    Fastify->>FS: Read settings.json
    Fastify->>DB: replaceOne({id: "c1"}, {name: "New Name"})
    DB-->>Fastify: Ack
    Fastify-->>UI: { success: true }

    Note over UI, Jira: Scenario 3: Jira Synchronization
    UI->>Fastify: POST /api/jira/issue { jira_key: "PROJ-123" }
    Fastify->>FS: Read settings.json (API Token)
    Fastify->>Jira: GET /rest/api/3/issue/PROJ-123
    Jira-->>Fastify: Jira Issue Data (Summary, Dates, Team)
    Fastify-->>UI: { success: true, data: JiraData }
```

## Core Algorithms & Code Patterns

### 1. The Graph Layout Engine
The core visualization is a highly deterministic layout engine split across `useGraphFilters.ts` (filter logic), `useGraphBuilder.ts` (rendering), and `useGraphLayout.ts` (orchestrator) — not a physics-based graph.
- **Column Mapping:** Establishes fixed X-coordinates forming a left-to-right flow pipeline.
- **Reachability Analysis:** When a node is selected, the engine recursively traces upstream (to root causes) and downstream (to execution) to filter the visible graph to relevant paths.
- **Coordinate Placement:** Dynamically calculates Y offsets so nodes do not overlap, protecting Issue Gantt bars within Team vertical bounds.
- **Holiday-Aware Capacity:** Team capacity is adjusted based on public holidays in the team's configured country.

### 2. Transient UI State Persistence
The application maintains a `uiState` object within the `ValueStreamContext` to persist transient view settings:
- **Scope:** Used by list pages to remember filters, sort orders, and scroll positions.
- **Scroll Restoration:** Implements multi-attempt scroll restoration to ensure the view is correctly applied even if content renders asynchronously.

## Directory Structure

```mermaid
graph TD
    root[Project Root]
    web[web-client/ - Frontend]
    api[backend/ - Fastify API]
    docs[doc/]
    k8s[k8s/ - Kubernetes Manifests]

    root --> web
    root --> api
    root --> docs
    root --> k8s

    api --> api_src[src/]
    api_src --> routes[routes/ - API Endpoints]
    api_src --> plugins[plugins/ - Fastify Plugins]
    api_src --> services[services/ - RICE Scoring, Sprint Quarters]
    api_src --> util[utils/ - dbHelpers, businessLogic, etc.]

    web --> web_src[src/]
    web_src --> components[components/ - UI & React Flow]
    web_src --> pages[pages/]
    web_src --> hooks[hooks/]
```

## Deployment Architecture

The application is designed for multiple deployment environments.

### 1. Standalone (Local Development)
Ideal for individual developers running everything directly on the host machine.
- Start both services concurrently using `npm run dev` from the project root.

### 2. Docker (Containerized Environments)
- **Development:** Uses `docker-compose.yml` with hot-reloading.
- **Production:** Uses a multi-stage build (`docker-compose.prod.yml`) to compile the React app and serve it statically via Nginx, which reverse-proxies to the Fastify container.

### 3. Kubernetes (Cluster Deployment)
Manifests are provided in the `k8s/` directory.
- Decoupled Pods for the Nginx Web Client, Fastify Backend, and MongoDB.
- `ADMIN_SECRET` is managed via a Kubernetes Secret object.

## Networking & SSH Tunneling

To support MongoDB clusters behind secure SSH bastions, the application employs a Systematic SOCKS5 Architecture.

### 1. SOCKS5 vs. Port Forwarding
Standard SSH Port Forwarding fails with MongoDB SRV records because the driver connects to the real hostnames of the cluster members. SOCKS5 acts as a dynamic proxy that captures all traffic from the driver.

### 2. Architecture Patterns

| Environment | Pattern | Implementation |
| :--- | :--- | :--- |
| **Local Dev** | **External Proxy** | Start a tunnel via `./scripts/start-tunnel.ps1`. Backend picks up env vars. |
| **Docker (A)** | **Direct** | Set `SOCKS_PROXY_HOST=` for local/unprotected DBs. |
| **Docker (B)** | **Service Sidecar** | The backend connects to the `ssh-proxy` container in the bridge network. |
| **Docker (C)** | **Host Workaround** | The backend connects to `host.docker.internal` (Mac/PC host tunnel). |
| **Kubernetes** | **Pod Sidecar** | An SSH container runs alongside the backend in the same Pod. |

### 3. Systematic Discovery
The backend checks for the following environment variables:
- `SOCKS_PROXY_HOST`: The IP/Hostname of the SOCKS5 proxy.
- `SOCKS_PROXY_PORT`: The port for the external proxy.

Setting these variables does not automatically force all traffic through the proxy. Users must explicitly enable the "Use Proxy" toggle for each database connection in the UI Settings.
