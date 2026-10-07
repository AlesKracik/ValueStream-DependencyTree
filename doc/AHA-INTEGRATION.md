# Aha! Integration

## Overview

The application integrates with [Aha!](https://www.aha.io/) to fetch product roadmap features by reference number. This allows linking Work Items to their corresponding Aha! features for traceability.

## Configuration

Settings are stored under the `aha` key:

| Field | Description |
|-------|-------------|
| `subdomain` | Your Aha! account subdomain (e.g. `your-company` for `your-company.aha.io`) |
| `api_key` | Personal API key (Bearer token) |

Configured in the UI via **Settings > Aha!** tab.

### Obtaining an API Key

1. Log in to your Aha! account.
2. Navigate to **Settings > Account > API** (or visit `https://<subdomain>.aha.io/settings/api_keys`).
3. Generate a new Personal Access Token.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/aha/test` | Validates connection by listing features |
| `POST` | `/api/aha/feature` | Fetches a specific feature by `reference_num` |
| `POST` | `/api/aha/features` | Lists every feature of a workspace (product), with full feature fields |
| `POST` | `/api/aha/epic` | Fetches a specific epic by `reference_num` |
| `POST` | `/api/aha/epics` | Lists every epic of a workspace (product), with full fields |

### Test Connection

Sends a GET request to `https://{subdomain}.aha.io/api/v1/features` with the API key. Returns `{ success: true }` on valid credentials.

### Fetch Feature

Fetches `https://{subdomain}.aha.io/api/v1/features/{reference_num}`. Returns the full Aha! feature object. Returns 404 if the reference number is not found.

## Work Item Link and Ownership

A work item links to an Aha! feature through `links.aha` (an `ExternalLink`):
`key` is the reference number the user typed, `external_id` the Aha! feature id
(set once the feature is synced), and `data` the last synced values (name,
HTML description, Product Value `score`, informational `estimate_mds`,
requirements).

- Once synced (`external_id` set), the work item's **origin** is `aha` and Aha!
  owns its `name` and `description`: the server copies them from the synced data
  on every write and rejects local edits to them. Effort stays local engineering
  data. See [WORKITEMS.md](WORKITEMS.md#origin-and-source-owned-fields).
- **Sync from Aha!** refreshes `links.aha` (keeping the key as typed) and thereby
  the owned fields.
- **Delete** removes the link; the work item keeps its current values and becomes
  `local`.

### Import Matching

**Settings > Aha! > Import** matches each imported feature to an existing work
item by `links.aha.external_id` first, then by an unsynced `links.aha.key`
(case-insensitive). A match gets the refreshed link; an unmatched feature becomes
a new `Backlog` work item with origin `aha`.

The import counts are reported per kind (epics, features). Import and sync never clear stored data that a response lacks. When the new link
points at the same feature as the stored one (same `external_id`), its `data` is
merged onto the stored `links.aha.data` field by field: a field missing from the
response keeps its stored value, while a field that is present always overwrites,
even with `null`, `''` or `0`. Effort is never taken from Aha!. **Sync all** refreshes every work item
that has a `links.aha.key`.

### Epics

Aha! **epics** are what some Aha! workspaces call **feature sets** (Aha! lets a
workspace rename its record types; the REST API always says epics). Epics are
fetched like features: `GET /api/v1/epics/{reference_num}` for one, and
`GET /api/v1/products/{workspace}/epics` with
`fields=id,reference_num,name,url,score,description,original_estimate` for the
import. Aha! numbers epics `PREFIX-E-N` (e.g. `DR-E-12`).

> Aha! terms only. Aha! epics are unrelated to Jira's Epic level or to Jira's
> Parent Link hierarchy; in this app both meet only through the generic
> work item `parent_id`.

### List Features (Import)

Fetches `https://{subdomain}.aha.io/api/v1/products/{workspace}/features` page by page
(`per_page=200`, at most 50 pages). Aha!'s list endpoint returns only summary fields
by default, so the request passes
`fields=id,reference_num,name,url,score,description,original_estimate,requirements,epic`:
every field the import reads, so an imported feature carries the same data as a
per-feature sync (Product Value, HTML description, estimate, requirements).

## Epics and the Work Item Hierarchy

- An Aha! epic is imported as a work item like a feature (`links.aha.record_type:
  'epic'`, origin `aha`, Aha! owns its name and description). It has no
  requirements, and Aha! initiatives above epics are not brought over, so an
  epic's own parent stays local.
- A feature's link records its epic (`links.aha.data.epic_id`, `null` when it has
  none). Not every feature has an epic, and that is fine.
- **A feature in an epic:** Aha! owns its `parent_id`: the work item linked to
  the epic (none while that epic isn't a work item here yet). The server derives
  it on every write and rejects a PATCH that sets a different parent (400); the
  Hierarchy tab shows it read-only, and Jira's hierarchy alignment skips such
  work items.
- **A feature without an epic:** its parent stays local — empty by default, and
  editable like any work item's. When a feature is taken out of its epic in
  Aha!, the next sync moves it out of that epic's work item (parent cleared); a
  parent that doesn't point at the old epic's work item is kept.
- **Import** fetches epics first, then features, so each feature finds its
  epic's work item. **Sync all** also syncs epics before features, so a feature
  moved to another epic in Aha! moves to that epic's work item. A per-item Sync
  uses the epic endpoint for an epic.

## Data Flow

```mermaid
sequenceDiagram
    participant UI as Browser
    participant BE as Fastify Backend
    participant Aha as Aha! API

    UI->>BE: POST /api/aha/feature {reference_num: "PROD-123"}
    BE->>Aha: GET /api/v1/features/PROD-123
    Aha-->>BE: Feature JSON
    BE-->>UI: {success: true, feature: {...}}
```
