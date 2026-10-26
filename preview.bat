@echo off
REM Serves the helpdesk pages at http://localhost:8080 for testing.
cd /d "%~dp0"
start "" http://localhost:8080/dashboard.html
python -m http.server 8080 || py -m http.server 8080
pause
