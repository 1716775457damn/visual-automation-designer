//! Execution context
//!
//! This module provides the execution context that maintains state
//! during flow execution.
//!
//! Validates: Requirements 5.2

use std::collections::HashMap;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use crate::models::{BlockId, ImageId};
use super::events::ExecutionEvent;

/// Loop counter type
pub type LoopCounter = u32;

/// Execution log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionLogEntry {
    /// Event that occurred
    pub event: ExecutionEvent,
    /// Timestamp of the event
    pub timestamp: DateTime<Utc>,
}

impl ExecutionLogEntry {
    /// Create a new log entry
    pub fn new(event: ExecutionEvent) -> Self {
        Self {
            timestamp: Utc::now(),
            event,
        }
    }
}

/// Execution context that maintains state during flow execution
///
/// This struct tracks:
/// - Current block being executed
/// - Execution log for all events
/// - Loop counters for nested loops
/// - Image match results cache
#[derive(Debug, Clone)]
pub struct ExecutionContext {
    /// Currently executing block (if any)
    current_block: Option<BlockId>,
    /// Execution event log
    execution_log: Vec<ExecutionLogEntry>,
    /// Loop counters: block_id -> current iteration
    loop_counters: HashMap<BlockId, LoopCounter>,
    /// Image match result cache: image_id -> (x, y) center position
    image_match_cache: HashMap<ImageId, (u32, u32)>,
    /// Generic runtime variables for cross-block data passing
    variables: HashMap<String, String>,
    /// Total blocks executed
    blocks_executed: u64,
    /// Flow start time
    start_time: Option<DateTime<Utc>>,
}

impl Default for ExecutionContext {
    fn default() -> Self {
        Self::new()
    }
}

impl ExecutionContext {
    /// Create a new execution context
    pub fn new() -> Self {
        Self {
            current_block: None,
            execution_log: Vec::new(),
            loop_counters: HashMap::new(),
            image_match_cache: HashMap::new(),
            variables: HashMap::new(),
            blocks_executed: 0,
            start_time: None,
        }
    }

    /// Start execution (set start time)
    pub fn start(&mut self) {
        self.start_time = Some(Utc::now());
        self.blocks_executed = 0;
        self.execution_log.clear();
        self.loop_counters.clear();
        self.image_match_cache.clear();
        self.variables.clear();
    }

    /// Get the current block ID
    pub fn current_block(&self) -> Option<&BlockId> {
        self.current_block.as_ref()
    }

    /// Set the current block
    pub fn set_current_block(&mut self, block_id: Option<BlockId>) {
        self.current_block = block_id;
    }

    /// Log an execution event
    pub fn log_event(&mut self, event: ExecutionEvent) {
        self.execution_log.push(ExecutionLogEntry::new(event));
    }

    /// Get the execution log
    pub fn execution_log(&self) -> &[ExecutionLogEntry] {
        &self.execution_log
    }

    /// Get loop counter for a block
    pub fn get_loop_counter(&self, block_id: &BlockId) -> LoopCounter {
        self.loop_counters.get(block_id).copied().unwrap_or(0)
    }

    /// Increment loop counter for a block
    pub fn increment_loop_counter(&mut self, block_id: BlockId) -> LoopCounter {
        let counter = self.loop_counters.entry(block_id).or_insert(0);
        *counter += 1;
        *counter
    }

    /// Reset loop counter for a block
    pub fn reset_loop_counter(&mut self, block_id: &BlockId) {
        self.loop_counters.insert(block_id.clone(), 0);
    }

    /// Set loop counter for a block
    pub fn set_loop_counter(&mut self, block_id: BlockId, value: LoopCounter) {
        self.loop_counters.insert(block_id, value);
    }

    /// Cache an image match result
    pub fn cache_image_match(&mut self, image_id: ImageId, center: (u32, u32)) {
        self.image_match_cache.insert(image_id, center);
    }

    /// Get cached image match result
    pub fn get_cached_image_match(&self, image_id: &ImageId) -> Option<(u32, u32)> {
        self.image_match_cache.get(image_id).copied()
    }

    /// Set a runtime variable for cross-block data passing
    pub fn set_variable(&mut self, key: String, value: String) {
        self.variables.insert(key, value);
    }

    /// Get a runtime variable value
    pub fn get_variable(&self, key: &str) -> Option<&str> {
        self.variables.get(key).map(|s| s.as_str())
    }

    /// Clear all runtime variables
    pub fn clear_variables(&mut self) {
        self.variables.clear();
    }

    /// Clear image match cache
    pub fn clear_image_match_cache(&mut self) {
        self.image_match_cache.clear();
    }

    /// Increment blocks executed counter
    pub fn increment_blocks_executed(&mut self) {
        self.blocks_executed += 1;
    }

    /// Get total blocks executed
    pub fn blocks_executed(&self) -> u64 {
        self.blocks_executed
    }

    /// Get start time
    pub fn start_time(&self) -> Option<DateTime<Utc>> {
        self.start_time
    }

    /// Get elapsed time in milliseconds
    pub fn elapsed_ms(&self) -> Option<i64> {
        self.start_time.map(|start| {
            (Utc::now() - start).num_milliseconds()
        })
    }

    /// Reset the context for a new execution
    pub fn reset(&mut self) {
        self.current_block = None;
        self.execution_log.clear();
        self.loop_counters.clear();
        self.image_match_cache.clear();
        self.variables.clear();
        self.blocks_executed = 0;
        self.start_time = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execution_context_creation() {
        let ctx = ExecutionContext::new();
        assert!(ctx.current_block().is_none());
        assert!(ctx.execution_log().is_empty());
        assert_eq!(ctx.blocks_executed(), 0);
    }

    #[test]
    fn test_set_current_block() {
        let mut ctx = ExecutionContext::new();
        let block_id = BlockId::new();
        ctx.set_current_block(Some(block_id.clone()));
        assert_eq!(ctx.current_block(), Some(&block_id));
    }

    #[test]
    fn test_log_event() {
        let mut ctx = ExecutionContext::new();
        ctx.log_event(ExecutionEvent::started());
        assert_eq!(ctx.execution_log().len(), 1);
    }

    #[test]
    fn test_loop_counter() {
        let mut ctx = ExecutionContext::new();
        let block_id = BlockId::new();
        
        assert_eq!(ctx.get_loop_counter(&block_id), 0);
        
        let counter = ctx.increment_loop_counter(block_id.clone());
        assert_eq!(counter, 1);
        assert_eq!(ctx.get_loop_counter(&block_id), 1);
        
        ctx.reset_loop_counter(&block_id);
        assert_eq!(ctx.get_loop_counter(&block_id), 0);
    }

    #[test]
    fn test_image_match_cache() {
        let mut ctx = ExecutionContext::new();
        let image_id = ImageId::new();
        
        assert!(ctx.get_cached_image_match(&image_id).is_none());
        
        ctx.cache_image_match(image_id.clone(), (100, 200));
        assert_eq!(ctx.get_cached_image_match(&image_id), Some((100, 200)));
        
        ctx.clear_image_match_cache();
        assert!(ctx.get_cached_image_match(&image_id).is_none());
    }

    #[test]
    fn test_context_start_and_reset() {
        let mut ctx = ExecutionContext::new();
        
        ctx.start();
        assert!(ctx.start_time().is_some());
        
        ctx.log_event(ExecutionEvent::started());
        ctx.set_current_block(Some(BlockId::new()));
        ctx.increment_blocks_executed();
        
        assert_eq!(ctx.execution_log().len(), 1);
        assert_eq!(ctx.blocks_executed(), 1);
        
        ctx.reset();
        assert!(ctx.current_block().is_none());
        assert!(ctx.execution_log().is_empty());
        assert_eq!(ctx.blocks_executed(), 0);
    }
}
