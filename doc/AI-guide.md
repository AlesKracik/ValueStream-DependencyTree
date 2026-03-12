# AI Context & Project Orientation (AI-guide.md)

This document provides a high-level map of the ValueStream Dependency Tree project to help AI assistants orient quickly and compartmentalize tasks without exhaustive codebase scanning.

## 1. Core Purpose
A React-based visualization tool that maps value from **Customers** (Demand) through **Work Items** (Strategy) to **Epics/Teams** (Execution) on a **Gantt Timeline**.

## 2. Domain Entities & Relations
Defined in: `web-client/src/types/models.ts`

### Entities
- **Customer**: Root nodes. Have TCV (Total Contract Value) and Support Issues.
- **WorkItem**: Strategy nodes. Linked to multiple Customers via `customer_targets`.
- **Epic**: Execution nodes. Linked to ONE WorkItem and ONE Team. Contains Effort (man-days) and Dependencies.
- **Team**: Capacity nodes. Have total capacity and per-sprint overrides.
- **Sprint**: Time nodes. Define the Gantt scale and release targets.

### Reports
- **ValueStream**: A saved set of filters/parameters for viewing a specific slice of the data.
- **Support**: A list of active support items to review

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
- `GET /api/loadData`: Fetches the entire workspace state (customers, work items, teams, epics, sprints, value streams, and settings). Calculates global scaling metrics (maxScore, maxRoi).
- `POST /api/settings`: Updates the global `settings.json` file. Automatically handles masking/unmasking of sensitive credentials.
- `POST /api/entity/{collection}/{id}`: Upserts a document into one of the allowed MongoDB collections.
- `DELETE /api/entity/{collection}/{id}`: Deletes a document from a collection.

#### MongoDB Operations
- `POST /api/mongo/test`: Validates connection to an app or customer MongoDB instance.
- `POST /api/mongo/databases`: Lists available databases for a given connection string.
- `POST /api/mongo/query`: Executes a JSON-based find or aggregate query against the customer database.
- `POST /api/mongo/export`: Returns a full JSON dump of all application data.
- `POST /api/mongo/import`: Replaces all application data with the provided JSON dump.

#### Integrations
- `POST /api/jira/issue`: Fetches details for a specific Jira key using the configured credentials.
- `POST /api/jira/search`: Executes a JQL search and returns matching issues.
- `POST /api/llm/generate`: Generates text using OpenAI, Gemini, or Augment providers based on the configured settings.
- `POST /api/aws/sso/login`: Initiates an AWS SSO device-code login flow.
- `POST /api/aws/sso/credentials`: Exports temporary AWS credentials for a logged-in SSO session.

### Authentication & Security
The application implements several layers of security to protect sensitive data and prevent unauthorized access:

- **API Authentication**:
    - All `/api/*` routes are protected if `ADMIN_SECRET` is set in the environment.
    - Clients must provide the secret via the `x-admin-secret` header or a `Bearer` token in the `Authorization` header.
    - Auth status can be checked at `/api/auth/status`.
    - Logic is centralized in `web-client/src/utils/authServer.ts`.

- **Sensitive Field Masking**:
    - Credentials (API tokens, AWS keys, etc.) are masked with `********` when sent to the client.
    - The backend (`vite.config.ts`) selectively unmasks these fields only during a `POST /api/settings` request if the original values are needed.

- **Data Integrity**:
    - **ID Generation**: `generateId(prefix)` in `web-client/src/utils/security.ts` uses `crypto.randomUUID()` to create unique, secure identifiers.
    - **URL Sanitization**: `sanitizeUrl()` in `web-client/src/utils/security.ts` prevents XSS by filtering suspicious protocols.

### Business Logic & Metrics
Core calculations are centralized in `web-client/src/utils/businessLogic.ts` to ensure consistency between the UI and backend:

- **Effort Management**:
    - **Epics**: Jira is the source of truth for effort (converted from seconds to Man-Days).
    - **Work Items**: Effort is the sum of all associated Epics. If no Epics are linked, it falls back to a manually entered value on the Work Item.
    - **Distribution**: `calculateEpicEffortPerSprint()` distributes an Epic's total effort across its overlapping Sprints. It prioritizes manual overrides and distributes the remainder proportionally based on business days.

- **Value & Scoring**:
    - **TCV**: Work Items aggregate Total Contract Value (TCV) from linked Customers. It supports both "Existing" (committed) and "Potential" (pipeline) TCV types.
    - **RICE Score (ROI)**: Work Items are scored based on their Return on Investment (ROI).
        - **Formula**: `Score = Total Impact / Effort`.
        - **Priority-Based Impact (Total TCV)**: The contribution of a customer's TCV to a Work Item's Impact depends on the target priority:
            - **Must-have**: Contributes **100%** of the associated Customer TCV.
            - **Should-have**: Contributes a **shared portion** of the Customer TCV. Calculated as: `(Customer TCV) / (Total number of 'Should-have' Work Items for that particular Customer)`.
            - **Nice-to-have**: Contributes **0%** (does not add to the TCV/Impact).
        - **Safety**: Effort has a floor of 1 MD to prevent division by zero. Reach and Confidence are currently implicitly 1.0.

- **Global Metrics**:
    - During the `loadData` phase in `vite.config.ts`, the system calculates global `maxScore` and `maxRoi`. These values are used by the visualization engine to normalize node sizes and connection thickness across the entire graph.

### State Management
- **Primary Hook**: `web-client/src/hooks/useValueStreamData.ts`. Handles fetching, optimistic updates, and debounced persistence.
- **Context**: `web-client/src/contexts/ValueStreamContext.tsx`. Provides global access to data and mutation functions.

#### Optimistic Updates & Persistence
The system uses a "UI-first" state management strategy to ensure the application feels fast and responsive:

- **Optimistic UI**: When a user modifies an entity, the `useValueStreamData` hook updates the local React state immediately. The UI reflects the change instantly without waiting for the server response.
- **Debounced Persistence**: 
    - To prevent excessive database writes during typing, most updates are debounced (default: 1000ms).
    - If multiple changes occur to the same entity within the debounce window, only the final state is sent to the server.
- **Immediate Sync**: 
    - Deletions, additions, and critical settings changes (like MongoDB connection strings) bypass the debounce and are persisted immediately.
- **Referential Integrity (Cascading Updates)**: 
    - The state manager handles cascading logic. For example, deleting a Customer will automatically clear related targets in Work Items and persist those changes to the database.
- **Error Feedback**: If a background persistence request fails, the system provides visual feedback (via `showAlert`) while maintaining the current local state.

### Visualization & Layout
- **Engine**: `web-client/src/hooks/useGraphLayout.ts`. Deterministic coordinate calculation (NOT force-directed).
- **React Flow**: Uses `@xyflow/react`.

## 4. Frontend Assets & Deployment

### Dockerization
The application is containerized for consistent development and deployment environments:
- **Dockerfile**: `web-client/Dockerfile` uses Node.js 22 (Alpine) and includes `aws-cli` and `git` for backend integrations.
- **Docker Compose**: `docker-compose.yml` orchestrates the `app`, a `mongodb` instance for persistence, and an optional `ssh-proxy` for secure database tunneling.
- **Dev Mode**: The container runs in `npm run dev` mode to keep the Vite-embedded backend plugin active and responsive to code changes.

### Documentation & Static Assets
Located in `web-client/public/`:
- **User Guide**: `USER_GUIDE.md` is the primary source of documentation for end-users.
- **Schema**: `schema.json` defines the expected structure for data imports and exports.
- **Automated Screenshots**: `web-client/take-screenshots.js` uses Playwright to generate high-quality screenshots for the User Guide, ensuring documentation stays in sync with UI changes.

## 5. Common Workflows for AI

### List & Detail Pattern
The application follows a consistent structure for managing entities (Customers, WorkItems, Teams, Epics, Sprints):

- **List Template**: `web-client/src/components/common/GenericListPage.tsx`.
    - A reusable component for all list views.
    - Features: Automatic filtering (search input), multi-column sorting, and configurable grid layout.
    - Props: `items`, `columns`, `filterPredicate`, `sortOptions`, and `onItemClick`.
    - Styles: `web-client/src/pages/List.module.css`.

- **Detail Pages**: `web-client/src/components/{entity}/{Entity}Page.tsx`.
    - Structured using `PageWrapper` for consistent loading/error/empty state handling.
    - **Header**: Contains the entity name and a "Back" button (or "Create" for new entities).
    - **Content**: Organized into logical `styles.card` sections.
    - **Forms**: Use `styles.formGrid` for a standard multi-column layout of input fields.
    - **Persistence**: 
        - Existing entities: Auto-update on every field change (immediate persistence).
        - New entities: Local draft state + a "Create" button for final submission.
    - Styles: `web-client/src/components/customers/CustomerPage.module.css` (shared across most detail pages).

### ValueStream Visualization
- **Custom Nodes**: `web-client/src/components/nodes/`.
    - `CustomerNode.tsx`: Circle with TCV scale.
    - `WorkItemNode.tsx`: Circle with Score/Effort.
    - `TeamNode.tsx`: Vertical container for Epics.
    - `GanttBarNode.tsx`: Rectangular bars inside Team vertical bounds.
- **Columns**:
    - X=0: Customers (`COL_CUSTOMER_X`)
    - X=350: Work Items (`COL_WORKITEM_X`)
    - X=700: Teams (`COL_TEAM_X`)
    - X=950+: Gantt Timeline (`COL_GANTT_START_X`)

### Standard Modifications
- **Adding a Field to an Entity**:
    1. Update `web-client/src/types/models.ts`.
    2. Update `web-client/public/schema.json` (for validation).
    3. Update the Page/Modal in `web-client/src/components/{entity}/` or `web-client/src/pages/`.
    4. Ensure the backend in `vite.config.ts` passes the field (usually automatic via MongoDB `find`).
- **Modifying Visualization**:
    - **Layout Change**: Edit `web-client/src/hooks/useGraphLayout.ts`.
    - **Visual Style**: Edit `web-client/src/components/nodes/` or `web-client/src/App.css` (variables).
    - **Highlighting/Filtering**: Edit the reachability logic in `useGraphLayout.ts`.
- **Changing Business Logic**:
    - Edit `web-client/src/utils/businessLogic.ts` or the `loadData` aggregator in `vite.config.ts`.

## 6. Key Constants
- **Grid Layout**: `COL_CUSTOMER_X`, `COL_WORKITEM_X`, etc., in `useGraphLayout.ts`.
- **Theming**: CSS variables in `web-client/src/index.css`.
- **ID Generation**: `generateId(prefix)` in `web-client/src/utils/security.ts`.

## 7. Testing Strategy
- **Unit Tests**: `**/__tests__/*.test.ts(x)`.
- **Logic Tests**: `web-client/src/utils/__tests__/businessLogic.test.ts`.
- **Hook Tests**: `web-client/src/hooks/__tests__/useValueStreamData.test.tsx`.
