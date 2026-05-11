//! Control block implementations
//!
//! This module contains implementations for all control block types:
//! - LoopBlock: Execute child blocks a specified number of times
//! - InfiniteLoopBlock: Execute child blocks indefinitely
//! - ConditionalBlock: Execute branches based on conditions
//!
//! Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use crate::models::{BlockId, BlockType, BlockConfig, ControlType, ImageId, BlockPosition, ConditionOp};
use crate::error::{AppError, Result};
use super::traits::{Block, BlockResult, BlockError, validate_config};

/// Loop block - executes child blocks a specified number of times
///
/// This block contains a list of child block IDs that will be executed
/// in sequence for the specified number of iterations.
///
/// Validates: Requirements 4.1, 4.5
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopBlock {
    pub id: BlockId,
    pub position: BlockPosition,
    pub count: u32,
    pub children: Vec<BlockId>,
}

impl LoopBlock {
    /// Create a new loop block
    pub fn new(count: u32, position: BlockPosition) -> Self {
        Self {
            id: BlockId::new(),
            position,
            count: count.max(1),
            children: Vec::new(),
        }
    }

    /// Add a child block
    pub fn add_child(&mut self, child_id: BlockId) {
        self.children.push(child_id);
    }

    /// Remove a child block
    pub fn remove_child(&mut self, child_id: &BlockId) {
        self.children.retain(|id| id != child_id);
    }

    /// Get current iteration (used during execution)
    pub fn current_iteration(&self, context: &std::collections::HashMap<BlockId, u32>) -> Option<u32> {
        context.get(&self.id).copied()
    }

    /// Check if more iterations remain
    pub fn has_more_iterations(&self, current: u32) -> bool {
        current < self.count
    }
}

#[async_trait]
impl Block for LoopBlock {
    fn id(&self) -> &BlockId {
        &self.id
    }

    fn block_type(&self) -> &BlockType {
        static BLOCK_TYPE: BlockType = BlockType::Control { control: ControlType::Loop };
        &BLOCK_TYPE
    }

    fn validate(&self) -> Vec<BlockError> {
        let config = BlockConfig::Loop {
            count: self.count,
        };
        let mut errors = validate_config(&config);
        
        // Additional validation for children
        if self.children.is_empty() {
            errors.push(BlockError::new("children", "Loop must have at least one child block"));
        }
        
        errors
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
        // Actual loop logic will be implemented in Task 12
        Ok(BlockResult::Continue)
    }

    fn to_json(&self) -> Result<serde_json::Value> {
        serde_json::to_value(self).map_err(AppError::from)
    }

    fn from_json(json: &serde_json::Value) -> Result<Box<dyn Block>> {
        let block: LoopBlock = serde_json::from_value(json.clone())?;
        Ok(Box::new(block))
    }
}

/// Infinite loop block - executes child blocks indefinitely
///
/// This block will continue executing its children until the flow is
/// explicitly stopped or an error occurs.
///
/// Validates: Requirements 4.2, 4.5
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InfiniteLoopBlock {
    pub id: BlockId,
    pub position: BlockPosition,
    pub children: Vec<BlockId>,
}

impl InfiniteLoopBlock {
    /// Create a new infinite loop block
    pub fn new(position: BlockPosition) -> Self {
        Self {
            id: BlockId::new(),
            position,
            children: Vec::new(),
        }
    }

    /// Add a child block
    pub fn add_child(&mut self, child_id: BlockId) {
        self.children.push(child_id);
    }

    /// Remove a child block
    pub fn remove_child(&mut self, child_id: &BlockId) {
        self.children.retain(|id| id != child_id);
    }
}

#[async_trait]
impl Block for InfiniteLoopBlock {
    fn id(&self) -> &BlockId {
        &self.id
    }

    fn block_type(&self) -> &BlockType {
        static BLOCK_TYPE: BlockType = BlockType::Control { control: ControlType::LoopInfinite };
        &BLOCK_TYPE
    }

    fn validate(&self) -> Vec<BlockError> {
        let config = BlockConfig::LoopInfinite;
        let mut errors = validate_config(&config);
        
        // Additional validation for children
        if self.children.is_empty() {
            errors.push(BlockError::new("children", "Infinite loop must have at least one child block"));
        }
        
        errors
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
        // Actual infinite loop logic will be implemented in Task 12
        Ok(BlockResult::Continue)
    }

    fn to_json(&self) -> Result<serde_json::Value> {
        serde_json::to_value(self).map_err(AppError::from)
    }

    fn from_json(json: &serde_json::Value) -> Result<Box<dyn Block>> {
        let block: InfiniteLoopBlock = serde_json::from_value(json.clone())?;
        Ok(Box::new(block))
    }
}

/// Conditional block - executes branches based on image presence
///
/// Evaluates a condition (image exists or not) and executes the
/// appropriate branch of child blocks.
///
/// Validates: Requirements 4.3, 4.4, 4.5, 4.6
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConditionalBlock {
    pub id: BlockId,
    pub position: BlockPosition,
    pub image_id: ImageId,
    pub condition: ConditionOp,
    pub true_branch: Vec<BlockId>,
    pub false_branch: Vec<BlockId>,
}

impl ConditionalBlock {
    /// Create a new conditional block
    pub fn new(
        image_id: ImageId,
        condition: ConditionOp,
        position: BlockPosition,
    ) -> Self {
        Self {
            id: BlockId::new(),
            position,
            image_id,
            condition,
            true_branch: Vec::new(),
            false_branch: Vec::new(),
        }
    }

    /// Add a block to the true branch
    pub fn add_to_true_branch(&mut self, block_id: BlockId) {
        self.true_branch.push(block_id);
    }

    /// Add a block to the false branch
    pub fn add_to_false_branch(&mut self, block_id: BlockId) {
        self.false_branch.push(block_id);
    }

    /// Remove a block from the true branch
    pub fn remove_from_true_branch(&mut self, block_id: &BlockId) {
        self.true_branch.retain(|id| id != block_id);
    }

    /// Remove a block from the false branch
    pub fn remove_from_false_branch(&mut self, block_id: &BlockId) {
        self.false_branch.retain(|id| id != block_id);
    }

    /// Get all child block IDs (both branches)
    pub fn all_children(&self) -> Vec<&BlockId> {
        self.true_branch.iter()
            .chain(self.false_branch.iter())
            .collect()
    }

    /// Evaluate the condition based on image presence
    /// Returns true if the true branch should be executed
    pub fn evaluate_condition(&self, image_found: bool) -> bool {
        match self.condition {
            ConditionOp::ImageExists => image_found,
            ConditionOp::ImageNotExists => !image_found,
        }
    }
}

#[async_trait]
impl Block for ConditionalBlock {
    fn id(&self) -> &BlockId {
        &self.id
    }

    fn block_type(&self) -> &BlockType {
        static BLOCK_TYPE: BlockType = BlockType::Control { control: ControlType::Condition };
        &BLOCK_TYPE
    }

    fn validate(&self) -> Vec<BlockError> {
        let config = BlockConfig::Condition {
            image_id: self.image_id.clone(),
            condition: self.condition.clone(),
            true_branch: self.true_branch.clone(),
            false_branch: self.false_branch.clone(),
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
        // Actual conditional execution logic will be implemented in Task 12
        Ok(BlockResult::Continue)
    }

    fn to_json(&self) -> Result<serde_json::Value> {
        serde_json::to_value(self).map_err(AppError::from)
    }

    fn from_json(json: &serde_json::Value) -> Result<Box<dyn Block>> {
        let block: ConditionalBlock = serde_json::from_value(json.clone())?;
        Ok(Box::new(block))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_loop_block_creation() {
        let block = LoopBlock::new(5, BlockPosition::new(0.0, 0.0));
        assert_eq!(block.count, 5);
        assert!(block.children.is_empty());
    }

    #[test]
    fn test_loop_block_add_child() {
        let mut block = LoopBlock::new(3, BlockPosition::new(0.0, 0.0));
        let child_id = BlockId::new();
        block.add_child(child_id.clone());
        assert_eq!(block.children.len(), 1);
        assert_eq!(block.children[0], child_id);
    }

    #[test]
    fn test_loop_block_remove_child() {
        let mut block = LoopBlock::new(3, BlockPosition::new(0.0, 0.0));
        let child_id = BlockId::new();
        block.add_child(child_id.clone());
        block.remove_child(&child_id);
        assert!(block.children.is_empty());
    }

    #[test]
    fn test_loop_block_has_more_iterations() {
        let block = LoopBlock::new(3, BlockPosition::new(0.0, 0.0));
        assert!(block.has_more_iterations(0));
        assert!(block.has_more_iterations(1));
        assert!(block.has_more_iterations(2));
        assert!(!block.has_more_iterations(3));
    }

    #[test]
    fn test_loop_block_validation_valid() {
        let mut block = LoopBlock::new(3, BlockPosition::new(0.0, 0.0));
        block.add_child(BlockId::new());
        let errors = block.validate();
        assert!(errors.is_empty());
    }

    #[test]
    fn test_loop_block_validation_no_children() {
        let block = LoopBlock::new(3, BlockPosition::new(0.0, 0.0));
        let errors = block.validate();
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].field, "children");
    }

    #[test]
    fn test_infinite_loop_block_creation() {
        let block = InfiniteLoopBlock::new(BlockPosition::new(0.0, 0.0));
        assert!(block.children.is_empty());
    }

    #[test]
    fn test_infinite_loop_block_add_child() {
        let mut block = InfiniteLoopBlock::new(BlockPosition::new(0.0, 0.0));
        let child_id = BlockId::new();
        block.add_child(child_id.clone());
        assert_eq!(block.children.len(), 1);
    }

    #[test]
    fn test_infinite_loop_block_validation_valid() {
        let mut block = InfiniteLoopBlock::new(BlockPosition::new(0.0, 0.0));
        block.add_child(BlockId::new());
        let errors = block.validate();
        assert!(errors.is_empty());
    }

    #[test]
    fn test_conditional_block_creation() {
        let image_id = ImageId::new();
        let block = ConditionalBlock::new(
            image_id.clone(),
            ConditionOp::ImageExists,
            BlockPosition::new(0.0, 0.0),
        );
        assert_eq!(block.image_id, image_id);
        assert_eq!(block.condition, ConditionOp::ImageExists);
        assert!(block.true_branch.is_empty());
        assert!(block.false_branch.is_empty());
    }

    #[test]
    fn test_conditional_block_add_branches() {
        let mut block = ConditionalBlock::new(
            ImageId::new(),
            ConditionOp::ImageExists,
            BlockPosition::new(0.0, 0.0),
        );
        let true_child = BlockId::new();
        let false_child = BlockId::new();
        
        block.add_to_true_branch(true_child.clone());
        block.add_to_false_branch(false_child.clone());
        
        assert_eq!(block.true_branch.len(), 1);
        assert_eq!(block.false_branch.len(), 1);
        assert_eq!(block.all_children().len(), 2);
    }

    #[test]
    fn test_conditional_block_evaluate_condition() {
        let block = ConditionalBlock::new(
            ImageId::new(),
            ConditionOp::ImageExists,
            BlockPosition::new(0.0, 0.0),
        );
        
        // ImageExists: true when found
        assert!(block.evaluate_condition(true));
        assert!(!block.evaluate_condition(false));
        
        let block_not_exists = ConditionalBlock::new(
            ImageId::new(),
            ConditionOp::ImageNotExists,
            BlockPosition::new(0.0, 0.0),
        );
        
        // ImageNotExists: true when not found
        assert!(!block_not_exists.evaluate_condition(true));
        assert!(block_not_exists.evaluate_condition(false));
    }

    #[test]
    fn test_conditional_block_validation_valid() {
        let mut block = ConditionalBlock::new(
            ImageId::new(),
            ConditionOp::ImageExists,
            BlockPosition::new(0.0, 0.0),
        );
        block.add_to_true_branch(BlockId::new());
        let errors = block.validate();
        assert!(errors.is_empty());
    }

    #[test]
    fn test_conditional_block_validation_no_branches() {
        let block = ConditionalBlock::new(
            ImageId::new(),
            ConditionOp::ImageExists,
            BlockPosition::new(0.0, 0.0),
        );
        let errors = block.validate();
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].field, "branches");
    }

    #[test]
    fn test_loop_block_serialization() {
        let mut block = LoopBlock::new(5, BlockPosition::new(50.0, 100.0));
        block.add_child(BlockId::new());
        let json = block.to_json().unwrap();
        let deserialized = LoopBlock::from_json(&json).unwrap();
        assert_eq!(block.id, deserialized.id().clone());
    }

    #[test]
    fn test_conditional_block_serialization() {
        let mut block = ConditionalBlock::new(
            ImageId::new(),
            ConditionOp::ImageNotExists,
            BlockPosition::new(50.0, 100.0),
        );
        block.add_to_true_branch(BlockId::new());
        block.add_to_false_branch(BlockId::new());
        let json = block.to_json().unwrap();
        let deserialized = ConditionalBlock::from_json(&json).unwrap();
        assert_eq!(block.id, deserialized.id().clone());
    }

    #[tokio::test]
    async fn test_loop_block_execute() {
        let mut block = LoopBlock::new(3, BlockPosition::new(0.0, 0.0));
        block.add_child(BlockId::new());
        let result = block.execute().await.unwrap();
        assert_eq!(result, BlockResult::Continue);
    }

    #[tokio::test]
    async fn test_conditional_block_execute() {
        let mut block = ConditionalBlock::new(
            ImageId::new(),
            ConditionOp::ImageExists,
            BlockPosition::new(0.0, 0.0),
        );
        block.add_to_true_branch(BlockId::new());
        let result = block.execute().await.unwrap();
        assert_eq!(result, BlockResult::Continue);
    }
}
