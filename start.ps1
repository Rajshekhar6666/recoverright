# RecoverRight Local Launch Script (PowerShell)
# Usage: .\start.ps1 [-Docker] [-Mode dev|prod]

param (
    [switch]$Docker,
    [string]$Mode = "dev"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " RecoverRight Clinical Recovery Platform Launch Assistant " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if ($Docker) {
    Write-Host "Starting RecoverRight via Docker Compose..." -ForegroundColor Yellow
    if (-not (Test-Path ".env")) {
        Write-Host "Warning: .env not found. Copying .env.example..." -ForegroundColor Yellow
        Copy-Item ".env.example" ".env"
    }
    docker-compose up --build
    exit $LASTEXITCODE
}

# Local execution
Write-Host "[1/3] Checking environment..." -ForegroundColor Green
if (-not (Test-Path ".env")) {
    Write-Host "Notice: Creating default .env from .env.example" -ForegroundColor DarkGray
    Copy-Item ".env.example" ".env"
}

$PythonCmd = "python"
if (Test-Path "api\.venv\Scripts\python.exe") {
    $PythonCmd = "$PWD\api\.venv\Scripts\python.exe"
}

Write-Host "[2/3] Starting FastAPI Backend on http://localhost:8000..." -ForegroundColor Green
$ApiJob = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd api; & '$PythonCmd' -m uvicorn app.main:app --reload --port 8000" -PassThru

Write-Host "[3/3] Starting Next.js Web Frontend on http://localhost:3000..." -ForegroundColor Green
$WebJob = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd web; npm run dev" -PassThru

Write-Host "`nRecoverRight is launching!" -ForegroundColor Cyan
Write-Host "  - API Docs:           http://localhost:8000/docs" -ForegroundColor Gray
Write-Host "  - Health Probe:       http://localhost:8000/health" -ForegroundColor Gray
Write-Host "  - Staff Console:      http://localhost:3000/staff" -ForegroundColor Gray
Write-Host "  - Live Theater:       http://localhost:3000/live" -ForegroundColor Gray
Write-Host "  - Patient View (Demo):http://localhost:3000/p/demo" -ForegroundColor Gray
Write-Host "`nPress Ctrl+C or close the spawn windows to stop."
