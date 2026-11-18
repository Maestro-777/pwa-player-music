@echo off
chcp 65001 >nul
title Resonance Music - установка
cd /d "%~dp0"

echo.
echo  RESONANCE MUSIC - ПЕРВОНАЧАЛЬНАЯ УСТАНОВКА
echo  ==========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Не найден Node.js. Установи LTS-версию с https://nodejs.org/
  echo После установки закрой это окно и запусти файл снова.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo Не найден npm. Переустанови Node.js с сайта https://nodejs.org/
  pause
  exit /b 1
)

if not exist "server\.env" (
  copy "server\.env.example" "server\.env" >nul
  echo Создан server\.env
)

echo.
echo Устанавливаю компоненты интерфейса...
call npm install
if errorlevel 1 goto failed

echo.
echo Устанавливаю компоненты музыкального сервера...
pushd server
call npm install
if errorlevel 1 (
  popd
  goto failed
)
popd

echo.
echo ГОТОВО! Теперь дважды щёлкни по файлу 2-ЗАПУСТИТЬ.bat
pause
exit /b 0

:failed
echo.
echo Ошибка установки. Проверь подключение к интернету и повтори запуск.
pause
exit /b 1
