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

echo Starting music server...
start "Resonance Music Server" cmd /k "cd /d ""%~dp0server"" && npm start"

timeout /t 2 /nobreak >nul
echo Starting web player...
start "Resonance Music Player" cmd /k "cd /d ""%~dp0"" && npm run dev"

timeout /t 4 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo Player address: http://localhost:5173
echo Keep both command windows open while listening.
echo Close both windows to stop the player.
