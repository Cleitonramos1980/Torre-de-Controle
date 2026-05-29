@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup.ps1" %*
exit /b %errorlevel%