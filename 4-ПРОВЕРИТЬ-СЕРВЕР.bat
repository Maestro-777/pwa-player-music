@echo off
chcp 65001 >nul
title Resonance Music - проверка
echo Проверяю музыкальный сервер...
powershell -NoProfile -Command "try { $r=Invoke-RestMethod http://127.0.0.1:4317/api/health -TimeoutSec 5; Write-Host ('Сервер работает. Треков в индексе: ' + $r.trackCount); Write-Host ('Папка музыки: ' + $r.root) } catch { Write-Host 'Сервер не отвечает. Сначала запусти 2-ЗАПУСТИТЬ.bat'; exit 1 }"
echo.
pause
