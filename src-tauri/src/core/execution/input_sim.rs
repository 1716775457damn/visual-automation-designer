//! Input simulation operations
//!
//! Mouse clicks (coordinate-based and image-based), keyboard text input,
//! with DPI scaling, stop/pause support, and panic safety.
//!
//! Validates: Requirements 8.4

use crate::error::{AppError, Result};
use crate::models::ClickMode;
use crate::core::BlockResult;
use crate::platform::InputController;

use super::runner::{safe_execute, Executor};

impl Executor {
    /// Execute ClickBlock
    ///
    /// Validates: Requirements 8.4 - Exception handling for input operations
    ///
    /// DPI scaling: Coordinates from user input (ClickMode::Coordinates) are scaled from
    /// logical (CSS) pixels to physical pixels using the configured dpi_scale factor.
    /// Coordinates from image matching are already in physical pixels and not scaled.
    pub(super) async fn execute_click_block(
        &mut self,
        mode: &ClickMode,
        count: u32,
    ) -> Result<BlockResult> {
        let (x, y) = match mode {
            ClickMode::Coordinates { x, y } => {
                // Apply DPI scaling: logical → physical pixels
                if self.dpi_scale != 1.0 {
                    let sf = self.dpi_scale as f64;
                    (
                        (*x as f64 * sf).round() as u32,
                        (*y as f64 * sf).round() as u32,
                    )
                } else {
                    (*x, *y)
                }
            }
            ClickMode::Image { image_id } => {
                let image_id =
                    image_id.as_ref().ok_or_else(|| {
                        AppError::ExecutionFailed(
                            "Click block requires an image before execution"
                                .to_string(),
                        )
                    })?;
                // Check cache first
                let cached = {
                    let ctx = self.context.lock().await;
                    ctx.get_cached_image_match(image_id)
                };

                if let Some(pos) = cached {
                    pos
                } else {
                    // Find image on screen
                    let (found, pos, confidence) = self.find_image_on_screen(image_id, None).await?;
                    if !found {
                        let image_name = self.image_library
                            .get(image_id)
                            .map(|m| m.name.as_str())
                            .unwrap_or("unknown");
                        // Include accuracy info in error when available
                        let detail = if confidence > 0.0 {
                            format!(
                                " (最佳匹配准确率 {:.1}%)", confidence * 100.0
                            )
                        } else {
                            String::new()
                        };
                        return Ok(BlockResult::Error {
                            message: format!(
                                "Image not found on screen: {} (name: {}){}",
                                image_id, image_name, detail
                            ),
                        });
                    }
                    pos
                }
            }
        };

        // Check stop signal before starting clicks
        if *self.stop_receiver.borrow() {
            return Ok(BlockResult::Error {
                message: "Execution stopped".to_string(),
            });
        }

        self.wait_if_paused().await;

        // Perform clicks with panic handling in a single synchronous block
        // to avoid Enigo thread-safety (non-Send) issues across async awaits.
        let click_result = safe_execute(
            || {
                let mut input = InputController::new()?;
                for i in 0..count {
                    input.click_at(x, y, crate::platform::MouseButton::Left)?;
                    if i < count - 1 {
                        std::thread::sleep(std::time::Duration::from_millis(25));
                    }
                }
                Ok(())
            },
            "Click operation",
        );

        match click_result {
            Ok(Ok(_)) => Ok(BlockResult::Continue),
            Ok(Err(e)) => Err(e),
            Err(e) => Err(e),
        }
    }

    /// Execute InputTextBlock
    ///
    /// Validates: Requirements 8.4 - Exception handling for input operations
    pub(super) async fn execute_input_text_block(
        &mut self,
        text: &str,
        interval_ms: Option<u64>,
    ) -> Result<BlockResult> {
        let interval = interval_ms.unwrap_or(10);

        let click_result = safe_execute(
            || {
                let mut input = InputController::new()?;
                input.type_text_with_interval(text, interval)
            },
            "Text input operation",
        );

        match click_result {
            Ok(Ok(_)) => Ok(BlockResult::Continue),
            Ok(Err(e)) => Err(e),
            Err(e) => Err(e),
        }
    }
}
