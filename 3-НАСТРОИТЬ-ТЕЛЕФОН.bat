@echo off
chcp 65001 >nul
title Resonance Music - доступ с телефона
cd /d "%~dp0"

echo.
echo  ДОСТУП С ТЕЛЕФОНА ЧЕРЕЗ ЗАЩИЩЁННУЮ СЕТЬ TAILSCALE
echo  =================================================
echo.
where tailscale >nul 2>nul
if errorlevel 1 (
  echo Tailscale не найден.
  echo 1. Установи Tailscale на ноутбук: https://tailscale.com/download
  echo 2. Установи приложение Tailscale на телефон.
  echo 3. Войди в один и тот же аккаунт на обоих устройствах.
  echo 4. Снова запусти этот файл.
  echo.
  start "" "https://tailscale.com/download"
  pause
  exit /b 1
)

echo Проверяю, что локальный интерфейс запущен...
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173 -TimeoutSec 3 ^| Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo Сначала запусти 2-ЗАПУСТИТЬ.bat и дождись открытия плеера.
  pause
  exit /b 1
)

echo Включаю защищённую HTTPS-ссылку Tailscale Serve...
tailscale serve --bg http://127.0.0.1:5173
if errorlevel 1 (
  echo Не удалось включить Tailscale Serve.
  echo Проверь, что Tailscale запущен и выполнен вход в аккаунт.
  pause
  exit /b 1
)

echo.
echo Если команда показала HTTPS-адрес вида https://имя-устройства....
echo открой его на телефоне, подключённом к тому же Tailscale-аккаунту.
echo В браузере телефона выбери "Добавить на главный экран".
echo.
echo Музыка останется на ноутбуке. Ноутбук должен быть включён
echo и не должен переходить в спящий режим.
pause
