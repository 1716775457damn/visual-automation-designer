//! Action block implementations
//!
//! This module contains implementations for all action block types:
//! - ClickBlock: Perform mouse clicks at coordinates or on images
//! - WaitImageBlock: Wait for an image to appear on screen
//! - WaitTimeBlock: Wait for a specified duration
//! - InputTextBlock: Input text via keyboard simulation
//!
//! Validates: Requirements 3.1, 3.2, 3.3, 3.4

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use crate::models::{BlockId, BlockType, BlockConfig, ActionType, ClickMode, ImageId, BlockPosition};
use crate::error::{AppError, Result};
use super::traits::{Block, BlockResult, BlockError, validate_config};

/// Click block - performs mouse click operations
///
/// Supports two modes:
/// - Coordinates mode: Click at specific screen coordinates
/// - Image mode: Find an image on screen and click its center
///
/// Validates: Requirements 3.1, 3.6
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickBlock {
    pub id: BlockId,
    pub position: BlockPosition,
    pub mode: ClickMode,
    pub count: u32,
}

impl ClickBlock {
    /// Create a new click block with coordinates mode
    pub fn new_coordinates(x: u32, y: u32, count: u32, position: BlockPosition) -> Self {
        Self {
            id: BlockId::new(),
            position,
            mode: ClickMode::Coordinates { x, y },
            count: count.max(1),
        }
    }

    /// Create a new click block with image mode
    pub fn new_image(image_id: ImageId, count: u32, position: BlockPosition) -> Self {
        Self {
            id: BlockId::new(),
            position,
            mode: ClickMode::Image { image_id: Some(image_id) },
            count: count.max(1),
        }
    }

    /// Get click coordinates (if in coordinates mode)
    pub fn coordinates(&self) -> Option<(u32, u32)> {
        match &self.mode {
            ClickMode::Coordinates { x, y } => Some((*x, *y)),
            ClickMode::Image { .. } => None,
        }
    }

    /// Get image ID (if in image mode)
    pub fn image_id(&self) -> Option<&ImageId> {
        match &self.mode {
            ClickMode::Image { image_id } => image_id.as_ref(),
            ClickMode::Coordinates { .. } => None,
        }
    }
}

#[async_trait]
impl Block for ClickBlock {
    fn id(&self) -> &BlockId {
        &self.id
    }

    fn block_type(&self) -> &BlockType {
        static BLOCK_TYPE: BlockType = BlockType::Action { action: ActionType::Click };
        &BLOCK_TYPE
    }

    fn validate(&self) -> Vec<BlockError> {
        let config = BlockConfig::Click {
            mode: self.mode.clone(),
            count: self.count,
        };
        validate_config(&config)
    }

    async fn execute(&self) -> Result<BlockResult> {
        // Task 6: Only validation, actual execution in Task 12
        let errors = self.validate();
        if !errors.is_empty() {
            return Ok(BlockResult::Error {
                message: errors.iter()
                    .map(|e| format!("{}: {}", e.field, e.message))
                    .collect::<Vec<_>>()
                    .join(", "),
            });
        }
        
        // Return Continue to indicate successful validation
        // Actual click logic will be implemented in Task 12
        Ok(BlockResult::Continue)
    }

    fn to_json(&self) -> Result<serde_json::Value> {
        serde_json::to_value(self).map_err(AppError::from)
    }

    fn from_json(json: &serde_json::Value) -> Result<Box<dyn Block>> {
        let block: ClickBlock = serde_json::from_value(json.clone())?;
        Ok(Box::new(block))
    }
}

/// Wait for image block - waits for an image to appear on screen
///
/// Polls the screen until the specified image is found or timeout is reached.
///
/// Validates: Requirements 3.2, 3.6
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaitImageBlock {
    pub id: BlockId,
    pub position: BlockPosition,
    pub image_id: Option<ImageId>,
    pub timeout_ms: Option<u64>,
}

impl WaitImageBlock {
    /// Create a new wait image block
    pub fn new(image_id: Option<ImageId>, timeout_ms: Option<u64>, position: BlockPosition) -> Self {
        Self {
            id: BlockId::new(),
            position,
            image_id,
            timeout_ms,
        }
    }
}

#[async_trait]
impl Block for WaitImageBlock {
    fn id(&self) -> &BlockId {
        &self.id
    }

    fn block_type(&self) -> &BlockType {
        static BLOCK_TYPE: BlockType = BlockType::Action { action: ActionType::WaitImage };
        &BLOCK_TYPE
    }

    fn validate(&self) -> Vec<BlockError> {
        let config = BlockConfig::WaitImage {
            image_id: self.image_id.clone(),
            timeout_ms: self.timeout_ms,
            threshold: None,
        };
        validate_config(&config)
    }

    async fn execute(&self) -> Result<BlockResult> {
        // Task 6: Only validation, actual execution in Task 12
        let errors = self.validate();
        if !errors.is_empty() {
            return Ok(BlockResult::Error {
                message: errors.iter()
                    .map(|e| format!("{}: {}", e.field, e.message))
                    .collect::<Vec<_>>()
                    .join(", "),
            });
        }
        
        // Return WaitFor to indicate this block needs to wait
        // Actual wait logic will be implemented in Task 12
        Ok(BlockResult::WaitFor {
            duration_ms: self.timeout_ms,
            image_id: self.image_id.clone(),
        })
    }

    fn to_json(&self) -> Result<serde_json::Value> {
        serde_json::to_value(self).map_err(AppError::from)
    }

    fn from_json(json: &serde_json::Value) -> Result<Box<dyn Block>> {
        let block: WaitImageBlock = serde_json::from_value(json.clone())?;
        Ok(Box::new(block))
    }
}

/// Wait time block - waits for a specified duration
///
/// Simply waits for the specified duration before continuing.
///
/// Validates: Requirements 3.3
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaitTimeBlock {
    pub id: BlockId,
    pub position: BlockPosition,
    pub duration_ms: u64,
}

impl WaitTimeBlock {
    /// Create a new wait time block
    pub fn new(duration_ms: u64, position: BlockPosition) -> Self {
        Self {
            id: BlockId::new(),
            position,
            duration_ms: duration_ms.max(1),
        }
    }
}

#[async_trait]
impl Block for WaitTimeBlock {
    fn id(&self) -> &BlockId {
        &self.id
    }

    fn block_type(&self) -> &BlockType {
        static BLOCK_TYPE: BlockType = BlockType::Action { action: ActionType::WaitTime };
        &BLOCK_TYPE
    }

    fn validate(&self) -> Vec<BlockError> {
        let config = BlockConfig::WaitTime {
            duration_ms: self.duration_ms,
        };
        validate_config(&config)
    }

    async fn execute(&self) -> Result<BlockResult> {
        // Task 6: Only validation, actual execution in Task 12
        let errors = self.validate();
        if !errors.is_empty() {
            return Ok(BlockResult::Error {
                message: errors.iter()
                    .map(|e| format!("{}: {}", e.field, e.message))
                    .collect::<Vec<_>>()
                    .join(", "),
            });
        }
        
        // Return WaitFor to indicate this block needs to wait
        // Actual wait logic will be implemented in Task 12
        Ok(BlockResult::WaitFor {
            duration_ms: Some(self.duration_ms),
            image_id: None,
        })
    }

    fn to_json(&self) -> Result<serde_json::Value> {
        serde_json::to_value(self).map_err(AppError::from)
    }

    fn from_json(json: &serde_json::Value) -> Result<Box<dyn Block>> {
        let block: WaitTimeBlock = serde_json::from_value(json.clone())?;
        Ok(Box::new(block))
    }
}

/// Input text block - simulates keyboard input
///
/// Types the specified text with optional interval between keystrokes.
///
/// Validates: Requirements 3.4
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputTextBlock {
    pub id: BlockId,
    pub position: BlockPosition,
    pub text: String,
    pub interval_ms: Option<u64>,
}

impl InputTextBlock {
    /// Create a new input text block
    pub fn new(text: String, interval_ms: Option<u64>, position: BlockPosition) -> Self {
        Self {
            id: BlockId::new(),
            position,
            text,
            interval_ms,
        }
    }
}

#[async_trait]
impl Block for InputTextBlock {
    fn id(&self) -> &BlockId {
        &self.id
    }

    fn block_type(&self) -> &BlockType {
        static BLOCK_TYPE: BlockType = BlockType::Action { action: ActionType::InputText };
        &BLOCK_TYPE
    }

    fn validate(&self) -> Vec<BlockError> {
        let config = BlockConfig::InputText {
            text: self.text.clone(),
            interval_ms: self.interval_ms,
        };
        validate_config(&config)
    }

    async fn execute(&self) -> Result<BlockResult> {
        // Task 6: Only validation, actual execution in Task 12
        let errors = self.validate();
        if !errors.is_empty() {
            return Ok(BlockResult::Error {
                message: errors.iter()
                    .map(|e| format!("{}: {}", e.field, e.message))
                    .collect::<Vec<_>>()
                    .join(", "),
            });
        }
        
        // Return Continue to indicate successful validation
        // Actual input logic will be implemented in Task 12
        Ok(BlockResult::Continue)
    }

    fn to_json(&self) -> Result<serde_json::Value> {
        serde_json::to_value(self).map_err(AppError::from)
    }

    fn from_json(json: &serde_json::Value) -> Result<Box<dyn Block>> {
        let block: InputTextBlock = serde_json::from_value(json.clone())?;
        Ok(Box::new(block))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_click_block_coordinates_creation() {
        let block = ClickBlock::new_coordinates(100, 200, 1, BlockPosition::new(0.0, 0.0));
        assert_eq!(block.coordinates(), Some((100, 200)));
        assert!(block.image_id().is_none());
        assert_eq!(block.count, 1);
    }

    #[test]
    fn test_click_block_image_creation() {
        let image_id = ImageId::new();
        let block = ClickBlock::new_image(image_id.clone(), 2, BlockPosition::new(0.0, 0.0));
        assert!(block.coordinates().is_none());
        assert_eq!(block.image_id(), Some(&image_id));
        assert_eq!(block.count, 2);
    }

    #[test]
    fn test_click_block_validation_valid() {
        let block = ClickBlock::new_coordinates(100, 200, 1, BlockPosition::new(0.0, 0.0));
        let errors = block.validate();
        assert!(errors.is_empty());
    }

    #[test]
    fn test_click_block_serialization() {
        let block = ClickBlock::new_coordinates(100, 200, 1, BlockPosition::new(50.0, 100.0));
        let json = block.to_json().unwrap();
        let deserialized = ClickBlock::from_json(&json).unwrap();
        assert_eq!(block.id, deserialized.id().clone());
    }

    #[test]
    fn test_wait_image_block_creation() {
        let image_id = ImageId::new();
        let block = WaitImageBlock::new(Some(image_id.clone()), Some(5000), BlockPosition::new(0.0, 0.0));
        assert_eq!(block.image_id, Some(image_id));
        assert_eq!(block.timeout_ms, Some(5000));
    }

    #[test]
    fn test_wait_image_block_validation_valid() {
        let block = WaitImageBlock::new(Some(ImageId::new()), Some(1000), BlockPosition::new(0.0, 0.0));
        let errors = block.validate();
        assert!(errors.is_empty());
    }

    #[test]
    fn test_wait_time_block_creation() {
        let block = WaitTimeBlock::new(1000, BlockPosition::new(0.0, 0.0));
        assert_eq!(block.duration_ms, 1000);
    }

    #[test]
    fn test_wait_time_block_validation_valid() {
        let block = WaitTimeBlock::new(1000, BlockPosition::new(0.0, 0.0));
        let errors = block.validate();
        assert!(errors.is_empty());
    }

    #[test]
    fn test_input_text_block_creation() {
        let block = InputTextBlock::new("Hello World".to_string(), Some(50), BlockPosition::new(0.0, 0.0));
        assert_eq!(block.text, "Hello World");
        assert_eq!(block.interval_ms, Some(50));
    }

    #[test]
    fn test_input_text_block_validation_valid() {
        let block = InputTextBlock::new("Test".to_string(), Some(10), BlockPosition::new(0.0, 0.0));
        let errors = block.validate();
        assert!(errors.is_empty());
    }

    #[tokio::test]
    async fn test_click_block_execute() {
        let block = ClickBlock::new_coordinates(100, 200, 1, BlockPosition::new(0.0, 0.0));
        let result = block.execute().await.unwrap();
        assert_eq!(result, BlockResult::Continue);
    }

    #[tokio::test]
    async fn test_wait_time_block_execute() {
        let block = WaitTimeBlock::new(1000, BlockPosition::new(0.0, 0.0));
        let result = block.execute().await.unwrap();
        assert_eq!(result, BlockResult::WaitFor {
            duration_ms: Some(1000),
            image_id: None,
        });
    }
}
