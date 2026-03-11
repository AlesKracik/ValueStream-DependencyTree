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
Updates the `settings.json` file. It automatically masks/unmasks sensitive fields (API tokens, URIs) recursively within the nested structure during the round-trip to the UI.

### Database Management & Portability

#### 5. `POST /api/mongo/test`
Validates connectivity to a MongoDB cluster. It accepts a hierarchical configuration object and connection role (`app` or `customer`). Returns whether the targeted database exists and provides descriptive feedback.

#### 6. `POST /api/mongo/databases`
Lists all databases on a cluster to assist with UI-based discovery. Uses the same hierarchical configuration as the test endpoint.

#### 7. `POST /api/mongo/export`
Aggregates the entire application database state into a single portable JSON object, including the current settings.

#### 8. `POST /api/mongo/import`
Wipes the current application database and re-populates it from a provided JSON export.

#### 9. `POST /api/mongo/query`
A pass-through interface for executing raw MongoDB queries or aggregation pipelines. Primarily used for fetching "Customer Custom Data" from secondary clusters. It expects the nested `persistence.mongo.customer` configuration.

### Security & Integration

#### 10. `GET /api/auth/status`
Checks if the `ADMIN_SECRET` environment variable is set and if the current session is authorized.

#### 11. `POST /api/jira/*`
Proxies requests to the Atlassian Jira API (`/test`, `/issue`, `/search`) to bypass CORS and inject credentials securely.

#### 12. `POST /api/llm/generate`
A unified gateway for multiple AI providers (OpenAI, Gemini, Anthropic, Augment). Supports Server-Sent Events (SSE) for real-time response streaming.

## MongoDB Authentication & Safety

The application supports three primary authentication methods for MongoDB, configurable via the **Settings** (⚙️) menu. The configuration is now organized into two distinct roles: **Application** (primary storage) and **Customer** (external data).

### Hierarchical Settings Structure
Configuration is stored in `web-client/settings.json` with the following top-level structure:
- `general`: Time and project-wide defaults.
- `persistence`: Database connections (Application vs. Customer).
- `jira`: Integration parameters.
- `ai`: LLM provider and API keys.

### 1. SCRAM (Standard)
The default authentication method using URI-based credentials.
- **Config:** Set in `persistence.mongo.[app|customer].uri`.
- **Example:** `mongodb://user:pass@localhost:27017`

### 2. AWS IAM
Allows connection using AWS Identity and Access Management. Supports both static keys and Assume Role.
- **Config:** Nested under `persistence.mongo.[role].auth`:
    - `method`: "aws"
    - `aws_auth_type`: "static" or "role"
    - `aws_access_key`, `aws_secret_key`, `aws_session_token`
    - `aws_role_arn`, `aws_external_id`
- **Driver Logic:** Uses `MONGODB-AWS` mechanism.
- **SSO Support:** Includes integrated buttons to trigger `aws sso login` and fetch temporary credentials directly into the application settings, supporting both local profiles and manual SSO metadata entry.

### 3. OIDC (OpenID Connect)
Enables authentication via external identity providers.
- **Config:** Set in `persistence.mongo.[role].auth`:
    - `method`: "oidc"
    - `oidc_token`: The bearer token.

### 4. SSH Tunneling (SOCKS5)
Supports SOCKS5 dynamic forwarding for databases behind bastions.
- **Config:** Each role can independently opt-in via `use_proxy` and specify a `tunnel_name` (matches `[NAME]_SOCKS_PORT` environment variables).

## Migration System
The system includes an automatic migration handler to ensure data consistency.

### Hierarchical Settings Migration
When the application loads, the backend automatically detects if `settings.json` is using the old flat structure. If so, it migrates all keys to the new nested format (`general`, `persistence`, `jira`, `ai`) and saves the file back to disk.

### Sprint Quarter Migration
... (rest of the section)

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




