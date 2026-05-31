# VAD v0.5.0 — Radical Optimization Design

**Date**: 2026-05-31  
**Author**: Marvis  
**Scope**: Performance + Architecture + UI/UX + Accessibility

---

## 1. Architecture Split

### Frontend

| File | Size | Split Into |
|---|---|---|
| `App.tsx` (37.5KB) | Layout + routing + state + lifecycle tangled | `AppShell.tsx` + feature providers per domain |
| `useFlow.ts` (23.9KB, 839 lines) | Single hook with too many concerns | `useNodes` / `useEdges` / `useHistory` / `useValidation` |
| `FlowCanvas.tsx` (21.8KB) | Canvas + drag + context menu + shortcuts | `FlowCanvas.tsx` (pure) + `useDragDrop.ts` + `useCanvasShortcuts.ts` |
| `BlockConfig.tsx` (19.7KB) | All block types in one file | `ActionConfig.tsx` / `ControlConfig.tsx` / shared `BaseConfig.tsx` |

### Backend (Rust)

| File | Size | Split Into |
|---|---|---|
| `executor.rs` (40.5KB) | Core bottleneck | `runner` / `step_executor` / `image_match` / `input_sim` modules |
| `validator.rs` (28.3KB) | Massive validation logic | `flow_validator` / `block_validator` / `connection_validator` |

---

## 2. P0 Performance Fixes

| Issue | Root Cause | Fix |
|---|---|---|
| `onDragOver` re-render loop | Deps on `isDropActive` state creates cycle | Use ref instead of state for drag tracking |
| `handleNodesChange` cascade | Deps on `nodes` state array | Use functional updater from `useNodesState` |
| `onPaneMouseMove` high frequency | State write per mousemove | Throttle 16ms + ref write, batch via rAF |
| `addConnection` nested setState | Multiple setStates in sequence | Merge into single `useReducer` dispatch |

---

## 3. Design Token System

Six token categories as CSS custom properties:

- `--vad-color-*` (primary, surface, text, accent, semantic)
- `--vad-space-*` (xs/sm/md/lg/xl/2xl, 4px scale)
- `--vad-font-*` (family, size-sm/md/lg/xl, weight)
- `--vad-shadow-*` (sm/md/lg/glow)
- `--vad-radius-*` (sm/md/lg/full)
- `--vad-transition-*` (fast/normal/slow, easing curves)

Dual theme: light + dark, switchable via CSS class on `<html>`.

---

## 4. Glassmorphism v2

- Dynamic backdrop blur (intensity shifts based on underlying content)
- Light-following glow (subtle gradient follows cursor on canvas)
- Improved depth hierarchy via multi-layer shadows
- Smooth state transitions (node hover → glow, connection drag → pulse)

---

## 5. Micro-interactions

- Node hover: soft glow + subtle scale(1.02)
- Connection line: animated dash on drag
- Drag preview: ghost with reduced opacity
- Toast: slide-in from top-right, auto-dismiss with fade-out
- Toolbox: item lift animation on hover
- Status bar: pulse on execution state change

---

## 6. Accessibility (WCAG AA Target)

| Area | Current | Target |
|---|---|---|
| Keyboard nav | Partial | Full Tab/Shift+Tab traversal on canvas |
| ARIA labels | Missing | All interactive elements: role + aria-label |
| Focus management | None | Modal auto-focus, return on close |
| Contrast ratio | Unchecked | 4.5:1 minimum (AA) |
| Screen reader | Unsupported | Node content readable, actions announced |
| Focus indicators | Inconsistent | Visible 2px outline on all focusable |

---

## 7. Implementation Phases

| Phase | Content | Files |
|---|---|---|
| **P1** | Spec doc + backup | 0 changed |
| **P2** | Design tokens | Global CSS + types |
| **P3** | P0 perf fixes | useFlow / FlowCanvas / BlockNode |
| **P4** | Frontend split | App / hooks / components |
| **P5** | Rust split | executor / validator |
| **P6** | a11y + micro-interactions | All components |
