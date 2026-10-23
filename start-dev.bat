@echo off
title TrustVault - Full Stack Development Server
echo ========================================================
echo   TrustVault - Secure Document Sharing & Audit Trail
echo ========================================================
echo.
echo Starting Backend API (FastAPI on http://127.0.0.1:8000)...
start "TrustVault Backend" cmd /k "cd /d %~dp0backend && .\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo Starting Frontend UI (Vite on http://127.0.0.1:5173)...
start "TrustVault Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ========================================================
echo Both servers are launching!
echo Backend:  http://127.0.0.1:8000/api/docs
echo Frontend: http://127.0.0.1:5173
echo ========================================================
echo Press any key to exit this launcher window...
pause >nul
