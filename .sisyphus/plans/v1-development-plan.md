# V1 开发计划 — Visual Automation Designer

> 基于 2026-06-09 架构讨论生成。
> 三个核心决策：JSON Schema 端口系统 / 顺序执行(显式并行 V2) / 纯 Rust 图像匹配。
> 当前版本: v0.5.23 → 目标 V1: v1.0.0

---

## 总体路线图

```
Phase A ──→ Phase B ──→ Phase C ──→ Phase D ──→ Phase E
 端口系统     OCR 节点     断言节点      执行引擎     发布 V1
  3周         2周          1.5周        3周          1周
```

---

## Phase A: 端口系统 + 节点协议 (3 周)

**目标**: 给每个节点类型定义 JSON Schema 端口规范，前端据此渲染端口、校验连接；Rust 端据此做运行时断言。

### A1. 定义端口协议 (week 1)

- 设计 PortSchema 数据结构，支持类型：string / number / boolean / imageRef / coordinate / any
- 每个端口包含：name, type, direction (input/output), description, required, default
- 位置：`src-tauri/src/models/port.rs` + 前端同步类型 `src/types/port.ts`
- 每个端口 3-5 行 JSON Schema

现有节点端口清单：

| 节点类型 | 输入端口 | 输出端口 |
|---------|---------|---------|
| Click | imageRef? / coordinates? | clickResult |
| WaitImage | imageRef / timeout | found: boolean |
| WaitTime | durationMs | -- |
| InputText | text / intervalMs? | -- |
| Loop | count | iterationIndex |
| Condition | imageRef / operator | branchResult: true/false |
| Screenshot | -- | screenshotRef |

### A2. 前端端口渲染 (week 1-2)

- ReactFlow 自定义手柄 (Handle)，根据端口类型显示颜色/形状
- 端口类型不兼容时禁用连接（如 number -> imageRef 不允许）
- 输入端口限制入度 <=1，输出端口不限出度
- 端口悬停提示显示类型和描述

### A3. Rust 端运行时端口校验 (week 2-3)

- 执行节点前，检查所有 required 输入端口是否已连接且有值
- 类型不匹配时给出明确的错误消息
- 验证逻辑统合进现有的 FlowValidator

**验收标准**:
- 每个节点类型有对应的 PortSchema 定义
- 前端根据 schema 渲染端口，不兼容的端口连接被 UI 禁用
- Rust 端执行前校验端口数据，类型错误时给出可读错误

---

## Phase B: OCR / 文字检测节点 (2 周)

**目标**: 增加文字识别能力，补全 Airtest 的核心功能之一。

### B1. OCR 引擎选型与集成 (week 1)

**决策**: 纯 Rust 方案，不引入 Python/Tesseract。

选项对比（对抗性审查）：

| 方案 | 优势 | 劣势 | 结论 |
|------|------|------|------|
| tesseract-rs (C++绑定) | 精度高 | 需要系统安装 Tesseract，跨平台打包噩梦 | ❌ |
| trtext / rust-tesseract | Rust 原生 | 生态不成熟，中文支持差 | ❌ |
| **Microsoft OCR (Windows.Media.Ocr)** | 无需额外安装，Win10+内置，中文支持好 | 仅 Windows | ✅ V1 |
| wgpu 推理 ONNX 模型 | 跨平台，精度可控 | 开发周期长（2-4周） | ⏳ V2 |

**V1 方案**: Windows 平台使用 windows-rs 调用 Windows.Media.Ocr API（Win10+ 内置 OCR，支持简体中文/英文/日文等）。macOS/Linux 回退到简单的占位（"平台暂不支持 OCR"）。

### B2. OCR 节点定义 (week 1-2)

- 新节点类型: TextExtract (截图->文字) 和 TextCheck (判断文字是否存在)
- TextExtract 端口：input imageRef -> output texts: string[]
- TextCheck 端口：input imageRef + keyword: string -> output found: boolean
- 前端配置面板：预览区域显示识别到的文字区域框选
- 图片库中增加"OCR 检测结果"预览

### B3. OCR 节点执行 (week 2)

- 在 step_executor.rs 中增加 OCR 步骤处理
- 截图 -> OCR 引擎 -> 返回文字列表 -> 传递给下游节点
- TextCheck 根据 keyword 做模糊匹配（包含即可，不要求完全匹配）

**验收标准**:
- Windows 上 OCR 节点能从截图中正确提取文字
- TextCheck 节点能根据 keyword 判断文字是否存在
- 非 Windows 平台给出清晰的"暂不支持"提示
- 前端能预览 OCR 识别结果

---

## Phase C: 断言节点 + 截图比对节点 (1.5 周)

### C1. ScreenshotAssert 节点 (week 1)

- 新节点: ScreenshotAssert -- 截屏并与参考图比对
- 端口: input imageRef (参考图) / threshold? / region? -> output passed: boolean / diffImageRef?
- 严格模式：差异像素占比超过阈值则断言失败
- 宽松模式：仅记录差异不阻断流程

### C2. 差异比对引擎 (week 1)

- 利用已有的 ImageMatcher 做 NCC 匹配
- 增加像素级差异检测：absdiff + 阈值 -> 差异热力图
- 差异结果可保存为截图供后续查看

### C3. 前端断言结果展示 (week 0.5)

- 执行结果面板中展示断言通过/失败
- 失败时展示差异图叠加（半透明红色覆盖差异区域）
- 点击差异区域跳转到对应截图

**验收标准**:
- ScreenshotAssert 节点能正确判断两张截图是否一致
- 差异区域在前端可视化展示
- 断言失败时流程可配置为阻断或继续

---

## Phase D: 执行引擎强化 + Rust 匹配优化 (3 周)

### D1. 执行引擎重构为顺序执行模型 (week 1)

当前问题：
- Executor 已有 DAG 拓扑排序，但节点间数据流传递是隐式的
- 没有端口数据传递机制

改动：
- ExecutionContext 增加 port_values: HashMap<(BlockId, PortName), PortValue>
- 每个节点执行：从 context 读取输入端口数据 -> 执行 -> 写入输出端口到 context
- 下一节点从 context 读取前驱输出
- 保持拓扑序执行（先排序再按序逐个执行），不做并发

### D2. 图片匹配缓存预热 + 多分辨率加速 (week 1-2)

当前性能基线（release 模式）：
- 30x50 按钮全屏搜索: ~50ms
- 50x80 图标全屏搜索: ~150ms
- 212x216 大图全屏搜索: ~4s

优化步骤：
1. **积分图复用** (已有 ✅) -- 同一截图多次匹配时只计算一次积分图
2. **多分辨率金字塔** (新增) -- 先 1/4 缩略图粗定位，再全分辨率精确定位
   - 搜索时间减少至 ~1/16（4x4 倍率缩减）
3. **SIMD 加速 NCC** (新增) -- packed_simd 或 std::simd 做向量化点积，预计 2-4x 加速
4. **ROI 搜索** (新增) -- 用户可指定搜索区域（region），跳过无关区域

优化后目标：
- 任意 <=200px 模板全屏搜索: <=200ms
- 区域搜索: <=50ms

### D3. 步骤调试增强 (week 2-3)

- 每步执行完成后自动截图保存（已有部分逻辑）
- 匹配失败时高亮显示"期望图片 vs 实际截图"对比
- 步骤超时时给出明确的超时原因
- 执行暂停时展示当前步骤上下文（端口值快照）

**验收标准**:
- 200px 以下模板全屏匹配 <=200ms
- 端口值在节点间正确传递
- 执行失败时给出具体原因而非泛泛的 "execution error"

---

## Phase E: V1 发布 (1 周)

### E1. 版本一致性 + Release 流水线

- package.json / Cargo.toml / tauri.conf.json 统一版本
- 增加发布前自动校验脚本 (scripts/verify-versions.js)
- Release notes 模板，记录每个版本的新节点和破坏性变更

### E2. 默认 Flow 模板

- 内置 3-5 个示例 Flow（开机启动流程、登录流程、数据录入流程）
- 新用户首次打开时显示模板选择界面

### E3. 安装包优化

- Windows MSI 安装包尺寸优化（控制依赖体积）
- 检查是否缺少必要的 VC Runtime 依赖
- 应用数字签名（如可用）

**验收标准**:
- 三个版本源一致，release 资产名正确
- 示例 flow 可直接打开并执行
- 安装包可在干净 Windows 环境安装运行

---

## 完整节点清单 (V1)

| 节点 | 类型 | 来源 | 说明 |
|------|------|------|------|
| Click | 动作 | ✅ 已有 | 坐标点击 / 图片点击 |
| WaitImage | 动作 | ✅ 已有 | 等待图片出现 |
| WaitTime | 动作 | ✅ 已有 | 等待时间 |
| InputText | 动作 | ✅ 已有 | 键盘输入 |
| Screenshot | 动作 | ✅ 已有 | 截图保存 |
| Loop | 控制 | ✅ 已有 | 循环 N 次 |
| InfiniteLoop | 控制 | ✅ 已有 | 无限循环 |
| Condition | 控制 | ✅ 已有 | 条件判断 |
| **TextExtract** | 动作 | ⭐ Phase B | 图片->文字 |
| **TextCheck** | 控制 | ⭐ Phase B | 判断文字存在 |
| **ScreenshotAssert** | 动作 | ⭐ Phase C | 截图比对断言 |

---

## 依赖关系

```
Phase A (端口系统)
  +-- 是 Phase B/C/D 的前置（节点需要端口定义）
  +-- B2 (OCR节点) 依赖 A1 (端口协议)
  +-- C1 (断言节点) 依赖 A1

Phase B (OCR)
  +-- 独立于 C/D
  +-- 可和 C 并行开发

Phase C (断言)
  +-- 独立于 B/D
  +-- 可和 B 并行开发

Phase D (执行引擎)
  +-- 依赖 A（需要端口值传递机制）
  +-- 匹配优化部分可独立进行
```

**并行策略**:
```
Week 1-3:  Phase A (端口系统) -- 单线程，必须先行
Week 4-6:  Phase B (OCR)  --+-- 可并行
            Phase C (断言) --+
Week 7-9:  Phase D (执行引擎)
Week 10:   Phase E (发布)
```

**总计: ~10 周 (全职开发)**

---

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| OCR 精度不够 | 中 | 中 | Windows.Media.Ocr 在 Win11 上的中文识别已较成熟；V2 可换 ONNX 模型 |
| 匹配速度不达标 | 低 | 高 | 优先做多分辨率金字塔（收益最大），SIMD 是第二优先级 |
| 端口系统过度设计 | 中 | 中 | 严格按 3-5 行/端口控制，不做泛型/多态类型系统 |
| 跨平台打包问题 | 低 | 高 | OCR 的 Windows 专有 API 用条件编译隔离，不影响其他平台 |
