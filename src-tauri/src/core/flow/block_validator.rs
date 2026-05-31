//! Block-level validation
//!
//! Per-block configuration checks: parameter completeness, type matching,
//! required fields, and image reference validity.
//!
//! Validates: Requirements 5.4

use crate::models::block::{BlockConfig, BlockId};
use crate::models::flow::Flow;

use super::flow_validator::{FlowValidator, ValidationError};

/// Validate block configuration
pub(super) fn validate_block_config(
    validator: &FlowValidator,
    block_id: &BlockId,
    config: &BlockConfig,
) -> Vec<ValidationError> {
    let mut errors = Vec::new();

    match config {
        BlockConfig::Click { count, .. } => {
            if *count == 0 {
                errors.push(
                    ValidationError::error(
                        "INVALID_CLICK_COUNT",
                        "Click count must be at least 1".to_string(),
                    )
                    .with_block(block_id.clone()),
                );
            }
        }
        BlockConfig::WaitImage { timeout_ms, .. } => {
            if let Some(timeout) = timeout_ms {
                if *timeout < validator.min_timeout_ms
                    || *timeout > validator.max_timeout_ms
                {
                    errors.push(
                        ValidationError::warning(
                            "TIMEOUT_OUT_OF_RANGE",
                            format!(
                                "Timeout should be between {}ms and {}ms",
                                validator.min_timeout_ms, validator.max_timeout_ms
                            ),
                        )
                        .with_block(block_id.clone()),
                    );
                }
            }
        }
        BlockConfig::WaitTime { duration_ms } => {
            if *duration_ms == 0 {
                errors.push(
                    ValidationError::warning(
                        "ZERO_WAIT_TIME",
                        "Wait time is zero".to_string(),
                    )
                    .with_block(block_id.clone()),
                );
            }
        }
        BlockConfig::InputText { text, .. } => {
            if text.is_empty() {
                errors.push(
                    ValidationError::warning(
                        "EMPTY_INPUT_TEXT",
                        "Input text is empty".to_string(),
                    )
                    .with_block(block_id.clone()),
                );
            }
        }
        BlockConfig::Loop { count } => {
            if *count == 0 {
                errors.push(
                    ValidationError::error(
                        "ZERO_LOOP_COUNT",
                        "Loop count must be at least 1".to_string(),
                    )
                    .with_block(block_id.clone()),
                );
            }
        }
        BlockConfig::LoopInfinite => {
            // Infinite loops are valid but we might want to warn about them
            // No error here as infinite loops are intentional
        }
        BlockConfig::Condition {
            true_branch,
            false_branch,
            ..
        } => {
            if true_branch.is_empty() && false_branch.is_empty() {
                errors.push(
                    ValidationError::warning(
                        "EMPTY_CONDITION_BRANCHES",
                        "Both condition branches are empty".to_string(),
                    )
                    .with_block(block_id.clone()),
                );
            }
        }
    }

    errors
}

/// Check for image references (placeholder - actual image existence check would require ImageLibrary)
pub(super) fn check_image_references(
    _validator: &FlowValidator,
    flow: &Flow,
) -> Vec<ValidationError> {
    let mut errors = Vec::new();

    for (block_id, block) in &flow.blocks {
        match &block.config {
            BlockConfig::Click { mode, .. } => {
                if let crate::models::block::ClickMode::Image { image_id } = mode {
                    if let Some(image_id) = image_id {
                        if image_id.0.is_nil() {
                            errors.push(
                                ValidationError::error(
                                    "INVALID_IMAGE_REFERENCE",
                                    "Image ID is invalid (nil UUID)".to_string(),
                                )
                                .with_block(block_id.clone()),
                            );
                        }
                    }
                }
            }
            BlockConfig::WaitImage { image_id, .. } => {
                if let Some(image_id) = image_id {
                    if image_id.0.is_nil() {
                        errors.push(
                            ValidationError::error(
                                "INVALID_IMAGE_REFERENCE",
                                "Image ID is invalid (nil UUID)".to_string(),
                            )
                            .with_block(block_id.clone()),
                        );
                    }
                }
            }
            BlockConfig::Condition { image_id, .. } => {
                if let Some(image_id) = image_id {
                    if image_id.0.is_nil() {
                        errors.push(
                            ValidationError::error(
                                "INVALID_IMAGE_REFERENCE",
                                "Image ID is invalid (nil UUID)".to_string(),
                            )
                            .with_block(block_id.clone()),
                        );
                    }
                }
            }
            _ => {}
        }
    }

    errors
}
