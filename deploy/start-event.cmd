@echo off
setlocal
cd /d "%~dp0.."
if errorlevel 1 exit /b 1
node event-server/server.cjs
exit /b %ERRORLEVEL%
