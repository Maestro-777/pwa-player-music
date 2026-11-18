@echo off
chcp 65001 >nul
title Resonance Music - запуск
cd /d "%~dp0"

if not exist "node_modules" (
  echo Сначала запусти 1-УСТАНОВИТЬ.bat
  pause
  exit /b 1
)
if not exist "server\node_modules" (
  echo Сначала запусти 1-УСТАНОВИТЬ.bat
  pause
  exit /b 1
)
if not exist "server\.env" (
  copy "server\.env.example" "server\.env" >nul
)

echo Запускаю музыкальный сервер...
start "Resonance - музыкальный сервер" cmd /k "cd /d ""%~dp0server"" && npm start"

timeout /t 2 /nobreak >nul
echo Запускаю интерфейс...
start "Resonance - интерфейс" cmd /k "cd /d ""%~dp0"" && npm run dev"

timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo Приложение открывается в браузере: http://localhost:5173
echo Не закрывай два чёрных окна: в них работают сервер и интерфейс.
echo Чтобы остановить плеер, закрой оба окна.
echo.
