@echo off
setlocal

python runner.py ^
  --workspace "F:\projects\visual-automation-designer" ^
  --base-prompt ".\prompt.txt" ^
  --agent-command "opencode run --dir \"{workspace}\" \"Read and follow the full instructions in this file: {prompt_file}. Make the code changes directly in the workspace, then stop after this round.\"" ^
  --verify-command "npm test" ^
  --max-iters 2

endlocal
