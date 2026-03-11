# start-tunnel.ps1
# Helper script to start SOCKS5 SSH tunnels from a consolidated .env file.
# Usage: 
#   .\scripts\start-tunnel.ps1 app        (Starts APP bastion)
#   .\scripts\start-tunnel.ps1 customer   (Starts CUSTOMER bastion)
#   .\scripts\start-tunnel.ps1 all        (Starts both)

param (
    [Parameter(Mandatory=$true)]
    [ValidateSet("app", "customer", "all")]
    [string]$Target
)

$EnvFile = ".env"
if (-not (Test-Path $EnvFile)) {
    Write-Host "[ERROR] .env file not found." -ForegroundColor Red
    exit 1
}

# Load .env file into process environment
Write-Host "[INFO] Loading environment variables from $EnvFile..." -ForegroundColor Gray
foreach ($line in Get-Content $EnvFile) {
    if ($line -notmatch "^#" -and $line -match "=") {
        $parts = $line -split "=", 2
        $key = $parts[0].Trim()
        $value = $parts[1].Trim()
        [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

function Start-Tunnel {
    param([string]$Name)
    
    $Prefix = $Name.ToUpper()
    $User = [System.Environment]::GetEnvironmentVariable("${Prefix}_SSH_USER")
    $Host = [System.Environment]::GetEnvironmentVariable("${Prefix}_SSH_HOST")
    $Port = [System.Environment]::GetEnvironmentVariable("${Prefix}_SOCKS_PORT")
    $Key  = $env:SSH_KEY_PATH
    
    if (-not $Port) { $Port = "1080" }
    if (-not $Key) { $Key = "~/.ssh/id_rsa" }
    
    if (-not $User -or -not $Host) {
        Write-Host "[ERROR] ${Prefix}_SSH_USER and ${Prefix}_SSH_HOST must be defined in .env" -ForegroundColor Red
        return
    }

    $PidFile = ".tunnel.$Name.pid"

    Write-Host "`n[INFO] Configuration for $Name ($Prefix):" -ForegroundColor Gray
    Write-Host "  - SSH User: $User" -ForegroundColor Gray
    Write-Host "  - SSH Host: $Host" -ForegroundColor Gray
    Write-Host "  - SOCKS Port: $Port" -ForegroundColor Gray
    Write-Host "  - PID File: $PidFile" -ForegroundColor Gray

    # Check if tunnel is already running
    if (Test-Path $PidFile) {
        $OldPid = Get-Content $PidFile
        $proc = Get-Process -Id $OldPid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "[ACTION] Tunnel for $Name is already running. Stopping it (PID: $OldPid)..." -ForegroundColor Yellow
            Stop-Process -Id $OldPid -Force
            Start-Sleep -Seconds 1
        }
        Remove-Item $PidFile
    }

    Write-Host "[ACTION] Starting SOCKS5 tunnel for $Name on 0.0.0.0:$Port to $Host..." -ForegroundColor Cyan
    $sshArgs = @("-o", "StrictHostKeyChecking=no", "-o", "ExitOnForwardFailure=yes", "-D", "0.0.0.0:$Port", "-N", "-i", $Key, "$User@$Host")
    $sshProc = Start-Process ssh -ArgumentList $sshArgs -PassThru -NoNewWindow

    if ($sshProc) {
        $sshProc.Id | Out-File $PidFile -NoNewline
        Write-Host "[SUCCESS] Tunnel for $Name started (PID: $($sshProc.Id))." -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Failed to start SSH tunnel for $Name." -ForegroundColor Red
    }
}

if ($Target -eq "all") {
    Start-Tunnel "app"
    Start-Tunnel "customer"
} else {
    Start-Tunnel $Target
}
