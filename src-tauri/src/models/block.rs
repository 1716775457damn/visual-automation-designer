//! Block data models for the Visual Automation Designer
//!
//! This module defines the core data structures for blocks (积木块),
//! which are the building units of automation flows.
//!
//! Validates: Requirements 2.2, 2.3

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Unique identifier for a block
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct BlockId(pub Uuid);

impl BlockId {
    /// Create a new unique block ID
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for BlockId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for BlockId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Action block types - perform operations
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionType {
    /// Click operation (coordinate or image-based)
    Click,
    /// Wait for image to appear on screen
    WaitImage,
    /// Wait for a specified duration
    WaitTime,
    /// Input text via keyboard simulation
    InputText,
    /// Extract text from screen via OCR
    TextExtract,
    /// Take screenshot and compare with reference image for assertion
    ScreenshotAssert,
}

/// Control block types - control flow execution
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ControlType {
    /// Loop with specified iteration count
    Loop,
    /// Infinite loop (until explicitly stopped)
    LoopInfinite,
    /// Conditional branching based on image presence
    Condition,
    /// Conditional branching based on OCR text detection
    TextCheck,
}

/// Block type classification
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BlockType {
    /// Action block
    Action { action: ActionType },
    /// Control block
    Control { control: ControlType },
}

/// Position on the canvas (for rendering)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BlockPosition {
    pub x: f64,
    pub y: f64,
}

impl BlockPosition {
    /// Create a new position
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }
}

/// Click mode configuration
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ClickMode {
    /// Click at specific coordinates
    Coordinates { x: u32, y: u32 },
    /// Click at the center of an image found on screen
    Image {
        #[serde(alias = "image_id")]
        image_id: Option<crate::models::image::ImageId>,
    },
}

/// Condition operator for conditional blocks
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConditionOp {
    /// Execute branch if image exists on screen
    ImageExists,
    /// Execute branch if image does not exist on screen
    ImageNotExists,
}

/// Block configuration - varies by block type
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum BlockConfig {
    /// Click block configuration
    Click {
        /// Click mode: coordinates or image-based
        mode: ClickMode,
        /// Number of clicks (default: 1)
        count: u32,
    },
    /// Wait for image block configuration
    WaitImage {
        /// Image ID to wait for
        #[serde(alias = "image_id")]
        image_id: Option<crate::models::image::ImageId>,
        /// Timeout in milliseconds (optional)
        #[serde(alias = "timeout_ms")]
        timeout_ms: Option<u64>,
        /// Matching accuracy threshold (0.0~1.0). Default: 0.7
        /// Scores below this are treated as "not found".
        #[serde(alias = "threshold")]
        threshold: Option<f64>,
    },
    /// Wait for time block configuration
    WaitTime {
        /// Duration to wait in milliseconds
        #[serde(alias = "duration_ms")]
        duration_ms: u64,
    },
    /// Input text block configuration
    InputText {
        /// Text to input
        text: String,
        /// Interval between keystrokes in milliseconds (optional)
        #[serde(alias = "interval_ms")]
        interval_ms: Option<u64>,
    },
    /// Loop block configuration
    Loop {
        /// Number of iterations
        count: u32,
    },
    /// Infinite loop block configuration
    LoopInfinite,
    /// Text extract block configuration (OCR)
    TextExtract {
        /// Image ID to OCR
        #[serde(alias = "image_id")]
        image_id: Option<crate::models::image::ImageId>,
        /// Language tag (e.g. "zh-Hans-CN", "en-US")
        #[serde(alias = "language")]
        language: Option<String>,
    },
    /// Conditional block configuration
    Condition {
        /// Image ID to check
        #[serde(alias = "image_id")]
        image_id: Option<crate::models::image::ImageId>,
        /// Condition operator
        condition: ConditionOp,
        /// Block IDs to execute when condition is true
        #[serde(alias = "true_branch")]
        true_branch: Vec<BlockId>,
        /// Block IDs to execute when condition is false
        #[serde(alias = "false_branch")]
        false_branch: Vec<BlockId>,
    },
    /// Screenshot assertion block configuration (screenshot comparison)
    ScreenshotAssert {
        /// Image ID of the reference image to compare against
        #[serde(alias = "image_id")]
        image_id: Option<crate::models::image::ImageId>,
        /// Difference threshold (0.0 = exact match, 1.0 = ignore all differences)
        /// Default: 0.0 (exact pixel match)
        #[serde(alias = "threshold")]
        threshold: Option<f64>,
        /// Strict mode: if true, execution error when diff exceeds threshold.
        /// If false, continue with a warning / output flag.
        #[serde(alias = "strict_mode")]
        strict_mode: bool,
        /// Optional region to restrict comparison {x, y, width, height}
        #[serde(alias = "region")]
        region: Option<serde_json::Value>,
    },
    /// Text check block configuration (OCR-based conditional)
    TextCheck {
        /// Image ID to OCR
        #[serde(alias = "image_id")]
        image_id: Option<crate::models::image::ImageId>,
        /// Keyword to search for in the extracted text
        keyword: String,
        /// Block IDs to execute when keyword is found
        #[serde(alias = "true_branch")]
        true_branch: Vec<BlockId>,
        /// Block IDs to execute when keyword is not found
        #[serde(alias = "false_branch")]
        false_branch: Vec<BlockId>,
    },
}

/// A block node in the flow graph
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockNode {
    /// Unique block identifier
    pub id: BlockId,
    /// Block type (action or control)
    pub block_type: BlockType,
    /// Position on canvas
    pub position: BlockPosition,
    /// Block-specific configuration
    pub config: BlockConfig,
    /// Child blocks (for control blocks like loops and conditions)
    pub children: Vec<BlockId>,
}

impl BlockNode {
    /// Create a new block node
    pub fn new(block_type: BlockType, position: BlockPosition, config: BlockConfig) -> Self {
        Self {
            id: BlockId::new(),
            block_type,
            position,
            config,
            children: Vec::new(),
        }
    }

    /// Create a block node with a specific ID (for deserialization)
    pub fn with_id(
        id: BlockId,
        block_type: BlockType,
        position: BlockPosition,
        config: BlockConfig,
    ) -> Self {
        Self {
            id,
            block_type,
            position,
            config,
            children: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_block_id_uniqueness() {
        let id1 = BlockId::new();
        let id2 = BlockId::new();
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_block_type_serialization() {
        let block_type = BlockType::Action {
            action: ActionType::Click,
        };
        let json = serde_json::to_string(&block_type).unwrap();
        // The JSON should be: {"type":"action","action":"click"}
        assert!(json.contains("action"), "JSON should contain 'action': {}", json);
        assert!(json.contains("click"), "JSON should contain 'click': {}", json);
    }

    #[test]
    fn test_block_node_creation() {
        let position = BlockPosition::new(100.0, 200.0);
        let config = BlockConfig::WaitTime { duration_ms: 1000 };
        let node = BlockNode::new(
            BlockType::Action {
                action: ActionType::WaitTime,
            },
            position,
            config,
        );
        assert!(node.children.is_empty());
    }
}
