@echo off
setlocal

set "LATEST_FILE=logs\latest-run.txt"

if not exist "%LATEST_FILE%" (
  echo latest run pointer not found: %LATEST_FILE%
  exit /b 1
)

set /p LATEST_RUN=<"%LATEST_FILE%"

if "%LATEST_RUN%"=="" (
  echo latest run pointer is empty
  exit /b 1
)

set "SUMMARY_FILE=%LATEST_RUN%\final-summary.txt"

if not exist "%SUMMARY_FILE%" (
  echo final summary not found: %SUMMARY_FILE%
  exit /b 1
)

type "%SUMMARY_FILE%"

endlocal
