@echo off
setlocal
cd /d "%~dp0..\.."
if errorlevel 1 exit /b 1
set "XDG_DATA_HOME=%CD%\tools\caddy\runtime"
set "XDG_CONFIG_HOME=%CD%\tools\caddy\config"
set "VERDANO_WORKSPACE=%CD:\=/%"
if not exist "tools\caddy\caddy.exe" (
  echo Caddy is missing from tools\caddy. See the landing page README.
  exit /b 1
)
"tools\caddy\caddy.exe" run --config "verdano_site\deploy\Caddyfile.production" --adapter caddyfile
exit /b %ERRORLEVEL%
