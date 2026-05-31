//! Execution engine module
//!
//! This module provides the execution engine for running automation flows:
//! - Executor: Controls flow execution (start, stop, pause, resume, step)
//! - ExecutionContext: Maintains execution state
//! - ExecutionEvent: Events emitted during execution
//!
//! Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6

mod runner;
mod step_executor;
mod image_match;
mod input_sim;
mod context;
mod events;

pub use runner::{ExecutionController, Executor};
pub use context::ExecutionContext;
pub use events::{ExecutionEvent, ExecutionStatus};
