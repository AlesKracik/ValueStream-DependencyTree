# 📖 User Guide & Value Stream Concepts

### 1. The Interactive Dashboard
The main view provides a high-level map of value flow from Customers to Teams.
- **Column Structure:** The dashboard is organized into three primary columns: **Customers**, **Work Items**, and **Teams**, followed by the **Gantt Timeline**.
- **Unified Filtering:** The header contains a streamlined filter bar organized into three logic groups:
    - **Search:** Quickly filter any column by typing names or partial strings.
    - **Status & Metrics:** Toggle visibility based on **Release Status** or set thresholds for **Min TCV** and **Min Score**.
    - **Visualization:** Toggle visual aids like dependency lines and hover effects.
- **Enhanced Highlighting:** By default, hover-based highlighting is disabled to reduce visual noise. You can toggle this on/off using the **"Disable Hover Highlight"** checkbox.
- **Dependency Tracing:** When highlighting is enabled (or via right-click), hovering over any node dims the rest of the graph and illuminates its direct upstream and downstream dependencies.
- **Structural Filtering (Right-Click):** Right-click any node to **Filter and Reposition** the graph. This isolates just the dependency tree of that node and collapses empty space. Right-click again to clear the filter.
- **Reset View:** Clicking **"Reset View"** in the bottom-right corner perfectly frames the dashboard, top-aligning the column headers and centering the Gantt chart on the **Active Sprint**.

### 2. Customer TCV Visualization
Customers are represented by dual-layer additive circles:
- **Inner Circle (Solid Blue):** Represents **Existing TCV** (realized value).
- **Outer Ring (Dashed Blue):** Represents **Total TCV** (Existing + Potential). 
- **The Gap:** The distance between the solid core and the dashed ring visually represents the "Potential Upside" still available for that customer.
- **Proportional Scaling:** Circle diameters are strictly proportional to the global maximum TCV, making it easy to spot your most valuable accounts at a glance.

### 3. Work Item & Team Management
- **Labels:** To maximize legibility, all node names are placed **below the circles** in a large, bold font. Circles are reserved for core numerical metrics (TCV, RICE Score, or Capacity).
- **Searchable Assignments:** All dropdown menus for linking entities (e.g., adding a Customer Target to a Work Item) are **Searchable**. Simply type a few letters to filter the options.
- **Release Tracking:** Work Items can now include a **Release Link** (URL).
    - **Configuration:** Add or edit the link in the Work Item detail page or the Edit Node Modal.
    - **Visualization:** Items with an active release link will display a **🚀 icon** in the top-right of their circle. Clicking this icon opens the release page in a new tab.
- **Global Work Items (Maintenance/Tech Debt):** Work Items can be designated to impact **ALL Customers** simultaneously. 
    - **Configuration:** In the Work Item detail page, check the **"ALL CUSTOMERS (Global)"** row at the top of the target table.
    - **TCV Basis:** You can choose whether the item's impact is calculated based on total **Existing TCV** or **Potential TCV** across the entire system.
    - **Visualization:** Global items are marked with a **🌐 icon** and a **gold border**. To keep the dashboard clean, individual connection lines to every customer are hidden for these items.
- **Score Calculation:** Work Items use a RICE-based score that scales visually. The number inside the purple circle is the calculated priority score. For global items, the impact is the sum of relevant TCV across all existing customers.
- **Team Capacity:** Team circles show their base capacity in Man-Days (MDs). If a team is over-allocated in a specific sprint, the capacity marker above their Gantt lane will turn red.

### 4. Progress-Aware Gantt Timeline
The Gantt chart distinguishes between what has happened and what is planned:
- **Historical Actuals (Steel Blue + Stripes):** Segments in sprints older than the active one are **frozen**. They represent effort already spent and are snapshotted into a permanent "Actuals" ledger.
- **Future Plan (Vibrant Purple):** Segments in the active and future sprints are **dynamic**. Their intensity shifts in real-time as you move dates or change estimates.
- **Effort Intensity:** In both colors, the brightness of a segment indicates the volume of work allocated to that specific sprint.
- **Safety Prompts:** If you attempt to shift the **Start Date** of an Epic that has recorded historical work, the app will prompt you to confirm if you want to "unthaw" and overwrite those records.

### 5. Sprint Management & Continuity
The dashboard ensures a continuous, unbroken timeline through strict schedule management:
- **Access:** Left-click any **Sprint Header** (the capacity markers above the Gantt lanes) to open the Sprint Management page.
- **Inline Editing:** To rename a sprint, simply click its header to enter the management page. The selected sprint will be highlighted and editable directly in the schedule table.
- **Schedule Integrity:** 
    - **Date Locking:** Start and end dates are managed automatically to ensure no gaps or overlaps exist in your timeline. They are read-only for existing sprints.
    - **Deletion Protection:** To prevent orphaning data, only the **last sprint** in the schedule can be deleted. Earlier sprints are "Locked" to preserve the historical sequence.
- **Timeline Expansion:** Click **"+ Create Next Sprint"** at the bottom of the table to add a new 14-day block. The system automatically calculates the next logical dates and name.

### 6. Native Jira Epic Synchronization
- **Proxy Sync:** Inside an Epic's detail page, click the **"Sync from Jira"** button.
- **Automated Mapping:** The system automatically pulls the latest Summary, Remaining Estimate, Dates, and Team assignments from Atlassian.
- **Configuration:** Use the ⚙️ **Settings** modal to set your Jira Base URL and Personal Access Token (PAT).

### 7. Persistence & Collaboration
- **Auto-Snapshot:** When a sprint ends, the system automatically snapshots the calculated effort into permanent overrides, preserving your delivery history.
- **Save Changes:** Click the blue **"Save Changes"** button in the header to write all layout adjustments and node edits back to the central data store.
