# Product Requirements Document (PRD)

**Work Item Name:** End-to-End Product OS Dashboard (Value Stream & Execution Timeline)

## 1. Objective

To build an interactive, zero-mental-math visualization that connects **Customer Demand** ("Why"), **Work Item Scope** ("What"), **Team Supply** ("Who"), and **Delivery Schedule** ("When") in a single, horizontally flowing dashboard. It allows Product and Engineering leaders to instantly identify high-ROI initiatives, spot execution bottlenecks, and visualize parallel work streams.

The solution is an entirely local, client-side web application built on Vite and React. It utilizes an injected node proxy dev-server to handle remote API connections securely and persists its internal state fully to local disk (`mockData.json`).

## 2. Layout & Architecture (4-Stage Flow)

The dashboard consists of a fixed **3-column bipartite-style graph** on the left, pivoting into a horizontally scrolling **Gantt chart** on the right.

- **Column 1 (Demand):** Customer nodes, sorted vertically from Highest ACV (Top) to Lowest ACV (Bottom).
- **Column 2 (Scope):** Work Item nodes, sized visually using a RICE prioritization algorithm linked to target Customer TCV and Priority.
- **Column 3 (Supply / The Pivot):** Team nodes, representing engineering groups and their structural velocity/bottlenecks.
- **Section 4 (Execution Timeline Framework):** A calendar grid mapped chronologically via dynamic real-world Sprints (Weeks/Months) extending horizontally to the right of Column 3. Each Team node serves as the Y-axis header for its respective swimlane.

## 3. Data Model & Tracking Units

- **Customers:** Root drivers of Value. Possess both an "Existing TCV" and "Potential TCV".
- **Work Items:** Strategic initiatives bound to specific Customers.
- **Teams:** Execution units with absolute Sprint Capacity metadata.
- **Epics:** The core unit of work. Placed physically on the Timeline. An Epic connects a Work Item to a concrete Team constraint, carrying Jira tracking keys, target dates, and Remaining Man-Days.
- **Sprints:** Absolute calendar time fences (Start Date & End Date).

## 4. Visual Encodings (Nodes & Edges)

### Nodes
- **Customers:** Circular node. Contains an inner ring (Existing TCV) and outer ring (Potential TCV) that visually scale against each other.
- **Work Items:** Circular node. Size scales dynamically based on a native RICE impact calculation. Background colors map chronologically via the Gantt bars they spawn.
- **Teams:** Circular node. Acts as a visual bottleneck and anchor for horizontal swimlane bounds.
- **Sprint/Today Overlay:** Dynamic red vertical line visually grounding the timeline at "Today", passing behind all node structures.

### Edges (Dependencies)
- **Tracing Flow:** Curved gray connections visually chaining Customers to Work Items to Teams to Epics. Edge highlighting occurs dynamically on user interaction.
- **Epic Dependencies:** Support for 'Finish-to-Start' and 'Finish-to-Finish' blockers, enforcing execution sequencing.

### Gantt Bars (Timeline)
- Horizontal floating bars spanning mapped target dates within the vertical bound of the assigned Team.
- **Crucial Rule:** Gantt bars inherit the exact background color of their parent **Work Item node** to visually unify "Why" and "When".
- **Collision Protection:** Multiple Epics assigned to the same team vertically stack inside the team's widened swimlane instead of horizontally overlapping.

## 5. Interactive UI / UX Core

- **End-to-End Highlighting (Hover):** Hovering over any node dynamically highlights the structural chain traversing in both directions up to the Root Customer and down to the Leaf Epic, dimming irrelevant nodes instantly.
- **Global Text Filtering:** Fast indexing bar allowing users to omit unmatched Customers, Work Items, Teams, or Epics.
- **Dedicated Strategy Pages:**
  - Left-clicking a **Customer** opens a dedicated page managing financial footprints and targeted Work Item impact tracking.
  - Left-clicking a **Work Item** opens a dedicated page managing Customer ROI targeting and child Epic assignments.

## 6. Integrations (Jira Sync)

- **Native Settings Store:** Users can provide absolute credentials (`Jira Base URL`, `API Version`, `Email`, and `Token`) directly in the UI. 
- **Local Dev Proxy:** To avoid browser Cross-Origin (CORS) security locks against Atlassian domains, the system routes requests through an inline HTTP Vite proxy.
- **Epic Details Hydration:** Advanced Roadmaps custom fields (`Target start`, `Target end`, `Team`) and native fields (`Summary`, `Remaining Estimate`) are parsed automatically from Atlassian via `/api/jira/issue` during the "Sync from Jira" action.
