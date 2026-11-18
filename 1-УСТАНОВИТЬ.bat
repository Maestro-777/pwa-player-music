@echo off
setlocal
title Resonance Music - Setup
cd /d "%~dp0"

echo.
echo RESONANCE MUSIC - FIRST TIME SETUP
echo ==================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js LTS from https://nodejs.org/
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js LTS from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "server\.env" (
  copy /y "server\.env.example" "server\.env" >nul
  if errorlevel 1 (
    echo Could not create server\.env
    pause
    exit /b 1
  )
)

echo Installing frontend packages...
call npm install
if errorlevel 1 goto failed

echo Installing music server packages...
pushd server
call npm install
if errorlevel 1 (
  popd
  goto failed
)
popd

echo.
echo SETUP COMPLETE.
echo Now double-click 2-ZAPUSTIT.bat
pause
exit /b 0

:failed
echo.
echo INSTALLATION FAILED. Check your internet connection and try again.
pause
exit /b 1
