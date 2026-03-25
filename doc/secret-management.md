# Secret Management

## Overview

Sensitive configuration values (API tokens, database URIs, AWS credentials) are stored encrypted at rest using the `SecretManager` service, separate from non-sensitive settings in `settings.json`.

## Architecture

```
settings.json (non-secrets: theme, URLs, DB names, sprint config)
     +
settings.secrets.enc (AES-256-GCM encrypted: tokens, URIs, keys)
     =
Full settings (merged at runtime via getFullSettings())
```

### Provider Selection (automatic)

| Priority | Condition | Provider | Use Case |
|----------|-----------|----------|----------|
| 1 | `VSDT_SECRET_*` env vars exist | `EnvProvider` | Kubernetes |
| 2 | `ADMIN_SECRET` env var set | `EncryptedFileProvider` | Local, Docker |
| 3 | Neither | `NoOpProvider` | Dev without auth |

### Encryption Details

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Derivation**: PBKDF2 with SHA-512, 100,000 iterations
- **Salt**: Random 32 bytes, stored per file
- **IV**: Random 16 bytes, regenerated on every write
- **Master Key**: `ADMIN_SECRET` environment variable

### File Format (`settings.secrets.enc`)

```json
{
  "version": 1,
  "salt": "<base64>",
  "iv": "<base64>",
  "tag": "<base64>",
  "ciphertext": "<base64>"
}
```

Decrypted content is a flat key-value map using dot-path keys:

```json
{
  "persistence.mongo.app.uri": "mongodb+srv://user:pass@cluster/db",
  "jira.api_token": "pat-abc123",
  "ai.api_key": "sk-..."
}
```

## Sensitive Fields

Defined in `backend/src/utils/configHelpers.ts` as `SENSITIVE_FIELDS`:

`api_token`, `uri`, `aws_access_key`, `aws_secret_key`, `aws_session_token`, `oidc_token`, `api_key`, `access_token`, `refresh_token`, `client_secret`, `registration_access_token`, `bind_password`

Non-secret AWS config fields (`aws_profile`, `aws_role_arn`, `aws_sso_start_url`, `aws_sso_region`, `aws_sso_account_id`, `aws_sso_role_name`, `aws_external_id`, `aws_role_session_name`) remain in plain-text `settings.json`.

## Data Flow

### Read (GET /api/settings)

```
getFullSettings()
  ├── readSettingsFile()       → settings.json (non-secrets)
  ├── SecretManager.getAll()   → decrypted secrets
  └── mergeSecrets()           → complete settings object
       └── maskSettings()      → replace secrets with ********
            └── send to UI
```

### Write (POST /api/settings)

```
UI sends settings (with ******** for unchanged secrets)
  └── unmaskSettings(newData, getFullSettings())  → restore unchanged secrets
       └── saveFullSettings(unmasked)
            ├── extractSecrets()   → flat secret map
            ├── stripSecrets()     → config without secrets
            ├── write settings.json (config only)
            └── SecretManager.setAll(secrets) → encrypt and write .enc file
```

## Migration

On first startup after upgrade, `migrateSecretsFromSettingsFile()` automatically:

1. Reads `settings.json` for any remaining secrets
2. Extracts them to the SecretManager (encrypted file)
3. Rewrites `settings.json` without secrets

This is idempotent — runs safely on every startup.

## Deployment

### Local (Native)

No additional setup needed. Secrets are encrypted using `ADMIN_SECRET` from `.env`.

### Docker

`docker-compose.yml` bind-mounts both files for persistence:

```yaml
volumes:
  - ./backend/settings.json:/app/backend/settings.json
  - ./backend/settings.secrets.enc:/app/backend/settings.secrets.enc
```

### Kubernetes

**Option A: Encrypted file (default)**

Mount `ADMIN_SECRET` from K8s Secrets. The encrypted file persists via a PersistentVolumeClaim.

**Option B: Environment variables**

Set secrets as `VSDT_SECRET_*` env vars from K8s Secrets. This bypasses the encrypted file entirely.

```yaml
# k8s/secrets.example.yaml
stringData:
  ADMIN_SECRET: "your-admin-secret"
  VSDT_SECRET_PERSISTENCE_MONGO_APP_URI: "mongodb+srv://..."
  VSDT_SECRET_JIRA_API_TOKEN: "pat-..."
```

Env var naming convention: `VSDT_SECRET_` + dot-path in UPPER_SNAKE_CASE.

Example: `persistence.mongo.app.uri` → `VSDT_SECRET_PERSISTENCE_MONGO_APP_URI`

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/services/secretManager.ts` | SecretManager service, providers, getFullSettings(), saveFullSettings(), migration |
| `backend/src/utils/configHelpers.ts` | SENSITIVE_FIELDS, mask/unmask, extractSecrets, stripSecrets, mergeSecrets |
| `backend/settings.secrets.enc` | Encrypted secrets file (gitignored) |
| `backend/settings.json` | Non-secret configuration (gitignored) |

## Changing ADMIN_SECRET

If `ADMIN_SECRET` changes, the existing `settings.secrets.enc` cannot be decrypted. To handle this:

1. Before changing `ADMIN_SECRET`, note current secret values (visible in Settings UI)
2. Delete `settings.secrets.enc`
3. Update `ADMIN_SECRET` in `.env`
4. Restart the backend — secrets from `settings.json` (if any) will auto-migrate
5. Re-enter any secrets via the Settings UI
