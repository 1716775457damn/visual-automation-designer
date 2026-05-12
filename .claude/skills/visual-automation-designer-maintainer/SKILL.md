---
name: visual-automation-designer-maintainer
description: Use this skill whenever the user is working on `visual-automation-designer`, mentions `F:\projects\visual-automation-designer`, asks about the Tauri desktop app, release installers, flow execution bugs, block config issues, condition branches, loop behavior, entry block behavior, or any mismatch between what the canvas shows and what the app actually executes. Be aggressive about using this skill for bug fixing, release work, runtime validation, frontend-backend data-shape mismatches, and iterative maintenance on this repository.
---

# Visual Automation Designer Maintainer

Use this skill for all meaningful maintenance work on this repository.

The project is a `React + TypeScript + Tauri + Rust` visual automation editor. The most important maintenance principle is that real desktop runtime behavior matters more than browser-only behavior. This repository has a history of bugs where the canvas looked correct but execution semantics or Tauri command payloads were wrong.

## Primary Standard

Treat this project as an execution-sensitive editor, not just a CRUD UI.

When you make changes, optimize for these priorities in order:

1. Runtime correctness in the desktop app
2. Frontend/backend data-shape consistency
3. Execution semantics matching the visible canvas
4. Release correctness and asset/version consistency
5. Code cleanup and refactoring

## Default Workflow

When this skill triggers, follow this workflow unless the user explicitly narrows scope:

1. Inspect the full chain involved in the issue
2. Prefer finding the true runtime source of truth before editing
3. Make the smallest correct fix
4. Add or update regression tests when the bug is reproducible
5. Run `npm run test`, `npm run lint`, and `npm run build`
6. If release work is involved, run `npm run tauri build`
7. If the user wants GitHub updates, commit and push after verification

## Investigation Rules

Always inspect both sides of the boundary when a feature crosses frontend and Tauri:

1. Frontend UI/editor components
2. Frontend flow serialization and hooks
3. Tauri TypeScript command wrappers
4. Rust command handlers and models
5. Rust executor behavior if execution is involved

Do not assume the browser mock path proves desktop correctness.

## High-Risk Areas

Pay extra attention to these areas because they have repeatedly caused real usage problems:

1. Tauri command payload field naming
2. `condition` branch semantics
3. `loop` and `loop_infinite` child execution semantics
4. execution using stale unsaved state
5. `entryBlock` stability
6. release version synchronization
7. generated assets polluting lint or test workflows

## Frontend/Backend Data Rules

If a Tauri command fails with missing fields or invalid args, suspect serialization mismatch first.

Common risk patterns:

1. frontend camelCase vs Rust snake_case
2. editor state using one representation while executor uses another
3. browser mock saving raw objects that the real Tauri command would reject

Prefer centralizing any field conversion at the Tauri TypeScript wrapper boundary instead of scattering conversion logic across UI components.

## Execution Semantics Rules

The canvas should not lie.

If the UI lets users connect or configure something visually, make sure execution derives from the same effective source of truth. If multiple representations exist, normalize them before save and execution.

Prefer save-time or execute-time canonicalization over trusting partially synchronized editor state.

## Release Rules

When building or publishing a release, always verify version consistency across:

1. `package.json`
2. `src-tauri/Cargo.toml`
3. `src-tauri/tauri.conf.json`

If release assets have the wrong version in filenames, check `tauri.conf.json` immediately.

Before creating a GitHub release:

1. check whether the tag already exists
2. check whether the release already exists
3. verify the generated asset filenames match the intended version
4. check GitHub Actions run status before manually uploading missing assets

## Git Rules

Do not touch unrelated worktree noise unless the user asks.

Examples of things to leave alone by default:

1. `auto-iterate/`
2. pure line-ending noise
3. generated output not required for the current task

If the user asks for commits or release publication, verify first, then commit only the intended files.

## Validation Standard

Minimum validation for normal code changes:

1. `npm run test`
2. `npm run lint`
3. `npm run build`

Add `npm run tauri build` when:

1. release artifacts are requested
2. a desktop-only runtime bug was fixed
3. Tauri config/version/package behavior changed

## Response Standard

When reporting results, always include:

1. what problem was fixed
2. the root cause
3. what changed
4. how it was validated
5. Git or release status if relevant
6. the next most natural follow-up risk

## Project References

Read these project-local references when relevant:

1. `references/runtime-risks.md` for repository-specific failure patterns
2. `references/release-checklist.md` for release/version workflow
