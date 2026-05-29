@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore.ps1" %*
exit /b %errorlevel%