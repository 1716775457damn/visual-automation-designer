# Auto Iterate

This directory wraps OpenCode in an outer loop so it can iterate on `visual-automation-designer` without manual intervention.

## Files

```text
auto-iterate/
  runner.py
  prompt.txt
  README.md
  logs/
```

## Recommended verification command

For this repository, the default fast verification command is:

```powershell
npm test
```

This project also has these useful scripts:

```powershell
npm run lint
npm run build
```

For quick iteration, start with `npm test`. After the workflow is stable, you can switch to `npm run build` or a combined command outside this template.

## Required inputs

You need to provide:

1. The project directory
2. An OpenCode command template

## Example command

Run this from `F:\projects\visual-automation-designer\auto-iterate`:

```powershell
python runner.py ^
  --workspace "F:\projects\visual-automation-designer" ^
  --base-prompt ".\prompt.txt" ^
  --agent-command "opencode run --dir \"{workspace}\" \"Read and follow the full instructions in this file: {prompt_file}. Make the code changes directly in the workspace, then stop after this round.\"" ^
  --verify-command "npm test" ^
  --max-iters 5
```

## One-click launchers

This directory also includes:

```text
open-latest-log.bat
run-safe.bat
run-full-check.bat
run-unattended.bat
show-latest-summary.bat
```

Use `run-safe.bat` first. It runs only `2` iterations and does not skip permission prompts.

Use `run-full-check.bat` when you want stricter verification. It runs `npm test` and then `npm run build` on each iteration, with unattended permissions enabled.

Use `run-unattended.bat` when you want no permission prompts. It runs `5` iterations and includes `--dangerously-skip-permissions`.

Use `open-latest-log.bat` to open the newest run directory in Explorer.

Use `show-latest-summary.bat` to print the newest `final-summary.txt` in the terminal.

From a terminal in this directory:

```powershell
.\run-safe.bat
```

or:

```powershell
.\run-full-check.bat
```

or:

```powershell
.\run-unattended.bat
```

To open the latest run folder:

```powershell
.\open-latest-log.bat
```

To print the latest final summary:

```powershell
.\show-latest-summary.bat
```

## Full-check command note

`run-full-check.bat` currently uses this verification chain:

```powershell
npm test && npm run build
```

If your shell environment does not accept `&&` inside the spawned command, switch the launcher to a PowerShell-compatible form such as:

```powershell
powershell -Command "npm test; if ($?) { npm run build }"
```

If you want fully unattended execution without permission prompts, add `--dangerously-skip-permissions` inside `--agent-command`:

```powershell
python runner.py ^
  --workspace "F:\projects\visual-automation-designer" ^
  --base-prompt ".\prompt.txt" ^
  --agent-command "opencode run --dir \"{workspace}\" --dangerously-skip-permissions \"Read and follow the full instructions in this file: {prompt_file}. Make the code changes directly in the workspace, then stop after this round.\"" ^
  --verify-command "npm test" ^
  --max-iters 5
```

## Stop conditions

The loop stops when any of these happen:

1. `npm test` succeeds
2. The maximum iteration count is reached
3. The same verification failure repeats
4. No new Git-visible changes are detected

## Logs

Each run writes artifacts under `logs/run-YYYYMMDD-HHMMSS/`, including:

```text
latest-run.txt
latest-run.json
session.json
final-summary.txt
final-summary.json
iter-01/
  prompt.txt
  agent.stdout.txt
  agent.stderr.txt
  verify.stdout.txt
  verify.stderr.txt
  meta.json
```

`final-summary.txt` is the quickest place to inspect the end result of an unattended run. It records the stop reason, exit code, last return codes, log directory, and the final verification output.

`latest-run.txt` points to the newest run directory. `latest-run.json` stores the same path plus an update timestamp.

## Recommendation

Start with `--max-iters 2` first to verify your local `opencode` command shape, then increase to `5` or `10`.
