@echo off
setlocal

set "LATEST_FILE=%~dp0logs\latest-run.txt"

if not exist "%LATEST_FILE%" (
  echo latest run pointer not found: %LATEST_FILE%
  exit /b 1
)

set /p LATEST_RUN=<"%LATEST_FILE%"

if "%LATEST_RUN%"=="" (
  echo latest run pointer is empty
  exit /b 1
)

if not exist "%LATEST_RUN%" (
  echo latest run directory not found: %LATEST_RUN%
  exit /b 1
)

start "" "%LATEST_RUN%"

endlocal
