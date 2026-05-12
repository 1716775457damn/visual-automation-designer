//! Executor implementation
//!
//! This module provides the executor for running automation flows.
//!
//! Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 8.1, 8.5, 8.4

use std::collections::HashMap;
use std::future::Future;
use std::panic::{self, AssertUnwindSafe};
use std::pin::Pin;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, watch};
use tokio::time::sleep;

use crate::error::{AppError, Result};
use crate::models::{BlockId, BlockConfig, BlockNode, BlockType, ClickMode, ConditionOp, Flow, ImageId, ImageMetadata};
use crate::core::BlockResult;
use crate::platform::{InputController, ScreenCapture};
use crate::matching::{CachedImageMatcher, MatchCacheConfig};

use super::context::ExecutionContext;
use super::events::{ExecutionEvent, ExecutionStatus};

/// Default timeout for wait operations (30 seconds)
const DEFAULT_WAIT_TIMEOUT_MS: u64 = 30_000;

/// Default polling interval for image matching (200ms)
const POLL_INTERVAL_MS: u64 = 200;

/// Type alias for boxed future
type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Execute a potentially panicking operation safely
///
/// This helper function wraps operations that might panic (like image matching
/// or input operations) in catch_unwind to prevent application crashes.
fn safe_execute<T, F>(operation: F, operation_name: &str) -> Result<T>
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
                None
            );
            
            Err(AppError::ExecutionFailed(format!("{} failed: {}", operation_name, message)))
        }
    }
}

/// Executor for running automation flows
pub struct Executor {
    /// The flow to execute
    flow: Flow,
    /// Execution context
    context: Arc<Mutex<ExecutionContext>>,
    /// Application handle for event emission
    app_handle: AppHandle,
    /// Current execution status
    status: Arc<Mutex<ExecutionStatus>>,
    /// Stop signal channel
    stop_signal: watch::Sender<bool>,
    /// Stop signal receiver
    stop_receiver: watch::Receiver<bool>,
    /// Pause signal
    paused: Arc<Mutex<bool>>,
    /// Image library for loading images
    image_library: HashMap<ImageId, ImageMetadata>,
    /// Base directory for image files
    images_dir: std::path::PathBuf,
    /// Cached image matcher for performance
    matcher: Arc<Mutex<CachedImageMatcher>>,
}

/// Lightweight control handle for an active executor.
#[derive(Clone)]
pub struct ExecutionController {
    status: Arc<Mutex<ExecutionStatus>>,
    stop_signal: watch::Sender<bool>,
    paused: Arc<Mutex<bool>>,
    context: Arc<Mutex<ExecutionContext>>,
    app_handle: AppHandle,
}

impl ExecutionController {
    /// Get the current execution status.
    pub async fn status(&self) -> ExecutionStatus {
        *self.status.lock().await
    }

    /// Pause execution.
    pub async fn pause(&self) -> Result<()> {
        let status = self.status().await;
        if status != ExecutionStatus::Running {
            return Err(AppError::ExecutionFailed("Can only pause a running flow".to_string()));
        }

        *self.paused.lock().await = true;

        if let Some(block_id) = self.context.lock().await.current_block().cloned() {
            self.app_handle
                .emit("execution-event", ExecutionEvent::paused(block_id))
                .map_err(|e| AppError::InternalError(format!("Failed to emit event: {}", e)))?;
        }

        *self.status.lock().await = ExecutionStatus::Paused;
        Ok(())
    }

    /// Resume execution.
    pub async fn resume(&self) -> Result<()> {
        let status = self.status().await;
        if status != ExecutionStatus::Paused {
            return Err(AppError::ExecutionFailed("Can only resume a paused flow".to_string()));
        }

        *self.paused.lock().await = false;

        if let Some(block_id) = self.context.lock().await.current_block().cloned() {
            self.app_handle
                .emit("execution-event", ExecutionEvent::resumed(block_id))
                .map_err(|e| AppError::InternalError(format!("Failed to emit event: {}", e)))?;
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
            .emit("execution-event", ExecutionEvent::stopped("User requested stop".to_string()))
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
        }
    }

    /// Get the current execution status
    pub async fn status(&self) -> ExecutionStatus {
        *self.status.lock().await
    }

    /// Start flow execution
    pub async fn start(&mut self) -> Result<()> {
        let mut status = self.status.lock().await;
        if *status == ExecutionStatus::Running {
            return Err(AppError::ExecutionFailed("Flow is already running".to_string()));
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
            return Err(AppError::ExecutionFailed("Cannot step while running".to_string()));
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
            return Err(AppError::ExecutionFailed("Can only pause a running flow".to_string()));
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
            return Err(AppError::ExecutionFailed("Can only resume a paused flow".to_string()));
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
        
        self.emit_event(ExecutionEvent::stopped("User requested stop".to_string())).await?;
        
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
            
            // Execute the block with panic handling
            let result = self.execute_block_with_panic_handling(&block_id).await;
            
            match result {
                Ok(block_result) => {
                    // Handle result and determine next block
                    current_block = self.handle_block_result(block_result, &block_id).await?;
                }
                Err(e) => {
                    // Log error and stop execution
                    crate::logging::log_error(
                        &format!("Block execution failed: {}", block_id),
                        Some(&e.to_string()),
                        None
                    );
                    return Err(e);
                }
            }
        }
        
        Ok(())
    }
    
    /// Execute a block with panic handling
    ///
    /// This method wraps the block execution in catch_unwind to prevent
    /// panics from crashing the application.
    async fn execute_block_with_panic_handling(&mut self, block_id: &BlockId) -> Result<BlockResult> {
        let block_id_owned = block_id.clone();
        
        // Use AssertUnwindSafe to allow catch_unwind with async code
        let result = panic::catch_unwind(AssertUnwindSafe(|| {
            // We need to use a blocking approach here since catch_unwind doesn't work with async
            // The actual async execution will happen through tokio::task::block_in_place
            tokio::task::block_in_place(|| {
                // Execute the block synchronously within the async context
                futures::executor::block_on(self.execute_block(&block_id_owned))
            })
        }));
        
        match result {
            Ok(Ok(block_result)) => Ok(block_result),
            Ok(Err(e)) => Err(e),
            Err(panic_payload) => {
                // Extract panic message
                let message = if let Some(s) = panic_payload.downcast_ref::<&str>() {
                    s.to_string()
                } else if let Some(s) = panic_payload.downcast_ref::<String>() {
                    s.clone()
                } else {
                    "Unknown panic during block execution".to_string()
                };
                
                // Log the panic
                crate::logging::log_panic(
                    &format!("Block {} panicked: {}", block_id, message),
                    None
                );
                
                // Return as ExecutionError
                Err(AppError::ExecutionFailed(format!("Panic: {}", message)))
            }
        }
    }

    /// Wait if execution is paused
    async fn wait_if_paused(&self) {
        loop {
            let paused = *self.paused.lock().await;
            if !paused {
                break;
            }
            sleep(Duration::from_millis(100)).await;
        }
    }

    /// Execute a single block
    fn execute_block<'a>(&'a mut self, block_id: &'a BlockId) -> BoxFuture<'a, Result<BlockResult>> {
        Box::pin(async move {
            // Get block from flow
            let block_node = self.flow.get_block(block_id)
                .ok_or_else(|| AppError::BlockNotFound(block_id.to_string()))?
                .clone();
            
            // Update context
            {
                let mut ctx = self.context.lock().await;
                ctx.set_current_block(Some(block_id.clone()));
                ctx.increment_blocks_executed();
            }
            
            // Emit block started event
            self.emit_event(ExecutionEvent::block_started(block_id.clone())).await?;
            
            // Execute based on block type
            let result: Result<BlockResult> = self.execute_block_by_type(&block_node).await;
            
            // Emit completion event
            match &result {
                Ok(BlockResult::Continue) => {
                    self.emit_event(ExecutionEvent::block_completed(block_id.clone(), true)).await?;
                }
                Ok(BlockResult::Error { message }) => {
                    self.emit_event(ExecutionEvent::block_error(block_id.clone(), message.clone())).await?;
                }
                Ok(_) => {
                    self.emit_event(ExecutionEvent::block_completed(block_id.clone(), true)).await?;
                }
                Err(e) => {
                    self.emit_event(ExecutionEvent::block_error(block_id.clone(), e.to_string())).await?;
                }
            }
            
            result
        })
    }

    /// Execute a block based on its type
    fn execute_block_by_type<'a>(&'a mut self, block_node: &'a BlockNode) -> BoxFuture<'a, Result<BlockResult>> {
        Box::pin(async move {
            match &block_node.block_type {
                BlockType::Action { action } => {
                    self.execute_action_block(action, &block_node.config).await
                }
                BlockType::Control { control } => {
                    self.execute_control_block(control, block_node).await
                }
            }
        })
    }

    /// Execute an action block
    async fn execute_action_block(
        &mut self,
        _action: &crate::models::ActionType,
        config: &BlockConfig,
    ) -> Result<BlockResult> {
        match config {
            BlockConfig::Click { mode, count } => {
                self.execute_click_block(mode, *count).await
            }
            BlockConfig::WaitImage { image_id, timeout_ms } => {
                self.execute_wait_image_block(image_id, *timeout_ms).await
            }
            BlockConfig::WaitTime { duration_ms } => {
                self.execute_wait_time_block(*duration_ms).await
            }
            BlockConfig::InputText { text, interval_ms } => {
                self.execute_input_text_block(text, *interval_ms).await
            }
            _ => {
                Err(AppError::ExecutionFailed("Invalid action block config".to_string()))
            }
        }
    }

    /// Execute a control block
    fn execute_control_block<'a>(
        &'a mut self,
        _control: &'a crate::models::ControlType,
        block_node: &'a BlockNode,
    ) -> BoxFuture<'a, Result<BlockResult>> {
        Box::pin(async move {
            match &block_node.config {
                BlockConfig::Loop { count } => {
                    self.execute_loop_block(block_node.id.clone(), *count, &block_node.children).await
                }
                BlockConfig::LoopInfinite => {
                    self.execute_infinite_loop_block(block_node.id.clone(), &block_node.children).await
                }
                BlockConfig::Condition { image_id, condition, true_branch, false_branch } => {
                    self.execute_conditional_block(image_id, condition, true_branch, false_branch).await
                }
                _ => {
                    Err(AppError::ExecutionFailed("Invalid control block config".to_string()))
                }
            }
        })
    }

    /// Handle block result and return next block to execute
    async fn handle_block_result(
        &mut self,
        result: BlockResult,
        current_block_id: &BlockId,
    ) -> Result<Option<BlockId>> {
        match result {
            BlockResult::Continue => {
                // Find next block through connections
                let next_block = self.find_next_block(current_block_id, None);
                Ok(next_block)
            }
            BlockResult::JumpTo { target_block_id } => {
                Ok(Some(target_block_id))
            }
            BlockResult::WaitFor { .. } => {
                // WaitFor is handled within block execution
                Ok(self.find_next_block(current_block_id, None))
            }
            BlockResult::Error { message } => {
                Err(AppError::ExecutionFailed(message))
            }
        }
    }

    /// Find the next block to execute after the current block
    fn find_next_block(&self, current_block_id: &BlockId, handle: Option<&str>) -> Option<BlockId> {
        for connection in &self.flow.connections {
            if connection.source == *current_block_id {
                let handle_matches = match (&connection.source_handle, handle) {
                    (None, None) => true,
                    (Some(conn_handle), Some(h)) => conn_handle == h,
                    _ => false,
                };
                if handle_matches {
                    return Some(connection.target.clone());
                }
            }
        }
        None
    }

    // ========================================================================
    // Action Block Implementations
    // ========================================================================

    /// Execute ClickBlock
    ///
    /// Validates: Requirements 8.4 - Exception handling for input operations
    async fn execute_click_block(&mut self, mode: &ClickMode, count: u32) -> Result<BlockResult> {
        let (x, y) = match mode {
            ClickMode::Coordinates { x, y } => (*x, *y),
            ClickMode::Image { image_id } => {
                // Check cache first
                let cached = {
                    let ctx = self.context.lock().await;
                    ctx.get_cached_image_match(image_id)
                };
                
                if let Some(pos) = cached {
                    pos
                } else {
                    // Find image on screen
                    let (found, pos) = self.find_image_on_screen(image_id).await?;
                    if !found {
                        return Ok(BlockResult::Error {
                            message: format!("Image not found on screen: {}", image_id),
                        });
                    }
                    pos
                }
            }
        };
        
        // Perform clicks with panic handling
        let mut input = InputController::new();
        for i in 0..count {
            let click_result = safe_execute(
                || input.click_at(x, y, crate::platform::MouseButton::Left),
                "Click operation"
            );
            
            match click_result {
                Ok(_) => {},
                Err(e) => {
                    crate::logging::log_error(
                        &format!("Click operation {} of {} failed", i + 1, count),
                        Some(&e.to_string()),
                        None
                    );
                    return Err(e);
                }
            }
            
            // Small delay between clicks
            sleep(Duration::from_millis(50)).await;
        }
        
        Ok(BlockResult::Continue)
    }

    /// Execute WaitImageBlock
    async fn execute_wait_image_block(
        &mut self,
        image_id: &ImageId,
        timeout_ms: Option<u64>,
    ) -> Result<BlockResult> {
        let timeout = timeout_ms.unwrap_or(DEFAULT_WAIT_TIMEOUT_MS);
        let start = std::time::Instant::now();
        
        loop {
            // Check stop signal
            if *self.stop_receiver.borrow() {
                return Ok(BlockResult::Error {
                    message: "Execution stopped".to_string(),
                });
            }
            
            // Check timeout
            if start.elapsed().as_millis() as u64 > timeout {
                return Ok(BlockResult::Error {
                    message: format!("WaitImage timeout: image {} not found within {}ms", image_id, timeout),
                });
            }
            
            // Try to find image
            let (found, pos) = self.find_image_on_screen(image_id).await?;
            if found {
                // Cache the result
                let mut ctx = self.context.lock().await;
                ctx.cache_image_match(image_id.clone(), pos);
                return Ok(BlockResult::Continue);
            }
            
            // Wait before next poll
            sleep(Duration::from_millis(POLL_INTERVAL_MS)).await;
        }
    }

    /// Execute WaitTimeBlock
    async fn execute_wait_time_block(&mut self, duration_ms: u64) -> Result<BlockResult> {
        let start = std::time::Instant::now();
        let check_interval = 100.min(duration_ms);
        
        loop {
            // Check stop signal
            if *self.stop_receiver.borrow() {
                return Ok(BlockResult::Error {
                    message: "Execution stopped".to_string(),
                });
            }
            
            // Check if duration elapsed
            if start.elapsed().as_millis() as u64 >= duration_ms {
                return Ok(BlockResult::Continue);
            }
            
            // Wait in small increments
            sleep(Duration::from_millis(check_interval)).await;
        }
    }

    /// Execute InputTextBlock
    ///
    /// Validates: Requirements 8.4 - Exception handling for input operations
    async fn execute_input_text_block(
        &mut self,
        text: &str,
        interval_ms: Option<u64>,
    ) -> Result<BlockResult> {
        let mut input = InputController::new();
        
        let result = if let Some(interval) = interval_ms {
            safe_execute(
                || input.type_text_with_interval(text, interval),
                "Text input with interval"
            )
        } else {
            safe_execute(
                || input.type_text(text),
                "Text input"
            )
        };
        
        match result {
            Ok(_) => Ok(BlockResult::Continue),
            Err(e) => {
                crate::logging::log_error(
                    "Text input operation failed",
                    Some(&e.to_string()),
                    None
                );
                Err(AppError::ExecutionFailed(format!("Text input failed: {}", e)))
            }
        }
    }

    // ========================================================================
    // Control Block Implementations
    // ========================================================================

    /// Execute LoopBlock
    fn execute_loop_block<'a>(
        &'a mut self,
        loop_id: BlockId,
        count: u32,
        children: &'a [BlockId],
    ) -> BoxFuture<'a, Result<BlockResult>> {
        Box::pin(async move {
            if children.is_empty() {
                return Ok(BlockResult::Continue);
            }
            
            // Reset loop counter
            {
                let mut ctx = self.context.lock().await;
                ctx.reset_loop_counter(&loop_id);
            }
            
            for iteration in 1..=count {
                // Check stop signal
                if *self.stop_receiver.borrow() {
                    return Ok(BlockResult::Error {
                        message: "Execution stopped".to_string(),
                    });
                }
                
                // Update loop counter
                {
                    let mut ctx = self.context.lock().await;
                    ctx.set_loop_counter(loop_id.clone(), iteration);
                }
                
                // Execute all child blocks
                for child_id in children {
                    // Check stop signal
                    if *self.stop_receiver.borrow() {
                        return Ok(BlockResult::Error {
                            message: "Execution stopped".to_string(),
                        });
                    }
                    
                    // Check pause signal
                    self.wait_if_paused().await;
                    
                    // Execute child block
                    let result = self.execute_block(child_id).await?;
                    
                    // Handle result
                    match result {
                        BlockResult::Continue => continue,
                        BlockResult::JumpTo { target_block_id } => {
                            // Jump out of loop
                            return Ok(BlockResult::JumpTo { target_block_id });
                        }
                        BlockResult::Error { message } => {
                            return Ok(BlockResult::Error { message });
                        }
                        BlockResult::WaitFor { .. } => continue,
                    }
                }
            }
            
            Ok(BlockResult::Continue)
        })
    }

    /// Execute InfiniteLoopBlock
    fn execute_infinite_loop_block<'a>(
        &'a mut self,
        loop_id: BlockId,
        children: &'a [BlockId],
    ) -> BoxFuture<'a, Result<BlockResult>> {
        Box::pin(async move {
            if children.is_empty() {
                return Ok(BlockResult::Continue);
            }
            
            // Reset loop counter
            {
                let mut ctx = self.context.lock().await;
                ctx.reset_loop_counter(&loop_id);
            }
            
            let mut iteration = 0;
            loop {
                // Check stop signal
                if *self.stop_receiver.borrow() {
                    return Ok(BlockResult::Error {
                        message: "Execution stopped".to_string(),
                    });
                }
                
                // Update loop counter
                iteration += 1;
                {
                    let mut ctx = self.context.lock().await;
                    ctx.set_loop_counter(loop_id.clone(), iteration);
                }
                
                // Execute all child blocks
                for child_id in children {
                    // Check stop signal
                    if *self.stop_receiver.borrow() {
                        return Ok(BlockResult::Error {
                            message: "Execution stopped".to_string(),
                        });
                    }
                    
                    // Check pause signal
                    self.wait_if_paused().await;
                    
                    // Execute child block
                    let result = self.execute_block(child_id).await?;
                    
                    // Handle result
                    match result {
                        BlockResult::Continue => continue,
                        BlockResult::JumpTo { target_block_id } => {
                            return Ok(BlockResult::JumpTo { target_block_id });
                        }
                        BlockResult::Error { message } => {
                            return Ok(BlockResult::Error { message });
                        }
                        BlockResult::WaitFor { .. } => continue,
                    }
                }
            }
        })
    }

    /// Execute ConditionalBlock
    fn execute_conditional_block<'a>(
        &'a mut self,
        image_id: &'a ImageId,
        condition: &'a ConditionOp,
        true_branch: &'a [BlockId],
        false_branch: &'a [BlockId],
    ) -> BoxFuture<'a, Result<BlockResult>> {
        Box::pin(async move {
            // Find image on screen
            let (found, _) = self.find_image_on_screen(image_id).await?;
            
            // Evaluate condition
            let condition_met = match condition {
                ConditionOp::ImageExists => found,
                ConditionOp::ImageNotExists => !found,
            };
            
            // Execute appropriate branch
            let branch = if condition_met {
                true_branch
            } else {
                false_branch
            };
            
            for child_id in branch {
                // Check stop signal
                if *self.stop_receiver.borrow() {
                    return Ok(BlockResult::Error {
                        message: "Execution stopped".to_string(),
                    });
                }
                
                // Check pause signal
                self.wait_if_paused().await;
                
                // Execute child block
                let result = self.execute_block(child_id).await?;
                
                // Handle result
                match result {
                    BlockResult::Continue => continue,
                    BlockResult::JumpTo { target_block_id } => {
                        return Ok(BlockResult::JumpTo { target_block_id });
                    }
                    BlockResult::Error { message } => {
                        return Ok(BlockResult::Error { message });
                    }
                    BlockResult::WaitFor { .. } => continue,
                }
            }
            
            Ok(BlockResult::Continue)
        })
    }

    // ========================================================================
    // Helper Methods
    // ========================================================================

    /// Find an image on screen with caching and performance tracking
    ///
    /// This method uses the CachedImageMatcher for improved performance
    /// on repeated matches. It also logs performance metrics.
    ///
    /// Validates: Requirements 8.4 - Exception handling for image operations
    async fn find_image_on_screen(&self, image_id: &ImageId) -> Result<(bool, (u32, u32))> {
        let start = Instant::now();
        
        // Get image metadata
        let metadata = self.image_library.get(image_id)
            .ok_or_else(|| AppError::ImageNotFound(image_id.to_string()))?
            .clone();
        
        // Load the template image with panic handling
        let image_path = self.images_dir.join(&metadata.file_path);
        let template: image::DynamicImage = safe_execute(
            || image::open(&image_path).map_err(|e| AppError::ImageError(e.to_string())),
            "Image loading"
        )??;
        
        // Capture screen with panic handling
        let capture = ScreenCapture::new();
        let screen = safe_execute(
            || capture.capture_screen(),
            "Screen capture"
        )??;
        
        // Use cached matcher for better performance
        let result = {
            let mut matcher = self.matcher.lock().await;
            matcher.find_image_cached(&screen.image, &template, image_id)
        };
        
        let duration = start.elapsed();
        
        // Log performance metrics
        if duration.as_millis() > 500 {
            log::warn!(
                "Image matching took {}ms (exceeds 500ms target) for image_id: {}",
                duration.as_millis(),
                image_id
            );
        } else {
            log::debug!(
                "Image matching completed in {}ms for image_id: {}",
                duration.as_millis(),
                image_id
            );
        }
        
        if result.found {
            let center = (
                result.center_x.unwrap_or(0),
                result.center_y.unwrap_or(0),
            );
            Ok((true, center))
        } else {
            Ok((false, (0, 0)))
        }
    }
    
    /// Get matcher performance metrics
    pub async fn matcher_metrics(&self) -> crate::matching::MatchMetrics {
        let matcher = self.matcher.lock().await;
        matcher.metrics().clone()
    }
    
    /// Clear matcher cache
    pub async fn clear_matcher_cache(&self) {
        let mut matcher = self.matcher.lock().await;
        matcher.clear_cache();
    }
    
    /// Get matcher cache statistics
    pub async fn cache_stats(&self) -> crate::matching::CacheStats {
        let matcher = self.matcher.lock().await;
        matcher.cache_stats()
    }

    /// Emit an event to the frontend
    async fn emit_event(&self, event: ExecutionEvent) -> Result<()> {
        self.app_handle
            .emit("execution-event", &event)
            .map_err(|e| AppError::InternalError(format!("Failed to emit event: {}", e)))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ActionType, BlockPosition, BlockType, BlockConfig, Flow};
    
    // Note: Many tests here would require mocking Tauri's AppHandle,
    // which is complex. Integration tests are better suited for full execution testing.
    
    fn create_test_flow() -> Flow {
        let mut flow = Flow::new("Test Flow".to_string());
        
        // Add a simple wait block
        let block = BlockNode::new(
            BlockType::Action { action: ActionType::WaitTime },
            BlockPosition::new(0.0, 0.0),
            BlockConfig::WaitTime { duration_ms: 100 },
        );
        let block_id = block.id.clone();
        flow.add_block(block);
        flow.set_entry_block(Some(block_id));
        
        flow
    }

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
        let result: Result<i32> = safe_execute(
            || panic!("Test panic"),
            "Test panic operation"
        );
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("Test panic operation"));
    }

    #[test]
    fn test_safe_execute_with_result() {
        let result: Result<Result<i32>> = safe_execute(
            || Ok::<i32, AppError>(100),
            "Test result operation"
        );
        assert!(result.is_ok());
        let inner_result = result.unwrap();
        assert_eq!(inner_result.unwrap(), 100);
    }
}
