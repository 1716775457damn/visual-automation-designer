# Architecture

## 概述

Visual Automation Designer 采用 **Tauri 桌面应用** 架构，前端负责 UI 渲染和用户交互，Rust 后端承载所有核心业务逻辑、系统调用和平台抽象。

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (React 18)                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    AppShell                           │  │
│  │  ┌─────────────┐  ┌──────────┐  ┌──────────────────┐ │  │
│  │  │ BlockToolbox │  │FlowCanvas│  │   ConfigPanel    │ │  │
│  │  │  (拖拽源)    │  │(ReactFlow│  │ ActionBlockConfig│ │  │
│  │  │              │  │  画布)   │  │ControlBlockConfig│ │  │
│  │  └─────────────┘  └──────────┘  └──────────────────┘ │  │
│  │  ┌──────────────────────────────────────────────────┐ │  │
│  │  │              ExecutionStatus (执行控制栏)         │ │  │
│  │  └──────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │ invoke                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                     Hooks Layer                        │  │
│  │  useFlow / useFlowNodes / useFlowEdges                 │  │
│  │  useFlowHistory / useFlowValidation                    │  │
│  │  useExecution / useImageLibrary / useTheme             │  │
│  │  useKeyboardShortcuts                                  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                   Tauri IPC (invoke)
                              │
┌─────────────────────────────────────────────────────────────┐
│                       后端 (Rust)                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  Commands Layer                        │  │
│  │  flow.rs  │  execution.rs  │  image_library.rs        │  │
│  │  (#[tauri::command] → 前端可调用的 API)                │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  Core Layer                            │  │
│  │  flow/        ← 流程管理 / 校验 / 序列化               │  │
│  │  execution/   ← 执行引擎 / 事件 / 图像匹配 / 输入模拟  │  │
│  │  image_library/ ← 图片库元数据管理                     │  │
│  │  blocks/      ← 步骤块 trait 与实现                    │  │
│  │  history.rs   ← 操作历史（撤销/重做）                  │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                 Platform Layer                         │  │
│  │  screen.rs    ← 屏幕捕获                               │  │
│  │  input.rs     ← 键盘/鼠标模拟                          │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │   matching/  │  │   models/    │                        │
│  │   图像匹配    │  │   数据模型    │                        │
│  └──────────────┘  └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

## 前端架构

### 组件树

```
AppShell
├── BlockToolbox              ← 左侧步骤块列表（拖拽源）
├── FlowCanvas (ReactFlow)    ← 中央画布（节点 & 连线编辑）
├── ConfigPanel               ← 右侧配置面板
│   ├── ActionBlockConfig     ← 动作块配置（点击/输入/截图/等待）
│   └── ControlBlockConfig    ← 控制块配置（条件判断/循环/等待）
├── ImageLibrary              ← 图片库管理面板
└── ExecutionStatus           ← 底部执行状态栏
```

### 核心 Hooks

| Hook | 职责 |
|------|------|
| `useFlow` | 流程状态编排层，组合 nodes/edges/history/validation 四个子 hook |
| `useFlowNodes` | 节点创建、位置更新、删除，通过 Tauri invoke 调后端持久化 |
| `useFlowEdges` | 连线创建和删除 |
| `useFlowHistory` | 撤销/重做操作，调用后端 `undo`/`redo`/`can_undo`/`can_redo` |
| `useFlowValidation` | 执行前校验，展示校验错误/警告 |
| `useExecution` | 执行控制：启动/停止/暂停/继续/单步 |
| `useImageLibrary` | 图片库 CRUD、文件选择、剪贴板粘贴 |
| `useKeyboardShortcuts` | 画布快捷键（删除节点/撤销/重做等） |
| `useTheme` | 亮色/暗色主题切换 |

### 数据流

```
用户交互
  → React 组件事件
  → Hook 调用 Tauri invoke("command_name", { args })
  → IPC 到达 Rust #[tauri::command] 函数
  → Core 层业务逻辑处理
  → 可能调用 Platform 层（屏幕捕获 / 输入模拟）
  → 返回 Result<T> (serde 序列化)
  → 前端 React 状态更新 → UI 重新渲染
```

执行流程的数据流：

```
execute_flow / step_execution
  → Executor::start() / step()
  → 事件发射 (ExecutionEvent via app.emit)
  → 前端监听 execution-event → 更新 ExecutionStatus 面板
  → 每个步骤：
    1. 截图（ScreenCapture）
    2. 图像匹配（matching 模块）
    3. 输入模拟（InputController）
    4. 发射步骤事件
```

## 后端架构

### Commands 层（`src-tauri/src/commands/`）

**`#[tauri::command]` 注册函数**，是前端唯一可调用的后端入口。通过 `tauri::State` 访问全局状态。

| 模块 | 管理的状态 | 主要操作 |
|------|-----------|---------|
| `flow.rs` | `FlowState` (Manager + Validator + History) | 流程 CRUD、块 CRUD、连线 CRUD、撤销重做、校验 |
| `execution.rs` | `ExecutionState` (Executor + Controller + Status) | 执行/停止/暂停/继续/单步、状态查询、运行环境自检 |
| `image_library.rs` | `ImageLibraryState` (Manager) | 图片增删改查、base64 导入 |

### Core 层（`src-tauri/src/core/`）

- **`flow/`** — `FlowManager` 负责流程文件的读写（JSON 序列化），`FlowValidator` 校验流程结构合法性（入口块、连通性、控制流语义）
- **`execution/`** — `Executor` 异步执行引擎，遍历流程 DAG 拓扑执行每个步骤；`ExecutionController` 提供 external stop/pause/resume 控制；`image_match.rs` 负责截图与参考图比对；`input_sim.rs` 封装键盘鼠标模拟
- **`image_library/`** — 图片元数据和文件存储管理
- **`blocks/`** — 步骤块 trait 和具体类型定义（动作块 + 控制流块）
- **`history.rs`** — `History` 维护 undo/redo 双栈，存储 `FlowOperation` 枚举

### Platform 层（`src-tauri/src/platform/`）

平台抽象，隔离 OS 相关系统调用：

- **`screen.rs`** — 屏幕捕获，支持多显示器、DPI 缩放因子检测
- **`input.rs`** — 键盘/鼠标模拟控制器

### Matching 模块（`src-tauri/src/matching/`）

- **`matcher.rs`** — 图像模板匹配算法实现
- **`cache.rs`** — 匹配结果缓存

### Models（`src-tauri/src/models/`）

Serde 序列化数据模型，前后端共享类型契约：

- `block.rs` — `BlockNode`, `BlockConfig` (enum: Click / TypeText / Screenshot / Wait / Condition / Loop), `BlockPosition`, `BlockType`
- `flow.rs` — `Flow`, `Connection`, `FlowMetadata`, `FlowId`
- `image.rs` — `ImageMetadata`, `ImageId`

## 状态管理

后端使用 `tauri::State<'_, T>` 管理全局单例状态：

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   FlowState      │  │ ExecutionState   │  │ImageLibraryState │
│  ┌────────────┐  │  │ ┌──────────────┐ │  │ ┌──────────────┐ │
│  │ FlowManager│  │  │ │ Executor     │ │  │ │ImageLibMgr   │ │
│  │ (Mutex)    │  │  │ │ (Arc<Mutex>) │ │  │ │ (Mutex)      │ │
│  ├────────────┤  │  │ ├──────────────┤ │  │ └──────────────┘ │
│  │ FlowValida.│  │  │ │ Controller   │ │  │                  │
│  │ (Mutex)    │  │  │ │ (Arc<Mutex>) │ │  │                  │
│  ├────────────┤  │  │ ├──────────────┤ │  │                  │
│  │ History    │  │  │ │ Status       │ │  │                  │
│  │ (Mutex)    │  │  │ │ (Arc<Mutex>) │ │  │                  │
│  └────────────┘  │  │ └──────────────┘ │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

执行状态使用 `tokio::sync::Mutex`（异步锁），其他使用 `std::sync::Mutex`。

## 执行引擎设计

`Executor` 采用异步拓扑排序遍历流程 DAG：

1. 从 entry_block 开始，按连接关系计算拓扑顺序
2. 对每个步骤块，根据类型执行对应逻辑：
   - **截图** → ScreenCapture → 保存临时文件
   - **匹配** → matching 模块比对 → 返回匹配区域坐标
   - **点击** → InputController 模拟鼠标点击（支持坐标/图片区域）
   - **输入** → InputController 模拟键盘输入
   - **等待** → tokio 异步延迟
   - **条件** → 根据前一步匹配结果决定分支
   - **循环** → 维护循环计数和退出条件
3. 每个步骤完成后发射 `ExecutionEvent` 到前端
4. `ExecutionController` 支持外部中断（stop/pause/resume），通过标志位在步骤间检查