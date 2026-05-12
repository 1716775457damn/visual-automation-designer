# Release Checklist

Use this checklist whenever building or publishing a release.

## Version Sync

Confirm these three files use the same version:

1. `package.json`
2. `src-tauri/Cargo.toml`
3. `src-tauri/tauri.conf.json`

## Pre-Release Validation

Run:

1. `npm run test`
2. `npm run lint`
3. `npm run build`
4. `npm run tauri build`

## Asset Validation

Confirm the generated asset filenames match the target version.

Expected Windows assets usually include:

1. `*_x64-setup.exe`
2. `*_x64_en-US.msi`
3. `*_x64_zh-CN.msi`
4. `*_x64_zh-TW.msi`

## GitHub Release Rules

Before creating or modifying a release:

1. check `gh release view <tag>`
2. check `gh run list --workflow release.yml`
3. if the workflow is still running, avoid manual uploads that could conflict with CI
4. if assets are missing after workflow completion, then consider manual upload
