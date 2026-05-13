# Desktop Runtime Hardening Checklist

This document tracks high-priority runtime issues for the packaged desktop app.

## 1. Startup and fatal-failure hardening

- [x] Remove panic/expect/unwrap from startup critical path
- [x] Make input controller initialization return `Result`
- [ ] Add user-visible startup failure state
- [ ] Verify release app behavior without console

## 2. Execution failure visibility

- [ ] Add backend execution-failed event
- [ ] Include error code, message, block id, remediation hint
- [ ] Surface async runtime failures in execution UI
- [ ] Distinguish stopped vs failed vs validation-blocked

## 3. Pause/stop responsiveness

- [ ] Add pause checks inside wait-image loop
- [ ] Add pause checks inside wait-time loop
- [ ] Make text input cancellable between characters
- [ ] Make repeated clicks cancellable between clicks
- [ ] Verify stop latency under active execution

## 4. Screen/DPI/multi-monitor correctness

- [ ] Model display origin/bounds/scale
- [ ] Convert image match results to global desktop coordinates
- [ ] Support non-primary display capture/execution
- [ ] Test negative monitor coordinates
- [ ] Test mixed-DPI setups

## 5. Platform permission and environment checks

- [ ] Add pre-execution runtime self-check command
- [ ] Detect screen capture unavailability
- [ ] Detect input/accessibility unavailability
- [ ] Add platform-specific remediation text
- [ ] Show checks before first execution

## 6. Image library resilience

- [ ] Recover from corrupted library metadata
- [ ] Mark missing image files as broken entries
- [ ] Clean up temp files for clipboard imports
- [ ] Add repair/rebuild image library path

## 7. Release-app verification

- [ ] Test fresh install on clean Windows machine
- [ ] Test first launch with empty app data dir
- [ ] Test image import + execution in packaged app
- [ ] Test runtime error UX in packaged app
- [ ] Record unsigned-build warning guidance

## Validation Evidence

- [ ] Reproduction steps
- [ ] Before/after behavior notes
- [ ] Screenshots or logs from packaged app
- [ ] Platform matrix checked
