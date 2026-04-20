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

Each settings field has a **scope** — either `server` (stored and managed by the backend in `settings.json`) or `client` (stored per-user in their profile in MongoDB). The scope is defined per dot-path in the `SETTINGS_SCOPE` map (`shared/types/src/models.ts`), using hierarchical inheritance:

- A parent path (e.g. `persistence`) sets the default scope for all its children.
- A child path (e.g. `general.theme`) can override its parent's scope.

The `partitionSettings()` utility splits any `Partial<Settings>` into `{ server, client }` portions based on this map. The `resolveScope(dotPath)` function walks up from the most specific path to find the applicable scope.

**UI indicator:** Each settings tab and overriding field displays a small icon showing whether it is stored on the server (rack icon) or client (monitor icon). Icons only appear at "points of change" — top-level section headers and fields that override their parent's scope.

Client-scoped settings are stored in the user's profile document (`users` collection, `client_settings` field) via `GET/POST /api/auth/me/settings`. If the user database is unavailable, client settings silently fall back to empty defaults. To move a field to client-side storage, update its entry in `SETTINGS_SCOPE` to `'client'`.

### 1. SCRAM (Standard)
The default authentication method using URI-based credentials.
- **Config:** Set in `persistence.mongo.[app|customer].uri`.
- **Example:** `mongodb://user:pass@localhost:27017`

### 2. AWS IAM
Allows connection using AWS Identity and Access Management. Supports static keys, Assume Role, SSO, and the service's own ambient AWS identity.
- **Config:** Nested under `persistence.mongo.[role].auth`:
    - `method`: "aws"
    - `aws_auth_type`: "static", "role", "sso", or "ambient"
    - `aws_access_key`, `aws_secret_key`, `aws_session_token`
    - `aws_role_arn`, `aws_external_id`
- **Driver Logic:** Uses `MONGODB-AWS` mechanism.
- **Ambient mode:** When `aws_auth_type` is `"ambient"`, the service uses whichever AWS identity is already attached to its runtime (IRSA / EKS Pod Identity, EC2 instance profile, ECS task role). No credentials or Role ARN are configured in settings — MongoDB authenticates as the pod/container's own role, which must have access to the target cluster. Useful when the deployment is already scoped by IAM at the platform level.
- **SSO Support:** The application uses the AWS SDK device authorization flow (no CLI required):
    1. Configure SSO parameters (Start URL, Region, Account ID, Role Name) in the Persistence settings.
    2. Click **Login via AWS SSO** — the backend calls `RegisterClient` + `StartDeviceAuthorization` via the AWS SDK.
    3. A verification URL opens in a new tab for the user to authenticate via their IdP (e.g. Okta).
    4. The frontend polls `/api/aws/sso/poll` until the user authorizes. The backend then calls `CreateToken` + `GetRoleCredentials` to obtain temporary AWS credentials.
    5. Credentials (Access Key, Secret Key, Session Token) are auto-populated into the settings and saved.
    6. MongoDB connects using these static credentials — no AWS CLI profile or `~/.aws/sso/cache` needed.
- **No AWS CLI required:** The SSO flow is fully SDK-based. No `aws` CLI installation needed in the container.

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
