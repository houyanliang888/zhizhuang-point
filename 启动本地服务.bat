@echo off
chcp 65001 >nul
title 智装点位通 - 本地服务
cd /d "%~dp0"

set PORT=8011
set PY=C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe
set URL=http://127.0.0.1:%PORT%/?nocache=%RANDOM%

REM 若服务已在跑（例如桌面启动器已起），直接开浏览器
netstat -ano | findstr /r ":%PORT% " >nul 2>&1
if not errorlevel 1 (
  start "" %URL%
  goto :eof
)

echo.
echo   正在启动本地服务...
echo   启动后浏览器会自动打开 http://127.0.0.1:%PORT%
echo.
echo   用完直接关掉这个黑窗口就行。
echo.

if exist "%PY%" (
    "%PY%" -m http.server %PORT%
) else (
    python -m http.server %PORT%
)

pause
