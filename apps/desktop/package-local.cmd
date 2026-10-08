@echo off
setlocal
rem Double-clickable launcher for scripts\package-local.mjs. Arguments are forwarded unchanged.
set "PACKAGE_LOCAL_NODE=node"
where node >nul 2>nul || set "PACKAGE_LOCAL_NODE=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
set "ELECTRON_RUN_AS_NODE="
"%PACKAGE_LOCAL_NODE%" "%~dp0scripts\package-local.mjs" %*
set "PACKAGE_LOCAL_CODE=%ERRORLEVEL%"
if "%~1"=="" pause
exit /b %PACKAGE_LOCAL_CODE%
