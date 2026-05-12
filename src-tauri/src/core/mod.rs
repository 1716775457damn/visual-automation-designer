//! Core business logic modules
//! 
//! This module contains the core business logic for:
//! - Block system (Block trait and implementations)
//! - Flow management (FlowManager)
//! - Execution engine (Executor, ExecutionContext, ExecutionEvent)
//! - Image library management
//! - Undo/redo history

pub mod blocks;
pub mod flow;
pub mod execution;
pub mod image_library;
pub mod history;

// Re-export core types
pub use blocks::{Block, BlockResult, BlockError, ClickBlock, WaitImageBlock, WaitTimeBlock, InputTextBlock, LoopBlock, InfiniteLoopBlock, ConditionalBlock};
pub use flow::{FlowManager, FlowValidator, FlowSerializer};
pub use execution::{ExecutionController, Executor, ExecutionContext, ExecutionEvent, ExecutionStatus};
pub use image_library::ImageLibraryManager;
pub use history::{History, FlowOperation, OperationApplier, DefaultOperationApplier};
