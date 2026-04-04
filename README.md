# ValueStream Dependency Tree

An interactive ValueStream visualization tool designed to map the flow of value from customer demand to engineering execution. It connects Customers (and their Total Contract Value/TCV) through Work Items and Teams to a React Flow-based Gantt Timeline.

## Architecture

The project is structured as a monorepo:

- **`backend/`**: A standalone Fastify API that handles data aggregation, RICE score calculations, MongoDB persistence, and integrations (Jira, Aha!, AWS, Glean, LLM).
- **`web-client/`**: A React frontend built with Vite, TypeScript, and React Flow for high-performance interactive visualizations.

For a detailed deep-dive into the system components, data flow, and code patterns, please refer to the **[High-Level Technical Architecture](./doc/ARCHITECTURE.md)** documentation.

## Getting Started

### Prerequisites
* **Node.js:** v22+
* **npm:** v10+
* **MongoDB:** A running instance (local or remote).

### Environment Configuration (.env)

Create a `.env` file in the root directory (you can use `.env.example` as a template). This file configures ports, authentication, and SSH networking for different deployment scenarios.

Key configuration groups include:

- **Authentication:**
  - `ADMIN_SECRET`: Secures the application and API (Required if authentication is enabled).
- **Networking & Ports:**
  - `PORT`: Backend API port (default `4000`).
  - `VITE_PROXY_TARGET`: Frontend proxy target (must match backend URL).
- **Glean AI Integration:**
  - `GLEAN_REDIRECT_BASE_URL` & `GLEAN_FRONTEND_BASE_URL` for OAuth callbacks.
- **SSH Tunnel Targets:** Define where you are connecting and which keys to use.
  - E.g., `APP_SSH_USER`, `APP_SSH_HOST`, `APP_SOCKS_PORT`, `APP_SSH_KEY_PATH`.
- **Networking Scenarios (`SOCKS_PROXY_HOST`):**
  - **Local Development:** `localhost`
  - **Docker Sidecar:** `ssh-proxy` (requires `COMPOSE_PROFILES=ssh-proxy`)
  - **VPN Workaround:** `host.docker.internal`

### Local Development

1.  **Clone and Install:**
    ```powershell
    git clone https://github.com/AlesKracik/ValueStream-DependencyTree.git
    cd ValueStream-DependencyTree
    npm install
    ```

2.  **Run the entire stack:**
    ```powershell
    npm run dev
    ```
    This will concurrently start the backend (port 4000) and the web-client (port 5173).

3.  **Authentication (Optional):**
    To enable security, set an admin secret in your environment or a `.env` file in the root:
    ```powershell
    ADMIN_SECRET="your-secure-password"
    ```

4.  **Initial Setup:**
    - Open `http://localhost:5173`.
    - Go to **Settings** (Sidebar) and configure your **MongoDB** connection under the **Persistence** tab.

## Deployment

### Docker Deployment

The application is container-ready with `docker-compose.yml`.

- **Standard Build:**
  ```powershell
  docker-compose up --build
  ```
- **With SSH Proxy Sidecar:**
  Set `COMPOSE_PROFILES=ssh-proxy` and `SOCKS_PROXY_HOST=ssh-proxy` in your `.env` to automatically manage SSH tunnels for secure database access.

### Kubernetes Deployment

Manifests are in **[`k8s/`](./k8s/)** — Ingress, Deployments, a MongoDB StatefulSet, and PVCs for settings persistence. Images are built and pushed to GHCR via a manual GitHub Actions workflow (**Actions > Build & Deploy > Run workflow**). See **[Deployment > Kubernetes](./doc/DEPLOYMENT.md#3-kubernetes-cluster-deployment)** for the full guide.

### Networking

If your MongoDB is behind SSH bastions, use the provided scripts for local development:
- **Windows:** `.\scripts\start-tunnel.ps1 all`
- **MacOS/Linux:** `./scripts/start-tunnel.sh all`

See the **[Networking & SSH Tunneling](./doc/ARCHITECTURE.md#networking--ssh-tunneling)** docs for complex scenarios (Docker, K8s, VPN).

## Documentation

See the **[Documentation Index](./doc/INDEX.md)** for the full documentation map, or jump directly to:

- **[Architecture Overview](./doc/ARCHITECTURE.md)**: System components, data model, and core algorithms.
- **[API Reference](./doc/API-REFERENCE.md)**: Complete REST endpoint catalogue.
- **[Deployment & Networking](./doc/DEPLOYMENT.md)**: Docker, Kubernetes, and SSH tunneling.
- **[User Guide](./web-client/public/USER_GUIDE.md)**: How to use the ValueStream, manage TCV, and synchronize with Jira.

## Security

- **Authentication:** Enforced via `ADMIN_SECRET` environment variable.
- **Secure Storage:** Sensitive credentials are encrypted at rest. See [Secret Management](./doc/SECRET-MANAGEMENT.md).
- **Authorized Communication:** All API calls are protected by Bearer token validation.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](./LICENSE) file for details.