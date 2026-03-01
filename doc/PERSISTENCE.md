# Persistence & Migrations

## Overview
The application uses a dual-mode persistence strategy to balance ease of local development with robust multi-user storage.

## Data Storage
- **MongoDB:** Primary storage for production-like environments. Entities are stored in collections named after their logical types: `customers`, `workItems`, `teams`, `epics`, `sprints`, and `dashboards`.
- **`staticImport.json`:** A fallback file-based storage used for seeding the database or sharing project state.

## The Vite Persistence Plugin
The "backend" logic resides in `web-client/vite.config.ts`. It utilizes `server.middlewares` to provide API endpoints:

### 1. `GET /api/loadData`
Fetches the project state, executes migrations, and performs server-side calculations.

**Supported Query Parameters:**
- `dashboardId`: (String) UUID of a persistent dashboard to load parameters from.
- `customerFilter`: (String) Text-based search for customer names.
- `workItemFilter`: (String) Text-based search for work item names.
- `teamFilter`: (String) Text-based search for team names.
- `epicFilter`: (String) Text-based search for epic names.
- `releasedFilter`: (`all` | `released` | `unreleased`) Filter by work item status.
- `minTcv`: (Number) Minimum total TCV for customers.
- `minScore`: (Number) Minimum RICE score for work items.

**Response Structure:**
The response includes standard entities plus a **`metrics`** object used for consistent frontend rendering:
- `metrics.maxScore`: The global maximum RICE score across the *entire* dataset.
- `metrics.maxRoi`: The global maximum Return on Investment (TCV/Effort) for edge scaling.

### 2. `POST /api/entity/{collection}`
Handles Upsert operations. When a Work Item or Customer is updated, the backend automatically recalculates all affected RICE scores on the next `loadData` call.

### 3. DELETE /api/entity/{collection}
Handles record removal.

### 4. POST /api/mongo/databases
Fetches a list of all databases available on the configured MongoDB cluster. Used for the Database Discovery feature in the UI.

### 5. POST /api/mongo/test
Tests connection to a specific URI and Database. Returns an `exists` boolean flag to indicate if the targeted database is already initialized on the server.

## MongoDB Authentication & Safety

The application supports three primary authentication methods for MongoDB, configurable via the **Settings** (⚙️) menu. It also includes a "Safety Rail" to prevent accidental database creation due to typos.

### Connection Safety Features
To ensure data integrity and prevent "ghost" databases:
1.  **Database Discovery:** After entering a URI and clicking "Test Connection", the UI provides a searchable dropdown of all existing databases on that cluster.
2.  **Explicit Creation Consent:** A **"Create database if it doesn't exist"** checkbox must be enabled to target a new database name.
3.  **Strict Enforcement:** If this safety checkbox is disabled, the backend will refuse to connect or perform any operations (Load, Save, Export) if the specified database does not already exist.

### 1. SCRAM (Standard)
... (rest of the file)
The default authentication method using URI-based credentials.
- **Config:** Provide a full URI including username and password.
- **Example:** `mongodb://user:pass@localhost:27017`

### 2. AWS IAM
Allows connection to Amazon DocumentDB or MongoDB Atlas using AWS Identity and Access Management.
- **Config:** Set method to "AWS IAM" and provide:
    - `Access Key ID`
    - `Secret Access Key`
    - `Session Token` (Optional)
- **Driver Logic:** Uses `MONGODB-AWS` mechanism.

### 3. OIDC (OpenID Connect)
Enables authentication via external identity providers like Azure AD, Okta, or Ping.
- **Config:** Set method to "OIDC" and provide:
    - `Access Token`: The bearer token obtained from your identity provider.
- **Driver Logic:** Uses `MONGODB-OIDC` mechanism.

```mermaid
graph TD
    UI[Settings UI] -->|Select Method| Auth{Auth Logic}
    Auth -->|SCRAM| SCRAM[URI + Options]
    Auth -->|AWS| AWS[MONGODB-AWS + IAM Keys]
    Auth -->|OIDC| OIDC[MONGODB-OIDC + Token]
    SCRAM --> Driver[MongoClient]
    AWS --> Driver
    OIDC --> Driver
    Driver --> DB[(MongoDB)]
```

## Migration System
The system includes an automatic migration handler inside the `/api/loadData` endpoint to ensure data consistency across versions.

### Example: Sprint Quarter Migration
When the data model was extended to include persisted `quarter` attributes on sprints, a migration was added to:
1. Identify sprints missing the `quarter` field.
2. Recompute the quarter using the `fiscal_year_start_month` setting.
3. Update the MongoDB collection retroactively.

```mermaid
graph TD
    Load[Load Data Request] --> Connect[Connect to MongoDB]
    Connect --> Check[Check Data Integrity]
    Check -->|Missing Fields| Migrate[Run Migration Script]
    Migrate --> Update[Update DB Collection]
    Update --> Return[Return Consistent Data]
    Check -->|Valid| Return
```

## Dockerized Persistence

The application includes a `docker-compose.yml` file to quickly spin up a fully connected environment.

### Deployment
1.  **Start Services:** Run `docker-compose up --build` from the root directory.
2.  **Configuration:** Inside the application's **Settings** (⚙️), update the **MongoDB URI** to:
    - `mongodb://mongodb:27017`
3.  **Persistence:** Data is stored in a named Docker volume (`mongo-data`), ensuring it persists even if containers are stopped or removed.

```mermaid
graph LR
    App[App Container] -->|Internal Network| Mongo[Mongo Container]
    Mongo -->|Mount| Volume[(Docker Volume: mongo-data)]
```

## Seeding
If the MongoDB database is empty on load, the plugin automatically reads `web-client/public/staticImport.json` and inserts the data into the corresponding collections.
