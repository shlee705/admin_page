# admin_page
jnu2026-2 web test pilot test page #2

HOW TO RUN SERVER? (Windows)

1. Install Python 3.10 or newer with pip and venv. Enable "Add python.exe to PATH" during installation.
2. After cloning the repository, run `init_server.bat`. It creates `.venv` and installs the pinned Python dependencies from `backend/requirements.lock.txt`. An internet connection is required for the first installation.
3. Run `start_server.bat`. The server listens at http://127.0.0.1:8000.

You can run `init_server.bat` again after updating the repository; it reuses the existing virtual environment. Setup stops and reports an error if any step fails. The default SQLite database is created and migrated automatically when the server starts.

The dashboard also requires frontend assets in `dist/`. On a fresh clone, install Node.js/npm and run `npm install`, then `npm run build` to generate them.
