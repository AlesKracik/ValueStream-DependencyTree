#!/bin/bash
# start-tunnel.sh
# Helper script to start a SOCKS5 SSH tunnel for local development on MacOS/Linux.

if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

SSH_USER=${SSH_USER:-""}
SSH_HOST=${SSH_HOST:-""}
SOCKS_PORT=${SOCKS_PROXY_PORT:-1080}
SSH_KEY=${SSH_KEY_PATH:-"~/.ssh/id_rsa"}

if [ -z "$SSH_USER" ] || [ -z "$SSH_HOST" ]; then
    echo "Error: SSH_USER and SSH_HOST must be defined in .env"
    exit 1
fi

echo -e "\033[0;36mStarting SOCKS5 tunnel on 0.0.0.0:$SOCKS_PORT to $SSH_HOST...\033[0m"
echo -e "\033[0;33mPress Ctrl+C to stop the tunnel.\033[0m"

ssh -o StrictHostKeyChecking=no -o ExitOnForwardFailure=yes -D 0.0.0.0:$SOCKS_PORT -N -i "$SSH_KEY" "$SSH_USER@$SSH_HOST"
