@echo off
setlocal
title Resonance Music - Phone Setup
cd /d "%~dp0"

echo.
echo PHONE ACCESS SETUP - TAILSCALE
echo ==============================
echo.
where tailscale >nul 2>nul
if errorlevel 1 (
  echo Tailscale was not found.
  echo Install it on this laptop and your phone:
  echo https://tailscale.com/download
  start "" "https://tailscale.com/download"
  pause
  exit /b 1
)

powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173 -TimeoutSec 3 ^| Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo Start 2-ZAPUSTIT.bat first, then run this file again.
  pause
  exit /b 1
)

echo Enabling private HTTPS access...
tailscale serve --bg http://127.0.0.1:5173
if errorlevel 1 (
  echo Tailscale Serve could not be enabled.
  echo Check that Tailscale is running and signed in.
  pause
  exit /b 1
)

echo.
echo Open the HTTPS URL shown above on your phone.
echo Tailscale must be connected on both devices.
echo The laptop must stay powered on and awake.
pause
