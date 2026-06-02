@echo off
cd /d C:\TorreControle
"C:\TorreControle\runtime\node\node.exe" backend/dist/server.js >> C:\TorreControle\backend\backend-live.log 2>&1
