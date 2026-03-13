#!/bin/bash
# start-tunnel.sh
# Helper script to start SOCKS5 SSH tunnels from a consolidated .env file.
# Usage: 
#   ./scripts/start-tunnel.sh app        (Starts APP bastion)
#   ./scripts/start-tunnel.sh customer   (Starts CUSTOMER bastion)
#   ./scripts/start-tunnel.sh all        (Starts both)

TARGET=$1

if [[ ! "$TARGET" =~ ^(app|customer|all)$ ]]; then
    echo -e "\033[0;31m[ERROR] Usage: ./scripts/start-tunnel.sh [app|customer|all]\033[0m"
    exit 1
fi

ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
    echo -e "\033[0;31m[ERROR] .env file not found.\033[0m"
    exit 1
fi

# Load variables into current shell
echo -e "\033[0;90m[INFO] Loading environment variables from $ENV_FILE...\033[0m"
export $(grep -v '^#' "$ENV_FILE" | xargs)

# Array to keep track of started PIDs
PIDS=()

cleanup() {
    echo -e "\n\033[0;33m[ACTION] Cleaning up tunnels...\033[0m"
    for PID in "${PIDS[@]}"; do
        if ps -p "$PID" > /dev/null; then
            echo -e "\033[0;90m  - Stopping tunnel PID $PID...\033[0m"
            kill "$PID" 2>/dev/null
        fi
    done
    
    # Also cleanup PID files
    rm -f .tunnel.app.pid .tunnel.customer.pid
    
    echo -e "\033[0;32m[SUCCESS] Cleanup complete.\033[0m"
    exit 0
}

# Register cleanup trap
trap cleanup SIGINT SIGTERM EXIT

start_tunnel() {
    NAME=$1
    PREFIX=$(echo "$NAME" | tr '[:lower:]' '[:upper:]')
    
    # Indirect reference to variables
    USER_VAR="${PREFIX}_SSH_USER"
    HOST_VAR="${PREFIX}_SSH_HOST"
    PORT_VAR="${PREFIX}_SOCKS_PORT"
    KEY_VAR="${PREFIX}_SSH_KEY_PATH"
    
    USER=${!USER_VAR}
    HOST=${!HOST_VAR}
    PORT=${!PORT_VAR:-"1080"}
    KEY=${!KEY_VAR:-${SSH_KEY_PATH:-"~/.ssh/id_rsa"}}
    PID_FILE=".tunnel.$NAME.pid"

    if [ -z "$USER" ] || [ -z "$HOST" ]; then
        echo -e "\033[0;31m[ERROR] ${PREFIX}_SSH_USER and ${PREFIX}_SSH_HOST must be defined in .env\033[0m"
        return
    fi

    echo -e "\n\033[0;90m[INFO] Configuration for $NAME ($PREFIX):\033[0m"
    echo -e "\033[0;90m  - SSH User: $USER\033[0m"
    echo -e "\033[0;90m  - SSH Host: $HOST\033[0m"
    echo -e "\033[0;90m  - SOCKS Port: $PORT\033[0m"
    echo -e "\033[0;90m  - SSH Key:  $KEY\033[0m"
    echo -e "\033[0;90m  - PID File: $PID_FILE\033[0m"

    # Check if tunnel is already running
    if [ -f "$PID_FILE" ]; then
        OLD_PID=$(cat "$PID_FILE")
        if ps -p "$OLD_PID" > /dev/null; then
            echo -e "\033[0;33m[ACTION] Tunnel for $NAME is already running. Stopping it (PID: $OLD_PID)...\033[0m"
            kill "$OLD_PID"
            sleep 1
        fi
        rm -f "$PID_FILE"
    fi

    echo -e "\033[0;36m[ACTION] Starting SOCKS5 tunnel for $NAME on 0.0.0.0:$PORT to $HOST...\033[0m"
    ssh -o StrictHostKeyChecking=no -o ExitOnForwardFailure=yes -D 0.0.0.0:$PORT -N -i "$KEY" "$USER@$HOST" &
    SSH_PID=$!

    if [ -n "$SSH_PID" ]; then
        echo "$SSH_PID" > "$PID_FILE"
        PIDS+=("$SSH_PID")
        echo -e "\033[0;32m[SUCCESS] Tunnel for $NAME started (PID: $SSH_PID).\033[0m"
    else
        echo -e "\033[0;31m[ERROR] Failed to start SSH tunnel for $NAME.\033[0m"
    fi
}

if [ "$TARGET" == "all" ]; then
    start_tunnel "app"
    start_tunnel "customer"
else
    start_tunnel "$TARGET"
fi

echo -e "\n\033[0;35m[INFO] Tunnels are active. Press Ctrl+C to stop them and exit.\033[0m"
# Wait for background processes
wait
