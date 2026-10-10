# admin_page
jnu2026-2 web test pilot test page #2

HOW TO RUN SERVER? (Windows)
0. (`Node.js`가 없다면 설치하고) `npm.cmd install`
1. Install Python 3.10 or newer with pip and venv. Enable "Add python.exe to PATH" during installation.
2. After cloning the repository, run `init_server.bat`. It creates '.venv' and installs the pinned Python dependencies from 'backend/requirements.lock.txt'. An internet connection is required for the first installation.
3. Run `start_server.bat`. The server listens at `http://127.0.0.1:8000`.
4. 계정을 만들고 로그인하세요.

You can run `init_server.bat` again after updating the repository; it reuses the existing virtual environment. Setup stops and reports an error if any step fails. The default SQLite database is created and migrated automatically when the server starts.

The built frontend assets in `dist/` are included in Git, so running the server from a fresh clone does not require Node.js/npm. When changing frontend source code, install Node.js/npm, run `npm install` and `npm run build`, and commit the updated `dist/` assets together with the source changes.
