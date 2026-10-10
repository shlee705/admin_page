@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -NoExit -Command "& '.\.venv\Scripts\python.exe' -m uvicorn backend.app:app --host 127.0.0.1 --port 8000"