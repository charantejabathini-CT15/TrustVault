# TrustVault 1-Click PowerShell Dev Launcher
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  TrustVault - Secure Document Sharing & Audit Trail" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting Backend API (FastAPI on http://127.0.0.1:8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\backend'; .\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

Write-Host "Starting Frontend UI (Vite on http://127.0.0.1:5173)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\frontend'; npm run dev"

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "Both servers launched successfully!" -ForegroundColor Green
Write-Host "Backend API:  http://127.0.0.1:8000/api/docs" -ForegroundColor Green
Write-Host "Frontend App: http://127.0.0.1:5173" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
