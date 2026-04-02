# Persistence & Migrations

## Overview
The application uses a dual-mode persistence strategy to balance ease of local development with robust multi-user storage.

## Data Storage
- **MongoDB:** Primary storage for production-like environments. Entities are stored in collections named after their logical types: `customers`, `workItems`, `teams`, `issues`, `sprints`, and `valueStreams`.

For the full REST API endpoint catalogue, see [API Reference](API-REFERENCE.md).

## MongoDB Authentication & Safety

The application supports three primary authentication methods for MongoDB, configurable via the **Settings** (⚙️) menu. The configuration is now organized into two distinct roles: **Application** (primary storage) and **Customer** (external data).

### Hierarchical Settings Structure
Configuration is stored in `backend/settings.json` with the following top-level structure:
- `general`: Time and project-wide defaults.
- `persistence`: Database connections (Application vs. Customer).
- `jira`: Integration parameters.
- `ai`: LLM provider and API keys.

### Settings Scope (Server / Client)

Each settings field has a **scope** — either `server` (stored and managed by the backend) or `client` (stored locally in the browser). The scope is defined per dot-path in the `SETTINGS_SCOPE` map (`shared/types/src/models.ts`), using hierarchical inheritance:

- A parent path (e.g. `persistence`) sets the default scope for all its children.
- A child path (e.g. `general.theme`) can override its parent's scope.

The `partitionSettings()` utility splits any `Partial<Settings>` into `{ server, client }` portions based on this map. The `resolveScope(dotPath)` function walks up from the most specific path to find the applicable scope.

**UI indicator:** Each settings tab and overriding field displays a small icon showing whether it is stored on the server (rack icon) or client (monitor icon). Icons only appear at "points of change" — top-level section headers and fields that override their parent's scope.

Currently all settings are stored on the server. To move a field to client-side storage, update its entry in `SETTINGS_SCOPE` to `'client'`.

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
- **SSO Support:** The application includes integrated buttons to streamline AWS SSO authentication:
    - **Login via AWS SSO:** Executes `aws sso login --use-device-code` on the server. The application automatically constructs a complete authorization URL with the device code pre-filled (e.g., `https://device.sso.../?user_code=ABCD-EFGH`) and displays it as a direct link in the UI for a seamless one-click experience.
    - **Fetch SSO Credentials:** Executes `aws configure export-credentials` to retrieve temporary keys from the active SSO session and automatically populates the Access Key, Secret Key, and Session Token fields.
- **Docker Note:** The `aws-cli` is required in the container. If updating from an older version, run `docker compose up --build app` to ensure the CLI is installed.

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
...

```mermaid
graph TD
    Load[Load Data Request] --> Connect[Connect to MongoDB]
    Connect --> Check[Check Data Integrity]
    Check -->|Missing Fields| Migrate[Run Migration Script]
    Migrate --> Update[Update DB Collection]
    Update --> Return[Return Consistent Data]
    Check -->|Valid| Return
```

For Docker and Kubernetes deployment, see [Deployment & Networking](DEPLOYMENT.md).
