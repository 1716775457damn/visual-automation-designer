@echo off
setlocal

for %%I in ("%~dp0..") do set "WORKSPACE=%%~fI"

python "%~dp0runner.py" ^
  --workspace "%WORKSPACE%" ^
  --base-prompt "%~dp0prompt.txt" ^
  --agent-command "opencode run --dir \"{workspace}\" \"Read and follow the full instructions in this file: {prompt_file}. Make the code changes directly in the workspace, then stop after this round.\"" ^
  --verify-command "npm test" ^
  --max-iters 2

endlocal
