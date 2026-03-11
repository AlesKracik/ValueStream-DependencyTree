# ValueStream Dependency Tree

An interactive React ValueStream designed to visualize the flow of value from customer demand to engineering execution. It maps Customers (and their Total Contract Value/TCV) through Work Items and Teams to a React Flow Gantt Timeline.

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

4.  **Initial Setup & SSH Tunneling:**
    - Open `http://localhost:5173`.
    - Go to **Settings** (Sidebar) and configure your **MongoDB URI**.
    - **SSH Tunneling (Local):** If your MongoDB is behind one or more SSH bastions, start SOCKS5 tunnels in a separate terminal:
      - **Windows:** `.\scripts\start-tunnel.ps1 all` (or `app`, `customer`)
      - **MacOS/Linux:** `./scripts/start-tunnel.sh all` (or `app`, `customer`)
    - Ensure `SOCKS_PROXY_HOST=localhost` is set in your `.env` file.
    - In the application **Settings**, enable the **"Use Proxy"** checkbox and specify the **"Tunnel Name"** (e.g., `app` or `customer`) to match your `.env` prefix.

### 🐳 Docker Deployment

The application supports four networking scenarios to ensure it runs in any environment:

#### Scenario A: Local Development (Native Node.js)
If you are running the app directly on your host machine.
- **Config:** Set `SOCKS_PROXY_HOST=localhost` in `.env`.
- **Tunnel:** Start manually on host using `scripts/start-tunnel.ps1 all`.

#### Scenario B: Docker Sidecar (Recommended)
The sidecar container in `docker-compose.yml` automatically manages one or more SSH tunnels.
- **Config:** 
  - Set `SOCKS_PROXY_HOST=ssh-proxy` and `COMPOSE_PROFILES=ssh-proxy` in `.env`.
  - Provide `[PREFIX]_SSH_USER`, `[PREFIX]_SSH_HOST`, and `[PREFIX]_SSH_KEY_PATH` for each bastion.
- **Command:** `docker-compose up`. The sidecar starts a tunnel for every `_SSH_HOST` it finds.

#### Scenario C: VPN Workaround (MacOS/Windows)
Use this if your corporate VPN blocks Docker VM outbound SSH, but allows your Host to connect.
- **Tunnel:** Start manually on host using `scripts/start-tunnel.ps1 all`.
- **Config:** 
  - Set `SOCKS_PROXY_HOST=host.docker.internal` in `.env`.
  - Ensure `COMPOSE_PROFILES=` is empty.

#### Scenario D: Kubernetes (Sidecar Pattern)
In K8s, the application and its SSH sidecars share the same Pod network.
- **Config:** Set `SOCKS_PROXY_HOST=localhost` in your Deployment manifest.
- **Tunnel:** Each `openssh-client` sidecar container listens on a unique local port (e.g., `1080`, `1081`).
- **Routing:** Specify the `Tunnel Name` in the UI Settings to route to the correct sidecar.

### ☸️ Kubernetes Deployment

For enterprise-grade scaling using the **Sidecar Pattern**:

1.  **SSH Sidecars:** 
    Add one or more lightweight SSH containers (e.g., using `alpine`) to your Application Pod.
    ```yaml
    - name: ssh-proxy-app
      image: alpine-ssh-client
      command: ["ssh", "-D", "1080", "-N", "..."]
    ```
2.  **App Configuration:** 
    Inject `SOCKS_PROXY_HOST=localhost` and the relevant `[PREFIX]_SOCKS_PORT` variables.
3.  **Secrets:** 
    Store `ADMIN_SECRET` and SSH Private Keys in K8s Secrets.
4.  **Persistence:** 
    Use PersistentVolumeClaims (PVC) for MongoDB data and to persist the `settings.json` file.

For more details on SOCKS5 proxying, see **[Networking & SSH Tunneling](../doc/ARCHITECTURE.md#networking--ssh-tunneling)**.

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

A comprehensive guide on how to use the ValueStream, manage TCV, and synchronize with Jira can be found in the **[User Guide](./public/USER_GUIDE.md)** or accessed directly within the application via the "Documentation" link.

---

## 🛠️ Security

The application includes a built-in security layer:
- **Authentication:** Enforced via `ADMIN_SECRET` environment variable.
- **Secure Storage:** sensitive credentials are kept in a non-public `settings.json` on the server.
- **Authorized Communication:** All API calls are protected by Bearer token validation.





