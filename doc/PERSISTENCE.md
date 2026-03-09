# Persistence & Migrations

## Overview
The application uses a dual-mode persistence strategy to balance ease of local development with robust multi-user storage.

## Data Storage
- **MongoDB:** Primary storage for production-like environments. Entities are stored in collections named after their logical types: `customers`, `workItems`, `teams`, `epics`, `sprints`, and `valueStreams`.
- **`staticImport.json`:** A fallback file-based storage used for seeding the database or sharing project state.

## The Vite Persistence Plugin
The "backend" logic resides in `web-client/vite.config.ts`. It utilizes `server.middlewares` to provide API endpoints:

## The Vite Backend Plugin
The "backend" logic resides in `web-client/vite.config.ts`. It provides a comprehensive set of REST endpoints for data management, integration, and security.

### Core Data Endpoints

#### 1. `GET /api/loadData`
The primary hydration endpoint. It fetches all entities, applies migrations, calculates RICE scores, and aggregates global metrics.
- **Parameters:** Supports `ValueStreamId` and various filters (`customerFilter`, `minTcv`, etc.).
- **Logic:** Performs complex joins (e.g., Epic effort summed into Work Items) and ROI calculations.

#### 2. `POST /api/entity/{collection}`
Upserts a single document into one of the allowed collections (`customers`, `workItems`, etc.).
- **Debouncing:** Frontend calls are debounced by 1000ms.
- **Validation:** Ensures a unique index on the `id` field.

#### 3. `DELETE /api/entity/{collection}/{id}`
Removes a specific document by its unique ID.

#### 4. `POST /api/settings`
Updates the `settings.json` file. It automatically masks/unmasks sensitive fields (API tokens, URIs) during the round-trip to the UI.

### Database Management & Portability

#### 5. `POST /api/mongo/test`
Validates connectivity to a MongoDB URI. Returns whether the targeted database exists and provides descriptive feedback based on the "Create if not exists" safety rail.

#### 6. `POST /api/mongo/databases`
Lists all databases on a cluster to assist with UI-based discovery.

#### 7. `POST /api/mongo/export`
Aggregates the entire database state into a single portable JSON object.

#### 8. `POST /api/mongo/import`
Wipes the current database and re-populates it from a provided JSON export.

#### 9. `POST /api/mongo/query`
A pass-through interface for executing raw MongoDB queries or aggregation pipelines. primarily used for fetching "Customer Custom Data" from secondary clusters.

### Security & Integration

#### 10. `GET /api/auth/status`
Checks if the `ADMIN_SECRET` environment variable is set and if the current session is authorized.

#### 11. `POST /api/jira/*`
Proxies requests to the Atlassian Jira API (`/test`, `/issue`, `/search`) to bypass CORS and inject credentials securely.

#### 12. `POST /api/llm/generate`
A unified gateway for multiple AI providers (OpenAI, Gemini, Anthropic, Augment). Supports Server-Sent Events (SSE) for real-time response streaming.

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

### 4. SSH Tunneling (SOCKS5)
For databases behind an SSH bastion (common with MongoDB Atlas + Private Link), the application supports SOCKS5 dynamic forwarding provided by the **Infrastructure (Sidecar/Proxy)**.

- **Local Dev:** Use the provided scripts (`scripts/start-tunnel.ps1`) to start a tunnel on your host.
- **Docker/K8s:** Use a dedicated sidecar container (e.g., a custom `alpine` image with `openssh-client`) in the same network/pod.
- **Application Logic:** The app is configured via `SOCKS_PROXY_HOST` and `SOCKS_PROXY_PORT`, but the proxy is only used if the **"Use SOCKS Proxy (from .env)"** toggle is enabled for a specific connection in the Settings UI. This allows for mixed connection types.

```mermaid
graph TD
    UI[Settings UI] -->|Select Method| Auth{Auth Logic}
    Auth -->|SCRAM| SCRAM[URI + Options]
    Auth -->|AWS| AWS[MONGODB-AWS + IAM Keys]
    Auth -->|OIDC| OIDC[MONGODB-OIDC + Token]
    SCRAM --> Driver[MongoClient]
    AWS --> Driver
    OIDC --> Driver
    Driver --> ProxyToggle{Use Proxy Toggle enabled?}
    ProxyToggle -->|Yes| EnvCheck{SOCKS_PROXY_HOST set?}
    EnvCheck -->|Yes| SOCKS[External SOCKS Proxy/Sidecar]
    ProxyToggle -->|No| Direct[Direct Connection]
    EnvCheck -->|No| Direct
    SOCKS --> DB[(MongoDB)]
    Direct --> DB
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




