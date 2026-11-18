@echo off
setlocal
title Resonance Music - Start
cd /d "%~dp0"

if not exist "node_modules" (
  echo Run 1-USTANOVIT.bat first.
  pause
  exit /b 1
)
if not exist "server\node_modules" (
  echo Run 1-USTANOVIT.bat first.
  pause
  exit /b 1
)

if not exist "server\.env" copy /y "server\.env.example" "server\.env" >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "server\ensure-access-key.ps1"
if errorlevel 1 (
  echo Failed to create the Resonance access key.
  pause
  exit /b 1
)

echo Starting protected music server...
start "Resonance Music Server" cmd /k "cd /d ""%~dp0server"" && npm start"
timeout /t 2 /nobreak >nul

echo Starting web player...
start "Resonance Music Player" cmd /k "cd /d ""%~dp0"" && npm run dev"
timeout /t 4 /nobreak >nul
start "" "http://127.0.0.1:5173"

echo.
echo Player address: http://127.0.0.1:5173
echo Access key saved to: server\.access-key.txt
echo Keep the server and player command windows open while listening.
echo.

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo Public internet link is not available yet.
  echo Install it with: winget install --id Cloudflare.cloudflared -e
  echo Then run 5-INTERNET-DOSTUP.bat or restart this launcher.
) else (
  choice /c YN /t 8 /d Y /m "Start a temporary public internet link? Only devices with your access key can use the music API."
  if not errorlevel 2 start "Resonance Internet Tunnel" cmd /k "cloudflared tunnel --url http://127.0.0.1:5173"
)

echo.
echo Use the trycloudflare.com URL printed in the tunnel window.
echo Do not share server\.access-key.txt with anyone.
pause
