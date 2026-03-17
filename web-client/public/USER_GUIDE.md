# 📖 User Guide & ValueStream Concepts

This guide provides a comprehensive overview of the ValueStream platform, organized by core entities, reporting capabilities, and system configuration.

---

## 🔐 0. Getting Started

### Starting the Application
Depending on your deployment environment, you can run the application in a few different ways:

- **Local Development (Node.js):**
  From the project root directory, run `npm run dev`. This will start both the Fastify backend API (port 4000) and the Vite frontend (port 5173). Access the app at `http://localhost:5173`.
- **Docker Compose (Development):**
  Run `docker-compose up --build`. Access the app at `http://localhost:5173`.
- **Docker Compose (Production):**
  Run `docker-compose -f docker-compose.prod.yml up -d --build`. This serves a highly optimized, compiled build via an Nginx web server. Access the app at `http://localhost:80`.
- **Kubernetes:**
  Manifests are available in the `k8s/` directory for deploying the MongoDB database, Fastify backend, and Nginx web client into a cluster.

### Authentication
The platform is protected by a global `ADMIN_SECRET` environment variable. 

![Login Page](images/settings.png) *Note: Image placeholder for login*

*   **Access:** Enter the administrative password to unlock the workspace.
*   **Session:** Your session is maintained via local storage. If you encounter "Unauthorized" errors, please log in again or check your `ADMIN_SECRET` in the `.env` file or Kubernetes secret.

---

## 1. Entities

Entities are the foundational data models that drive the system. Each entity has a dedicated list view for broad management and a detail view for granular control.

### 👤 Customers

Customers represent the accounts, segments, or contract entities that provide value (TCV) to the organization.

#### Customer List Page
The entry point for account management, providing a quick health check of the entire customer base.

![Customers List](images/customers-list.png)

**Details:**
*   **Intention:** High-level directory for financial impact assessment and account discovery.
*   **Visibility:** 
    *   **Name:** Customer identity.
    *   **Existing TCV:** Realized contract value currently active.
    *   **Potential TCV:** Pipeline value or targeted upsell opportunities.
*   **Actions:** 
    *   **Sorting:** Order the list by Name or TCV metrics to identify top accounts.
    *   **Filtering:** Instant-search across names to find specific accounts.
    *   **Navigation:** Click any row to enter the detailed account workspace.

#### Customer Detail & Lifecycle
The detail page is the command center for managing a specific account's lifecycle and alignment.

![Customer Detail](images/customer-detail.png)

**Details:**
*   **Intention:** Precise management of contract states and strategic delivery.
*   **TCV Promotion Lifecycle:** The platform distinguishes between "Actual" (Existing) and "Target" (Potential) TCV. 
    *   **Action - "Promote to Actual":** This workflow moves the current Potential TCV into the Actual slot, while automatically snapshotting the old Actual value into the **TCV History** ledger. This ensures a clean audit trail as contracts evolve.
*   **Management Actions:** 
    *   **Update ID:** Set the internal Customer ID to enable automated MongoDB and Jira lookups.
    *   **Delete Customer:** Permanently remove the account and all its historical impact data from the workspace.

#### Management Tabs
The detail page uses a tabbed interface to organize complex data sets:

**Tab: Custom Fields**

![Customer Custom Fields](images/customer-detail-fields.png)

*   **Intention:** Viewing bespoke customer data without duplicating it into the ValueStream database.
*   **Visibility:** Fetches real-time data from an external MongoDB collection using the Customer ID and the custom aggregation pipeline defined in **Settings > Persistence > Customer**.
*   **Interaction:** View nested structures, product clusters, or status fields directly within the portal.

**Tab: Targeted Work Items**

![Customer Targeted Work Items](images/customer-detail-workitems.png)

*   **Intention:** Defining which strategic initiatives are fulfilling the customer's value.
*   **Actions:** 
    *   **Add Target:** Link a work item to this customer using the searchable dropdown.
    *   **Refine ROI:** Choose if the work impacts the **Existing** contract (defensive/retention) or **Potential** growth (offensive/upsell).
    *   **Historical Mapping:** For Existing TCV, link the work to a specific period from the TCV History.
    *   **Priority Alignment:** Set the delivery tier (Must-have, Should-have, Nice-to-have) which influences the overall RICE score.

**Tab: TCV History**

![Customer TCV History](images/customer-detail-history.png)

*   **Visibility:** An immutable, chronological audit trail created by the "Promote to Actual" lifecycle. Displays past values, start dates, and contract durations.
*   **Actions:** Manually remove historical entries if necessary.

**Tab: Support Health**

![Customer Support Health](images/customer-detail-support.png)

*   **Intention:** Real-time risk monitoring for the account.
*   **Health Status Indicator:** A colored dot in the tab label provides an instant health check based on the most serious Jira category:
    *   🔴 **Red:** New / Untriaged issues found.
    *   🟡 **Yellow:** Active Work in progress.
    *   🔵 **Blue:** Blocked / Pending issues.
*   **Manual Tracking:** Add localized support issues with descriptions, statuses, and expiration dates.
    *   **Available Statuses:** *To Do, Work in Progress, Noop, Waiting for Customer, Waiting for Other Party, Done*.
    *   **Auto-Expiration:** Moving an issue to the **"Done"** status automatically sets an expiration date 5 days in the future, after which the issue is automatically archived.
*   **Jira Integration:** Automatically sync tickets from Jira matching the customer's JQL (defined in Settings).
    *   **Linking:** Discovered Jira tickets can be linked to manual Support Issues to provide a unified view.

---

### 🚀 Work Items

Work Items represent strategic initiatives, major feature sets, or roadmap themes.

#### Work Item List Page
A prioritization dashboard for the product organization.

![Work Items List](images/workitems-list.png)

**Details:**
*   **Intention:** ROI-driven prioritization using the RICE framework.
*   **Visibility:** 
    *   **RICE Score:** Calculated as `(Total Impact TCV / Combined Effort MDs)`.
    *   **Effort (MDs):** Total man-days required, rolling up from connected Issues or the baseline manual estimate.
    *   **Release Target:** The specific sprint where this item is delivered.
*   **Actions:** Sort the list to identify high-ROI opportunities.

#### Work Item Scope & Execution
Define the "What" and the "How" of a strategic goal.

![Work Item Detail](images/workitem-detail.png)

**Details:**
*   **Actions:** 
    *   **Define Scope:** Toggle the **"Global"** flag if the item benefits every customer (e.g., core infrastructure).
    *   **Set Score Components:** Adjust "Baseline Effort" estimates if no issues are yet defined.
    *   **Release Planning:** Select the target **Release Sprint** to place the item on the ValueStream timeline.

**Tab: Targeted Customers**
Define exactly which accounts this initiative is for. Choose the TCV type (Existing/Potential) for each account to drive the RICE score.

**Tab: Issues & Engineering**

![Work Item Issues](images/workitem-detail-issues.png)

*   **Intention:** Breaking down strategy into deliverable technical units.
*   **Actions:** 
    *   **Issue Linkage:** Add new Issues or link existing ones. 
    *   **Estimate Roll-up:** Set individual Man-Day estimates for each Issue. The Work Item's total effort is automatically updated.

---

### 📦 Issues

The granular execution units that bridge Product strategy and Engineering delivery.

#### Issue Detail View

![Issue Detail](images/issue-detail.png)

**Details:**
*   **Jira Sync:** Link a **Jira Key** and click **"Sync from Jira"** to pull real-time Status, Summary, and Effort estimates.
*   **Timeline Control:** Set Target Start/End dates. If these are missing, the issue will show a ⚠️ warning icon.
*   **Sprint Effort Distribution:** View and override how effort is allocated across the timeline. Overridden values are highlighted in bold blue.

---

### 👥 Teams & Capacity

Engineering teams are the delivery engines, each with a defined velocity.

#### Team Detail & Capacity Management

![Team Detail](images/team-detail.png)

**Details:**
*   **Baseline Capacity:** Set the default MDs per sprint.
*   **Dynamic Overrides:** Click any sprint in the capacity list to set a manual override (e.g., for holidays). Overridden values are marked with a 🔒 icon.

---

### 📅 Sprints

The temporal framework that aligns the organization.

![Sprints List](images/sprints-list.png)

**Details:**
*   **Intention:** Maintaining a continuous, gap-free delivery timeline.
*   **Quarterly Grouping:** Sprints are automatically grouped by fiscal quarters for better long-term planning.
*   **Statuses:**
    *   **Active:** The current ongoing sprint (highlighted in blue).
    *   **Past/Future:** Historical or upcoming periods.
*   **Locking Logic:** To maintain timeline integrity, only the **earliest past** sprint (for archiving) or the **latest future** sprint (for deletion) can be modified. Intermediate sprints are locked.
*   **Creation:** **"+ Create Next Sprint"** automatically calculates the next period based on the duration setting.

---

## 2. Reports & Custom Views

### 🗺️ The Interactive Value Stream

The platform's primary visualization, mapping value from source to delivery.

#### Value Stream Scopes (Custom Views)

![ValueStream List](images/valuestream-list.png)

Instead of one global view, you can create multiple **Value Stream Scopes**. These are saved configurations that allow you to focus on specific segments of the organization or roadmap.

*   **Custom Persistence:** Save specific filters to create focused dashboards (e.g., "Mobile Team Path", "Top 10 Customers", "Q3 Roadmap").
*   **Time Ranges:** Limit the scope to a specific **Start** and **End Sprint** to visualize specific fiscal quarters or release cycles.
*   **Structural Filters:** Pre-define filters for:
    *   **Names:** Customer, Work Item, Team, or Issue search strings.
    *   **Release Status:** Filter by "Released Only" or "Unreleased Only".
    *   **Impact Thresholds:** Set minimum **TCV Impact** ($) or **RICE Score** to filter out noise and focus on high-value initiatives.

#### The Live Graph Visualization

![ValueStream View](images/ValueStream.png)

The Live Graph is a multi-layered dependency tree that maps demand (Customers) to execution (Issues) over a temporal Gantt timeline.

##### 1. Node Anatomy & Visual Cues

*   **👤 Customers (Root Nodes):**
    *   **Dual-Layer Circles:** The inner solid circle represents **Actual TCV** (Existing contracts), while the outer dashed ring represents **Potential TCV** (Growth/Pipeline).
    *   **Size Scaling:** Node diameter is proportional to the customer's total revenue impact relative to the workspace maximum.
    *   **Dynamic Highlighting:** Hovering a customer dims unrelated paths and can highlight specifically the "Actual" or "Potential" path depending on the connection type.

*   **🚀 Work Items (Strategy Nodes):**
    *   **RICE Score:** Centered in the node, representing the calculated ROI.
    *   **Warning Indicators:**
        *   🌐 **Global:** This item impacts all existing customers.
        *   📦 **Released:** The item is already delivered in a past/active sprint.
        *   🕒 **Missing Dates:** One or more linked Issues lack target start/end dates.
        *   📏 **No Effort:** Effort is not yet estimated (0 MDs).

*   **👥 Teams (Capacity Nodes):**
    *   **Baseline Capacity:** Shows total team velocity.
    *   **Size Scaling:** Nodes represent the team's total capacity relative to other teams.

*   **📊 Gantt Bars (Execution Nodes/Issues):**
    *   **Heat/Intensity Mapping:** Bars are segmented by sprint. A segment's brightness (White glow) or darkness (Black shade) indicates if the effort allocated to that sprint is higher or lower than the mathematical uniform baseline.
    *   **Frozen History:** Segments in the past (before the active sprint) are marked with a diagonal stripe pattern and are automatically snapshotted to preserve historical accuracy.
    *   **Status Colors:** Issues are Slate Blue (Past) or Purple (Future/Active).

*   **📅 Sprint Capacity (Timeline Header):**
    *   **Visual Health:** Sprint headers change color based on team utilization:
        *   🔴 **Red:** Overallocated (>100% capacity).
        *   🟢 **Green:** Allocated (0-100% capacity).
        *   ⚪ **Grey:** Empty (0 MDs).
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
    *   **Demand (Customer -> WorkItem):** Thickness represents the ROI of the connection (TCV / Work Item Effort).
    *   **Execution (WorkItem -> Team):** Thickness represents the relative effort (Man-Days) required by that specific Issue.
*   **Dependency Tracing:** Explicit Issue-to-Issue dependencies (Finish-to-Start or Finish-to-Finish) are shown as animated orange lines, highlighting critical paths and potential bottlenecks.

---

### 🏥 Support Health

A bird's-eye view of account stability across the customer base.

![Support Health](images/support-health.png)

**Details:**
*   **Ranking:** Issues are sorted by the **Customer's TCV Rank**, prioritizing high-revenue accounts.
*   **Sync:** Fetches real-time status from Jira based on the JQL templates in Settings.

---

## 3. Settings & System

### ⚙️ System Configuration

![Settings Page](images/settings.png)

**Details:**
*   **Persistence (Multi-Role):** 
    *   **Application DB:** Where ValueStream stores its internal entities.
    *   **Customer DB:** Connect to your production/external MongoDB to fetch "Custom Fields" via JSON aggregation pipelines.
*   **AWS SSO Workflow:** For IAM-protected MongoDB:
    1.  Select **AWS IAM** auth method.
    2.  Use **"Login via AWS SSO"** to get a device code.
    3.  Authorize in your browser.
    4.  Click **"Fetch SSO Credentials"** to populate temporary access tokens.
*   **Jira Integration:** 
    *   **Common:** Base URL and API Token (PAT).
    *   **Issues:** Import entire projects or components via JQL.
    *   **Customer:** Define JQL templates (using `{{CUSTOMER_ID}}`) to drive the Support Health dashboard.
*   **General:**
    *   **Theme:** Switch between **Dark mode** and **Filips mode** (high-contrast pastel).
    *   **Fiscal Year:** Align quarter groupings to your organization's calendar.

---

### 🎨 Theming & Accessibility

**Available Modes:**
-   **Dark mode:** Standard high-contrast interface.
-   **Filips mode:** A "muted dim" theme using soft slate-grey and pastel colors, designed for readability in bright environments.