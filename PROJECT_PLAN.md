# Visual Automation Designer Development Plan

## 1. Project Goal

Build `visual-automation-designer` into a stable, understandable, and releasable desktop automation editor where:

1. the canvas accurately reflects runtime behavior
2. configuration errors are exposed before execution whenever possible
3. desktop releases are version-consistent and easy to distribute
4. maintenance work follows a repeatable, test-first standard

## 2. Current Status Snapshot

- Version: `0.4.6`
- Stack: `React + TypeScript + Tauri + Rust`
- Release pipeline: GitHub Actions multi-platform build for Windows, macOS, and Linux
- Current project maintenance standard: `.claude/skills/visual-automation-designer-maintainer/`
- Current working branch target: `main`

## 3. Execution Rules

All meaningful maintenance work on this repository should follow these rules:

1. inspect the full UI -> hook -> Tauri wrapper -> Rust command -> executor chain before editing
2. prioritize desktop runtime correctness over browser-only behavior
3. prefer the smallest correct fix
4. add regression coverage for real runtime bugs
5. run `npm run test`, `npm run lint`, and `npm run build` for normal code changes
6. run `npm run tauri build` when desktop runtime or release behavior changes
7. do not touch unrelated worktree noise unless explicitly requested

## 4. Phase 0 基础治理

Status: `[done]`

Goal: make the repository easier to maintain and easier to reason about.

- [done] 建立项目专属 maintainer skill
- [done] 建立 release checklist 和 runtime risk references
- [done] 固化默认验证流程：`test / lint / build / tauri build`
- [done] 建立完整开发计划与优化路线图文档 (`OPTIMIZATION_ROADMAP.md`)
- [next] 明确 `auto-iterate/` 的去留策略
- [next] 为团队沉淀更细的提交流程与发布说明

Acceptance Criteria:

1. repository contains maintenance standards and roadmap
2. developers can quickly identify the current phase and next priorities
3. unrelated workspace noise no longer causes confusion

## 5. Phase 1 运行时一致性

Status: `[in_progress]`

Goal: ensure the visible graph and the executed flow mean the same thing.

- [done] 修复 Tauri config 序列化字段命名不一致
- [done] 在执行前保存并规范化当前 flow
- [done] 条件块分支从连接关系派生
- [done] 循环块 children 从连接关系派生
- [done] 增量编辑时同步条件块语义
- [done] 入口块稳定推导
- [done] 允许显式设置入口块
- [next] 继续减少“只有保存后才完全一致”的残余窗口
- [next] 审视控制块结构在更复杂图中的运行语义

Acceptance Criteria:

1. users do not need a manual save cycle to get correct execution semantics
2. condition branches and loop children match visible connections
3. execution starts from a stable and understandable entry block

## 6. Phase 2 编辑体验与可理解性

Status: `[in_progress]`

Goal: make building and repairing flows understandable for non-expert users.

- [done] 新手引导和快速创建入口
- [done] 快速放置与精确放置模式
- [done] 节点新增反馈和最近节点高亮
- [done] 右键菜单入口增强
- [done] 节点右键“设为入口”
- [done] 状态栏展示结构问题
- [done] 将结构问题定位到具体节点
- [done] 在配置区或节点层级高亮有问题的块
- [next] 评估是否需要“清除入口”操作

Acceptance Criteria:

1. users can quickly identify where to start and what to fix
2. entry node behavior is visible and controllable
3. configuration and structure problems are understandable without reading logs

## 7. Phase 3 流程校验体系

Status: `[done]`

Goal: move runtime failures into earlier structural validation.

- [done] 执行前阻断 error 级 flow validation
- [done] 状态栏显示第一条 validation error / warning
- [done] 编辑后自动刷新 validation state
- [done] 增加节点级 validation 定位
- [done] 强化条件块结构规则
- [done] 强化循环块结构规则
- [next] 更明确地区分 warning 与 error 的 UI 呈现

Acceptance Criteria:

1. most malformed flows are caught before execution starts
2. users receive actionable messages, not generic failure notices
3. warnings and errors are surfaced in a predictable way

## 8. Phase 4 自动化测试体系

Status: `[in_progress]`

Goal: ensure high-risk user paths stay fixed.

- [done] 前端 UI tests 覆盖核心配置组件
- [done] `src/tauri/flow.ts` 命令包装层测试
- [done] `useFlow` 语义同步测试
- [done] `App` 执行前保存/校验阻断测试
- [done] 入口块设置菜单测试
- [done] 节点级 validation 高亮测试
- [next] 更多控制块复杂结构执行测试
- [next] release/version consistency 自动检查测试或脚本

Acceptance Criteria:

1. high-risk runtime semantics have regression coverage
2. bug fixes are reproducible before and after the change
3. release-critical paths are protected by checks, not memory alone

## 9. Phase 5 发布与安装体验

Status: `[in_progress]`

Goal: make each release consistent, installable, and visually polished.

- [done] 三处版本源同步流程建立
- [done] 修正 Tauri packaging version source
- [done] `v0.4.6` release 成功生成全平台资产
- [done] 重做桌面应用图标资产
- [next] 增加 release 前自动版本校验脚本
- [next] 规范化 release notes 内容
- [next] 评估是否需要更好的安装后首屏体验

Acceptance Criteria:

1. release tag, package version, and asset filenames always match
2. Windows, macOS, and Linux assets are consistently produced
3. the packaged app looks intentional and professional

## 10. Phase 6 桌面执行能力增强

Status: `[next]`

Goal: improve reliability and diagnosability of actual automation runs.

- [next] 图片匹配失败提示更具体
- [next] 输入/点击失败恢复策略
- [next] 执行日志分级显示
- [next] 步进与暂停的可理解性增强
- [next] 权限问题、资源缺失、超时问题的用户提示细化

Acceptance Criteria:

1. users can distinguish config bugs from runtime environment failures
2. automation failures are easier to debug from UI feedback
3. desktop execution feels reliable, not opaque

## 11. Phase 7 文档与团队协作

Status: `[in_progress]`

Goal: make the project maintainable by future sessions and teammates.

- [done] 项目内 maintainer skill 入库
- [done] runtime risk and release checklist references
- [done] 当前开发计划文档
- [next] 团队用法说明与 onboarding 文档
- [next] 维护者操作手册
- [next] 问题分类与优先级标准

Acceptance Criteria:

1. future maintainers know the standard workflow immediately
2. priorities and progress are visible without reading long chat history
3. release and runtime troubleshooting knowledge is preserved in the repo

## 12. Current Focus

Current Phase: `Phase 4 自动化测试体系`

Immediate Focus:

1. 规划 `v0.4.7` 或 `v0.5.0` 桌面应用版本发布
2. 解决多显示器、高DPI屏幕下的缩放坐标偏置问题 (DPI Scaling)
3. 强化复杂嵌套控制块（如循环体中嵌套条件）的执行语义

## 13. Completed Recently

Recent completed work, newest first:

1. `[done]` 完成精细的节点级结构校验与错误定位（如循环圈、重复连接、不支持的串联分支）
2. `[done]` 完成验证系统全面汉化并提供具体可操作性的修复指南
3. `[done]` 建立完整的项目开发计划与优化路线图文档 (`OPTIMIZATION_ROADMAP.md`)
4. `[done]` 编辑后自动刷新 flow 校验状态并实时高亮 offending nodes
5. `[done]` 状态栏展示 flow validation error / warning
6. `[done]` 执行前校验并阻断 error 级问题
7. `[done]` 编辑期同步条件块和循环块语义

## 14. Next Actions

Recommended execution order from this point:

1. 解决高DPI与多显示器混合缩放坐标偏移 (Mixed-DPI & Multi-Monitor)
2. 评估是否需要“清除入口”操作，并增强警告和错误的 UI 区分度
3. 增加 release 前自动校验版本的脚本 (`verify-versions.js`)
4. 强化更复杂的控制块执行集成测试
5. 规划 `v0.4.7` release

## 15. Release Checklist

Before creating a new release:

1. verify `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` versions match
2. run `npm run test`
3. run `npm run lint`
4. run `npm run build`
5. run `npm run tauri build`
6. verify generated asset filenames match the intended version
7. verify release/tag status with `gh release view <tag>` and `gh run list --workflow release.yml`

## 16. Tracking Convention

Use these status markers when updating this document:

1. `[done]` completed and verified
2. `[in_progress]` currently being worked on
3. `[next]` queued and recommended soon
4. `[blocked]` cannot proceed until a dependency or decision is resolved
