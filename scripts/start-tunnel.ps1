# start-tunnel.ps1
# Helper script to start a SOCKS5 SSH tunnel for local development.
# Requires a .env file in the root directory with SSH_USER and SSH_HOST.

$envFile = Join-Path (Get-Item .).FullName ".env"
if (-not (Test-Path $envFile)) {
    Write-Error ".env file not found in root directory."
    exit 1
}

# Simple .env parser
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        Set-Item -Path "env:$name" -Value $value
    }
}

if (-not $env:SSH_USER -or -not $env:SSH_HOST) {
    Write-Error "SSH_USER and SSH_HOST must be defined in .env"
    exit 1
}

$port = if ($env:SOCKS_PROXY_PORT) { $env:SOCKS_PROXY_PORT } else { "1080" }
$keyPath = if ($env:SSH_KEY_PATH) { $env:SSH_KEY_PATH } else { "~/.ssh/id_rsa" }

Write-Host "Starting SOCKS5 tunnel on 0.0.0.0:$port to $env:SSH_HOST..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the tunnel." -ForegroundColor Yellow

ssh -o StrictHostKeyChecking=no -o ExitOnForwardFailure=yes -D "0.0.0.0:$port" -N -i $keyPath "$($env:SSH_USER)@$($env:SSH_HOST)"
