@echo off
setlocal
cd /d "%~dp0"

if exist ".venv\Scripts\python.exe" goto install
if exist ".venv" (
    echo [ERROR] .venv exists but has no Python executable. Rename it and try again.
    goto failed
)

py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if not errorlevel 1 (
    py -3 -m venv ".venv"
    if errorlevel 1 goto failed
    goto install
)
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Install Python 3.10 or newer with pip and venv, then run this file again.
    echo Enable "Add python.exe to PATH" during installation.
    goto failed
)
python -m venv ".venv"
if errorlevel 1 goto failed

:install
".venv\Scripts\python.exe" -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"
if errorlevel 1 (
    echo [ERROR] The existing virtual environment requires Python 3.10 or newer.
    goto failed
)
".venv\Scripts\python.exe" -m ensurepip --upgrade
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -m pip install -r "backend\requirements.lock.txt"
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -m pip check
if errorlevel 1 goto failed
echo [OK] Server setup complete. Run start_server.bat to start the server.
exit /b 0

:failed
echo [ERROR] Server setup failed. Check the message above and run init_server.bat again.
pause
exit /b 1
