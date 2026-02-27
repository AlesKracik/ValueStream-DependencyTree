# 📖 User Guide & Work Items

### 1. The Interactive Dashboard
The main view provides a high-level map of value flow. 
- **Dependencies & Tracing:** Hover over any node (Customer, Work Item, Team, or Epic Gantt Bar) to dim the rest of the graph and brightly illuminate its direct upstream and downstream dependencies. 
- **Structural Filtering (Right-Click):** Right-click any node to **Filter and Reposition** the graph. This isolates just the dependency tree of that node and collapses the empty space, making it easy to focus on a specific workstream. Right-click again to clear the filter.
- **Canvas Controls:** Use the fixed `+`, `-`, and `Reset View` buttons in the bottom-right corner to quickly navigate the graph.
- **Browser Navigation:** The app uses real URLs (e.g., `/customer/c1`). You can use your browser's **Back** and **Forward** buttons to navigate between the dashboard and detail pages, and your filters/zoom will be preserved.

### 2. Customer & Team Management
- **Add Customers/Teams:** Click the blue `+ Add` buttons at the top of the respective columns.
- **Dedicated Pages:** Click any node to open its dedicated full-screen details page.
- **Team Geolocation & Holidays:** Set a Team's **Country (ISO)** (e.g., US, CZ, GB) on their detail page. The system will automatically look up public holidays and adjust their sprint capacity accordingly.
- **Holiday Indicators:** Sprints affected by holidays are marked with a `🏝️` icon and show the exact capacity reduction (e.g., `-1d`).

### 3. Work Item & Epic Planning
- **Add Work Items:** Click the `+ Add Work Item` button at the top of the Work Item column.
- **Work Itemless Epics:** Epics can now exist independently of Work Items (e.g., for Tech Debt or Security Patches). They will appear on the timeline without a connecting line to the Work Item column.
- **Epic Assignment:** On a Work Item's detail page, you can either create new epics or **Assign Existing Epics** from the unassigned pool using the dropdown in the Epics section.
- **Score Calculation:** Work Items use a lightweight RICE calculation taking into account targeted Customer TCV and priorities to visually scale their importance on the dashboard.

### 4. Native Jira Epic Synchronization
- **Proxy Sync:** Inside the Work Item page Epics table, click the green **Sync** button next to any Epic mapped to a `Jira Key`.
- **Automated Data Mapping:** It securely reaches out to Atlassian via a local proxy (bypassing browser CORS) to download the latest Epic data, automatically updating the Epic's Name, Remaining Estimate, Target Start/End dates, and Team assignment.
- **Settings & Auth:** Click the ⚙️ **Settings** button on the top right of the dashboard. Here you can configure your `Jira Base URL`, `Api Version (v2/v3)`, and input your `Jira Email` and `Jira API Token` for secure REST authentication.

### 5. Capacity & Timelines
- **Sprint Management:** Epics span across dynamically generated Sprint columns. 
- **Over allocations:** Swim lanes will stack neatly if multiple Epics belong to the same team. If a team's total sprint capacity is exceeded, their capacity node label flags the bottleneck.
- **Today Line:** A bright red vertical line dynamically anchors the Gantt chart to the current date (`Feb 12 2026` mock logic baseline), letting you easily see slipped or upcoming deliverables.
- **Persistence:** Click the blue **Save Changes** button in the header at any time to permanently write your layout and node edits back to `mockData.json`.
