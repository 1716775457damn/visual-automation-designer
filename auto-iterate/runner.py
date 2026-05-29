import argparse
import json
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


DEFAULT_CONTEXT_TEMPLATE = """You are working inside the visual-automation-designer repository and should continue iterative repair.

Goal:
{base_prompt}

Iteration: {iteration}/{max_iterations}

Instructions:
1. Make direct code changes instead of only analyzing.
2. Prefer the smallest correct change.
3. Use the previous verification output to guide the next fix.
4. Avoid unrelated refactors.
5. End after this round. The outer runner will decide whether to continue.

Previous summary:
{previous_summary}

Previous verification output:
{previous_verification}
"""


@dataclass
class CommandResult:
    returncode: int
    stdout: str
    stderr: str

    @property
    def combined_output(self) -> str:
        parts = []
        if self.stdout:
            parts.append(self.stdout)
        if self.stderr:
            parts.append(self.stderr)
        return "\n".join(parts).strip()


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def clip_text(text: str, limit: int = 8000) -> str:
    text = (text or "").strip()
    if not text:
        return "none"
    if len(text) <= limit:
        return text
    return text[:limit] + "\n...[truncated]"


def run_command(command: str, cwd: Path) -> CommandResult:
    completed = subprocess.run(
        command,
        cwd=str(cwd),
        shell=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return CommandResult(
        returncode=completed.returncode,
        stdout=completed.stdout,
        stderr=completed.stderr,
    )


def is_git_repo(workspace: Path) -> bool:
    result = run_command("git rev-parse --is-inside-work-tree", workspace)
    return result.returncode == 0 and "true" in result.stdout.lower()


def git_snapshot(workspace: Path) -> dict:
    return {
        "status": run_command("git status --short", workspace).stdout,
        "diff_stat": run_command("git diff --stat", workspace).stdout,
        "staged_diff_stat": run_command("git diff --cached --stat", workspace).stdout,
    }


def render_prompt(
    base_prompt: str,
    iteration: int,
    max_iterations: int,
    previous_summary: str,
    previous_verification: str,
) -> str:
    return DEFAULT_CONTEXT_TEMPLATE.format(
        base_prompt=base_prompt.strip(),
        iteration=iteration,
        max_iterations=max_iterations,
        previous_summary=previous_summary.strip() or "none",
        previous_verification=previous_verification.strip() or "none",
    )


def expand_command(template: str, *, prompt_file: Path, workspace: Path, iteration: int) -> str:
    return template.format(
        prompt_file=str(prompt_file),
        workspace=str(workspace),
        iteration=iteration,
    )


def ensure_exists(path: Path, label: str) -> None:
    if not path.exists():
        raise SystemExit(f"{label} does not exist: {path}")


def write_final_summary(
    run_root: Path,
    *,
    stop_reason: str,
    exit_code: int,
    iteration: int,
    max_iters: int,
    verify_returncode: int | None,
    agent_returncode: int | None,
    previous_summary: str,
    previous_verification: str,
) -> None:
    summary = {
        "stop_reason": stop_reason,
        "exit_code": exit_code,
        "iteration": iteration,
        "max_iters": max_iters,
        "agent_returncode": agent_returncode,
        "verify_returncode": verify_returncode,
        "logs_dir": str(run_root),
        "last_agent_summary": previous_summary,
        "last_verification_output": previous_verification,
    }
    write_text(run_root / "final-summary.json", json.dumps(summary, indent=2, ensure_ascii=False))
    write_text(
        run_root / "final-summary.txt",
        "\n".join(
            [
                f"stop_reason: {stop_reason}",
                f"exit_code: {exit_code}",
                f"iteration: {iteration}/{max_iters}",
                f"agent_returncode: {agent_returncode}",
                f"verify_returncode: {verify_returncode}",
                f"logs_dir: {run_root}",
                "",
                "last_agent_summary:",
                previous_summary,
                "",
                "last_verification_output:",
                previous_verification,
            ]
        ),
    )


def write_latest_run_pointer(logs_root: Path, run_root: Path) -> None:
    payload = {
        "latest_run_dir": str(run_root),
        "updated_at": datetime.now().isoformat(timespec="seconds"),
    }
    write_text(logs_root / "latest-run.json", json.dumps(payload, indent=2, ensure_ascii=False))
    write_text(logs_root / "latest-run.txt", str(run_root))


def main() -> int:
    parser = argparse.ArgumentParser(description="Run unattended iterative OpenCode loops.")
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--base-prompt", required=True)
    parser.add_argument("--agent-command", required=True)
    parser.add_argument("--verify-command", default="npm test")
    parser.add_argument("--max-iters", type=int, default=5)
    parser.add_argument("--output-dir", default="logs")
    args = parser.parse_args()

    workspace = Path(args.workspace).resolve()
    base_prompt_path = Path(args.base_prompt).resolve()
    ensure_exists(workspace, "Workspace")
    ensure_exists(base_prompt_path, "Base prompt file")

    logs_root = Path(args.output_dir).resolve()
    run_root = logs_root / datetime.now().strftime("run-%Y%m%d-%H%M%S")
    run_root.mkdir(parents=True, exist_ok=True)
    write_latest_run_pointer(logs_root, run_root)

    base_prompt = read_text(base_prompt_path)
    previous_summary = "none"
    previous_verification = "none"
    seen_verification_signatures = set()
    git_enabled = is_git_repo(workspace)

    session_meta = {
        "workspace": str(workspace),
        "base_prompt": str(base_prompt_path),
        "agent_command": args.agent_command,
        "verify_command": args.verify_command,
        "max_iters": args.max_iters,
        "git_enabled": git_enabled,
        "started_at": datetime.now().isoformat(timespec="seconds"),
    }
    write_text(run_root / "session.json", json.dumps(session_meta, indent=2, ensure_ascii=False))

    last_agent_returncode = None
    last_verify_returncode = None

    for iteration in range(1, args.max_iters + 1):
        iter_dir = run_root / f"iter-{iteration:02d}"
        iter_dir.mkdir(parents=True, exist_ok=True)

        before_git = git_snapshot(workspace) if git_enabled else None
        prompt = render_prompt(
            base_prompt=base_prompt,
            iteration=iteration,
            max_iterations=args.max_iters,
            previous_summary=previous_summary,
            previous_verification=previous_verification,
        )
        prompt_file = iter_dir / "prompt.txt"
        write_text(prompt_file, prompt)

        agent_command = expand_command(
            args.agent_command,
            prompt_file=prompt_file,
            workspace=workspace,
            iteration=iteration,
        )
        verify_command = expand_command(
            args.verify_command,
            prompt_file=prompt_file,
            workspace=workspace,
            iteration=iteration,
        )

        agent_result = run_command(agent_command, workspace)
        verify_result = run_command(verify_command, workspace)
        after_git = git_snapshot(workspace) if git_enabled else None

        write_text(iter_dir / "agent.stdout.txt", agent_result.stdout)
        write_text(iter_dir / "agent.stderr.txt", agent_result.stderr)
        write_text(iter_dir / "verify.stdout.txt", verify_result.stdout)
        write_text(iter_dir / "verify.stderr.txt", verify_result.stderr)

        metadata = {
            "iteration": iteration,
            "agent_command": agent_command,
            "verify_command": verify_command,
            "agent_returncode": agent_result.returncode,
            "verify_returncode": verify_result.returncode,
            "before_git": before_git,
            "after_git": after_git,
        }
        write_text(iter_dir / "meta.json", json.dumps(metadata, indent=2, ensure_ascii=False))

        last_agent_returncode = agent_result.returncode
        last_verify_returncode = verify_result.returncode
        previous_summary = clip_text(agent_result.combined_output)
        previous_verification = clip_text(verify_result.combined_output)

        verification_signature = f"{verify_result.returncode}:{previous_verification}"
        if verify_result.returncode == 0:
            write_final_summary(
                run_root,
                stop_reason="verification passed",
                exit_code=0,
                iteration=iteration,
                max_iters=args.max_iters,
                verify_returncode=last_verify_returncode,
                agent_returncode=last_agent_returncode,
                previous_summary=previous_summary,
                previous_verification=previous_verification,
            )
            print(f"[stop] verification passed at iteration {iteration}")
            return 0

        if verification_signature in seen_verification_signatures:
            write_final_summary(
                run_root,
                stop_reason="verification output repeated",
                exit_code=2,
                iteration=iteration,
                max_iters=args.max_iters,
                verify_returncode=last_verify_returncode,
                agent_returncode=last_agent_returncode,
                previous_summary=previous_summary,
                previous_verification=previous_verification,
            )
            print(f"[stop] verification output repeated at iteration {iteration}")
            return 2
        seen_verification_signatures.add(verification_signature)

        if git_enabled and before_git == after_git:
            write_final_summary(
                run_root,
                stop_reason="no git-visible changes detected",
                exit_code=3,
                iteration=iteration,
                max_iters=args.max_iters,
                verify_returncode=last_verify_returncode,
                agent_returncode=last_agent_returncode,
                previous_summary=previous_summary,
                previous_verification=previous_verification,
            )
            print(f"[stop] no git-visible changes detected at iteration {iteration}")
            return 3

    write_final_summary(
        run_root,
        stop_reason="max iterations reached",
        exit_code=4,
        iteration=args.max_iters,
        max_iters=args.max_iters,
        verify_returncode=last_verify_returncode,
        agent_returncode=last_agent_returncode,
        previous_summary=previous_summary,
        previous_verification=previous_verification,
    )
    print(f"[stop] reached max iterations: {args.max_iters}")
    return 4


if __name__ == "__main__":
    sys.exit(main())
