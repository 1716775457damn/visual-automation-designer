# Tauri Command API

前端通过 `invoke("command_name", { args })` 调用以下所有命令。命令分为三大模块。

---

## 图片库 (Image Library)

### `add_image`
```rust
fn add_image(file_path: String, name: String) -> Result<ImageMetadata>
```
从文件路径添加图片到图片库。

### `add_image_from_base64`
```rust
fn add_image_from_base64(base64_data: String, name: String) -> Result<ImageMetadata>
```
从 Base64 编码数据添加图片（支持剪贴板粘贴）。

### `remove_image`
```rust
fn remove_image(id: String) -> Result<bool>
```
按 ID 删除图片。

### `rename_image`
```rust
fn rename_image(id: String, new_name: String) -> Result<bool>
```
重命名图片。

### `list_images`
```rust
fn list_images() -> Result<Vec<ImageMetadata>>
```
列出图片库中所有图片的元数据。

### `get_image`
```rust
fn get_image(id: String) -> Result<Option<ImageMetadata>>
```
按 ID 获取单张图片元数据。

---

## 流程管理 (Flow Management)

### `create_flow`
```rust
fn create_flow(name: String) -> Result<Flow>
```
创建新流程。

### `save_flow`
```rust
fn save_flow(flow: Flow) -> Result<bool>
```
保存完整流程对象到磁盘。

### `load_flow`
```rust
fn load_flow(id: String) -> Result<Flow>
```
按 ID 加载流程。

### `list_flows`
```rust
fn list_flows() -> Result<Vec<FlowMetadata>>
```
列出所有流程（仅元数据，不含完整节点/连线数据）。

### `delete_flow`
```rust
fn delete_flow(id: String) -> Result<bool>
```
按 ID 删除流程。

### `validate_flow`
```rust
fn validate_flow(flow: Flow) -> Result<ValidationResponse>
```
校验流程结构，返回错误列表和警告列表。

### `log_runtime_issue`
```rust
fn log_runtime_issue(payload: RuntimeIssuePayload) -> Result<bool>
```
前端上报运行时问题到后端日志系统。

---

## 块操作 (Block Operations)

### `create_block`
```rust
fn create_block(
    flow_id: String,
    block_type: BlockType,
    config: BlockConfig,
    position: BlockPosition,
) -> Result<BlockNode>
```
在流程中创建新步骤块。

### `update_block_position`
```rust
fn update_block_position(
    flow_id: String,
    block_id: String,
    position: BlockPosition,
) -> Result<bool>
```
更新块在画布上的位置。

### `delete_block`
```rust
fn delete_block(
    flow_id: String,
    block_id: String,
) -> Result<bool>
```
删除块（同时删除关联连线）。

### `update_block_config`
```rust
fn update_block_config(
    flow_id: String,
    block_id: String,
    config: BlockConfig,
) -> Result<bool>
```
更新块配置。

### `set_entry_block`
```rust
fn set_entry_block(
    flow_id: String,
    block_id: Option<String>,
) -> Result<bool>
```
设置或清除流程入口块。

---

## 连线操作 (Connection Operations)

### `create_connection`
```rust
fn create_connection(
    flow_id: String,
    source: String,
    target: String,
    source_handle: Option<String>,
) -> Result<Connection>
```
创建两个块之间的连线。`source_handle` 用于条件分支。

### `delete_connection`
```rust
fn delete_connection(
    flow_id: String,
    connection_id: String,
) -> Result<bool>
```
删除连线。

---

## 撤销/重做 (Undo/Redo)

### `can_undo`
```rust
fn can_undo(flow_id: String) -> Result<bool>
```
检查指定流程是否有可撤销操作。

### `can_redo`
```rust
fn can_redo(flow_id: String) -> Result<bool>
```
检查指定流程是否有可重做操作。

### `undo`
```rust
fn undo(flow_id: String) -> Result<Option<Flow>>
```
撤销上一步操作，返回撤销后的流程。无操作时返回 `None`。

### `redo`
```rust
fn redo(flow_id: String) -> Result<Option<Flow>>
```
重做上一步撤销，返回重做后的流程。无操作时返回 `None`。

---

## 执行控制 (Execution Control)

### `execute_flow`
```rust
async fn execute_flow(flow_id: String) -> Result<bool>
```
启动流程全量执行（异步后台运行）。通过 `execution-event` 事件向前端推送进度。

### `step_execution`
```rust
async fn step_execution(flow_id: String) -> Result<bool>
```
单步执行（调试模式）。首次调用创建交互式 Executor，后续每次调用执行一个步骤。

### `stop_execution`
```rust
async fn stop_execution() -> Result<bool>
```
停止当前执行。

### `pause_execution`
```rust
async fn pause_execution() -> Result<bool>
```
暂停当前执行。

### `resume_execution`
```rust
async fn resume_execution() -> Result<bool>
```
恢复已暂停的执行。

### `get_execution_status`
```rust
async fn get_execution_status() -> Result<ExecutionStatusResponse>
```
获取当前执行状态（Idle / Running / Paused / Stopped / Failed / Completed）。

### `runtime_self_check`
```rust
fn runtime_self_check() -> Result<RuntimeCheckResponse>
```
运行环境自检：检查屏幕捕获、输入控制、数据目录是否可用。

---

## 事件 (Events)

后端通过 `app.emit("event-name", payload)` 推送事件到前端。

| 事件名 | 触发时机 | Payload |
|--------|----------|---------|
| `execution-event` | 执行步骤完成/失败/状态变更 | `ExecutionEvent` (含 step_index, block_id, status, error 等) |
| `application-error` | 后端 panic 或严重错误 | `{ type, message, location }` |