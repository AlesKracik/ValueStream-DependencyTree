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
- **Secret Management**: `backend/src/services/secretManager.ts` — orchestrates secret storage (singleton factory, settings I/O, migration). Provider implementations live in `backend/src/services/providers/`: `EncryptedFileProvider` (AES-256-GCM, default), `EnvProvider` (K8s), `NoOpProvider` (dev fallback). Encrypts sensitive settings (API tokens, DB URIs, AWS credentials) in `settings.secrets.enc`. See [Secret Management](SECRET-MANAGEMENT.md).
- **Settings Plugin**: `backend/src/plugins/settings.ts` — Fastify decorator providing `fastify.getSettings()` and `fastify.saveSettings()`. Routes use this decorator instead of importing settings functions directly. Backed by async `getFullSettingsAsync()` / `saveFullSettingsAsync()` (non-blocking fs.promises I/O with caching, invalidated on save). Sync `getFullSettings()` / `saveFullSettings()` remain for startup migration only.
- **Error Handling**: `backend/src/plugins/errorHandler.ts` — global Fastify error handler that standardizes all error responses to `{ success: false, error: message }`. Routes throw errors (or `AppError` from `backend/src/utils/errors.ts` for non-500 status codes) instead of catching them locally. Schema validation errors (400) and custom `AppError` status codes are preserved; unrecognized errors default to 500. Raw `TypeError: fetch failed` from outbound Node `fetch()` calls is enriched by walking `error.cause` to include the underlying `code`/`hostname`/`port` (e.g. `ECONNREFUSED jira.example.com:443`) plus the inbound `method url`, so UI alerts surface actionable detail instead of the generic message.
- **Logging**: All backend logging uses Pino (Fastify's built-in logger). Route handlers use `fastify.log.*` / `request.log.*`. Utility modules that lack Fastify access import the standalone Pino logger from `backend/src/utils/logger.ts`. No `console.*` calls — use `logger.info/warn/error/debug` instead. Set `LOG_LEVEL` env var to control verbosity (default: `info`).

### Available APIs
The backend is a standalone Fastify server running on port 4000. All endpoints require authorization via `ADMIN_SECRET` handled by a Fastify hook (`backend/src/plugins/auth.ts`). The Vite dev server proxies `/api` calls to this backend.

For the complete endpoint catalogue, see [API Reference](API-REFERENCE.md). Key endpoints:

- `GET /api/workspace` — Composite Graph View hydration (ValueStream filtering, RICE scores, metrics).
- `GET /api/data/{collection}` — Granular entity endpoints with query filtering and threshold protection.
- `POST /api/entity/{collection}` / `DELETE /api/entity/{collection}/{id}` — CRUD with cascade cleanup.
- `GET /api/settings` / `POST /api/settings` — Settings with secret masking (see [Secret Management](SECRET-MANAGEMENT.md)).
- Integration proxies: Jira (`/api/jira/*`), AI (`/api/llm/generate`), Glean (`/api/glean/*`), Aha! (`/api/aha/*`), AWS SSO (`/api/aws/sso/*`), LDAP (`/api/ldap/*`).

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
- **Context Architecture** (`web-client/src/contexts/`): Three separated concerns:
  - `NotificationContext.tsx` — `NotificationProvider` + `useNotificationContext()` for alert/confirm modals.
  - `UIStateContext.tsx` — `UIStateProvider` + `useUIStateContext()` for page-level UI state (filter, sort, scroll) and graph view state.
  - `ValueStreamContext.tsx` — `ValueStreamProvider` + `useValueStreamContext()` for entity data and mutations (data, updateIssue, addIssue, deleteIssue). Re-exports from the other two contexts for backward compatibility.
- **Optimistic Updates**: UI updates immediately; persistence is debounced (1s) to prevent excessive writes.
- **Cascading Deletes**: Referential integrity is enforced **server-side** in the backend DELETE endpoint (e.g., deleting a Customer `$pull`s its targets from all Work Items; deleting a WorkItem `$unset`s `work_item_id` from Issues). The frontend mirrors cascades optimistically in local state for instant UI feedback.

### Visualization & Layout
- **Engine**: Three hooks in `web-client/src/hooks/`:
  - `useGraphFilters.ts` — filter validation, visible set computation, and selection-based graph traversal.
  - `useGraphBuilder.ts` — node/edge construction, coordinate calculation, and highlight application.
  - `useGraphLayout.ts` — thin orchestrator; public API consumed by components.
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
- **Filters**: Update `useGraphFilters.ts` (visible set logic, filter rules).
- **Layout/Rendering**: Update `useGraphBuilder.ts` (node/edge construction, coordinates, highlights).
- **Visuals**: Update node components in `src/components/nodes/` or CSS variables in `index.css`.

## 5. Key Constants & Locations
- **Layout X-Coordinates**: `COL_CUSTOMER_X`, `COL_WORKITEM_X`, etc., in `useGraphBuilder.ts`.
- **Types**: `shared/types/src/models.ts` (single source of truth, imported as `@valuestream/shared-types`).
- **API Utilities**: `web-client/src/utils/api.ts`.
- **Test Utils**: `web-client/src/test/testUtils.tsx`.
