# Usage

This project ships a project-local maintenance skill for `visual-automation-designer`.

## What it is for

Use this skill whenever work touches:

1. Tauri desktop runtime bugs
2. flow execution semantics
3. block configuration serialization
4. release building or GitHub release publishing
5. frontend/backend data-shape mismatches

## Default expectations

The maintainer workflow should normally:

1. inspect the full UI -> hook -> Tauri wrapper -> Rust command -> executor chain
2. prefer the smallest correct fix
3. add regression coverage for real runtime bugs
4. run `npm run test`, `npm run lint`, and `npm run build`
5. run `npm run tauri build` when desktop runtime or release behavior is involved

## Release expectations

Always verify version consistency across:

1. `package.json`
2. `src-tauri/Cargo.toml`
3. `src-tauri/tauri.conf.json`

## Trigger hint

If you want to force the intended workflow in a future conversation, start with:

`按 visual-automation-designer maintainer 标准执行`
