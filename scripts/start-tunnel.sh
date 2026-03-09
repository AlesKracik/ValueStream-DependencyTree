#!/bin/bash
# start-tunnel.sh
# Helper script to start a SOCKS5 SSH tunnel for local development on MacOS/Linux.

echo -e "\033[0;90m[INFO] Locating .env file...\033[0m"
if [ -f .env ]; then
    echo -e "\033[0;90m[INFO] Loading environment variables from .env...\033[0m"
    export $(grep -v '^#' .env | xargs)
else
    echo -e "\033[0;31m[ERROR] .env file not found. Please create it based on .env.example.\033[0m"
    exit 1
fi

SSH_USER=${SSH_USER:-""}
SSH_HOST=${SSH_HOST:-""}
SOCKS_PORT=${SOCKS_PROXY_PORT:-1080}
SSH_KEY=${SSH_KEY_PATH:-"~/.ssh/id_rsa"}
PID_FILE=".tunnel.pid"

if [ -z "$SSH_USER" ] || [ -z "$SSH_HOST" ]; then
    echo -e "\033[0;31m[ERROR] SSH_USER and SSH_HOST must be defined in .env\033[0m"
    exit 1
fi

echo -e "\033[0;90m[INFO] Configuration:\033[0m"
echo -e "\033[0;90m  - SSH User: $SSH_USER\033[0m"
echo -e "\033[0;90m  - SSH Host: $SSH_HOST\033[0m"
echo -e "\033[0;90m  - SOCKS Port: $SOCKS_PORT\033[0m"
echo -e "\033[0;90m  - Key Path: $SSH_KEY\033[0m"
echo -e "\033[0;90m  - PID File: $PID_FILE\033[0m"

# Check if tunnel is already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    echo -e "\033[0;90m[INFO] Found existing PID file: $PID_FILE (PID: $OLD_PID)\033[0m"
    if ps -p "$OLD_PID" > /dev/null; then
        echo -e "\033[0;33m[ACTION] Tunnel is already running. Stopping it (PID: $OLD_PID)...\033[0m"
        kill "$OLD_PID"
        sleep 1
        echo -e "\033[0;32m[SUCCESS] Stopped process $OLD_PID.\033[0m"
    else
        echo -e "\033[0;90m[INFO] PID $OLD_PID from file is not running.\033[0m"
    fi
    echo -e "\033[0;90m[INFO] Cleaning up old PID file.\033[0m"
    rm "$PID_FILE"
fi

echo -e "\033[0;36m[ACTION] Starting SOCKS5 tunnel on 0.0.0.0:$SOCKS_PORT to $SSH_HOST...\033[0m"

# Using background manual capture for better PID tracking:
ssh -o StrictHostKeyChecking=no -o ExitOnForwardFailure=yes -D 0.0.0.0:$SOCKS_PORT -N -i "$SSH_KEY" "$SSH_USER@$SSH_HOST" &
SSH_PID=$!

if [ -n "$SSH_PID" ]; then
    echo "$SSH_PID" > "$PID_FILE"
    echo -e "\033[0;32m[SUCCESS] Tunnel started (PID: $SSH_PID).\033[0m"
    echo -e "\033[0;90m[INFO] To stop the tunnel, run this script again or kill PID $SSH_PID.\033[0m"
else
    echo -e "\033[0;31m[ERROR] Failed to start SSH tunnel process.\033[0m"
    exit 1
fi
