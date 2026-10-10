@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Run init_server.bat before starting the server.
    pause
    exit /b 1
)
powershell.exe -NoProfile -NoExit -Command "& '.\.venv\Scripts\python.exe' -m uvicorn backend.app:app --host 127.0.0.1 --port 8000"
