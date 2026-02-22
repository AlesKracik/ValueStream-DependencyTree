# Value Stream Dependency Tree MVP

An interactive React dashboard designed to visualize the flow of value from Customers (and their Total Contract Value/TCV) through Features, assigned Teams, out to targeted Epics and Sprints on a React Flow Gantt Timeline.

## 🚀 How to Compile and Run

This project uses [Vite](https://vitejs.dev/) for lightning-fast HMR and building.

### Prerequisites
* Node.js (v18+ recommended)
* npm (v9+ recommended)

### Local Development
1. Navigate into the client directory: `cd web-client`
2. Install the necessary dependencies: `npm install`
3. Start the local Vite development server: `npm run dev`
4. Open the displayed localhost URL (typically `http://localhost:5173`) in your browser.
   * *Note: The application will hot-reload automatically as you edit React components!*

### Production Build
To compile the TypeScript project into minified static assets ready for deployment:
1. Run the build script: `npm run build`
2. The bundled assets will be generated securely inside the `/dist` folder. You can serve this standard HTML/JS footprint statically via NGINX, AWS S3, Vercel, etc.

---

## 🏗️ High Level Tech Architecture

The MVP is built entirely as a client-side Single Page Application (SPA), relying on local JSON state manipulation to bypass complex backend orchestration in the short term.

### 1. The Core Stack
* **Framework:** React 19 + TypeScript
* **Bundler:** Vite
* **Rendering Engine:** `@xyflow/react` (React Flow)
* **CSS System:** Standard Modules (`*.module.css`) + Inline styles for dynamic SVG sizing.

### 2. The Data Model (`mockData.json`)
All dashboard state is hydrated from a strict dictionary footprint injected via `public/mockData.json`. This acts as the "backend database":
* **Customers:** Defined by `existing_tcv` and `potential_tcv`.
* **Features:** Bound to Customers via `customer_targets` (existing vs potential). Contains the total Effort (MD).
* **Teams:** Total specific capacity parameters.
* **Sprints:** Absolute calendar boundaries.
* **Epics:** The core intersection node. Ties a Feature to a specific Team and tracks remaining Work, Target Start, and Target End.

*Note: Any program you write to import/export this payload from Salesforce or Jira can safely validate against the draft-07 JSON Schema provided at `public/schema.json`!*

### 3. The Layout Engine (`useGraphLayout.ts`)
Instead of using automated algorithm-based layout (like Dagre), the dashboard relies on a custom deterministic mathematical engine within `useGraphLayout.ts`:
* Maps nodes linearly across 4 major columns `X` offsets: Customers -> Features -> Teams -> Gantt Timeline.
* Traces Epic Target Start/End dates, intersects them against Sprint definitions using `date-fns`, and proportionally draws horizontal Gantt lines extending into the future.
* Tracks parallel swimlane allocations to ensure Epic rows assigned to the same team don't graphically overlap.

### 4. Custom Node Interactions
* React Flow uses heavily customized Node types (e.g. `CustomerNode`, `FeatureNode`, `GanttBarNode`) mapped in `Dashboard.tsx`.
* **Hover Tracing:** Handled globally by edge-searching. When you hover a Feature, it recursively traverses edges backward to highlight its owning Customers and forward to highlight its resulting Gantt Sprints.
* **Context Modals:** Right-clicking almost any element pulls up React State `EditNodeModal.tsx` popups allowing real-time injection of patched metrics back into the running `mockData.json` DOM layout context!

---

## 📖 User Guide & Features

### 1. The Interactive Dashboard
The main view provides a high-level map of value flow. 
- **Dependencies & Tracing:** Hover over any node (Customer, Feature, Team, or Epic Gantt Bar) to dim the rest of the graph and brightly illuminate its direct upstream and downstream dependencies. 
- **Customer Node Viz:** Customer nodes visually represent Total Contract Value (TCV). The inner circle represents Existing TCV, and the outer circle represents Potential TCV. Node sizes scale relative to each other based on value.
- **Top Bar Filters:** Use the input boxes at the top left to instantly filter nodes by text (filtering Customers, Features, Teams, or Epics). Unrelated nodes will disappear, making complex graphs legible.

### 2. Customer Strategy Management
- **Add Customers:** Click the blue `+ Add Customer` button at the top of the Customer column to draft a new account.
- **Dedicated Customer Pages:** Left-click any existing Customer node to open its dedicated full-screen details page.
- **Manage Targeting:** From the Customer page, you can easily adjust their Existing/Potential TCV and manage which Features they care about using an inline table with `Priority` and `TCV Type` drop-downs.

### 3. Feature & Epic Planning
- **Add Features:** Click the `+ Add Feature` button at the top of the Feature column.
- **Dedicated Feature Pages:** Left-click any existing Feature to open its full details interface.
- **Score Calculation:** Features use a lightweight RICE calculation taking into account targeted Customer TCV and priorities to visually scale their importance on the dashboard.
- **Inline Epic Editor:** Inside the Feature details page, you can manage the child Epics required to deliver it. Easily update Names, assigned Teams, Remaining Effort (Man-Days), and Target Dates.

### 4. Native Jira Epic Synchronization
- **Proxy Sync:** Inside the Feature page Epics table, click the green **Sync** button next to any Epic mapped to a `Jira Key`.
- **Automated Data Mapping:** It securely reaches out to Atlassian via a local proxy (bypassing browser CORS) to download the latest Epic data, automatically updating the Epic's Name, Remaining Estimate, Target Start/End dates, and Team assignment.
- **Settings & Auth:** Click the ⚙️ **Settings** button on the top right of the dashboard. Here you can configure your `Jira Base URL`, `Api Version (v2/v3)`, and input your `Jira Email` and `Jira API Token` for secure REST authentication.

### 5. Capacity & Timelines
- **Sprint Management:** Epics span across dynamically generated Sprint columns. 
- **Over allocations:** Swim lanes will stack neatly if multiple Epics belong to the same team. If a team's total sprint capacity is exceeded, their capacity node label flags the bottleneck.
- **Today Line:** A bright red vertical line dynamically anchors the Gantt chart to the current date (`Feb 12 2026` mock logic baseline), letting you easily see slipped or upcoming deliverables.
- **Persistence:** Click the blue **Save Changes** button in the header at any time to permanently write your layout and node edits back to `mockData.json`.
