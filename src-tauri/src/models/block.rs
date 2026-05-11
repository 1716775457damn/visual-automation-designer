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
#[serde(tag = "mode", rename_all = "camelCase")]
pub enum ClickMode {
    /// Click at specific coordinates
    Coordinates { x: u32, y: u32 },
    /// Click at the center of an image found on screen
    Image { image_id: crate::models::image::ImageId },
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
#[serde(tag = "type", rename_all = "camelCase")]
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
        image_id: crate::models::image::ImageId,
        /// Timeout in milliseconds (optional)
        timeout_ms: Option<u64>,
    },
    /// Wait for time block configuration
    WaitTime {
        /// Duration to wait in milliseconds
        duration_ms: u64,
    },
    /// Input text block configuration
    InputText {
        /// Text to input
        text: String,
        /// Interval between keystrokes in milliseconds (optional)
        interval_ms: Option<u64>,
    },
    /// Loop block configuration
    Loop {
        /// Number of iterations
        count: u32,
    },
    /// Infinite loop block configuration
    LoopInfinite,
    /// Conditional block configuration
    Condition {
        /// Image ID to check
        image_id: crate::models::image::ImageId,
        /// Condition operator
        condition: ConditionOp,
        /// Block IDs to execute when condition is true
        true_branch: Vec<BlockId>,
        /// Block IDs to execute when condition is false
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
