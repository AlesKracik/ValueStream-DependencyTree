# Deployment & Networking

## 1. Standalone (Local Development)

Ideal for individual developers running everything directly on the host machine.
- Start both services concurrently using `npm run dev` from the project root.
- The Fastify backend runs on port 4000; the Vite frontend on port 5173.

## 2. Docker (Containerised Environments)

- **Development:** Uses `docker-compose.yml` with hot-reloading.
- **Production:** Uses a multi-stage build (`docker-compose.prod.yml`) to compile the React app and serve it statically via Nginx, which reverse-proxies to the Fastify container.

### Dockerised Persistence

The `docker-compose.yml` file spins up a fully connected environment.

1. **Start Services:** Run `docker-compose up --build` from the root directory.
2. **Configuration:** Inside the application's **Settings**, update the **MongoDB URI** to:
   - `mongodb://mongodb:27017`
3. **Persistence:** Data is stored in a named Docker volume (`mongo-data`), ensuring it persists even if containers are stopped or removed.

```mermaid
graph LR
    App[App Container] -->|Internal Network| Mongo[Mongo Container]
    Mongo -->|Mount| Volume[(Docker Volume: mongo-data)]
```

## 3. Kubernetes (Cluster Deployment)

Manifests are provided in the `k8s/` directory.

### Architecture

```mermaid
graph LR
    ING[Ingress] -->|"/"| WC[web-client Service]
    ING -->|"/api"| BE[backend Service]
    WC --> WC_POD[web-client Pod<br/>nginx static files]
    BE --> BE_POD[backend Pod<br/>Node.js + PVC]
    BE_POD --> MG[mongodb Service]
    MG --> MG_POD[mongodb StatefulSet<br/>+ PVC 5Gi]
```

### Components

| Manifest | Kind | Notes |
| :--- | :--- | :--- |
| `ingress.yaml` | Ingress | Routes `/api` to backend, `/` to web-client. Requires an nginx Ingress controller. |
| `web-client.yaml` | Deployment + ClusterIP Service | Nginx serving static assets on port 80. |
| `backend.yaml` | Deployment + ClusterIP Service + PVC | Node.js API on port 4000. Settings files (`settings.json`, `settings.secrets.enc`) are persisted on a `ReadWriteOnce` PVC (100Mi). |
| `mongodb.yaml` | StatefulSet + Service | MongoDB with a 5Gi `ReadWriteOnce` PVC via `volumeClaimTemplates`. |
| `secrets.example.yaml` | Secret (example) | Copy, fill in real values, and apply. Holds `ADMIN_SECRET` and optional `VSDT_SECRET_*` env-var overrides. |

### Quick Start

```bash
# Create secrets (edit with real values first)
cp k8s/secrets.example.yaml k8s/secrets.yaml
kubectl apply -f k8s/secrets.yaml

# Deploy all components
kubectl apply -f k8s/mongodb.yaml
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/web-client.yaml
kubectl apply -f k8s/ingress.yaml
```

### Settings Persistence

The backend writes to `settings.json` and `settings.secrets.enc` at runtime. These files are mounted from a `ReadWriteOnce` PVC (`backend-settings-pvc`), so they survive pod restarts and redeployments. This limits the backend to a single replica; scaling requires migrating settings to a shared store.

## Networking & SSH Tunneling

To support MongoDB clusters behind secure SSH bastions, the application employs a systematic SOCKS5 architecture.

### SOCKS5 vs. Port Forwarding

Standard SSH Port Forwarding fails with MongoDB SRV records because the driver connects to the real hostnames of the cluster members. SOCKS5 acts as a dynamic proxy that captures all traffic from the driver.

### Architecture Patterns

| Environment | Pattern | Implementation |
| :--- | :--- | :--- |
| **Local Dev** | **External Proxy** | Start a tunnel via `./scripts/start-tunnel.ps1`. Backend picks up env vars. |
| **Docker (A)** | **Direct** | Set `SOCKS_PROXY_HOST=` for local/unprotected DBs. |
| **Docker (B)** | **Service Sidecar** | The backend connects to the `ssh-proxy` container in the bridge network. |
| **Docker (C)** | **Host Workaround** | The backend connects to `host.docker.internal` (Mac/PC host tunnel). |
| **Kubernetes** | **Pod Sidecar** | An SSH container runs alongside the backend in the same Pod. |

### Systematic Discovery

The backend checks for the following environment variables:
- `SOCKS_PROXY_HOST`: The IP/Hostname of the SOCKS5 proxy.
- `SOCKS_PROXY_PORT`: The port for the external proxy.

Setting these variables does not automatically force all traffic through the proxy. Users must explicitly enable the "Use Proxy" toggle for each database connection in the UI Settings.
