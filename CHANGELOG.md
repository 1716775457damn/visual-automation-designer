# Changelog

所有重要变更记录。版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [0.5.0] - 2026-05

### Added
- 无障碍 (a11y) 合规和所有组件的微交互
- 设计令牌系统，支持亮色/暗色双主题
- 多平台发布 CI 工作流 (Windows / macOS Intel+Apple Silicon / Linux)
- 执行流失败事件与失败状态持久化

### Changed
- **重构**：拆分超大 Rust 后端文件（executor.rs → 6 个子模块，validator.rs → 3 个子模块）
- **重构**：App 拆分为 AppShell 和 AppProviders
- **重构**：BlockConfig 拆分为 ActionBlockConfig 和 ControlBlockConfig
- **重构**：useFlow.ts 拆分为 4 个子 hook（nodes, edges, history, validation）
- **重构**：从 FlowCanvas 提取 useDragDrop 和 useCanvasShortcuts

### Fixed
- 修复 useFlow 和 FlowCanvas 中 4 个 P0 重渲染问题
- 修复 CI 构建中缺失的 diagnostics/logging 模块
- 修复 BlockConfig 和 ClickMode 枚举的 serde 命名字段

### Security
- 添加自动化 API 密钥和密钥扫描器到 git-sync

---

## [0.4.11] - 2026-05

### Fixed
- 修复图片依赖块在无图片时可创建的问题
- 运行时保护图片依赖执行的守卫逻辑

---

## [0.4.10] - 2026-05

### Added
- 覆盖所有块类型的快速添加创建测试
- 块配置兼容可选图片 ID 的测试覆盖

### Fixed
- Rust 块模型中接受可选 image_ids 字段

---

## [0.4.8] - 2026-04

### Added
- 执行控制台状态持久化
- 覆盖已存在节点的精准放置测试

### Fixed
- 收紧执行等待节奏
- 执行控制台交互改进

---

## [0.4.7] - 2026-04

### Added
- 控制流结构校验集成
- 不支持的控制流连线引导提示
- 运行时自检能力
- 执行失败状态处理
- 节点上高亮显示校验问题

### Fixed
- 编辑后刷新校验状态
- 执行前校验流程
- 输入动作可被暂停感知
- 等待块遵守暂停状态

---

## [0.4.6] - 2026-04

### Added
- 桌面应用图标资源更新
- 画布上设置入口节点
- 新手引导和浏览器模式编辑回退

### Fixed
- 保存前派生稳定入口块
- 执行前规范化流程状态
- Tauri 命令的块配置序列化
- 流程编辑后刷新撤销状态

---

## [0.4.0] - 2026-03

### Added
- 流程编辑状态与执行历史能力的完善
- Redo 语义修正及历史回归测试补充
- 多轮 UX 优化 (1-8 轮，共 160 项改进)
  - 日志筛选搜索
  - 键盘提示
  - 颜色图例
  - 执行时间线
  - 智能建议
  - 无障碍优化
  - 暗色主题增强
  - 快捷键帮助面板
  - 状态栏增强
  - 拖拽预览
  - Toast 通知等

### Fixed
- 拖拽放置和剪贴板粘贴图片功能改进
- 图片选择器上传和删除功能

---

## [0.1.0] - 2025-12

### Added
- 初始版本：Visual Automation Designer 基础框架
- Tauri 2 + React 18 + ReactFlow 11 项目骨架
- 多平台 GitHub Actions 发布工作流