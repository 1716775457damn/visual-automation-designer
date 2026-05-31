//! Top-level execution scheduler
//!
//! Coordinates sub-modules for flow execution: setup, run, pause, resume,
//! stop, step, and the main execution loop.
//!
//! Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 8.1, 8.5, 8.4

use std::collections::HashMap;
use std::future::Future;
use std::panic::{self, AssertUnwindSafe};
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, watch};
use tokio::time::sleep;

use crate::error::{AppError, Result};
use crate::models::{BlockId, Flow, ImageId, ImageMetadata};
use crate::matching::{CachedImageMatcher, MatchCacheConfig};

use super::context::ExecutionContext;
use super::events::{ExecutionEvent, ExecutionStatus};

/// Default timeout for wait operations (30 seconds)
pub(super) const DEFAULT_WAIT_TIMEOUT_MS: u64 = 30_000;

/// Default polling interval for image matching — reduced from 200ms to 50ms
/// to keep stop latency well below the 100ms target.
pub(super) const POLL_INTERVAL_MS: u64 = 50;

/// Polling interval for pause/resume checks — reduced from 100ms to 50ms.
pub(super) const PAUSE_POLL_INTERVAL_MS: u64 = 50;

/// Maximum stop latency target (used for documentation and assertions).
/// All wait/sleep loops must check the stop signal at least this frequently.
#[allow(dead_code)]
pub(super) const MAX_STOP_LATENCY_MS: u64 = 100;

/// Type alias for boxed future
pub(super) type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Execute a potentially panicking operation safely
///
/// This helper function wraps operations that might panic (like image matching
/// or input operations) in catch_unwind to prevent application crashes.
pub(super) fn safe_execute<T, F>(operation: F, operation_name: &str) -> Result<T>
where
    F: FnOnce() -> T,
{
    match panic::catch_unwind(AssertUnwindSafe(operation)) {
        Ok(result) => Ok(result),
        Err(panic_payload) => {
            let message = if let Some(s) = panic_payload.downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = panic_payload.downcast_ref::<String>() {
                s.clone()
            } else {
                "Unknown panic".to_string()
            };

            // Log the panic
            crate::logging::log_panic(
                &format!("{} panicked: {}", operation_name, message),
                None,
            );

            Err(AppError::ExecutionFailed(format!(
                "{} failed: {}",
                operation_name, message
            )))
        }
    }
}

/// Executor for running automation flows
pub struct Executor {
    /// The flow to execute
    pub(super) flow: Flow,
    /// Execution context
    pub(super) context: Arc<Mutex<ExecutionContext>>,
    /// Application handle for event emission
    pub(super) app_handle: AppHandle,
    /// Current execution status
    pub(super) status: Arc<Mutex<ExecutionStatus>>,
    /// Stop signal channel
    pub(super) stop_signal: watch::Sender<bool>,
    /// Stop signal receiver
    pub(super) stop_receiver: watch::Receiver<bool>,
    /// Pause signal
    pub(super) paused: Arc<Mutex<bool>>,
    /// Image library for loading images
    pub(super) image_library: HashMap<ImageId, ImageMetadata>,
    /// Base directory for image files
    pub(super) images_dir: std::path::PathBuf,
    /// Cached image matcher for performance
    pub(super) matcher: Arc<Mutex<CachedImageMatcher>>,
    /// DPI scale factor for coordinate correction (1.0 = 100%).
    /// When set > 1.0, click coordinates from user input are scaled to physical pixels.
    pub(super) dpi_scale: f32,
}

/// Lightweight control handle for an active executor.
#[derive(Clone)]
pub struct ExecutionController {
    status: Arc<Mutex<ExecutionStatus>>,
    stop_signal: watch::Sender<bool>,
    paused: Arc<Mutex<bool>>,
    context: Arc<Mutex<ExecutionContext>>,
    app_handle: AppHandle,
    /// DPI scale factor for coordinate correction (read from executor).
    dpi_scale: f32,
}

impl ExecutionController {
    /// Get the current execution status.
    pub async fn status(&self) -> ExecutionStatus {
        *self.status.lock().await
    }

    /// Get the current DPI scale factor.
    pub fn dpi_scale(&self) -> f32 {
        self.dpi_scale
    }

    /// Pause execution.
    pub async fn pause(&self) -> Result<()> {
        let status = self.status().await;
        if status != ExecutionStatus::Running {
            return Err(AppError::ExecutionFailed(
                "Can only pause a running flow".to_string(),
            ));
        }

        *self.paused.lock().await = true;

        if let Some(block_id) = self.context.lock().await.current_block().cloned() {
            self.app_handle
                .emit("execution-event", ExecutionEvent::paused(block_id))
                .map_err(|e| {
                    AppError::InternalError(format!("Failed to emit event: {}", e))
                })?;
        }

        *self.status.lock().await = ExecutionStatus::Paused;
        Ok(())
    }

    /// Resume execution.
    pub async fn resume(&self) -> Result<()> {
        let status = self.status().await;
        if status != ExecutionStatus::Paused {
            return Err(AppError::ExecutionFailed(
                "Can only resume a paused flow".to_string(),
            ));
        }

        *self.paused.lock().await = false;

        if let Some(block_id) = self.context.lock().await.current_block().cloned() {
            self.app_handle
                .emit("execution-event", ExecutionEvent::resumed(block_id))
                .map_err(|e| {
                    AppError::InternalError(format!("Failed to emit event: {}", e))
                })?;
        }

        *self.status.lock().await = ExecutionStatus::Running;
        Ok(())
    }

    /// Stop execution.
    pub async fn stop(&self) -> Result<()> {
        let status = self.status().await;
        if !status.is_active() {
            return Err(AppError::ExecutionFailed("Flow is not running".to_string()));
        }

        *self.paused.lock().await = false;
        let _ = self.stop_signal.send(true);

        self.app_handle
            .emit(
                "execution-event",
                ExecutionEvent::stopped("User requested stop".to_string()),
            )
            .map_err(|e| AppError::InternalError(format!("Failed to emit event: {}", e)))?;

        *self.status.lock().await = ExecutionStatus::Stopped;
        Ok(())
    }
}

impl Executor {
    /// Create a new executor
    pub fn new(flow: Flow, app_handle: AppHandle, images_dir: std::path::PathBuf) -> Self {
        let (stop_signal, stop_receiver) = watch::channel(false);

        // Create cached matcher with default config (5 second cache TTL, 100 max entries)
        let cache_config = MatchCacheConfig::new(100, 5);
        let matcher = CachedImageMatcher::with_cache_config(cache_config);

        Self {
            flow,
            context: Arc::new(Mutex::new(ExecutionContext::new())),
            app_handle,
            status: Arc::new(Mutex::new(ExecutionStatus::Idle)),
            stop_signal,
            stop_receiver,
            paused: Arc::new(Mutex::new(false)),
            image_library: HashMap::new(),
            images_dir,
            matcher: Arc::new(Mutex::new(matcher)),
            dpi_scale: 1.0,
        }
    }

    /// Set the image library
    pub fn set_image_library(&mut self, library: HashMap<ImageId, ImageMetadata>) {
        self.image_library = library;
    }

    /// Create a control handle that can manage this executor while it runs in the background.
    pub fn controller(&self) -> ExecutionController {
        ExecutionController {
            status: Arc::clone(&self.status),
            stop_signal: self.stop_signal.clone(),
            paused: Arc::clone(&self.paused),
            context: Arc::clone(&self.context),
            app_handle: self.app_handle.clone(),
            dpi_scale: self.dpi_scale,
        }
    }

    /// Set the DPI scale factor for coordinate correction.
    ///
    /// When this is set to a non-1.0 value (e.g., 1.5 for 150% scaling),
    /// click coordinates in `ClickMode::Coordinates` will be automatically
    /// multiplied by this factor to convert from logical (CSS) pixels
    /// to physical pixels.
    pub fn set_dpi_scale(&mut self, scale: f32) {
        self.dpi_scale = scale;
    }

    /// Get the current execution status
    pub async fn status(&self) -> ExecutionStatus {
        *self.status.lock().await
    }

    /// Start flow execution
    pub async fn start(&mut self) -> Result<()> {
        let mut status = self.status.lock().await;
        if *status == ExecutionStatus::Running {
            return Err(AppError::ExecutionFailed(
                "Flow is already running".to_string(),
            ));
        }

        // Reset stop signal
        let _ = self.stop_signal.send(false);

        // Initialize context
        self.context.lock().await.start();

        // Set status to running
        *status = ExecutionStatus::Running;
        drop(status);

        // Emit started event
        self.emit_event(ExecutionEvent::started()).await?;

        // Execute the flow
        self.execute_flow().await
    }

    /// Execute a single step
    pub async fn step(&mut self) -> Result<()> {
        let mut status = self.status.lock().await;
        if *status == ExecutionStatus::Running {
            return Err(AppError::ExecutionFailed(
                "Cannot step while running".to_string(),
            ));
        }

        // Set status to running for this step
        *status = ExecutionStatus::Running;
        drop(status);

        // Get current block or entry block
        let current_block = {
            let ctx = self.context.lock().await;
            ctx.current_block().cloned()
        };

        let block_to_execute = match current_block {
            Some(block_id) => block_id,
            None => {
                // Start from entry block
                match &self.flow.entry_block {
                    Some(entry) => entry.clone(),
                    None => {
                        // No entry block, flow is empty or invalid
                        let mut status = self.status.lock().await;
                        *status = ExecutionStatus::Completed;
                        self.emit_event(ExecutionEvent::flow_completed()).await?;
                        return Ok(());
                    }
                }
            }
        };

        // Execute the single block
        self.execute_block(&block_to_execute).await?;

        // Update status
        let mut status = self.status.lock().await;
        *status = ExecutionStatus::Paused;
        drop(status);

        Ok(())
    }

    /// Pause execution
    pub async fn pause(&mut self) -> Result<()> {
        let status = self.status.lock().await;
        if *status != ExecutionStatus::Running {
            return Err(AppError::ExecutionFailed(
                "Can only pause a running flow".to_string(),
            ));
        }
        drop(status);

        let mut paused = self.paused.lock().await;
        *paused = true;
        drop(paused);

        let current_block = {
            let ctx = self.context.lock().await;
            ctx.current_block().cloned()
        };

        if let Some(block_id) = current_block {
            self.emit_event(ExecutionEvent::paused(block_id)).await?;
        }

        let mut status = self.status.lock().await;
        *status = ExecutionStatus::Paused;

        Ok(())
    }

    /// Resume execution
    pub async fn resume(&mut self) -> Result<()> {
        let status = self.status.lock().await;
        if *status != ExecutionStatus::Paused {
            return Err(AppError::ExecutionFailed(
                "Can only resume a paused flow".to_string(),
            ));
        }
        drop(status);

        let mut paused = self.paused.lock().await;
        *paused = false;
        drop(paused);

        let current_block = {
            let ctx = self.context.lock().await;
            ctx.current_block().cloned()
        };

        if let Some(block_id) = current_block {
            self.emit_event(ExecutionEvent::resumed(block_id)).await?;
        }

        let mut status = self.status.lock().await;
        *status = ExecutionStatus::Running;
        drop(status);

        // Continue execution
        self.execute_flow().await
    }

    /// Stop execution
    pub async fn stop(&mut self) -> Result<()> {
        let status = self.status.lock().await;
        if !status.is_active() {
            return Err(AppError::ExecutionFailed("Flow is not running".to_string()));
        }
        drop(status);

        // Send stop signal
        let _ = self.stop_signal.send(true);

        self.emit_event(ExecutionEvent::stopped("User requested stop".to_string()))
            .await?;

        let mut status = self.status.lock().await;
        *status = ExecutionStatus::Stopped;

        Ok(())
    }

    /// Execute the entire flow
    async fn execute_flow(&mut self) -> Result<()> {
        // Get entry block
        let entry_block = match &self.flow.entry_block {
            Some(entry) => entry.clone(),
            None => {
                // No entry block defined, try to find a starting block
                // Use the first block if no entry point is defined
                let first_block = self.flow.blocks.keys().next().cloned();
                match first_block {
                    Some(block_id) => block_id,
                    None => {
                        // Empty flow, complete immediately
                        let mut status = self.status.lock().await;
                        *status = ExecutionStatus::Completed;
                        self.emit_event(ExecutionEvent::flow_completed()).await?;
                        return Ok(());
                    }
                }
            }
        };

        // Execute starting from entry block
        let result = self.execute_from_block(&entry_block).await;

        // Handle execution result
        match result {
            Ok(()) => {
                let mut status = self.status.lock().await;
                if *status == ExecutionStatus::Running {
                    *status = ExecutionStatus::Completed;
                    self.emit_event(ExecutionEvent::flow_completed()).await?;
                }
                Ok(())
            }
            Err(e) => {
                let mut status = self.status.lock().await;
                *status = ExecutionStatus::Error;
                Err(e)
            }
        }
    }

    /// Execute from a specific block onwards
    async fn execute_from_block(&mut self, start_block: &BlockId) -> Result<()> {
        let mut current_block = Some(start_block.clone());

        while let Some(block_id) = current_block {
            // Check stop signal
            if *self.stop_receiver.borrow() {
                return Ok(());
            }

            // Check pause signal
            self.wait_if_paused().await;

            // Check stop signal again after pause
            if *self.stop_receiver.borrow() {
                return Ok(());
            }

            // Execute the block
            let result = self.execute_block(&block_id).await;

            match result {
                Ok(block_result) => {
                    // Handle result and determine next block
                    current_block =
                        self.handle_block_result(block_result, &block_id).await?;
                }
                Err(e) => {
                    // Log error and stop execution
                    crate::logging::log_error(
                        &format!("Block execution failed: {}", block_id),
                        Some(&e.to_string()),
                        None,
                    );
                    return Err(e);
                }
            }
        }

        Ok(())
    }

    /// Wait if execution is paused
    ///
    /// Polls every PAUSE_POLL_INTERVAL_MS so stop latency is bounded.
    pub(super) async fn wait_if_paused(&self) {
        loop {
            let paused = *self.paused.lock().await;
            if !paused {
                break;
            }
            sleep(Duration::from_millis(PAUSE_POLL_INTERVAL_MS)).await;
        }
    }

    /// Emit an event to the frontend
    pub(super) async fn emit_event(&self, event: ExecutionEvent) -> Result<()> {
        self.app_handle
            .emit("execution-event", &event)
            .map_err(|e| AppError::InternalError(format!("Failed to emit event: {}", e)))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::BlockResult;

    #[test]
    fn test_execution_status_default() {
        let status = ExecutionStatus::default();
        assert_eq!(status, ExecutionStatus::Idle);
    }

    #[test]
    fn test_execution_status_is_active() {
        assert!(!ExecutionStatus::Idle.is_active());
        assert!(ExecutionStatus::Running.is_active());
        assert!(ExecutionStatus::Paused.is_active());
        assert!(!ExecutionStatus::Completed.is_active());
    }

    #[test]
    fn test_block_result_default() {
        let result = BlockResult::default();
        assert_eq!(result, BlockResult::Continue);
    }

    #[test]
    fn test_execution_context() {
        let ctx = ExecutionContext::new();
        assert!(ctx.current_block().is_none());
        assert!(ctx.execution_log().is_empty());
    }

    #[test]
    fn test_safe_execute_success() {
        let result: Result<i32> = safe_execute(|| 42, "Test operation");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
    }

    #[test]
    fn test_safe_execute_panic() {
        let result: Result<i32> =
            safe_execute(|| panic!("Test panic"), "Test panic operation");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("Test panic operation"));
    }

    #[test]
    fn test_safe_execute_with_result() {
        let result: Result<Result<i32>> =
            safe_execute(|| Ok::<i32, AppError>(100), "Test result operation");
        assert!(result.is_ok());
        let inner_result = result.unwrap();
        assert_eq!(inner_result.unwrap(), 100);
    }

    #[test]
    fn should_report_is_active_for_paused() {
        assert!(ExecutionStatus::Paused.is_active());
    }

    #[test]
    fn should_report_is_active_for_running() {
        assert!(ExecutionStatus::Running.is_active());
    }

    #[test]
    fn should_report_not_active_for_idle() {
        assert!(!ExecutionStatus::Idle.is_active());
    }

    #[test]
    fn should_report_not_active_for_completed() {
        assert!(!ExecutionStatus::Completed.is_active());
    }

    #[test]
    fn should_report_not_active_for_error() {
        assert!(!ExecutionStatus::Error.is_active());
    }

    #[test]
    fn should_report_not_active_for_stopped() {
        assert!(!ExecutionStatus::Stopped.is_active());
    }

    #[test]
    fn should_update_and_clear_current_block() {
        let mut ctx = ExecutionContext::new();
        let block_id = BlockId::new();
        ctx.set_current_block(Some(block_id.clone()));
        assert_eq!(ctx.current_block(), Some(&block_id));
        ctx.set_current_block(None);
        assert!(ctx.current_block().is_none());
    }

    #[test]
    fn should_log_events_in_context() {
        let mut ctx = ExecutionContext::new();
        let block_id = BlockId::new();
        ctx.log_event(ExecutionEvent::block_started(block_id.clone()));
        ctx.log_event(ExecutionEvent::block_completed(block_id, true));
        assert_eq!(ctx.execution_log().len(), 2);
    }

    #[test]
    fn should_handle_string_panic_in_safe_execute() {
        let result: Result<i32> =
            safe_execute(|| panic!("string literal panic"), "String panic op");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("String panic op"));
    }

    #[test]
    fn should_handle_empty_string_panic_in_safe_execute() {
        let result: Result<i32> =
            safe_execute(|| panic!(""), "Empty panic op");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("Empty panic op"));
    }

    #[test]
    fn should_reset_context() {
        let mut ctx = ExecutionContext::new();
        ctx.set_current_block(Some(BlockId::new()));
        ctx.log_event(ExecutionEvent::started());
        ctx.reset();
        assert!(ctx.current_block().is_none());
        assert!(ctx.execution_log().is_empty());
        assert_eq!(ctx.blocks_executed(), 0);
    }
}
