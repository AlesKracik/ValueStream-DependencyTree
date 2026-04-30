# User Guide & ValueStream Concepts

This guide provides a comprehensive overview of the ValueStream platform, organised by core entities, reporting capabilities, and system configuration.

---

## 0. Getting Started

### Starting the Application

Depending on your deployment environment, you can run the application in a few different ways:

- **Local Development (Node.js):**
  From the project root directory, run `npm run dev`. This will start both the Fastify backend API (port 4000) and the Vite frontend (port 5173). Access the app at `http://localhost:5173`.
- **Docker Compose (Development):**
  Run `docker-compose up --build`. Access the app at `http://localhost:5173`.
- **Docker Compose (Production):**
  Run `docker-compose -f docker-compose.prod.yml up -d --build`. This serves an optimised, compiled build via Nginx. Access the app at `http://localhost:80`.
- **Kubernetes:**
  Manifests are available in the `k8s/` directory for deploying MongoDB, the Fastify backend, and the Nginx web client into a cluster.

### Authentication

The platform is protected by a global `ADMIN_SECRET` environment variable.

![Login Page](images/login.png)

*   **Access:** Enter the administrative password to unlock the workspace.
*   **Session:** Your session is maintained via local storage. If you encounter "Unauthorized" errors, log in again or check your `ADMIN_SECRET` in the `.env` file or Kubernetes secret.

### Navigation

The sidebar provides access to all sections of the application:

1. **Value Streams** — Interactive graph visualisation
2. **Support** — Customer health monitoring with AI discovery
3. **Customers** — Account and TCV management
4. **Work Items** — Strategic initiative prioritisation
5. **Teams** — Engineering capacity and members
6. **Sprints** — Timeline management

Bottom links:
- **Settings** — System configuration
- **Documentation** — This guide

---

## 1. Entities

Entities are the foundational data models that drive the system. Each entity has a dedicated list view for broad management and a detail view for granular control.

### Customers

Customers represent the accounts, segments, or contract entities that provide value (TCV) to the organisation.

#### Customer List Page

The entry point for account management, providing a quick health check of the entire customer base.

![Customers List](images/customers-list.png)

*   **Columns:** Name, Existing TCV, Potential TCV.
*   **Sorting:** Order the list by Name or TCV metrics to identify top accounts.
*   **Filtering:** Instant-search across names to find specific accounts.
*   **Navigation:** Click any row to enter the detailed account workspace.

#### Customer Detail & Lifecycle

The detail page is the command centre for managing a specific account's lifecycle and alignment.

![Customer Detail](images/customer-detail.png)

*   **TCV Promotion Lifecycle:** The platform distinguishes between "Actual" (Existing) and "Target" (Potential) TCV.
    *   **Action — "Promote to Actual":** This workflow moves the current Potential TCV into the Actual slot, while automatically snapshotting the old Actual value into the **TCV History** ledger. This ensures a clean audit trail as contracts evolve.
*   **Management Actions:**
    *   **Update ID:** Set the internal Customer ID to enable automated MongoDB and Jira lookups.
    *   **Delete Customer:** Permanently remove the account and all its historical impact data from the workspace.

#### Management Tabs

The detail page uses a tabbed interface to organise complex data sets:

**Tab: Custom Fields**

![Customer Custom Fields](images/customer-detail-fields.png)

*   Displays bespoke customer data fetched in real-time from an external MongoDB collection using the Customer ID and the custom aggregation pipeline defined in **Settings > Persistence > Customer**.
*   Allows viewing nested structures, product clusters, or status fields directly within the portal.

**Tab: Targeted Work Items**

![Customer Targeted Work Items](images/customer-detail-workitems.png)

*   Defines which strategic initiatives are fulfilling the customer's value.
*   **Add Target:** Link a work item to this customer using the searchable dropdown.
*   **Refine ROI:** Choose if the work impacts the **Existing** contract (defensive/retention) or **Potential** growth (offensive/upsell).
*   **Historical Mapping:** For Existing TCV, link the work to a specific period from the TCV History.
*   **Priority Alignment:** Set the delivery tier (Must-have, Should-have, Nice-to-have) which influences the overall RICE score.

**Tab: TCV History**

![Customer TCV History](images/customer-detail-history.png)

*   An immutable, chronological audit trail created by the "Promote to Actual" lifecycle. Displays past values, start dates, and contract durations.
*   Manually remove historical entries if necessary.

**Tab: Support Health**

![Customer Support Health](images/customer-detail-support.png)

*   **Health Status Indicator:** A coloured dot in the tab label provides an instant health check based on the most serious Jira category:
    *   Red: New / Untriaged issues found.
    *   Yellow: Active Work in progress.
    *   Blue: Blocked / Pending issues.
*   **Manual Tracking:** Add localised support issues with descriptions, statuses, and expiration dates.
    *   **Available Statuses:** To Do, Work in Progress, No-op, Waiting for Customer, Waiting for Other Party, Done.
    *   **Auto-Expiration:** Moving an issue to **"Done"** automatically sets an expiration date 1 day in the future, after which the issue is automatically archived.
*   **Jira Integration:** Automatically sync tickets from Jira matching the customer's JQL (defined in Settings).
    *   **Linking:** Discovered Jira tickets can be linked to manual Support Issues to provide a unified view.

---

### Work Items

Work Items represent strategic initiatives, major feature sets, or roadmap themes.

#### Work Item List Page

A prioritisation dashboard for the product organisation.

![Work Items List](images/workitems-list.png)

*   **Columns:** Name, RICE Score, Effort (MDs), TCV, Status, Released Sprint.
*   **RICE Score:** Calculated as `(Total Impact TCV / Combined Effort MDs)`.
*   **Sorting:** Sort the list to identify high-ROI opportunities.

#### Work Item Detail

Define the "What" and the "How" of a strategic goal.

![Work Item Detail](images/workitem-detail.png)

*   **Define Scope:** Toggle the **"Global"** flag if the item benefits every customer (e.g., core infrastructure).
*   **Set Score Components:** Adjust "Baseline Effort" estimates if no issues are yet defined.
*   **Release Planning:** Select the target **Release Sprint** to place the item on the ValueStream timeline.

**Tab: Targeted Customers**

![Work Item Targeted Customers](images/workitem-detail-customers.png)

Define exactly which accounts this initiative is for. Choose the TCV type (Existing/Potential) and Priority (Must-have/Should-have/Nice-to-have) for each account to drive the RICE score. Toggle **"ALL CUSTOMERS (Global)"** to target the entire customer base.

**Tab: Issues & Engineering**

![Work Item Issues](images/workitem-detail-issues.png)

*   Break down strategy into deliverable technical units.
*   **Issue Linkage:** Add new Issues or link existing ones.
*   **Estimate Roll-up:** Set individual Man-Day estimates for each Issue. The Work Item's total effort is automatically updated.

**Tab: Aha! Integration** *(appears only when Aha! is configured in Settings)*

![Work Item Aha! Integration](images/workitem-detail-aha.png)

*   **Link Feature:** Enter an Aha! Reference Number (e.g., `PROD-123`) and click **Sync from Aha!** to pull feature data.
*   **Synced Information:** Displays the feature's Name, Description (HTML-rendered), Effort (MDs), and Product Value (the Aha! "score" field).
*   **Requirements:** Lists all requirements attached to the Aha! feature, each showing its reference number, name, and description.
*   **Apply to Work Item:** Overwrites the current Work Item's name, description, baseline effort, and product value with the values from Aha! (requires confirmation).

---

### Issues

The granular execution units that bridge Product strategy and Engineering delivery.

#### Issue Detail View

![Issue Detail](images/issue-detail.png)

*   **Name:** Descriptive title for the issue.
*   **Work Item:** Searchable dropdown to assign the parent Work Item (or "Unassigned").
*   **Jira Key:** Link to Jira and click **Sync from Jira** to pull real-time Status, Summary, and Effort estimates.
*   **Target Start / End:** Set dates for timeline placement. Missing dates show a warning icon in the graph.
*   **Total Effort (MDs):** Manual effort estimate in man-days.

**Tab: Sprint Effort Distribution**

![Issue Sprint Effort Distribution](images/issue-detail-effort.png)

*   View and override how effort is allocated across the issue's timeline.
*   **Columns:** Sprint, Dates, Context (Quarter), Team Capacity, Effort (MDs).
*   **Manual Overrides:** Click any effort cell to set a manual value. Overridden values are highlighted in bold blue. Click the **X** button to revert to the proportional calculation.
*   **Team Capacity:** Shows effective capacity with holiday impact indicated by a holiday emoji and negative MDs (e.g., `🏖️ -2`). Overridden sprint capacities are labelled "(Override)".
*   **Historical Auto-Freeze:** Sprints older than the active sprint are automatically frozen. If an issue has effort in a past sprint but no manual override, the system snapshots the current calculation as a permanent override to prevent historical data from shifting.

---

### Teams & Capacity

Engineering teams are the delivery engines, each with a defined velocity.

#### Team Detail

![Team Detail](images/team-detail.png)

**Tab: General**

*   **Team Name:** Identifier for the team.
*   **Total Capacity (MDs per Sprint):** Base man-days available per sprint.
*   **Country (for Holidays):** Dropdown to set the team's location. Public holidays in the selected country automatically reduce sprint capacity. Available: Default (No Holidays), United States, United Kingdom, Germany, Czech Republic, Romania.

**Tab: Capacity Overrides**

![Team Capacity Overrides](images/team-detail-capacity.png)

*   View effective capacity per sprint with automatic holiday adjustments.
*   **Columns:** Sprint, Dates, Standard Work Days, Effective Capacity (MDs).
*   **Work Days:** Shows the count of business days, with holidays indicated (e.g., `🏖️ -1`).
*   **Manual Overrides:** Click any capacity cell to set a manual value. Overridden values are highlighted in bold blue. Click the **X** button to revert to the calculated capacity.

**Tab: Members**

![Team Members](images/team-detail-members.png)

*   Inline CRUD for team members.
*   **Fields:** Name, Username (unique identifier / LDAP merge key), Capacity % (default: 100).
*   **Actions:** Add Member, Edit (inline), Remove.

#### LDAP Member Sync

When LDAP is configured in **Settings > LDAP** (General & Team subtabs), an additional **LDAP Team Name** field appears at the top of the Members tab.

**Sync Workflow:**
1.  Enter the LDAP group name that corresponds to this team (e.g., `engineering`).
2.  Click **Sync from LDAP** to query the configured LDAP server for group members.
3.  The system automatically **merges** LDAP results with existing members using username as the key:
    *   **Existing members** retain their current Capacity %.
    *   **New members** (found in LDAP but not yet listed) are added with 100% capacity.
    *   **Removed members** (listed locally but no longer in the LDAP group) are removed.
4.  A result banner shows the sync outcome (e.g., "3 kept, 1 added, 2 removed").

---

### Sprints

The temporal framework that aligns the organisation.

![Sprints List](images/sprints-list.png)

*   **Quarterly Grouping:** Sprints are automatically grouped by fiscal quarters for better long-term planning.
*   **Statuses:**
    *   **Active:** The current ongoing sprint (highlighted in accent colour).
    *   **Past / Future:** Historical or upcoming periods.
*   **Locking Logic:** To maintain timeline integrity, only the **earliest past** sprint (for archiving) or the **latest future** sprint (for deletion) can be modified. All other sprints show a "Locked" indicator.
*   **Creation:** **"+ Create Next Sprint"** automatically calculates the next period based on the configured sprint duration. A draft form appears with auto-calculated name and dates.
*   **Archiving:** Archived sprints are hidden from the Sprint list and the ValueStream Gantt chart but remain in the database.

---

## 2. Reports & Custom Views

### The Interactive Value Stream

The platform's primary visualisation, mapping value from source to delivery.

#### Value Stream Scopes (Custom Views)

![ValueStream List](images/valuestream-list.png)

Instead of one global view, you can create multiple **Value Stream Scopes**. These are saved configurations that allow you to focus on specific segments of the organisation or roadmap.

*   **Custom Persistence:** Save specific filters to create focused dashboards (e.g., "Mobile Team Path", "Top 10 Customers", "Q3 Roadmap").
*   **Time Ranges:** Limit the scope to a specific **Start** and **End Sprint** (or "Beginning of time" / "End of time").
*   **Structural Filters:** Pre-define filters for:
    *   **Names:** Customer, Work Item, Team, or Issue search strings.
    *   **Release Status:** All Items, Released Only, or Unreleased Only.
    *   **Impact Thresholds:** Set minimum **TCV Impact ($)** or **RICE Score** to filter out noise and focus on high-value initiatives.

#### The Live Graph Visualisation

![ValueStream Graph View](images/ValueStream.png)

The Live Graph is a multi-layered dependency tree that maps demand (Customers) to execution (Issues) over a temporal Gantt timeline.

##### 1. Node Anatomy & Visual Cues

*   **Customers (Root Nodes):**
    *   **Dual-Layer Circles:** The inner solid circle represents **Actual TCV** (Existing contracts), while the outer dashed ring represents **Potential TCV** (Growth/Pipeline).
    *   **Size Scaling:** Node diameter is proportional to the customer's total revenue impact relative to the workspace maximum.
    *   **Dynamic Highlighting:** Hovering a customer dims unrelated paths and can highlight specifically the "Actual" or "Potential" path depending on the connection type.

*   **Work Items (Strategy Nodes):**
    *   **RICE Score:** Centred in the node, representing the calculated ROI.
    *   **Warning Indicators:**
        *   🌐 **Global:** This item impacts all existing customers.
        *   📦 **Released:** The item is already delivered in a past/active sprint.
        *   🕒 **Missing Dates:** One or more linked Issues lack target start/end dates.
        *   📏 **No Effort:** Effort is not yet estimated (0 MDs).

*   **Teams (Capacity Nodes):**
    *   **Baseline Capacity:** Shows total team velocity.
    *   **Size Scaling:** Nodes represent the team's total capacity relative to other teams.

*   **Gantt Bars (Execution Nodes / Issues):**
    *   **Heat/Intensity Mapping:** Bars are segmented by sprint. A segment's brightness indicates if the effort allocated to that sprint is higher or lower than the uniform baseline.
    *   **Frozen History:** Segments in the past (before the active sprint) are marked with a diagonal stripe pattern and are automatically snapshotted to preserve historical accuracy.
    *   **Status Colours:** Issues are Slate Blue (Past) or Purple (Future/Active).

*   **Sprint Capacity (Timeline Header):**
    *   **Visual Health:** Sprint headers change colour based on team utilisation:
        *   Red: Overallocated (>100% capacity).
        *   Green: Allocated (0–100% capacity).
        *   Grey: Empty (0 MDs).
    *   **Context Icons:** 🔒 (Manual override), 🏝️ (Public holidays impact included).

##### 2. Interactive Controls & Navigation

*   **Navigation & Viewport:**
    *   **Timeline Shifting:** Use the `<` and `>` buttons in the header to slide the Gantt view across sprints.
    *   **Reset View:** Instantly scrolls to the top of the graph and aligns the viewport with the **Active Sprint**.
    *   **Left-Click:** Navigate to the detail page of any Customer, Work Item, Team, or Issue.

*   **Drill-Down & Tracing:**
    *   **Hover Tracing:** Hover any node to trace its upstream (demand) and downstream (execution) dependencies. All unrelated nodes are dimmed.
    *   **Right-Click (Drill-Down):** Isolate a specific node. The graph filters to show *only* the dependency tree connected to that node. Right-click the background to reset the filter.

*   **Direct Manipulation:**
    *   **Drag-to-Resize:** Modify Issue timelines directly by dragging the left or right edges of a Gantt bar.
    *   **Timeline Constraints:** Shifting work into the past or changing historical dates will trigger a warning if existing effort data exists for those periods.

##### 3. Strategic Indicators

*   **Edge Thickness:**
    *   **Demand (Customer → Work Item):** Thickness represents the ROI of the connection (TCV / Work Item Effort).
    *   **Execution (Work Item → Team):** Thickness represents the relative effort (Man-Days) required by that specific Issue.
*   **Dependency Tracing:** Explicit Issue-to-Issue dependencies (Finish-to-Start or Finish-to-Finish) are shown as animated orange lines, highlighting critical paths and potential bottlenecks.

---

### Support Health

A bird's-eye view of account stability across the customer base.

![Support Health](images/support-health.png)

*   **Ranking:** Issues are sorted by the **Customer's TCV Rank**, prioritising high-revenue accounts.
*   **Columns:** Customer, TCV Category (💰), Activity, Description, Status.
*   **Activity:** "New" (green badge) or "Updated" (blue badge) indicates items created or updated today.
*   **TCV Category:** Displayed as 💰 emojis (1–3) based on combined TCV tiers.
*   **Linked Jira Issues:** Shown as clickable badges below the description with ticket key and status.
*   **Create Issue:** Inline form to add a new support issue — select Customer, enter Description, set Status.

#### AI-Powered Support Discovery

![AI Support Discovery](images/support-ai-discovery.png)

When an AI provider is configured in **Settings > AI & LLM**, the Support page gains an **AI Support Search** button that uses your configured LLM to automatically discover customer issues.

**Workflow:**
1.  Click **AI Support Search** (or **Connect Glean** first if using the Glean provider).
2.  The system sends the discovery prompt (configurable in Settings > AI & LLM > Support) to the selected LLM provider.
3.  A real-time streaming display shows the AI response as it arrives.
4.  The AI analyses results and returns structured issue data matching customers by name or ID.

**Results:**
*   Each discovered issue shows: **Summary**, **Impact**, **Root Cause**, and associated **Jira tickets**.
*   **Customer Matching:** A green "MATCHED" or red "NO MATCH" badge indicates whether the AI-identified customer was found in the system.
*   **Actions per issue:**
    *   **Dismiss** — Remove the issue from results.
    *   **Create New** — Create a new support issue in the matched customer.
    *   **Update existing...** — Append the AI analysis to an existing support issue (dropdown).

---

## 3. Settings & System

### System Configuration

![Settings Page](images/settings.png)

The Settings page provides six configuration tabs.

Each tab and field may display a small **scope icon** indicating where that setting is stored:
-   **Server icon** (rack): The value is stored and managed on the backend.
-   **Client icon** (monitor): The value is stored locally in your browser.

Icons only appear at the point where the scope is defined — on tab headers and on individual fields that differ from their section's default scope. Server settings are shared across all users; client settings (e.g. theme) are stored per-user in your profile and follow you across devices.

#### General Project

![Settings - General Project](images/settings-general.png)

*   **Colour Palette:** Switch between **Dark mode** and **Filips mode** (high-contrast pastel, designed for readability in bright environments).
*   **Fiscal Year Start Month:** Align quarter groupings to your organisation's calendar (January–December).
*   **Sprint Duration (Days):** Default duration for newly created sprints (typically 14).

#### Persistence (Multi-Role)

![Settings - Persistence](images/settings-persistence.png)

*   **Application DB:** Where ValueStream stores its internal entities. Configure the MongoDB URI, database name, and authentication method.
*   **Customer DB:** Connect to your production/external MongoDB to fetch "Custom Fields" via JSON aggregation pipelines.
*   **Authentication Methods:**
    *   **SCRAM (Standard):** URI-based credentials (e.g., `mongodb://user:pass@host:27017`).
    *   **AWS IAM:** Static keys or Assume Role. Includes integrated **AWS SSO** support:
        1.  Select **AWS IAM** auth method, then **SSO** sub-type.
        2.  Configure SSO Start URL, Region, Account ID, and Role Name.
        3.  Click **Login via AWS SSO** — a verification URL opens for IdP authentication.
        4.  After authorization, temporary credentials are automatically populated and saved.
    *   **OIDC:** Bearer token authentication via external identity providers.
*   **Proxy:** Enable per-connection SOCKS5 proxy for databases behind SSH bastions.
*   **Test Connection:** Validate connectivity and list databases.
*   **Import / Export:** Export the entire database as portable JSON, or import from a previous export.

#### Jira Integration

![Settings - Jira Integration](images/settings-jira.png)

*   **Common:** Jira Base URL, API Version, and Personal Access Token (PAT). Includes a **Test Connection** tool.
*   **Issues:** Tools for bulk operations:
    *   **Import from Jira:** Execute a custom JQL query and create new Issues (and potentially Work Items) in the local database.
    *   **Sync Issues from Jira:** Iterate through all local issues with a `jira_key` and refresh their metadata.
*   **Customer:** Define JQL queries to automatically identify and track specific issue types linked to customers using the `{{CUSTOMER_ID}}` placeholder. Three categories: New (Untriaged), In-Progress, and No-op (Blocked/Pending).

#### Aha! Integration

![Settings - Aha! Integration](images/settings-aha.png)

*   **Aha! Subdomain:** Your company's Aha! subdomain (e.g., `your-company` for `your-company.aha.io`).
*   **Aha! API Key:** Personal Access Token (masked input).
*   **Test Connection:** Validates connectivity by querying the Aha! API.

Once configured, Work Item detail pages gain an **Aha! Integration** tab for linking and syncing features.

#### AI & LLM

![Settings - AI & LLM](images/settings-ai.png)

**General subtab:**

*   **LLM Provider:** Select the active provider — OpenAI, Google Gemini, Anthropic, Augment CLI, or Glean.
*   **Provider-specific fields:**
    *   **OpenAI / Gemini / Anthropic:** API Key and optional Model override.
    *   **Augment CLI:** Session Auth token.
    *   **Glean:** Instance URL (e.g., `https://company-be.glean.com`) and a **Connect Glean** button to initiate the OAuth2 authentication flow. A green "Connected" indicator shows when authenticated.

**Support subtab:**

*   **AI Support Discovery Prompt:** Customisable prompt (monospace textarea) sent to the LLM when running AI Support Search.
*   **Required Schema:** Read-only display of the JSON schema that the AI response must match, ensuring structured issue extraction.

#### LDAP

![Settings - LDAP](images/settings-ldap.png)

*   **General:** LDAP Server URL, Bind DN, and Bind Password (encrypted via SecretManager).
*   **Team:** Base DN for group searches and a Search Filter template. Use the `{{LDAP_TEAM_NAME}}` placeholder in the filter — it is replaced at runtime with the team's configured LDAP group name (e.g., `(cn={{LDAP_TEAM_NAME}})`).

Once configured, Team detail pages gain an **LDAP Team Name** field and a **Sync from LDAP** button in the Members tab.

#### Authentication

*   **Method:** Choose how users authenticate:
    *   **Local accounts** — username/password stored in the application database.
    *   **LDAP bind** — authenticates against the LDAP server (configured in the LDAP tab).
    *   **AWS SSO** — device-based SSO authentication through AWS (piggybacks on existing Okta/IdP setup without admin involvement).
    *   **Okta** — standard OIDC/OAuth2 login via Okta (requires Okta admin to register the app).
*   **Default role for new users:** The role assigned to auto-provisioned users (LDAP/AWS SSO). Options: Viewer (read-only), Editor (can modify entities), Admin (full access).
*   **Session expiry:** How long a login session lasts before re-authentication is needed.
*   **AWS SSO Configuration** (when AWS SSO is selected): SSO Start URL, AWS Region, Account ID, and Role Name. Only users who can assume the configured role get access.
*   **Users table:** View all registered users, change roles, or delete users (admin only).

---

### Theming & Accessibility

**Available Modes:**
-   **Dark mode:** Standard high-contrast interface.
-   **Filips mode:** A "muted dim" theme using soft slate-grey and pastel colours, designed for readability in bright environments.

Configure in **Settings > General Project > Colour Palette**.
