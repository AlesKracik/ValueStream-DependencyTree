# Value Stream Dependency Tree MVP

An interactive React dashboard designed to visualize the flow of value from Customers (and their Total Contract Value/TCV) through Work Items, assigned Teams, out to targeted Epics and Sprints on a React Flow Gantt Timeline.

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
* **Work Items:** Bound to Customers via `customer_targets` (existing vs potential). Contains the total Effort (MD).
* **Teams:** Total specific capacity parameters.
* **Sprints:** Absolute calendar boundaries.
* **Epics:** The core intersection node. Ties a work item to a specific Team and tracks remaining Work, Target Start, and Target End.

*Note: Any program you write to import/export this payload from Salesforce or Jira can safely validate against the draft-07 JSON Schema provided at `public/schema.json`!*

### 3. The Layout Engine (`useGraphLayout.ts`)
Instead of using automated algorithm-based layout (like Dagre), the dashboard relies on a custom deterministic mathematical engine within `useGraphLayout.ts`:
* Maps nodes linearly across 4 major columns `X` offsets: Customers -> Work Items -> Teams -> Gantt Timeline.
* Traces Epic Target Start/End dates, intersects them against Sprint definitions using `date-fns`, and proportionally draws horizontal Gantt lines extending into the future.
* Tracks parallel swimlane allocations to ensure Epic rows assigned to the same team don't graphically overlap.

### 4. Custom Node Interactions
* React Flow uses heavily customized Node types (e.g. `CustomerNode`, `WorkItemNode`, `GanttBarNode`) mapped in `Dashboard.tsx`.
* **Hover Tracing:** Handled globally by edge-searching. When you hover a work item, it recursively traverses edges backward to highlight its owning Customers and forward to highlight its resulting Gantt Sprints.
* **Context Modals:** Right-clicking almost any element pulls up React State `EditNodeModal.tsx` popups allowing real-time injection of patched metrics back into the running `mockData.json` DOM layout context!

---

## 📖 User Guide & Work Items

The detailed user guide has been moved to a separate file. Please see [USER_GUIDE.md](./public/USER_GUIDE.md) or access it directly inside the application via the "Documentation" button in the top right corner.

