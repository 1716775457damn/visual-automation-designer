@echo off
setlocal

python runner.py ^
  --workspace "F:\projects\visual-automation-designer" ^
  --base-prompt ".\prompt.txt" ^
  --agent-command "opencode run --dir \"{workspace}\" --dangerously-skip-permissions \"Read and follow the full instructions in this file: {prompt_file}. Make the code changes directly in the workspace, then stop after this round.\"" ^
  --verify-command "npm test" ^
  --max-iters 5

endlocal
