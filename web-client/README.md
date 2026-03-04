# Value Stream Dependency Tree

An interactive React dashboard designed to visualize the flow of value from customer demand to engineering execution. It maps Customers (and their Total Contract Value/TCV) through Work Items and Teams to a React Flow Gantt Timeline.

## 🚀 Getting Started

### Prerequisites
* **Node.js:** v22+
* **npm:** v10+
* **MongoDB:** A running instance (local or remote).

### Local Development

1.  **Clone and Install:**
    ```powershell
    git clone https://github.com/AlesKracik/ValueStream-DependencyTree.git
    cd ValueStream-DependencyTree/web-client
    npm install
    ```

2.  **Set Authentication (Optional):**
    To enable security, set an admin secret in your environment:
    ```powershell
    $env:ADMIN_SECRET="your-secure-password"
    ```

3.  **Run the App:**
    ```powershell
    npm run dev
    ```

4.  **Initial Setup:**
    - Open `http://localhost:5173`.
    - Go to **Settings** (Sidebar) and configure your **MongoDB URI** (e.g., `mongodb://localhost:27017`) and **Jira Integration**.
    - If the database is empty, the app will automatically seed from `public/staticImport.json`.

### 🐳 Docker Deployment

The fastest way to spin up the entire stack (App + MongoDB) is using Docker Compose:

1.  **Configure Environment:**
    Create a `.env` file in the project root to define your secrets. This file is automatically loaded by Docker Compose:
    ```env
    ADMIN_SECRET=your-secure-password
    ```

2.  **Start the Stack:**
    ```powershell
    docker-compose up --build
    ```

3.  **Initial Setup:**
    - Open `http://localhost:5173`.
    - Set MongoDB URI to `mongodb://mongodb:27017` (using the internal Docker network).

### ☸️ Kubernetes Deployment

For enterprise-grade scaling and availability:

1.  **Secrets Management:** 
    Store your `ADMIN_SECRET` in a K8s Secret and inject it as an environment variable.
2.  **Persistence:** 
    Use PersistentVolumeClaims (PVC) for MongoDB data and to persist the `settings.json` file across pod restarts.
3.  **Orchestration:** 
    Deploy the web-client and MongoDB as separate Deployments/Services.

For more details on production patterns, see the **[Architecture Deployment Section](../doc/ARCHITECTURE.md#deployment-modes)**.

### Production Build
To compile the project into minified static assets:
1. Run `npm run build` in the `web-client` directory.
2. The output is generated in the `/dist` folder.

---

## 🏗️ Architecture

The application uses a React frontend with a custom Vite middleware "backend" that handles data aggregation, RICE score calculations, and MongoDB persistence.

For a detailed deep-dive into the system components, data flow, and code patterns, please refer to the **[High-Level Technical Architecture](../doc/ARCHITECTURE.md)** documentation.

---

## 📖 User Guide

A comprehensive guide on how to use the dashboard, manage TCV, and synchronize with Jira can be found in the **[User Guide](./public/USER_GUIDE.md)** or accessed directly within the application via the "Documentation" link.

---

## 🛠️ Security

The application includes a built-in security layer:
- **Authentication:** Enforced via `ADMIN_SECRET` environment variable.
- **Secure Storage:** sensitive credentials are kept in a non-public `settings.json` on the server.
- **Authorized Communication:** All API calls are protected by Bearer token validation.
