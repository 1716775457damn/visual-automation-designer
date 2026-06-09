//! Block trait definition and common types
//!
//! This module defines the core Block trait that all block types must implement.
//!
//! Validates: Requirements 3.5, 4.5

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use crate::models::{BlockId, BlockType, BlockConfig};
use crate::error::Result;

/// Result of block execution
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum BlockResult {
    /// Execution completed successfully, continue to next block
    Continue,
    /// Jump to a specific block (used by control flow blocks)
    JumpTo {
        target_block_id: BlockId,
    },
    /// Wait for an external event or condition
    WaitFor {
        /// Duration to wait in milliseconds (if applicable)
        duration_ms: Option<u64>,
        /// Image ID to wait for (if applicable)
        image_id: Option<crate::models::ImageId>,
    },
    /// Execution completed with an error
    Error {
        message: String,
    },
}

impl Default for BlockResult {
    fn default() -> Self {
        BlockResult::Continue
    }
}

/// Block validation error
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BlockError {
    pub field: String,
    pub message: String,
}

impl BlockError {
    pub fn new(field: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            field: field.into(),
            message: message.into(),
        }
    }
}

/// Core Block trait that all block types must implement
///
/// This trait defines the interface for all automation blocks.
/// Blocks can be action blocks (perform operations) or control blocks
/// (control flow execution).
#[async_trait]
pub trait Block: Send + Sync {
    /// Get the unique identifier of this block
    fn id(&self) -> &BlockId;
    
    /// Get the block type
    fn block_type(&self) -> &BlockType;
    
    /// Validate the block configuration
    /// Returns a list of validation errors, empty if valid
    fn validate(&self) -> Vec<BlockError>;
    
    /// Execute the block
    /// 
    /// Note: In this task (Task 6), execute() only validates the block.
    /// Actual execution logic will be implemented in Task 12.
    async fn execute(&self) -> Result<BlockResult>;
    
    /// Serialize block to JSON
    fn to_json(&self) -> Result<serde_json::Value>;
    
    /// Deserialize block from JSON
    fn from_json(json: &serde_json::Value) -> Result<Box<dyn Block>>
    where
        Self: Sized;
}

/// Helper function to validate a block's configuration
pub fn validate_config(config: &BlockConfig) -> Vec<BlockError> {
    let mut errors = Vec::new();
    
    match config {
        BlockConfig::Click { mode, count } => {
            if *count == 0 {
                errors.push(BlockError::new("count", "Click count must be at least 1"));
            }
            if let crate::models::ClickMode::Coordinates { x, y } = mode {
                // Coordinates are always valid for screen positions
                let _ = (x, y); // Coordinates can be any valid screen position
            }
        }
        BlockConfig::WaitImage { image_id: _, timeout_ms, threshold: _ } => {
            if let Some(timeout) = timeout_ms {
                if *timeout == 0 {
                    errors.push(BlockError::new("timeout_ms", "Timeout must be greater than 0"));
                }
            }
        }
        BlockConfig::WaitTime { duration_ms } => {
            if *duration_ms == 0 {
                errors.push(BlockError::new("duration_ms", "Duration must be greater than 0"));
            }
        }
        BlockConfig::InputText { text, interval_ms } => {
            if text.is_empty() {
                errors.push(BlockError::new("text", "Text cannot be empty"));
            }
            if let Some(interval) = interval_ms {
                if *interval == 0 {
                    errors.push(BlockError::new("interval_ms", "Interval must be greater than 0"));
                }
            }
        }
        BlockConfig::Loop { count } => {
            if *count == 0 {
                errors.push(BlockError::new("count", "Loop count must be at least 1"));
            }
        }
        BlockConfig::LoopInfinite => {
            // Infinite loop has no configuration to validate
        }
        BlockConfig::Condition { 
            image_id: _, 
            condition: _, 
            true_branch, 
            false_branch 
        } => {
            if true_branch.is_empty() && false_branch.is_empty() {
                errors.push(BlockError::new("branches", "At least one branch must have blocks"));
            }
        }
        BlockConfig::TextExtract { image_id: _, language: _ } => {
            // TextExtract has no required config validation beyond having
            // a valid image reference, which is checked elsewhere
        }
        BlockConfig::ScreenshotAssert { image_id: _, threshold, strict_mode: _, region: _ } => {
            if let Some(t) = threshold {
                if *t < 0.0 || *t > 1.0 {
                    errors.push(BlockError::new("threshold", "Threshold must be between 0.0 and 1.0"));
                }
            }
        }
        BlockConfig::TextCheck { image_id: _, keyword, true_branch, false_branch } => {
            if keyword.is_empty() {
                errors.push(BlockError::new("keyword", "Keyword cannot be empty"));
            }
            if true_branch.is_empty() && false_branch.is_empty() {
                errors.push(BlockError::new("branches", "At least one branch must have blocks"));
            }
        }
    }
    
    errors
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ClickMode, ConditionOp, ImageId};

    #[test]
    fn test_block_result_default() {
        let result = BlockResult::default();
        assert_eq!(result, BlockResult::Continue);
    }

    #[test]
    fn test_validate_click_config_valid() {
        let config = BlockConfig::Click {
            mode: ClickMode::Coordinates { x: 100, y: 200 },
            count: 1,
        };
        let errors = validate_config(&config);
        assert!(errors.is_empty());
    }

    #[test]
    fn test_validate_click_config_invalid_count() {
        let config = BlockConfig::Click {
            mode: ClickMode::Coordinates { x: 100, y: 200 },
            count: 0,
        };
        let errors = validate_config(&config);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].field, "count");
    }

    #[test]
    fn test_validate_wait_time_config_valid() {
        let config = BlockConfig::WaitTime { duration_ms: 1000 };
        let errors = validate_config(&config);
        assert!(errors.is_empty());
    }

    #[test]
    fn test_validate_wait_time_config_invalid() {
        let config = BlockConfig::WaitTime { duration_ms: 0 };
        let errors = validate_config(&config);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].field, "duration_ms");
    }

    #[test]
    fn test_validate_input_text_config_valid() {
        let config = BlockConfig::InputText {
            text: "Hello".to_string(),
            interval_ms: Some(50),
        };
        let errors = validate_config(&config);
        assert!(errors.is_empty());
    }

    #[test]
    fn test_validate_input_text_config_empty_text() {
        let config = BlockConfig::InputText {
            text: "".to_string(),
            interval_ms: None,
        };
        let errors = validate_config(&config);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].field, "text");
    }

    #[test]
    fn test_validate_loop_config_valid() {
        let config = BlockConfig::Loop { count: 5 };
        let errors = validate_config(&config);
        assert!(errors.is_empty());
    }

    #[test]
    fn test_validate_loop_config_invalid() {
        let config = BlockConfig::Loop { count: 0 };
        let errors = validate_config(&config);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].field, "count");
    }

    #[test]
    fn test_validate_condition_config_valid() {
        let config = BlockConfig::Condition {
            image_id: Some(ImageId::new()),
            condition: ConditionOp::ImageExists,
            true_branch: vec![BlockId::new()],
            false_branch: vec![],
        };
        let errors = validate_config(&config);
        assert!(errors.is_empty());
    }

    #[test]
    fn test_validate_condition_config_no_branches() {
        let config = BlockConfig::Condition {
            image_id: Some(ImageId::new()),
            condition: ConditionOp::ImageExists,
            true_branch: vec![],
            false_branch: vec![],
        };
        let errors = validate_config(&config);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].field, "branches");
    }
}
