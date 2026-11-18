@echo off
title Resonance Music - Health Check
echo Checking music server...
powershell -NoProfile -Command "try { $r=Invoke-RestMethod http://127.0.0.1:4317/api/health -TimeoutSec 5; Write-Host ('Server is running. Indexed tracks: ' + $r.trackCount); Write-Host ('Music folder: ' + $r.root) } catch { Write-Host 'Server is not responding. Start 2-ZAPUSTIT.bat first.'; exit 1 }"
echo.
pause
