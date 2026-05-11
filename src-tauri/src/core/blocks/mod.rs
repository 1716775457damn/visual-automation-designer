//! Block system for the Visual Automation Designer
//!
//! This module defines the Block trait and implementations for all block types.
//! Blocks are the building units of automation flows.
//!
//! Validates: Requirements 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6

mod traits;
mod action;
mod control;

// Re-export block types
pub use traits::{Block, BlockResult, BlockError};
pub use action::{ClickBlock, WaitImageBlock, WaitTimeBlock, InputTextBlock};
pub use control::{LoopBlock, InfiniteLoopBlock, ConditionalBlock};
