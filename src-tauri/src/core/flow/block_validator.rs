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
        BlockConfig::TextExtract { .. } => {
            // TextExtract validation: requires image reference (checked in check_image_references)
        }
        BlockConfig::ScreenshotAssert { image_id: _, threshold, strict_mode: _, region: _ } => {
            if let Some(t) = threshold {
                if *t < 0.0 || *t > 1.0 {
                    errors.push(
                        ValidationError::warning(
                            "INVALID_ASSERT_THRESHOLD",
                            "Screenshot assert threshold should be between 0.0 (exact match) and 1.0 (ignore all)".to_string(),
                        )
                        .with_block(block_id.clone()),
                    );
                }
            }
        }
        BlockConfig::TextCheck {
            keyword,
            true_branch,
            false_branch,
            ..
        } => {
            if keyword.is_empty() {
                errors.push(
                    ValidationError::warning(
                        "EMPTY_TEXT_CHECK_KEYWORD",
                        "Text check keyword is empty".to_string(),
                    )
                    .with_block(block_id.clone()),
                );
            }
            if true_branch.is_empty() && false_branch.is_empty() {
                errors.push(
                    ValidationError::warning(
                        "EMPTY_TEXT_CHECK_BRANCHES",
                        "Both text check branches are empty".to_string(),
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
            BlockConfig::TextExtract { image_id, .. } => {
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
            BlockConfig::ScreenshotAssert { image_id, .. }
            | BlockConfig::TextCheck { image_id, .. } => {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::flow::ValidationSeverity;
    use crate::models::block::{BlockConfig, BlockId, ClickMode};
    use crate::models::flow::Flow;

    // ========================================================================
    // validate_block_config tests
    // ========================================================================

    #[test]
    fn should_error_on_zero_click_count() {
        let validator = FlowValidator::new();
        let block_id = BlockId::new();
        let config = BlockConfig::Click {
            mode: ClickMode::Coordinates { x: 100, y: 200 },
            count: 0,
        };
        let errors = validate_block_config(&validator, &block_id, &config);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].code, "INVALID_CLICK_COUNT");
        assert_eq!(errors[0].severity, ValidationSeverity::Error);
    }

    #[test]
    fn should_accept_valid_click_count() {
        let validator = FlowValidator::new();
        let block_id = BlockId::new();
        let config = BlockConfig::Click {
            mode: ClickMode::Coordinates { x: 100, y: 200 },
            count: 1,
        };
        let errors = validate_block_config(&validator, &block_id, &config);
        assert!(errors.is_empty());
    }

    #[test]
    fn should_warn_on_timeout_below_min() {
        let validator = FlowValidator::new();
        let block_id = BlockId::new();
        let config = BlockConfig::WaitImage {
            image_id: None,
            timeout_ms: Some(50),
        };
        let errors = validate_block_config(&validator, &block_id, &config);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].code, "TIMEOUT_OUT_OF_RANGE");
        assert_eq!(errors[0].severity, ValidationSeverity::Warning);
    }

    #[test]
    fn should_warn_on_timeout_above_max() {
        let validator = FlowValidator::new();
        let block_id = BlockId::new();
        let config = BlockConfig::WaitImage {
            image_id: None,
            timeout_ms: Some(100000),
        };
        let errors = validate_block_config(&validator, &block_id, &config);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].code, "TIMEOUT_OUT_OF_RANGE");
    }

    #[test]
    fn should_accept_timeout_in_valid_range() {
        let validator = FlowValidator::new();
        let block_id = BlockId::new();
        let config = BlockConfig::WaitImage {
            image_id: None,
            timeout_ms: Some(5000),
        };
        let errors = validate_block_config(&validator, &block_id, &config);
        assert!(errors.is_empty());
    }

    #[test]
    fn should_accept_none_timeout() {
        let validator = FlowValidator::new();
        let block_id = BlockId::new();
        let config = BlockConfig::WaitImage {
            image_id: None,
            timeout_ms: None,
        };
        let errors = validate_block_config(&validator, &block_id, &config);
        assert!(errors.is_empty());
    }

    #[test]
    fn should_warn_on_zero_wait_time() {
        let validator = FlowValidator::new();
        let block_id = BlockId::new();
        let config = BlockConfig::WaitTime { duration_ms: 0 };
        let errors = validate_block_config(&validator, &block_id, &config);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].code, "ZERO_WAIT_TIME");
        assert_eq!(errors[0].severity, ValidationSeverity::Warning);
    }

    #[test]
    fn should_accept_positive_wait_time() {
        let validator = FlowValidator::new();
        let block_id = BlockId::new();
        let config = BlockConfig::WaitTime { duration_ms: 500 };
        let errors = validate_block_config(&validator, &block_id, &config);
        assert!(errors.is_empty());
    }

    #[test]
    fn should_warn_on_empty_input_text() {
        let validator = FlowValidator::new();
        let block_id = BlockId::new();
        let config = BlockConfig::InputText {
            text: String::new(),
            interval_ms: None,
        };
        let errors = validate_block_config(&validator, &block_id, &config);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].code, "EMPTY_INPUT_TEXT");
        assert_eq!(errors[0].severity, ValidationSeverity::Warning);
    }

    #[test]
    fn should_accept_non_empty_input_text() {
        let validator = FlowValidator::new();
        let block_id = BlockId::new();
        let config = BlockConfig::InputText {
            text: "hello".to_string(),
            interval_ms: None,
        };
        let errors = validate_block_config(&validator, &block_id, &config);
        assert!(errors.is_empty());
    }

    #[test]
    fn should_error_on_zero_loop_count() {
        let validator = FlowValidator::new();
        let block_id = BlockId::new();
        let config = BlockConfig::Loop { count: 0 };
        let errors = validate_block_config(&validator, &block_id, &config);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].code, "ZERO_LOOP_COUNT");
        assert_eq!(errors[0].severity, ValidationSeverity::Error);
    }

    #[test]
    fn should_accept_positive_loop_count() {
        let validator = FlowValidator::new();
        let block_id = BlockId::new();
        let config = BlockConfig::Loop { count: 5 };
        let errors = validate_block_config(&validator, &block_id, &config);
        assert!(errors.is_empty());
    }

    #[test]
    fn should_accept_infinite_loop() {
        let validator = FlowValidator::new();
        let block_id = BlockId::new();
        let config = BlockConfig::LoopInfinite;
        let errors = validate_block_config(&validator, &block_id, &config);
        assert!(errors.is_empty());
    }

    #[test]
    fn should_warn_on_empty_condition_branches() {
        let validator = FlowValidator::new();
        let block_id = BlockId::new();
        let config = BlockConfig::Condition {
            image_id: None,
            condition: crate::models::block::ConditionOp::ImageExists,
            true_branch: vec![],
            false_branch: vec![],
        };
        let errors = validate_block_config(&validator, &block_id, &config);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].code, "EMPTY_CONDITION_BRANCHES");
        assert_eq!(errors[0].severity, ValidationSeverity::Warning);
    }

    #[test]
    fn should_accept_condition_with_true_branch() {
        let validator = FlowValidator::new();
        let block_id = BlockId::new();
        let true_block = BlockId::new();
        let config = BlockConfig::Condition {
            image_id: None,
            condition: crate::models::block::ConditionOp::ImageExists,
            true_branch: vec![true_block],
            false_branch: vec![],
        };
        let errors = validate_block_config(&validator, &block_id, &config);
        assert!(errors.is_empty());
    }

    #[test]
    fn should_accept_condition_with_false_branch() {
        let validator = FlowValidator::new();
        let block_id = BlockId::new();
        let false_block = BlockId::new();
        let config = BlockConfig::Condition {
            image_id: None,
            condition: crate::models::block::ConditionOp::ImageNotExists,
            true_branch: vec![],
            false_branch: vec![false_block],
        };
        let errors = validate_block_config(&validator, &block_id, &config);
        assert!(errors.is_empty());
    }

    // ========================================================================
    // check_image_references tests
    // ========================================================================

    #[test]
    fn should_error_on_nil_uuid_in_click_image_block() {
        let validator = FlowValidator::new();
        let mut flow = Flow::new("test".to_string());
        let block = crate::models::block::BlockNode::new(
            crate::models::block::BlockType::Action {
                action: crate::models::block::ActionType::Click,
            },
            crate::models::block::BlockPosition::new(0.0, 0.0),
            BlockConfig::Click {
                mode: ClickMode::Image {
                    image_id: Some(crate::models::image::ImageId(uuid::Uuid::nil())),
                },
                count: 1,
            },
        );
        let block_id = block.id.clone();
        flow.add_block(block);

        let errors = check_image_references(&validator, &flow);
        assert!(errors.iter().any(|e| e.code == "INVALID_IMAGE_REFERENCE"));
        assert!(errors.iter().any(|e| e.block_id.clone().is_some_and(|id| id == block_id)));
    }

    #[test]
    fn should_error_on_nil_uuid_in_wait_image_block() {
        let validator = FlowValidator::new();
        let mut flow = Flow::new("test".to_string());
        let block = crate::models::block::BlockNode::new(
            crate::models::block::BlockType::Action {
                action: crate::models::block::ActionType::WaitImage,
            },
            crate::models::block::BlockPosition::new(0.0, 0.0),
            BlockConfig::WaitImage {
                image_id: Some(crate::models::image::ImageId(uuid::Uuid::nil())),
                timeout_ms: Some(5000),
            },
        );
        flow.add_block(block);

        let errors = check_image_references(&validator, &flow);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].code, "INVALID_IMAGE_REFERENCE");
        assert_eq!(errors[0].severity, ValidationSeverity::Error);
    }

    #[test]
    fn should_error_on_nil_uuid_in_condition_block() {
        let validator = FlowValidator::new();
        let mut flow = Flow::new("test".to_string());
        let block = crate::models::block::BlockNode::new(
            crate::models::block::BlockType::Control {
                control: crate::models::block::ControlType::Condition,
            },
            crate::models::block::BlockPosition::new(0.0, 0.0),
            BlockConfig::Condition {
                image_id: Some(crate::models::image::ImageId(uuid::Uuid::nil())),
                condition: crate::models::block::ConditionOp::ImageExists,
                true_branch: vec![],
                false_branch: vec![],
            },
        );
        flow.add_block(block);

        let errors = check_image_references(&validator, &flow);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].code, "INVALID_IMAGE_REFERENCE");
    }

    #[test]
    fn should_accept_valid_uuid_in_image_block() {
        let validator = FlowValidator::new();
        let mut flow = Flow::new("test".to_string());
        let block = crate::models::block::BlockNode::new(
            crate::models::block::BlockType::Action {
                action: crate::models::block::ActionType::Click,
            },
            crate::models::block::BlockPosition::new(0.0, 0.0),
            BlockConfig::Click {
                mode: ClickMode::Image {
                    image_id: Some(crate::models::image::ImageId::new()),
                },
                count: 1,
            },
        );
        flow.add_block(block);

        let errors = check_image_references(&validator, &flow);
        assert!(errors.is_empty());
    }

    #[test]
    fn should_ignore_none_image_id_in_reference_check() {
        let validator = FlowValidator::new();
        let mut flow = Flow::new("test".to_string());
        let block = crate::models::block::BlockNode::new(
            crate::models::block::BlockType::Action {
                action: crate::models::block::ActionType::Click,
            },
            crate::models::block::BlockPosition::new(0.0, 0.0),
            BlockConfig::Click {
                mode: ClickMode::Image { image_id: None },
                count: 1,
            },
        );
        flow.add_block(block);

        let errors = check_image_references(&validator, &flow);
        assert!(errors.is_empty());
    }

    #[test]
    fn should_skip_non_image_blocks_in_reference_check() {
        let validator = FlowValidator::new();
        let mut flow = Flow::new("test".to_string());
        let block = crate::models::block::BlockNode::new(
            crate::models::block::BlockType::Action {
                action: crate::models::block::ActionType::WaitTime,
            },
            crate::models::block::BlockPosition::new(0.0, 0.0),
            BlockConfig::WaitTime { duration_ms: 1000 },
        );
        flow.add_block(block);

        let errors = check_image_references(&validator, &flow);
        assert!(errors.is_empty());
    }
}
