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
    - **SSH Tunneling (Local):** If your MongoDB is behind an SSH bastion, start a SOCKS5 tunnel in a separate terminal:
      - **Windows:** `powershell ./scripts/start-tunnel.ps1`
      - **MacOS/Linux:** `bash ./scripts/start-tunnel.sh`
    - Ensure `SOCKS_PROXY_HOST=127.0.0.1` is set in your `.env` file.
    - In the application **Settings**, enable the **"Use SOCKS Proxy (from .env)"** checkbox for your connection.
    - The app will then route that specific MongoDB connection's traffic (including SRV) through the tunnel.

### 🐳 Docker Deployment

The application supports three networking variants to ensure it runs in any environment:

#### Scenario A: Standard (No Tunnel)
If your MongoDB is directly accessible or you're running it in a container.
- **Config:** Set `SOCKS_PROXY_HOST=` (empty) in `.env`.
- **Command:** `docker-compose up`

#### Scenario B: Sidecar (Standard Sidecar) - RECOMMENDED
The most systematic way to run with an SSH tunnel.
- **Config:** Set `SOCKS_PROXY_HOST=ssh-proxy` in `.env`.
- **Pre-requisites:** Fill in `SSH_USER`, `SSH_HOST`, and `SSH_KEY_PATH` in `.env`.
- **Command:** `docker-compose up`. The `ssh-proxy` sidecar handles the tunnel automatically.

#### Scenario C: VPN Workaround (MacOS/Windows)
Use this if your corporate VPN blocks the Docker VM from making outbound SSH connections, but allows your Mac/PC host to do so.
1. **Start Tunnel on Host:** 
   - Windows: `powershell ./scripts/start-tunnel.ps1`
   - MacOS/Linux: `bash ./scripts/start-tunnel.sh`
2. **Config:** Set `SOCKS_PROXY_HOST=host.docker.internal` in `.env`.
3. **Command:** `docker-compose up`. The app routes traffic through the tunnel running on your Mac host.

### ☸️ Kubernetes Deployment

For enterprise-grade scaling using the **Sidecar Pattern**:

1.  **SSH Sidecar:** 
    Add a lightweight SSH container (e.g., `alpine/ssh`) to your Application Pod.
    ```yaml
    - name: ssh-proxy
      image: alpine/ssh
      command: ["ssh", "-D", "1080", "-N", "..."]
    ```
2.  **App Configuration:** 
    Inject `SOCKS_PROXY_HOST=localhost` and `SOCKS_PROXY_PORT=1080` into the Web Client container. The MongoDB driver will automatically route all traffic (including SRV lookups) through the sidecar.
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





