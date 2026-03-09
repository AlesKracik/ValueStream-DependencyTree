# start-tunnel.ps1
# Helper script to start a SOCKS5 SSH tunnel for local development.
# Requires a .env file in the root directory with SSH_USER and SSH_HOST.

Write-Host "[INFO] Locating .env file..." -ForegroundColor Gray
$envFile = Join-Path (Get-Item .).FullName ".env"
if (-not (Test-Path $envFile)) {
    Write-Error "[ERROR] .env file not found at $envFile. Please create it based on .env.example."
    exit 1
}

Write-Host "[INFO] Loading environment variables from $envFile..." -ForegroundColor Gray
# Simple .env parser
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        Set-Item -Path "env:$name" -Value $value
    }
}

if (-not $env:SSH_USER -or -not $env:SSH_HOST) {
    Write-Error "[ERROR] SSH_USER and SSH_HOST must be defined in .env"
    exit 1
}

$port = if ($env:SOCKS_PROXY_PORT) { $env:SOCKS_PROXY_PORT } else { "1080" }
$keyPath = if ($env:SSH_KEY_PATH) { $env:SSH_KEY_PATH } else { "~/.ssh/id_rsa" }
$pidFile = Join-Path (Get-Item .).FullName ".tunnel.pid"

Write-Host "[INFO] Configuration:" -ForegroundColor Gray
Write-Host "  - SSH User: $env:SSH_USER" -ForegroundColor Gray
Write-Host "  - SSH Host: $env:SSH_HOST" -ForegroundColor Gray
Write-Host "  - SOCKS Port: $port" -ForegroundColor Gray
Write-Host "  - Key Path: $keyPath" -ForegroundColor Gray
Write-Host "  - PID File: $pidFile" -ForegroundColor Gray

# Check if tunnel is already running
if (Test-Path $pidFile) {
    Write-Host "[INFO] Found existing PID file: $pidFile" -ForegroundColor Gray
    $oldPid = Get-Content $pidFile -Raw
    if ($oldPid) {
        $oldProcess = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
        if ($oldProcess) {
            Write-Host "[ACTION] Tunnel is already running (PID: $oldPid). Stopping it..." -ForegroundColor Yellow
            Stop-Process -Id $oldPid -Force
            Write-Host "[SUCCESS] Stopped process $oldPid." -ForegroundColor Green
        } else {
            Write-Host "[INFO] PID $oldPid from file is not running." -ForegroundColor Gray
        }
    }
    Write-Host "[INFO] Cleaning up old PID file." -ForegroundColor Gray
    Remove-Item $pidFile
}

Write-Host "[ACTION] Starting SOCKS5 tunnel on 0.0.0.0:$port to $env:SSH_HOST..." -ForegroundColor Cyan

# Start ssh in the background
$sshProcess = Start-Process ssh -ArgumentList "-o StrictHostKeyChecking=no -o ExitOnForwardFailure=yes -D `"0.0.0.0:$port`" -N -i `"$keyPath`" $($env:SSH_USER)@$($env:SSH_HOST)" -PassThru -NoNewWindow

if ($sshProcess) {
    $sshProcess.Id | Out-File -FilePath $pidFile -Encoding ascii
    Write-Host "[SUCCESS] Tunnel started (PID: $($sshProcess.Id))." -ForegroundColor Green
    Write-Host "[INFO] To stop the tunnel, run this script again or kill PID $($sshProcess.Id)." -ForegroundColor Gray
} else {
    Write-Error "[ERROR] Failed to start SSH tunnel process."
}
