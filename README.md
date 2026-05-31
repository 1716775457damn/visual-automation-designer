# Visual Automation Designer

可视化屏幕自动化流程编辑器 — 通过拖拽节点和连线，像画流程图一样编排屏幕自动化任务。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2 |
| 前端 UI | React 18 + ReactFlow 11 |
| 语言 | TypeScript + Rust |
| 构建工具 | Vite 5 |
| 测试 | Vitest + Rust unit tests |
| 代码质量 | ESLint 9 |

## 快速开始

### 前置条件

- **Node.js** 20+
- **Rust** 1.80+（通过 [rustup](https://rustup.rs) 安装）
- Windows 10+ / macOS 12+ / 主流 Linux 发行版

### 开发运行

```bash
npm install
npm run tauri dev
```

首次编译 Rust 后端可能需要几分钟下载依赖，后续增量编译会快很多。

### 其他命令

```bash
npm run dev          # 仅启动 Vite 前端（浏览器模式）
npm run build        # TypeScript 检查 + Vite 构建
npm run test         # 运行 Vitest 测试
npm run lint         # ESLint 检查
npm run tauri build  # 打包桌面应用
```

## 核心功能

- **可视化流程编辑** — 基于 ReactFlow 的画布，拖拽节点、连线编排自动化步骤
- **屏幕截图比对** — 捕获屏幕区域，与预设图片进行像素级匹配，作为流程跳转条件
- **键盘鼠标模拟** — 支持点击、输入、快捷键、滚轮等完整鼠标/键盘操作
- **步骤调试** — 单步执行、暂停/继续、停止，实时查看每一步的执行状态
- **图片库管理** — 上传、管理用于图像匹配的参考图片
- **流程校验** — 执行前自动检查流程结构合法性，标记有问题的节点和连线
- **撤销/重做** — 完整的历史记录支持，跨编辑会话
- **双主题** — 亮色/暗色主题一键切换
- **DPI 自适应** — 自动检测显示器缩放比例，纠正坐标映射

## 项目结构

```
visual-automation-designer/
├── src/                          # 前端源代码
│   ├── main.tsx                  # 应用入口
│   ├── App.tsx                   # 根组件
│   ├── AppShell.tsx              # 应用壳层（布局框架）
│   ├── AppProviders.tsx          # Context 提供者组合
│   ├── components/
│   │   ├── App/                  # 应用级组件
│   │   ├── BlockToolbox/         # 步骤块工具箱（拖拽源）
│   │   ├── common/               # 通用 UI 组件
│   │   ├── ConfigPanel/          # 步骤配置面板（ActionBlockConfig / ControlBlockConfig）
│   │   ├── ExecutionStatus/      # 执行状态控制栏
│   │   ├── FlowEditor/           # 流程编辑器容器
│   │   │   └── FlowCanvas.tsx    # ReactFlow 画布
│   │   └── ImageLibrary/         # 图片库管理面板
│   ├── hooks/
│   │   ├── useFlow.ts            # 流程状态管理（编排层）
│   │   ├── useFlowNodes.ts       # 节点 CRUD 操作
│   │   ├── useFlowEdges.ts       # 连线 CRUD 操作
│   │   ├── useFlowHistory.ts     # 撤销/重做
│   │   ├── useFlowValidation.ts  # 流程校验状态
│   │   ├── useExecution.ts       # 执行控制
│   │   ├── useImageLibrary.ts    # 图片库管理
│   │   ├── useKeyboardShortcuts.ts # 键盘快捷键
│   │   └── useTheme.ts           # 主题切换
│   ├── types/                    # TypeScript 类型定义
│   ├── validation/               # 前端校验规则
│   └── styles/                   # 全局样式 & 设计令牌
├── src-tauri/                    # Rust 后端
│   ├── Cargo.toml                # Rust 依赖
│   ├── tauri.conf.json           # Tauri 配置
│   ├── icons/                    # 应用图标
│   ├── capabilities/             # 权限声明
│   └── src/
│       ├── main.rs               # 入口（windows_subsystem）
│       ├── lib.rs                # 应用初始化 & 命令注册
│       ├── error.rs              # 统一错误类型
│       ├── logging.rs            # 日志 & panic 处理
│       ├── commands/             # Tauri 命令层
│       │   ├── flow.rs           # 流程 CRUD / 块操作 / 连线操作 / 撤销重做
│       │   ├── execution.rs      # 执行控制 / 单步调试 / 状态查询
│       │   └── image_library.rs  # 图片库 CRUD
│       ├── core/                 # 核心业务逻辑
│       │   ├── flow/             # 流程管理器 / 校验器 / 序列化
│       │   ├── execution/        # 执行引擎 / 事件 / 图像匹配 / 输入模拟
│       │   ├── image_library/    # 图片库元数据管理
│       │   ├── blocks/           # 步骤块定义 & trait
│       │   └── history.rs        # 操作历史（撤销/重做）
│       ├── models/               # 数据模型
│       │   ├── block.rs          # BlockNode / BlockConfig / BlockType
│       │   ├── flow.rs           # Flow / Connection / FlowMetadata
│       │   └── image.rs          # ImageMetadata / ImageId
│       ├── platform/             # 平台抽象层
│       │   ├── screen.rs         # 屏幕捕获
│       │   └── input.rs          # 键盘鼠标模拟
│       └── matching/             # 图像匹配模块
├── docs/                         # 设计文档 & 规格说明
├── scripts/                      # 辅助脚本
├── package.json
├── vite.config.ts
├── tsconfig.json
└── vitest.config.ts
```

## License

MIT