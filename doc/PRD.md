# Product Requirements Document (PRD)

**Feature Name:** End-to-End Product OS Dashboard (Value Stream & Execution Timeline)

## 1. Objective

To build an interactive, zero-mental-math visualization that connects **Customer Demand** ("Why"), **Feature Scope** ("What"), **Team Capacity** ("Who"), and **Delivery Schedule** ("When") in a single, horizontally flowing dashboard. It allows Product and Engineering leaders to instantly identify high-ROI initiatives, spot execution bottlenecks, and visualize parallel work streams.

The solution should be client-server, with primary client web, then mobile.
In first iterations the server should be a static json file.
The used language and frameworks should be chosen with the goal of visualization via mindmap and gantt chart, with ability to easily allow editing data directly in the visualization.
This project will evolve to complicated product, so we should start with good component based architecture.

## 2. Layout & Architecture (4-Stage Flow)

The dashboard consists of a fixed **3-column bipartite-style graph** on the left, pivoting into a horizontally scrolling **Gantt chart** on the right.

- **Column 1 (Demand):** Customer nodes, sorted vertically from Highest ACV (Top) to Lowest ACV (Bottom).
- **Column 2 (Scope):** Feature nodes, sorted vertically from Lowest Total Effort (Top) to Highest Total Effort (Bottom).
- **Column 3 (Supply / The Pivot):** Team nodes, sorted vertically by Total Capacity (Top) to Lowest Capacity (Bottom).
- **Section 4 (Execution Timeline):** A calendar grid (Weeks/Months) extending horizontally to the right of Column 3. Each Team node serves as the Y-axis header for its respective swimlane.

## 3. Visual Encodings (Nodes & Edges)

### Nodes
- **Customers:** Circle. Size proportional to `Potential_ACV`. Color: Primary (e.g., Light Blue).
- **Features:** Circle. Size proportional to `Total_Effort_MDs`. Color: Dynamic (Each feature gets a unique color for timeline tracking).
- **Teams:** Circle. Size proportional to `Total_Capacity_MDs`. Color: Tertiary (e.g., Dark Gray or Purple).

### Edges (Connections)
- **Value Flow (Cust → Feat):** Neutral Gray lines. Thickness proportional to ROI (`Potential_ACV` ÷ `Total_Effort_MDs`).
- **Execution Flow (Feat → Team):** Colored lines (matching the Feature's assigned color). Thickness proportional to the specific team effort required.

### Gantt Bars (Timeline)
- Horizontal bars within the Team swimlanes.
- **Crucial Rule:** Gantt bars must inherit the exact background color of their parent **Feature node** so users can visually track the work without reading text.

## 4. Interactive & UI/UX Requirements

- **End-to-End Highlighting (Hover):** Hovering over any node (Customer, Feature, or Team) must highlight the entire connected chain (edges, nodes, and Gantt bars) while dimming all unrelated elements to 15% opacity.
- **Parallel Execution Handling:** If a single team is assigned multiple features with overlapping `start_date` and `end_date` parameters, the UI must stack the Gantt bars vertically within that team's swimlane. They must not overlap horizontally.
- **Bottleneck Warning:** If the sum of scheduled MDs for a team exceeds their `Total_Capacity_MDs` for the visible timeframe, the Team node border must pulse **Red**.

### Dynamic Tooltips
- **Value Edge:** _"Cust A ($200k) requests SSO (15 MDs) = $13.3k/MD ROI."_
- **Gantt Bar:** _"Frontend Team building SSO: Mar 1 - Mar 15 (10 MDs)."_
