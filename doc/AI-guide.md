# AI Context & Project Orientation (AI-guide.md)

This document provides a high-level map of the ValueStream Dependency Tree project to help AI assistants orient quickly and compartmentalize tasks without exhaustive codebase scanning.

## 1. Core Purpose
A React-based visualization tool that maps value from **Customers** (Demand) through **Work Items** (Strategy) to **Issues/Teams** (Execution) on a **Gantt Timeline**.

## 2. Domain Entities & Relations
Defined in: `web-client/src/types/models.ts`

### Entities
- **Customer**: Root nodes. Have TCV (Total Contract Value), TCV History, and Support Issues.
- **WorkItem**: Strategy nodes. Linked to multiple Customers via `customer_targets` or a global `all_customers_target`.
- **Issue**: Execution nodes. Linked to ONE WorkItem and ONE Team. Contains Effort (man-days) and Dependencies (FS/FF).
- **Team**: Capacity nodes. Have total capacity, per-sprint overrides, and optional team members with capacity percentages. Can sync members from LDAP.
- **Sprint**: Time nodes. Define the Gantt scale and release targets.

### Reports
- **ValueStream**: A saved set of filters/parameters for viewing a specific slice of the data.
- **Support**: A list of active support items to review, aggregated from all customers.

### Relationship Graph
`Customer` <--[targets]-- `WorkItem` <--[fulfills]-- `Issue` --[assigned to]--> `Team`
`Sprint` --[release target]--> `WorkItem`
`Sprint` --[contains]--> `Issue`
`Issue` --[depends on]--> `Issue` (FS/FF)

## 3. Architecture & Code Map

### Backend & Persistence
- **API Entry Point**: `backend/src/server.ts` (Fastify Node.js Application).
- **API Routes**: Domain-specific logic is split into controllers in `backend/src/routes/` (e.g., `data.ts`, `jira.ts`, `auth.ts`). Route request bodies are validated using `@sinclair/typebox` JSON schemas defined in `backend/src/routes/schemas.ts`, providing both runtime validation (Fastify rejects invalid payloads with 400) and compile-time type safety via `FastifyRequest<{ Body: T }>` generics.
- **Database**: MongoDB (App data + External Customer data).
- **Core Logic**: `backend/src/utils/mongoServer.ts` (Connections), `backend/src/utils/businessLogic.ts` (RICE scoring, metrics), `backend/src/utils/dbHelpers.ts` (threshold protection, query building, ValueStream filtering), and `backend/src/services/metricsService.ts` (score pre-computation via `recomputeScoresForWorkItems`, metrics computation).
- **Secret Management**: `backend/src/services/secretManager.ts` — encrypts sensitive settings (API tokens, DB URIs, AWS credentials) in `settings.secrets.enc` using AES-256-GCM. Provider auto-detection: `EnvProvider` (K8s), `EncryptedFileProvider` (default), `NoOpProvider` (dev fallback). See `doc/secret-management.md`.
- **Settings Plugin**: `backend/src/plugins/settings.ts` — Fastify decorator providing `fastify.getSettings()` and `fastify.saveSettings()`. Routes use this decorator instead of importing settings functions directly. Backed by async `getFullSettingsAsync()` / `saveFullSettingsAsync()` (non-blocking fs.promises I/O with caching, invalidated on save). Sync `getFullSettings()` / `saveFullSettings()` remain for startup migration only.

### Available APIs
The backend is a standalone Fastify server running on port 4000. All endpoints require authorization via `ADMIN_SECRET` handled by a Fastify hook (`backend/src/plugins/auth.ts`). The Vite dev server proxies `/api` calls to this backend.

#### Core Data & Services
The backend encapsulates complex business logic (RICE scoring, fiscal quarter mapping) within a dedicated `backend/src/services/` layer, separating it from the data fetching routes.

- `GET /api/workspace`: Composite endpoint for the Graph View. Accepts `?valueStreamId=X`. Uses pre-computed RICE scores on WorkItem documents to push ValueStream parameter filters (name, score, released) to the DB level via `buildWorkspaceQueries()`. Cross-entity filters (issue team membership, sprint range) and the post-filter threshold (413) are applied in-memory by `applyValueStreamFilters()`. Metrics (`maxScore`, `maxRoi`) are computed from the filtered set via `computeMetricsFromPrecomputed()`.
- `POST /api/data/recomputeScores`: Migration endpoint — recomputes and persists `calculated_tcv`, `calculated_effort`, `calculated_score` on all WorkItem documents. Run once after deploying to backfill existing data.
- `GET /api/data/{collection}`: Granular endpoints (e.g., `/api/data/customers`, `/api/data/workItems`) for list and detail views. Query params are mapped to MongoDB queries via `buildMongoQuery()` — supports text filters (`customerFilter`, `teamFilter`), status filters (`releasedFilter`), score filters (`minScoreFilter`), and relational filters (`customerId`, `workItemId`, `teamId`). Each is protected by `fetchWithThreshold()`. The `workItems` endpoint reads pre-computed scores directly from documents (no cross-collection join needed).
- `GET /api/settings` & `POST /api/settings`: Retrieves or updates settings. Uses `SecretManager` to store sensitive credentials in an encrypted file (`settings.secrets.enc`) separate from `settings.json`. GET masks secrets with `********`; POST unmasks, splits secrets from config, and writes each to the appropriate store. See `backend/src/services/secretManager.ts` and `doc/secret-management.md`.
- `POST /api/entity/{collection}`: Upserts documents in MongoDB.
- `DELETE /api/entity/{collection}/{id}`: Deletes a document and performs **cascade cleanup** — removes customer_targets from WorkItems, clears work_item_id/team_id from Issues. Returns `cascaded` counts.
- `POST /api/mongo/query`: Executes JSON-based queries (find/aggregate) against the customer or app database.

#### Integrations
- `POST /api/jira/issue`: Fetches details for a specific Jira key.
- `POST /api/jira/search`: Executes a JQL search.
- `POST /api/llm/generate`: Generates text using OpenAI, Gemini, Augment, or Glean.
- `POST /api/aws/sso/*`: Manages AWS SSO authentication for secure MongoDB tunneling via device-code flow.
- `POST /api/ldap/sync-members`: Queries an LDAP server for group members. Accepts `{ ldap_team_name }`, reads LDAP connection settings from `settings.json`/SecretManager, resolves member DNs to `{ name, username }` pairs. Used by the Team Members tab for LDAP sync.

### Business Logic & Metrics
Centralized in `backend/src/utils/businessLogic.ts`:

- **Effort Management**:
    - **Work Items**: Effort is the maximum of its manual `total_effort_mds` or the sum of its linked Issues.
    - **Issue Distribution**: `calculateIssueEffortPerSprint()` distributes total effort across overlapping Sprints based on business days, respecting manual overrides.

- **Value & Scoring (RICE/ROI)**:
    - **TCV Calculation**:
        - **Must-have**: 100% of Customer TCV.
        - **Should-have**: Shared portion (`Customer TCV / Count of all Should-have targets for this customer`).
        - **Nice-to-have**: 0%.
    - **ROI Score**: `Total Impact (TCV) / Effort (min 1 MD)`.
    - **Pre-computed Scores**: `calculated_tcv`, `calculated_effort`, and `calculated_score` are stored directly on WorkItem documents. They are recomputed on every entity mutation (workItems, customers, issues) via `recomputeScoresForWorkItems()` in `metricsService.ts`. This enables DB-level filtering by score in the workspace endpoint.

- **Global Scaling**: `maxScore` and `maxRoi` are computed from pre-computed score fields via `computeMetricsFromPrecomputed()` to normalize node sizes and edge thicknesses in the visualization.

### State Management
- **Primary Hook**: `web-client/src/hooks/useValueStreamData.ts`.
- **Optimistic Updates**: UI updates immediately; persistence is debounced (1s) to prevent excessive writes.
- **Cascading Deletes**: Referential integrity is enforced **server-side** in the backend DELETE endpoint (e.g., deleting a Customer `$pull`s its targets from all Work Items; deleting a WorkItem `$unset`s `work_item_id` from Issues). The frontend mirrors cascades optimistically in local state for instant UI feedback.

### Visualization & Layout
- **Engine**: `web-client/src/hooks/useGraphLayout.ts`.
- **Logic**: Deterministic coordinate calculation (X-axis fixed by entity type, Y-axis calculated to minimize edge crossings).
- **Components**: `web-client/src/components/nodes/` (CustomerNode, WorkItemNode, TeamNode, GanttBarNode, etc.).

## 4. Common Workflows for AI

### List & Detail Pattern
- **GenericListPage**: Used for all list views (Support, ValueStreams, etc.). Supports persistence of filters/sorts and robust scroll restoration.
- **GenericDetailPage**: Used for all entity details.
- **FormFields** (`components/common/FormFields.tsx`): Reusable form field components (`FormTextField`, `FormNumberField`, `FormDateField`, `FormSelectField`, `FormTextArea`) used across detail pages and settings. Support labels, helper text, readOnly, and custom styling.
    - **CustomerPage**: TCV management (Actual vs Potential), Promotion (Potential -> Actual), Support linking to Jira issues, and Custom Field fetching.
    - **WorkItemPage**: Global targeting, ROI metrics, and Issue management with Jira synchronization.

### Support Workflow
- **Aggregation**: `SupportPage` flattens issues from all customers.
- **Health Tracking**: `useCustomerHealth` hook fetches real-time Jira data.
- **Cleanup**: Automatic expiration of support issues based on `expiration_date`.

### Modifying the Visualization
- **Layout**: Update `useGraphLayout.ts`.
- **Visuals**: Update node components in `src/components/nodes/` or CSS variables in `index.css`.

## 5. Key Constants & Locations
- **Layout X-Coordinates**: `COL_CUSTOMER_X`, `COL_WORKITEM_X`, etc., in `useGraphLayout.ts`.
- **Types**: `shared/types/src/models.ts` (single source of truth, imported as `@valuestream/shared-types`).
- **API Utilities**: `web-client/src/utils/api.ts`.
- **Test Utils**: `web-client/src/test/testUtils.tsx`.
