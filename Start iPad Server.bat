@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
echo Starting the engine. Scan the QR code below with your iPad camera (same Wi-Fi).
call npm run dev
pause
