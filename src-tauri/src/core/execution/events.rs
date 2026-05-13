//! Execution events and status
//!
//! This module defines the events emitted during flow execution
//! and the execution status.
//!
//! Validates: Requirements 5.2, 5.3, 5.4

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use crate::models::BlockId;

/// Execution status of a flow
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ExecutionStatus {
    /// Flow is idle, not running
    Idle,
    /// Flow is currently running
    Running,
    /// Flow is paused
    Paused,
    /// Flow completed successfully
    Completed,
    /// Flow stopped by user
    Stopped,
    /// Flow stopped due to error
    Error,
}

impl Default for ExecutionStatus {
    fn default() -> Self {
        ExecutionStatus::Idle
    }
}

impl ExecutionStatus {
    /// Check if execution is in progress
    pub fn is_active(&self) -> bool {
        matches!(self, ExecutionStatus::Running | ExecutionStatus::Paused)
    }
}

/// Events emitted during flow execution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ExecutionEvent {
    /// Flow execution started
    Started {
        timestamp: DateTime<Utc>,
    },
    /// A block started executing
    BlockStarted {
        block_id: BlockId,
        timestamp: DateTime<Utc>,
    },
    /// A block completed execution
    BlockCompleted {
        block_id: BlockId,
        success: bool,
        timestamp: DateTime<Utc>,
    },
    /// A block execution resulted in an error
    BlockError {
        block_id: BlockId,
        message: String,
        timestamp: DateTime<Utc>,
    },
    /// Flow execution completed successfully
    FlowCompleted {
        timestamp: DateTime<Utc>,
    },
    /// Flow execution failed after startup
    ExecutionFailed {
        message: String,
        block_id: Option<BlockId>,
        timestamp: DateTime<Utc>,
    },
    /// Flow execution stopped
    Stopped {
        reason: String,
        timestamp: DateTime<Utc>,
    },
    /// Flow execution paused
    Paused {
        block_id: BlockId,
        timestamp: DateTime<Utc>,
    },
    /// Flow execution resumed
    Resumed {
        block_id: BlockId,
        timestamp: DateTime<Utc>,
    },
}

impl ExecutionEvent {
    /// Create a Started event
    pub fn started() -> Self {
        ExecutionEvent::Started {
            timestamp: Utc::now(),
        }
    }

    /// Create a BlockStarted event
    pub fn block_started(block_id: BlockId) -> Self {
        ExecutionEvent::BlockStarted {
            block_id,
            timestamp: Utc::now(),
        }
    }

    /// Create a BlockCompleted event
    pub fn block_completed(block_id: BlockId, success: bool) -> Self {
        ExecutionEvent::BlockCompleted {
            block_id,
            success,
            timestamp: Utc::now(),
        }
    }

    /// Create a BlockError event
    pub fn block_error(block_id: BlockId, message: String) -> Self {
        ExecutionEvent::BlockError {
            block_id,
            message,
            timestamp: Utc::now(),
        }
    }

    /// Create a FlowCompleted event
    pub fn flow_completed() -> Self {
        ExecutionEvent::FlowCompleted {
            timestamp: Utc::now(),
        }
    }

    /// Create an ExecutionFailed event
    pub fn execution_failed(message: String, block_id: Option<BlockId>) -> Self {
        ExecutionEvent::ExecutionFailed {
            message,
            block_id,
            timestamp: Utc::now(),
        }
    }

    /// Create a Stopped event
    pub fn stopped(reason: String) -> Self {
        ExecutionEvent::Stopped {
            reason,
            timestamp: Utc::now(),
        }
    }

    /// Create a Paused event
    pub fn paused(block_id: BlockId) -> Self {
        ExecutionEvent::Paused {
            block_id,
            timestamp: Utc::now(),
        }
    }

    /// Create a Resumed event
    pub fn resumed(block_id: BlockId) -> Self {
        ExecutionEvent::Resumed {
            block_id,
            timestamp: Utc::now(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execution_status_default() {
        let status = ExecutionStatus::default();
        assert_eq!(status, ExecutionStatus::Idle);
    }

    #[test]
    fn test_execution_status_is_active() {
        assert!(!ExecutionStatus::Idle.is_active());
        assert!(ExecutionStatus::Running.is_active());
        assert!(ExecutionStatus::Paused.is_active());
        assert!(!ExecutionStatus::Completed.is_active());
        assert!(!ExecutionStatus::Stopped.is_active());
        assert!(!ExecutionStatus::Error.is_active());
    }

    #[test]
    fn test_execution_event_serialization() {
        let event = ExecutionEvent::started();
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("started"));
    }

    #[test]
    fn test_block_event_creation() {
        let block_id = BlockId::new();
        let event = ExecutionEvent::block_started(block_id.clone());
        match event {
            ExecutionEvent::BlockStarted { block_id: id, .. } => {
                assert_eq!(id, block_id);
            }
            _ => panic!("Expected BlockStarted event"),
        }
    }
}
