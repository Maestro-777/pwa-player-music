@echo off
setlocal
title Resonance Music - Internet Access
cd /d "%~dp0"

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo Cloudflare Tunnel is not installed.
  echo Install it with:
  echo winget install --id Cloudflare.cloudflared -e
  echo Then run this file again.
  pause
  exit /b 1
)

if not exist "server\.access-key.txt" (
  echo Access key is missing. Run 2-ZAPUSTIT.bat first.
  pause
  exit /b 1
)

echo.
echo Starting a temporary public URL for Resonance Music...
echo The app requires the secret key from server\.access-key.txt.
echo This URL changes when the tunnel is restarted.
echo Keep this window open while using the public link.
echo.
cloudflared tunnel --url http://127.0.0.1:5173
pause
