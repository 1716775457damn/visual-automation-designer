//! Tauri commands for execution control
//!
//! This module provides Tauri command handlers for flow execution:
//! - Start, stop, pause, resume execution
//! - Single-step execution
//! - Execution status queries
//!
//! Validates: Requirements 5.1, 5.2, 5.5, 5.6

use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;

use crate::core::execution::{ExecutionController, Executor, ExecutionStatus};
use crate::core::execution::ExecutionEvent;
use crate::error::{AppError, Result};
use crate::models::{FlowId, ImageId, ImageMetadata};
use crate::platform::{InputController, ScreenCapture};
use std::fs;

/// Application state containing the execution state
pub struct ExecutionState {
    /// Interactive executor used for step-by-step execution.
    executor: Arc<Mutex<Option<Executor>>>,
    /// Active background execution controller.
    active_controller: Arc<Mutex<Option<ExecutionController>>>,
    /// Current execution status
    status: Arc<Mutex<ExecutionStatus>>,
    /// App handle for creating executors
    app_handle: AppHandle,
}

impl ExecutionState {
    /// Create a new execution state
    pub fn new(app_handle: &AppHandle) -> Self {
        Self {
            executor: Arc::new(Mutex::new(None)),
            active_controller: Arc::new(Mutex::new(None)),
            status: Arc::new(Mutex::new(ExecutionStatus::Idle)),
            app_handle: app_handle.clone(),
        }
    }
}

// ============================================================================
// Execution Control Commands
// ============================================================================

/// Start executing a flow.
///
/// # Arguments
/// * `flow_id` - The flow ID to execute (as string)
///
/// # Returns
/// true if execution started successfully
///
/// Validates: Requirements 5.1
#[tauri::command]
pub async fn execute_flow(
    execution_state: State<'_, ExecutionState>,
    flow_state: State<'_, FlowState>,
    image_library_state: State<'_, ImageLibraryState>,
    flow_id: String,
) -> Result<bool> {
    let flow_id = parse_flow_id(&flow_id)?;
    
    // Check if already running
    {
        let status = execution_state.status.lock().await;
        if status.is_active() {
            return Err(AppError::ExecutionFailed(
                "Another flow is already running. Stop it first.".to_string()
            ));
        }
    }
    
    // Load the flow
    let flow = {
        let mut manager = flow_state.manager.lock()
            .map_err(|e| AppError::InternalError(
                format!("Failed to lock flow manager: {}", e)
            ))?;
        manager.load_flow(&flow_id)?
    };
    
    // Get image library
    let image_library: HashMap<ImageId, ImageMetadata> = {
        let manager = image_library_state.manager.lock()
            .map_err(|e| AppError::InternalError(
                format!("Failed to lock image library manager: {}", e)
            ))?;
        manager.list_images()?
            .into_iter()
            .map(|m| (m.id.clone(), m))
            .collect()
    };
    
    // Get images directory
    let images_dir = execution_state.app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::InternalError(
            format!("Failed to get app data dir: {}", e)
        ))?
        .join("images");
    
    // Create executor
    let mut executor = Executor::new(flow, execution_state.app_handle.clone(), images_dir);
    executor.set_image_library(image_library);

    // Query real DPI scale factor for coordinate correction.
    // Uses primary monitor (index 0) scale factor by default.
    if let Ok(monitors) = ScreenCapture::list_monitors_with_tauri(&execution_state.app_handle) {
        if let Some(primary) = monitors.first() {
            executor.set_dpi_scale(primary.scale_factor);
        }
    }
    
    // Clear any interactive executor before starting a background run.
    {
        let mut exec_guard = execution_state.executor.lock().await;
        *exec_guard = None;
    }

    let controller = executor.controller();
    {
        let mut controller_guard = execution_state.active_controller.lock().await;
        *controller_guard = Some(controller.clone());
    }
    {
        let mut status = execution_state.status.lock().await;
        *status = ExecutionStatus::Running;
    }

    let active_controller = Arc::clone(&execution_state.active_controller);
    let tracked_status = Arc::clone(&execution_state.status);
    let app_handle = execution_state.app_handle.clone();

    tauri::async_runtime::spawn(async move {
        let result = executor.start().await;
        let final_status = executor.status().await;

        if let Err(error) = result {
            crate::logging::log_error(
                "Flow execution task failed",
                Some(&error.to_string()),
                None,
            );
            let _ = app_handle.emit("execution-event", ExecutionEvent::execution_failed(error.to_string(), None));
        }

        {
            let mut controller_guard = active_controller.lock().await;
            *controller_guard = None;
        }
        {
            let mut status = tracked_status.lock().await;
            *status = final_status;
        }
    });

    Ok(true)
}

/// Execute a single step of a flow.
///
/// # Arguments
/// * `flow_id` - The flow ID to execute (as string)
///
/// # Returns
/// true if step executed successfully
///
/// Validates: Requirements 5.6
#[tauri::command]
pub async fn step_execution(
    execution_state: State<'_, ExecutionState>,
    flow_state: State<'_, FlowState>,
    image_library_state: State<'_, ImageLibraryState>,
    flow_id: String,
) -> Result<bool> {
    let flow_id = parse_flow_id(&flow_id)?;
    
    // Check current status
    {
        let status = execution_state.status.lock().await;
        if *status == ExecutionStatus::Running {
            return Err(AppError::ExecutionFailed(
                "Cannot step while flow is running. Pause it first.".to_string()
            ));
        }
    }
    
    // Check if we have an interactive executor already
    let has_executor = {
        let exec_guard = execution_state.executor.lock().await;
        exec_guard.is_some()
    };
    
    if !has_executor {
        // Need to create executor first (starting from entry block)
        let flow = {
            let mut manager = flow_state.manager.lock()
                .map_err(|e| AppError::InternalError(
                    format!("Failed to lock flow manager: {}", e)
                ))?;
            manager.load_flow(&flow_id)?
        };
        
        // Get image library
        let image_library: HashMap<ImageId, ImageMetadata> = {
            let manager = image_library_state.manager.lock()
                .map_err(|e| AppError::InternalError(
                    format!("Failed to lock image library manager: {}", e)
                ))?;
            manager.list_images()?
                .into_iter()
                .map(|m| (m.id.clone(), m))
                .collect()
        };
        
        // Get images directory
        let images_dir = execution_state.app_handle
            .path()
            .app_data_dir()
            .map_err(|e| AppError::InternalError(
                format!("Failed to get app data dir: {}", e)
            ))?
            .join("images");
        
        // Create executor
        let mut executor = Executor::new(flow, execution_state.app_handle.clone(), images_dir);
        executor.set_image_library(image_library);

        // Query real DPI scale factor for coordinate correction
        if let Ok(monitors) = ScreenCapture::list_monitors_with_tauri(&execution_state.app_handle) {
            if let Some(primary) = monitors.first() {
                executor.set_dpi_scale(primary.scale_factor);
            }
        }
        
        // Store executor
        let mut exec_guard = execution_state.executor.lock().await;
        *exec_guard = Some(executor);
    }
    
    // Execute step
    {
        let mut exec_guard = execution_state.executor.lock().await;
        if let Some(ref mut executor) = *exec_guard {
            executor.step().await?;
        }
    }
    
    Ok(true)
}

/// Stop the current execution.
///
/// # Returns
/// true if execution stopped successfully
///
/// Validates: Requirements 5.5
#[tauri::command]
pub async fn stop_execution(
    execution_state: State<'_, ExecutionState>,
) -> Result<bool> {
    // Check if running
    {
        let controller = execution_state.active_controller.lock().await;
        if let Some(controller) = controller.as_ref() {
            controller.stop().await?;
            let mut tracked_status = execution_state.status.lock().await;
            *tracked_status = ExecutionStatus::Stopped;
            return Ok(true);
        }
    }

    // Stop the interactive executor
    {
        let mut exec_guard = execution_state.executor.lock().await;
        if let Some(ref mut executor) = *exec_guard {
            executor.stop().await?;
        }
    }
    
    // Clear executor
    {
        let mut exec_guard = execution_state.executor.lock().await;
        *exec_guard = None;
    }
    
    // Update status
    {
        let mut status = execution_state.status.lock().await;
        *status = ExecutionStatus::Stopped;
    }
    
    Ok(true)
}

/// Pause the current execution.
///
/// # Returns
/// true if execution paused successfully
///
/// Validates: Requirements 5.5
#[tauri::command]
pub async fn pause_execution(
    execution_state: State<'_, ExecutionState>,
) -> Result<bool> {
    {
        let controller = execution_state.active_controller.lock().await;
        if let Some(controller) = controller.as_ref() {
            controller.pause().await?;
            let mut tracked_status = execution_state.status.lock().await;
            *tracked_status = ExecutionStatus::Paused;
            return Ok(true);
        }
    }

    // Pause interactive executor if present.
    {
        let mut exec_guard = execution_state.executor.lock().await;
        if let Some(ref mut executor) = *exec_guard {
            executor.pause().await?;
        }
    }
    
    // Update status
    {
        let mut status = execution_state.status.lock().await;
        *status = ExecutionStatus::Paused;
    }
    
    Ok(true)
}

/// Resume a paused execution.
///
/// # Returns
/// true if execution resumed successfully
///
/// Validates: Requirements 5.5
#[tauri::command]
pub async fn resume_execution(
    execution_state: State<'_, ExecutionState>,
) -> Result<bool> {
    {
        let controller = execution_state.active_controller.lock().await;
        if let Some(controller) = controller.as_ref() {
            controller.resume().await?;
            let mut tracked_status = execution_state.status.lock().await;
            *tracked_status = ExecutionStatus::Running;
            return Ok(true);
        }
    }

    // Resume interactive executor if present.
    {
        let mut exec_guard = execution_state.executor.lock().await;
        if let Some(ref mut executor) = *exec_guard {
            executor.resume().await?;
        }
    }
    
    // Update status
    {
        let mut status = execution_state.status.lock().await;
        *status = ExecutionStatus::Running;
    }
    
    Ok(true)
}

/// Get the current execution status.
///
/// # Returns
/// The current ExecutionStatus
///
/// Validates: Requirements 5.2
#[tauri::command]
pub async fn get_execution_status(
    execution_state: State<'_, ExecutionState>,
) -> Result<ExecutionStatusResponse> {
    let status = execution_state.status.lock().await;
    
    // Get status from executor if available
    let executor_status = {
        let controller_guard = execution_state.active_controller.lock().await;
        if let Some(controller) = controller_guard.as_ref() {
            Some(controller.status().await)
        } else {
            drop(controller_guard);
            let exec_guard = execution_state.executor.lock().await;
            if let Some(ref executor) = *exec_guard {
                Some(executor.status().await)
            } else {
                None
            }
        }
    };
    
    // Use executor status if available, otherwise use tracked status
    let final_status = executor_status.unwrap_or(*status);
    
    Ok(ExecutionStatusResponse {
        status: final_status,
        is_active: final_status.is_active(),
    })
}

// ============================================================================
// Helper Functions and Types
// ============================================================================

/// Parse a flow ID from a string.
fn parse_flow_id(id: &str) -> Result<FlowId> {
    uuid::Uuid::parse_str(id)
        .map(FlowId)
        .map_err(|e| AppError::FlowNotFound(format!("Invalid flow ID '{}': {}", id, e)))
}

/// Execution status response for frontend
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionStatusResponse {
    /// Current execution status
    pub status: ExecutionStatus,
    /// Whether execution is active (running or paused)
    pub is_active: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCheckResponse {
    pub ok: bool,
    pub code: String,
    pub message: String,
}

#[tauri::command]
pub fn runtime_self_check(
    execution_state: State<'_, ExecutionState>,
) -> Result<RuntimeCheckResponse> {
    let app_data_dir = execution_state.app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::InternalError(format!("Failed to get app data dir: {}", e)))?;

    if let Err(e) = ScreenCapture::screen_count() {
        return Ok(RuntimeCheckResponse {
            ok: false,
            code: "SCREEN_CAPTURE_UNAVAILABLE".to_string(),
            message: format!(
                "无法使用屏幕截图功能：{}。请确认系统允许屏幕捕获，并在需要时授予录屏权限后重试。",
                e
            ),
        });
    }

    if let Err(e) = InputController::new() {
        return Ok(RuntimeCheckResponse {
            ok: false,
            code: "INPUT_BACKEND_UNAVAILABLE".to_string(),
            message: format!(
                "无法初始化输入控制能力：{}。请确认当前系统允许模拟鼠标键盘输入，并在需要时授予辅助功能或无障碍权限后重试。",
                e
            ),
        });
    }

    if let Err(e) = fs::create_dir_all(&app_data_dir) {
        return Ok(RuntimeCheckResponse {
            ok: false,
            code: "APP_DATA_DIR_UNAVAILABLE".to_string(),
            message: format!(
                "应用数据目录不可用：{}。请确认当前账号对应用数据目录有读写权限后重试。",
                e
            ),
        });
    }

    let images_dir = app_data_dir.join("images");
    if let Err(e) = fs::create_dir_all(&images_dir) {
        return Ok(RuntimeCheckResponse {
            ok: false,
            code: "IMAGE_DIR_UNAVAILABLE".to_string(),
            message: format!(
                "图片目录不可用：{}。请确认应用图片目录存在且可写后重试。",
                e
            ),
        });
    }

    Ok(RuntimeCheckResponse {
        ok: true,
        code: "OK".to_string(),
        message: "Runtime environment is ready".to_string(),
    })
}

// ============================================================================
// Import FlowState and ImageLibraryState from other modules
// ============================================================================

use super::flow::FlowState;
use super::image_library::ImageLibraryState;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_flow_id_valid() {
        let uuid = uuid::Uuid::new_v4();
        let id_str = uuid.to_string();
        let result = parse_flow_id(&id_str);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().0, uuid);
    }

    #[test]
    fn test_parse_flow_id_invalid() {
        let result = parse_flow_id("not-a-uuid");
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), AppError::FlowNotFound(_)));
    }

    #[test]
    fn test_execution_status_response_serialization() {
        let response = ExecutionStatusResponse {
            status: ExecutionStatus::Running,
            is_active: true,
        };
        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("running"));
        assert!(json.contains("isActive"));
    }
}
