//! Single-step block execution
//!
//! Handles execution of individual blocks: actions, control flow,
//! and result routing to the next block.
//!
//! Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6

use std::time::Duration;

use image::{DynamicImage, GenericImageView};
use tokio::time::sleep;

use crate::error::{AppError, Result};
use crate::models::{
    BlockConfig, BlockId, BlockNode, BlockType, ConditionOp, ImageId, ImageMetadata,
};

/// Default timeout for screenshot assert execution (in seconds).
/// Prevents infinite hangs on large images or screen capture failures.
const SCREENSHOT_ASSERT_TIMEOUT_SECS: u64 = 60;

/// Simple rectangle for region-of-interest cropping
struct Rect {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}
use crate::core::BlockResult;

use super::events::ExecutionEvent;
use super::runner::{
    BoxFuture, safe_execute, DEFAULT_WAIT_TIMEOUT_MS, POLL_INTERVAL_MS,
    Executor,
};

impl Executor {
    /// Execute a single block
    pub(super) fn execute_block<'a>(
        &'a mut self,
        block_id: &'a BlockId,
    ) -> BoxFuture<'a, Result<BlockResult>> {
        Box::pin(async move {
            // Get block from flow
            let block_node = self
                .flow
                .get_block(block_id)
                .ok_or_else(|| AppError::BlockNotFound(block_id.to_string()))?
                .clone();

            // Update context
            {
                let mut ctx = self.context.lock().await;
                ctx.set_current_block(Some(block_id.clone()));
                ctx.increment_blocks_executed();
            }

            // Emit block started event
            self.emit_event(ExecutionEvent::block_started(block_id.clone()))
                .await?;

            // Execute based on block type
            let result: Result<BlockResult> =
                self.execute_block_by_type(&block_node).await;

            // Emit completion event
            match &result {
                Ok(BlockResult::Continue) => {
                    self.emit_event(ExecutionEvent::block_completed(
                        block_id.clone(),
                        true,
                    ))
                    .await?;
                }
                Ok(BlockResult::Error { message }) => {
                    self.emit_event(ExecutionEvent::block_error(
                        block_id.clone(),
                        message.clone(),
                    ))
                    .await?;
                }
                Ok(_) => {
                    self.emit_event(ExecutionEvent::block_completed(
                        block_id.clone(),
                        true,
                    ))
                    .await?;
                }
                Err(e) => {
                    self.emit_event(ExecutionEvent::block_error(
                        block_id.clone(),
                        e.to_string(),
                    ))
                    .await?;
                }
            }

            result
        })
    }

    /// Execute a block based on its type
    pub(super) fn execute_block_by_type<'a>(
        &'a mut self,
        block_node: &'a BlockNode,
    ) -> BoxFuture<'a, Result<BlockResult>> {
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
    pub(super) async fn execute_action_block(
        &mut self,
        _action: &crate::models::ActionType,
        config: &BlockConfig,
    ) -> Result<BlockResult> {
        match config {
            BlockConfig::Click { mode, count } => {
                self.execute_click_block(mode, *count).await
            }
            BlockConfig::WaitImage {
                image_id,
                timeout_ms,
            } => {
                self.execute_wait_image_block(image_id.as_ref(), *timeout_ms)
                    .await
            }
            BlockConfig::WaitTime { duration_ms } => {
                self.execute_wait_time_block(*duration_ms).await
            }
            BlockConfig::InputText { text, interval_ms } => {
                self.execute_input_text_block(text, *interval_ms).await
            }
            BlockConfig::TextExtract { image_id, language } => {
                self.execute_text_extract_block(image_id.as_ref(), language.as_deref()).await
            }
            BlockConfig::ScreenshotAssert { image_id, threshold, strict_mode, region } => {
                self.execute_screenshot_assert_block(
                    image_id.as_ref(), *threshold, *strict_mode, region.as_ref(),
                ).await
            }
            _ => Err(AppError::ExecutionFailed(
                "Invalid action block config".to_string(),
            )),
        }
    }

    /// Execute a control block
    pub(super) fn execute_control_block<'a>(
        &'a mut self,
        _control: &'a crate::models::ControlType,
        block_node: &'a BlockNode,
    ) -> BoxFuture<'a, Result<BlockResult>> {
        Box::pin(async move {
            match &block_node.config {
                BlockConfig::Loop { count } => {
                    self.execute_loop_block(
                        block_node.id.clone(),
                        *count,
                        &block_node.children,
                    )
                    .await
                }
                BlockConfig::LoopInfinite => {
                    self.execute_infinite_loop_block(
                        block_node.id.clone(),
                        &block_node.children,
                    )
                    .await
                }
                BlockConfig::Condition {
                    image_id,
                    condition,
                    true_branch,
                    false_branch,
                } => {
                    self.execute_conditional_block(
                        image_id.as_ref(),
                        condition,
                        true_branch,
                        false_branch,
                    )
                    .await
                }
                BlockConfig::TextCheck {
                    image_id,
                    keyword,
                    true_branch,
                    false_branch,
                } => {
                    self.execute_text_check_block(
                        image_id.as_ref(),
                        keyword,
                        true_branch,
                        false_branch,
                    )
                    .await
                }
                _ => Err(AppError::ExecutionFailed(
                    "Invalid control block config".to_string(),
                )),
            }
        })
    }

    /// Handle block result and return next block to execute
    pub(super) async fn handle_block_result(
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
            BlockResult::JumpTo { target_block_id } => Ok(Some(target_block_id)),
            BlockResult::WaitFor { .. } => {
                // WaitFor is handled within block execution
                Ok(self.find_next_block(current_block_id, None))
            }
            BlockResult::Error { message } => Err(AppError::ExecutionFailed(message)),
        }
    }

    /// Find the next block to execute after the current block
    pub(super) fn find_next_block(
        &self,
        current_block_id: &BlockId,
        handle: Option<&str>,
    ) -> Option<BlockId> {
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
    // Wait Block Implementations
    // ========================================================================

    /// Execute WaitImageBlock
    pub(super) async fn execute_wait_image_block(
        &mut self,
        image_id: Option<&ImageId>,
        timeout_ms: Option<u64>,
    ) -> Result<BlockResult> {
        let image_id = image_id.ok_or_else(|| {
            AppError::ExecutionFailed(
                "WaitImage block requires a selected image before execution".to_string(),
            )
        })?;
        let timeout = timeout_ms.unwrap_or(DEFAULT_WAIT_TIMEOUT_MS);
        let start = std::time::Instant::now();

        loop {
            // Check stop signal
            if *self.stop_receiver.borrow() {
                return Ok(BlockResult::Error {
                    message: "Execution stopped".to_string(),
                });
            }

            // Respect pause state during active waiting
            self.wait_if_paused().await;

            // Check timeout
            if start.elapsed().as_millis() as u64 > timeout {
                let image_name = self.image_library
                    .get(image_id)
                    .map(|m| m.name.as_str())
                    .unwrap_or("unknown");
                return Ok(BlockResult::Error {
                    message: format!(
                        "WaitImage timeout: image {} (name: {}) not found within {}ms",
                        image_id, image_name, timeout
                    ),
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
    pub(super) async fn execute_wait_time_block(
        &mut self,
        duration_ms: u64,
    ) -> Result<BlockResult> {
        let start = std::time::Instant::now();
        let check_interval = 50.min(duration_ms.max(1));

        loop {
            // Check stop signal
            if *self.stop_receiver.borrow() {
                return Ok(BlockResult::Error {
                    message: "Execution stopped".to_string(),
                });
            }

            // Respect pause state during active waiting
            self.wait_if_paused().await;

            // Check if duration elapsed
            if start.elapsed().as_millis() as u64 >= duration_ms {
                return Ok(BlockResult::Continue);
            }

            // Wait in small increments
            sleep(Duration::from_millis(check_interval)).await;
        }
    }

    // ========================================================================
    // Control Block Implementations
    // ========================================================================

    /// Execute a list of child blocks sequentially.
    /// Each child gets stop/pause checks. Returns early on JumpTo/Error;
    /// returns Continue when all children completed.
    async fn execute_child_blocks(
        &mut self,
        children: &[BlockId],
    ) -> Result<BlockResult> {
        for child_id in children {
            if *self.stop_receiver.borrow() {
                return Ok(BlockResult::Error {
                    message: "Execution stopped".to_string(),
                });
            }
            self.wait_if_paused().await;
            let result = self.execute_block(child_id).await?;
            match result {
                BlockResult::Continue | BlockResult::WaitFor { .. } => continue,
                other => return Ok(other),
            }
        }
        Ok(BlockResult::Continue)
    }

    /// Execute LoopBlock
    pub(super) fn execute_loop_block<'a>(
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
                match self.execute_child_blocks(children).await? {
                    BlockResult::Continue => {}
                    other => return Ok(other),
                }
            }

            Ok(BlockResult::Continue)
        })
    }

    /// Execute InfiniteLoopBlock
    pub(super) fn execute_infinite_loop_block<'a>(
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
                match self.execute_child_blocks(children).await? {
                    BlockResult::Continue => {}
                    other => return Ok(other),
                }
            }
        })
    }

    /// Execute ConditionalBlock
    pub(super) fn execute_conditional_block<'a>(
        &'a mut self,
        image_id: Option<&'a ImageId>,
        condition: &'a ConditionOp,
        true_branch: &'a [BlockId],
        false_branch: &'a [BlockId],
    ) -> BoxFuture<'a, Result<BlockResult>> {
        Box::pin(async move {
            let image_id = image_id.ok_or_else(|| {
                AppError::ExecutionFailed(
                    "Condition block requires a selected image before execution"
                        .to_string(),
                )
            })?;
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

            match self.execute_child_blocks(branch).await? {
                BlockResult::Continue => {}
                other => return Ok(other),
            }

            Ok(BlockResult::Continue)
        })
    }

    /// Execute TextExtractBlock — take screenshot, run OCR, return recognized text
    pub(super) async fn execute_text_extract_block(
        &mut self,
        _image_id: Option<&ImageId>,
        language: Option<&str>,
    ) -> Result<BlockResult> {
        // Take screenshot of the primary monitor
        let capture = safe_execute(
            || crate::platform::ScreenCapture::new().capture_screen(),
            "Screen capture for OCR text extraction",
        )??;

        // Run OCR on the captured image (convert from DynamicImage to RgbaImage)
        let rgba = capture.image.to_rgba8();
        let ocr_result = safe_execute(
            || crate::core::ocr::recognize_text(&rgba, language),
            "OCR text recognition",
        )??;

        log::info!(
            "TextExtract: recognized {} characters from screen",
            ocr_result.text.len()
        );

        // Store the result in context for downstream blocks via event emission
        // TODO: emit a dedicated execution event with OCR result text when the
        //       block is executed as part of a flow (currently returns Continue)
        Ok(BlockResult::Continue)
    }

    /// Execute ScreenshotAssertBlock — take screenshot, compare with reference image,
    /// and report pixel-level diff results.
    pub(super) async fn execute_screenshot_assert_block(
        &mut self,
        image_id: Option<&ImageId>,
        threshold: Option<f64>,
        strict_mode: bool,
        region: Option<&serde_json::Value>,
    ) -> Result<BlockResult> {
        let reference_id = image_id.ok_or_else(|| {
            AppError::ExecutionFailed(
                "ScreenshotAssert block requires a reference image".to_string(),
            )
        })?;

        // Get image metadata and load reference from disk
        // Clone metadata name eagerly to avoid borrow conflict with insert below
        let metadata = self.image_library.get(reference_id).ok_or_else(|| {
            AppError::ImageNotFound(reference_id.to_string())
        })?;
        let image_name = metadata.name.clone();
        let image_path = self.images_dir.join(&metadata.file_path);
        let reference_image: DynamicImage = tokio::time::timeout(
            std::time::Duration::from_secs(SCREENSHOT_ASSERT_TIMEOUT_SECS),
            async {
                safe_execute(
                    || image::open(&image_path).map_err(|e| AppError::ImageError(e.to_string())),
                    "Loading reference image for screenshot assert",
                )
            },
        ).await
            .map_err(|_| AppError::ExecutionFailed(
                "ScreenshotAssert timed out loading reference image (disk I/O hang)".to_string(),
            ))?
            .map_err(|panic_err| AppError::ExecutionFailed(
                format!("Panic loading reference image: {}", panic_err),
            ))?
            ?;

        // Take screenshot of the primary monitor
        let capture = tokio::time::timeout(
            std::time::Duration::from_secs(SCREENSHOT_ASSERT_TIMEOUT_SECS),
            async {
                safe_execute(
                    || crate::platform::ScreenCapture::new().capture_screen(),
                    "Screen capture for screenshot assertion",
                )
            },
        ).await
            .map_err(|_| AppError::ExecutionFailed(
                "ScreenshotAssert timed out during screen capture (driver hang)".to_string(),
            ))?
            .map_err(|panic_err| AppError::ExecutionFailed(
                format!("Screen capture panicked: {}", panic_err),
            ))?
            ?;

        // Apply optional region cropping to both images
        let region_rect = region.and_then(|v| Self::parse_region(v));

        let actual_cropped = if let Some(rect) = &region_rect {
            let (w, h) = capture.image.dimensions();
            let x = rect.x.min(w.saturating_sub(1));
            let y = rect.y.min(h.saturating_sub(1));
            let rw = rect.width.min(w - x);
            let rh = rect.height.min(h - y);
            if rw > 0 && rh > 0 {
                capture.image.crop_imm(x, y, rw, rh)
            } else {
                capture.image.clone()
            }
        } else {
            capture.image.clone()
        };

        let reference_cropped = if let Some(rect) = &region_rect {
            let (w, h) = reference_image.dimensions();
            let x = rect.x.min(w.saturating_sub(1));
            let y = rect.y.min(h.saturating_sub(1));
            let rw = rect.width.min(w - x);
            let rh = rect.height.min(h - y);
            if rw > 0 && rh > 0 {
                reference_image.crop_imm(x, y, rw, rh)
            } else {
                reference_image.clone()
            }
        } else {
            reference_image.clone()
        };

        // Run diff comparison
        let matcher = crate::matching::ImageMatcher::new();
        let diff_result = matcher.diff_images(
            &reference_cropped,
            &actual_cropped,
            30,   // default pixel-level grayscale threshold
            true, // generate diff heatmap
        );

        let effective_threshold = threshold.unwrap_or(0.0);
        let passed = diff_result.diff_percentage <= effective_threshold;

        log::info!(
            "ScreenshotAssert: image='{}', diff={:.6} ({:.4}%), threshold={:.4}, passed={}",
            image_name,
            diff_result.diff_pixel_count,
            diff_result.diff_percentage * 100.0,
            effective_threshold,
            passed,
        );

        // Store diff results in context
        {
            let mut ctx = self.context.lock().await;
            ctx.set_variable("screenshot_assert_passed".to_string(), passed.to_string());
            ctx.set_variable("screenshot_assert_diff_pct".to_string(), diff_result.diff_percentage.to_string());
            ctx.set_variable("screenshot_assert_diff_pixels".to_string(), diff_result.diff_pixel_count.to_string());
            ctx.set_variable("screenshot_assert_total_pixels".to_string(), diff_result.total_pixels.to_string());
        }

        // Save diff heatmap image to disk and register it in the library
        if let Some(diff_img) = &diff_result.diff_image {
            let diff_image_id = ImageId::new();
            let diff_file_name = format!("diff_{}.png", diff_image_id);
            let diff_path = self.images_dir.join(&diff_file_name);

            // Save diff image to disk
            let _ = safe_execute(
                || diff_img.save(&diff_path).map_err(|e| AppError::ImageError(e.to_string())),
                "Saving diff heatmap image",
            );

            // Register in the image library HashMap
            let diff_metadata = ImageMetadata::new(
                format!("{}_diff", image_name),
                diff_file_name,
                diff_img.width(),
                diff_img.height(),
                crate::models::image::ImageFormat::Png,
                String::new(), // no hash needed for generated diff images
            );
            self.image_library.insert(diff_image_id.clone(), diff_metadata);

            // Store diff image ID in context
            let mut ctx = self.context.lock().await;
            ctx.set_variable("screenshot_assert_diff_image_id".to_string(), diff_image_id.to_string());
        }

        // In strict mode, fail on diff exceeding threshold
        if strict_mode && !passed {
            return Err(AppError::ExecutionFailed(format!(
                "Screenshot assertion FAILED: image '{}' differs by {:.4}% (threshold {:.4})",
                image_name, diff_result.diff_percentage * 100.0, effective_threshold,
            )));
        }

        Ok(BlockResult::Continue)
    }

    /// Parse a region value from JSON {x, y, width, height}
    fn parse_region(val: &serde_json::Value) -> Option<Rect> {
        let obj = val.as_object()?;
        let x = obj.get("x")?.as_f64()? as u32;
        let y = obj.get("y")?.as_f64()? as u32;
        let width = obj.get("width")?.as_f64()? as u32;
        let height = obj.get("height")?.as_f64()? as u32;
        Some(Rect { x, y, width, height })
    }

    /// Execute TextCheckBlock — take screenshot, run OCR, check keyword, branch
    pub(super) fn execute_text_check_block<'a>(
        &'a mut self,
        image_id: Option<&'a ImageId>,
        keyword: &'a str,
        true_branch: &'a [BlockId],
        false_branch: &'a [BlockId],
    ) -> BoxFuture<'a, Result<BlockResult>> {
        Box::pin(async move {
            let _image_id = image_id.ok_or_else(|| {
                AppError::ExecutionFailed(
                    "Text check block requires a selected image before execution"
                        .to_string(),
                )
            })?;

            // Take screenshot of the primary monitor
            let capture = safe_execute(
                || crate::platform::ScreenCapture::new().capture_screen(),
                "Screen capture for OCR text check",
            )??;

            // Run OCR (convert from DynamicImage to RgbaImage)
            let rgba = capture.image.to_rgba8();
            let ocr_result = crate::core::ocr::recognize_text(&rgba, None)?;

            // Check for keyword (case-insensitive partial match)
            let found = crate::core::ocr::contains_keyword(&ocr_result.text, keyword);

            log::info!(
                "TextCheck: keyword '{}' {} found in recognized text",
                keyword,
                if found { "was" } else { "not" }
            );

            // Execute appropriate branch
            let branch = if found { true_branch } else { false_branch };

            match self.execute_child_blocks(branch).await? {
                BlockResult::Continue => {}
                other => return Ok(other),
            }

            Ok(BlockResult::Continue)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Connection, ConnectionId};
    use uuid::Uuid;

    fn bid(hex: &str) -> BlockId {
        BlockId(Uuid::parse_str(hex).expect("invalid test UUID"))
    }

    /// Standalone implementation of `find_next_block` logic, testable
    /// without an Executor (which requires AppHandle / Tauri runtime).
    fn find_next_connection(
        connections: &[Connection],
        source: &BlockId,
        handle: Option<&str>,
    ) -> Option<BlockId> {
        for connection in connections {
            if connection.source == *source {
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

    #[test]
    fn should_have_default_wait_timeout_30_seconds() {
        assert_eq!(DEFAULT_WAIT_TIMEOUT_MS, 30_000);
    }

    #[test]
    fn should_have_poll_interval_50ms() {
        assert_eq!(POLL_INTERVAL_MS, 50);
    }

    // ---------------------------------------------------------------
    // find_next_block logic
    // ---------------------------------------------------------------

    fn make_connection(source: &BlockId, target: &BlockId) -> Connection {
        Connection {
            id: ConnectionId::new(),
            source: source.clone(),
            target: target.clone(),
            source_handle: None,
        }
    }

    fn make_connection_with_handle(source: &BlockId, target: &BlockId, handle: &str) -> Connection {
        Connection {
            id: ConnectionId::new(),
            source: source.clone(),
            target: target.clone(),
            source_handle: Some(handle.to_string()),
        }
    }

    #[test]
    fn should_find_next_block_with_default_handle() {
        let a = bid("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        let b = bid("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        let c = bid("cccccccc-cccc-cccc-cccc-cccccccccccc");
        let conns = vec![
            make_connection(&a, &b),
            make_connection(&b, &c),
        ];
        assert_eq!(find_next_connection(&conns, &a, None), Some(b.clone()));
    }

    #[test]
    fn should_return_none_when_no_connection_found() {
        let a = bid("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        let b = bid("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        let z = bid("00000000-0000-0000-0000-0000000000ff");
        let conns = vec![make_connection(&a, &b)];
        assert_eq!(find_next_connection(&conns, &z, None), None);
    }

    #[test]
    fn should_match_on_source_handle() {
        let a = bid("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        let b = bid("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        let c = bid("cccccccc-cccc-cccc-cccc-cccccccccccc");
        let conns = vec![
            make_connection_with_handle(&a, &b, "true"),
            make_connection_with_handle(&a, &c, "false"),
        ];
        assert_eq!(
            find_next_connection(&conns, &a, Some("true")),
            Some(b.clone())
        );
        assert_eq!(
            find_next_connection(&conns, &a, Some("false")),
            Some(c.clone())
        );
    }

    #[test]
    fn should_not_match_mismatched_handles() {
        let a = bid("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        let b = bid("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        let conns = vec![make_connection_with_handle(&a, &b, "true")];
        assert_eq!(find_next_connection(&conns, &a, Some("wrong")), None);
    }

    #[test]
    fn should_not_match_default_when_handle_expected() {
        let a = bid("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        let b = bid("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        let conns = vec![make_connection_with_handle(&a, &b, "true")];
        // Searching with None but connection has a handle → no match
        assert_eq!(find_next_connection(&conns, &a, None), None);
    }

    #[test]
    fn should_return_first_matching_connection() {
        let a = bid("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        let b = bid("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        let c = bid("cccccccc-cccc-cccc-cccc-cccccccccccc");
        let conns = vec![
            make_connection(&a, &b),
            make_connection(&a, &c),
        ];
        // First match wins
        assert_eq!(find_next_connection(&conns, &a, None), Some(b.clone()));
    }

    // ---------------------------------------------------------------
    // handle_block_result / BlockResult logic
    // ---------------------------------------------------------------

    #[test]
    fn should_continue_block_result() {
        let result = BlockResult::Continue;
        match result {
            BlockResult::Continue => {}
            _ => panic!("Expected Continue"),
        }
    }

    #[test]
    fn should_jump_to_block_result_contains_target() {
        let target = bid("deadbeef-dead-beef-dead-beefdeadbeef");
        let result = BlockResult::JumpTo {
            target_block_id: target.clone(),
        };
        match result {
            BlockResult::JumpTo { target_block_id } => {
                assert_eq!(target_block_id, target);
            }
            _ => panic!("Expected JumpTo"),
        }
    }

    #[test]
    fn should_error_block_result_contains_message() {
        let result = BlockResult::Error {
            message: "test error".to_string(),
        };
        match result {
            BlockResult::Error { message } => {
                assert_eq!(message, "test error");
            }
            _ => panic!("Expected Error"),
        }
    }

    #[test]
    fn should_default_block_result_to_continue() {
        let result = BlockResult::default();
        assert_eq!(result, BlockResult::Continue);
    }

    #[test]
    fn should_wait_for_block_result() {
        let result = BlockResult::WaitFor {
            duration_ms: Some(5000),
            image_id: None,
        };
        match result {
            BlockResult::WaitFor { duration_ms, .. } => {
                assert_eq!(duration_ms, Some(5000));
            }
            _ => panic!("Expected WaitFor"),
        }
    }
}
