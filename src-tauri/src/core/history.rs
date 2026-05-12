//! Undo/Redo history management
//!
//! This module provides undo/redo functionality for flow operations.
//! It maintains operation stacks and supports operation reversal.
//!
//! Validates: Requirements 2.6

use std::collections::VecDeque;

use crate::error::{AppError, Result};
use crate::models::block::{BlockConfig, BlockId, BlockNode, BlockPosition};
use crate::models::flow::{Connection, Flow, FlowId};

/// Maximum number of undo steps to keep
const MAX_HISTORY_SIZE: usize = 100;

/// Operation that can be undone/redone
#[derive(Debug, Clone)]
pub enum FlowOperation {
    /// Create a block
    CreateBlock {
        flow_id: FlowId,
        block: BlockNode,
    },
    /// Delete a block
    DeleteBlock {
        flow_id: FlowId,
        block: BlockNode,
        /// Connections that were removed with this block
        removed_connections: Vec<Connection>,
    },
    /// Move a block to a new position
    MoveBlock {
        flow_id: FlowId,
        block_id: BlockId,
        old_position: BlockPosition,
        new_position: BlockPosition,
    },
    /// Update block configuration
    UpdateBlockConfig {
        flow_id: FlowId,
        block_id: BlockId,
        old_config: BlockConfig,
        new_config: BlockConfig,
    },
    /// Create a connection
    CreateConnection {
        flow_id: FlowId,
        connection: Connection,
    },
    /// Delete a connection
    DeleteConnection {
        flow_id: FlowId,
        connection: Connection,
    },
    /// Set entry block
    SetEntryBlock {
        flow_id: FlowId,
        old_entry: Option<BlockId>,
        new_entry: Option<BlockId>,
    },
    /// Batch operation (for grouping multiple operations)
    Batch {
        flow_id: FlowId,
        operations: Vec<FlowOperation>,
    },
}

impl FlowOperation {
    /// Get the flow ID this operation belongs to
    pub fn flow_id(&self) -> &FlowId {
        match self {
            FlowOperation::CreateBlock { flow_id, .. } => flow_id,
            FlowOperation::DeleteBlock { flow_id, .. } => flow_id,
            FlowOperation::MoveBlock { flow_id, .. } => flow_id,
            FlowOperation::UpdateBlockConfig { flow_id, .. } => flow_id,
            FlowOperation::CreateConnection { flow_id, .. } => flow_id,
            FlowOperation::DeleteConnection { flow_id, .. } => flow_id,
            FlowOperation::SetEntryBlock { flow_id, .. } => flow_id,
            FlowOperation::Batch { flow_id, .. } => flow_id,
        }
    }

    /// Create the inverse operation for undo
    pub fn inverse(&self) -> FlowOperation {
        match self {
            FlowOperation::CreateBlock { flow_id, block } => FlowOperation::DeleteBlock {
                flow_id: flow_id.clone(),
                block: block.clone(),
                removed_connections: vec![], // Will be populated when executing
            },
            FlowOperation::DeleteBlock { flow_id, block, removed_connections: _ } => {
                FlowOperation::CreateBlock {
                    flow_id: flow_id.clone(),
                    block: block.clone(),
                }
                // Note: connections need to be re-created separately
            }
            FlowOperation::MoveBlock { flow_id, block_id, old_position, new_position } => {
                FlowOperation::MoveBlock {
                    flow_id: flow_id.clone(),
                    block_id: block_id.clone(),
                    old_position: new_position.clone(),
                    new_position: old_position.clone(),
                }
            }
            FlowOperation::UpdateBlockConfig { flow_id, block_id, old_config, new_config } => {
                FlowOperation::UpdateBlockConfig {
                    flow_id: flow_id.clone(),
                    block_id: block_id.clone(),
                    old_config: new_config.clone(),
                    new_config: old_config.clone(),
                }
            }
            FlowOperation::CreateConnection { flow_id, connection } => {
                FlowOperation::DeleteConnection {
                    flow_id: flow_id.clone(),
                    connection: connection.clone(),
                }
            }
            FlowOperation::DeleteConnection { flow_id, connection } => {
                FlowOperation::CreateConnection {
                    flow_id: flow_id.clone(),
                    connection: connection.clone(),
                }
            }
            FlowOperation::SetEntryBlock { flow_id, old_entry, new_entry } => {
                FlowOperation::SetEntryBlock {
                    flow_id: flow_id.clone(),
                    old_entry: new_entry.clone(),
                    new_entry: old_entry.clone(),
                }
            }
            FlowOperation::Batch { flow_id, operations } => {
                // Inverse of batch is reversed operations, each inverted
                let inverse_ops: Vec<FlowOperation> = operations
                    .iter()
                    .rev()
                    .map(|op| op.inverse())
                    .collect();
                FlowOperation::Batch {
                    flow_id: flow_id.clone(),
                    operations: inverse_ops,
                }
            }
        }
    }
}

/// History manager for undo/redo operations
pub struct History {
    /// Stack of operations that can be undone
    undo_stack: VecDeque<FlowOperation>,
    /// Stack of operations that can be redone
    redo_stack: VecDeque<FlowOperation>,
    /// Maximum history size
    max_size: usize,
}

impl Default for History {
    fn default() -> Self {
        Self::new()
    }
}

impl History {
    /// Create a new history manager
    pub fn new() -> Self {
        Self {
            undo_stack: VecDeque::with_capacity(MAX_HISTORY_SIZE),
            redo_stack: VecDeque::with_capacity(MAX_HISTORY_SIZE),
            max_size: MAX_HISTORY_SIZE,
        }
    }

    /// Create a history manager with custom max size
    pub fn with_max_size(max_size: usize) -> Self {
        Self {
            undo_stack: VecDeque::with_capacity(max_size),
            redo_stack: VecDeque::with_capacity(max_size),
            max_size,
        }
    }

    /// Push an operation onto the undo stack
    /// Clears the redo stack (new operations invalidate redo history)
    pub fn push(&mut self, operation: FlowOperation) {
        // Clear redo stack when new operation is pushed
        self.redo_stack.clear();

        // Check if we need to pop oldest operation
        if self.undo_stack.len() >= self.max_size {
            self.undo_stack.pop_front();
        }

        self.undo_stack.push_back(operation);
    }

    /// Push multiple operations as a batch
    pub fn push_batch(&mut self, flow_id: FlowId, operations: Vec<FlowOperation>) {
        if operations.is_empty() {
            return;
        }
        if operations.len() == 1 {
            self.push(operations.into_iter().next().unwrap());
        } else {
            self.push(FlowOperation::Batch {
                flow_id,
                operations,
            });
        }
    }

    /// Pop an operation from the undo stack
    /// Returns the operation to apply for undo (the inverse)
    pub fn pop_undo(&mut self) -> Option<FlowOperation> {
        if let Some(operation) = self.undo_stack.pop_back() {
            let inverse = operation.inverse();
            self.redo_stack.push_back(operation);
            Some(inverse)
        } else {
            None
        }
    }

    /// Pop an operation from the redo stack
    /// Returns the original operation to re-apply for redo
    pub fn pop_redo(&mut self) -> Option<FlowOperation> {
        if let Some(operation) = self.redo_stack.pop_back() {
            self.undo_stack.push_back(operation.clone());
            Some(operation)
        } else {
            None
        }
    }

    /// Check if undo is available
    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    /// Check if redo is available
    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }

    /// Get the number of undo steps available
    pub fn undo_count(&self) -> usize {
        self.undo_stack.len()
    }

    /// Get the number of redo steps available
    pub fn redo_count(&self) -> usize {
        self.redo_stack.len()
    }

    /// Clear all history
    pub fn clear(&mut self) {
        self.undo_stack.clear();
        self.redo_stack.clear();
    }

    /// Clear history for a specific flow
    pub fn clear_for_flow(&mut self, flow_id: &FlowId) {
        self.undo_stack.retain(|op| op.flow_id() != flow_id);
        self.redo_stack.retain(|op| op.flow_id() != flow_id);
    }

    /// Peek at the next undo operation without removing it
    pub fn peek_undo(&self) -> Option<&FlowOperation> {
        self.undo_stack.back()
    }

    /// Peek at the next redo operation without removing it
    pub fn peek_redo(&self) -> Option<&FlowOperation> {
        self.redo_stack.back()
    }
}

/// Trait for applying operations to a flow
pub trait OperationApplier {
    /// Apply an operation to a flow
    fn apply_operation(&mut self, flow: &mut Flow, operation: &FlowOperation) -> Result<()>;
}

/// Default operation applier
pub struct DefaultOperationApplier;

impl OperationApplier for DefaultOperationApplier {
    fn apply_operation(&mut self, flow: &mut Flow, operation: &FlowOperation) -> Result<()> {
        match operation {
            FlowOperation::CreateBlock { block, .. } => {
                flow.add_block(block.clone());
                Ok(())
            }
            FlowOperation::DeleteBlock { block, .. } => {
                flow.remove_block(&block.id);
                Ok(())
            }
            FlowOperation::MoveBlock { block_id, new_position, .. } => {
                if let Some(block) = flow.get_block_mut(block_id) {
                    block.position = new_position.clone();
                    Ok(())
                } else {
                    Err(AppError::BlockNotFound(block_id.to_string()))
                }
            }
            FlowOperation::UpdateBlockConfig { block_id, new_config, .. } => {
                if let Some(block) = flow.get_block_mut(block_id) {
                    block.config = new_config.clone();
                    Ok(())
                } else {
                    Err(AppError::BlockNotFound(block_id.to_string()))
                }
            }
            FlowOperation::CreateConnection { connection, .. } => {
                flow.add_connection(connection.clone());
                Ok(())
            }
            FlowOperation::DeleteConnection { connection, .. } => {
                flow.remove_connection(&connection.id);
                Ok(())
            }
            FlowOperation::SetEntryBlock { new_entry, .. } => {
                flow.set_entry_block(new_entry.clone());
                Ok(())
            }
            FlowOperation::Batch { operations, .. } => {
                for op in operations {
                    self.apply_operation(flow, op)?;
                }
                Ok(())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::block::{ActionType, BlockConfig, BlockPosition, BlockType, ClickMode};
    use crate::models::flow::Connection;

    fn create_test_block() -> BlockNode {
        BlockNode::new(
            BlockType::Action {
                action: ActionType::Click,
            },
            BlockPosition::new(100.0, 200.0),
            BlockConfig::Click {
                mode: ClickMode::Coordinates { x: 10, y: 20 },
                count: 1,
            },
        )
    }

    fn create_test_flow_id() -> FlowId {
        FlowId::new()
    }

    #[test]
    fn test_history_new() {
        let history = History::new();
        assert!(!history.can_undo());
        assert!(!history.can_redo());
        assert_eq!(history.undo_count(), 0);
        assert_eq!(history.redo_count(), 0);
    }

    #[test]
    fn test_push_operation() {
        let mut history = History::new();
        let flow_id = create_test_flow_id();
        let block = create_test_block();

        history.push(FlowOperation::CreateBlock {
            flow_id,
            block,
        });

        assert!(history.can_undo());
        assert!(!history.can_redo());
        assert_eq!(history.undo_count(), 1);
    }

    #[test]
    fn test_undo_redo() {
        let mut history = History::new();
        let flow_id = create_test_flow_id();
        let block = create_test_block();

        // Push operation
        history.push(FlowOperation::CreateBlock {
            flow_id: flow_id.clone(),
            block,
        });

        assert!(history.can_undo());
        assert!(!history.can_redo());

        // Undo
        let undo_op = history.pop_undo();
        assert!(undo_op.is_some());
        assert!(!history.can_undo());
        assert!(history.can_redo());

        // Redo
        let redo_op = history.pop_redo();
        assert!(redo_op.is_some());
        assert!(history.can_undo());
        assert!(!history.can_redo());
    }

    #[test]
    fn test_push_clears_redo_stack() {
        let mut history = History::new();
        let flow_id = create_test_flow_id();
        let block1 = create_test_block();
        let block2 = create_test_block();

        // Push and undo
        history.push(FlowOperation::CreateBlock {
            flow_id: flow_id.clone(),
            block: block1,
        });
        history.pop_undo();

        assert!(history.can_redo());

        // Push new operation - should clear redo stack
        history.push(FlowOperation::CreateBlock {
            flow_id,
            block: block2,
        });

        assert!(!history.can_redo());
        assert_eq!(history.redo_count(), 0);
    }

    #[test]
    fn test_operation_inverse() {
        let flow_id = create_test_flow_id();
        let block = create_test_block();

        let create_op = FlowOperation::CreateBlock {
            flow_id: flow_id.clone(),
            block: block.clone(),
        };

        let delete_op = create_op.inverse();

        match delete_op {
            FlowOperation::DeleteBlock { flow_id: fid, .. } => {
                assert_eq!(fid, flow_id);
            }
            _ => panic!("Expected DeleteBlock operation"),
        }
    }

    #[test]
    fn test_move_operation_inverse() {
        let flow_id = create_test_flow_id();
        let block_id = BlockId::new();

        let move_op = FlowOperation::MoveBlock {
            flow_id: flow_id.clone(),
            block_id: block_id.clone(),
            old_position: BlockPosition::new(0.0, 0.0),
            new_position: BlockPosition::new(100.0, 100.0),
        };

        let inverse = move_op.inverse();

        match inverse {
            FlowOperation::MoveBlock {
                flow_id: fid,
                block_id: bid,
                old_position,
                new_position,
            } => {
                assert_eq!(fid, flow_id);
                assert_eq!(bid, block_id);
                assert_eq!(old_position, BlockPosition::new(100.0, 100.0));
                assert_eq!(new_position, BlockPosition::new(0.0, 0.0));
            }
            _ => panic!("Expected MoveBlock operation"),
        }
    }

    #[test]
    fn test_batch_operation_inverse() {
        let flow_id = create_test_flow_id();
        let block1 = create_test_block();
        let block2 = create_test_block();

        let batch = FlowOperation::Batch {
            flow_id: flow_id.clone(),
            operations: vec![
                FlowOperation::CreateBlock {
                    flow_id: flow_id.clone(),
                    block: block1,
                },
                FlowOperation::CreateBlock {
                    flow_id: flow_id.clone(),
                    block: block2,
                },
            ],
        };

        let inverse = batch.inverse();

        match inverse {
            FlowOperation::Batch { flow_id: fid, operations } => {
                assert_eq!(fid, flow_id);
                assert_eq!(operations.len(), 2);
                // Operations should be reversed and inverted
                match &operations[0] {
                    FlowOperation::DeleteBlock { .. } => {}
                    _ => panic!("Expected DeleteBlock as first inverse operation"),
                }
            }
            _ => panic!("Expected Batch operation"),
        }
    }

    #[test]
    fn test_max_history_size() {
        let mut history = History::with_max_size(5);

        for _ in 0..10 {
            history.push(FlowOperation::CreateBlock {
                flow_id: create_test_flow_id(),
                block: create_test_block(),
            });
        }

        assert_eq!(history.undo_count(), 5);
    }

    #[test]
    fn test_clear_history() {
        let mut history = History::new();
        let flow_id = create_test_flow_id();

        history.push(FlowOperation::CreateBlock {
            flow_id,
            block: create_test_block(),
        });
        history.pop_undo();

        assert!(history.can_redo());

        history.clear();

        assert!(!history.can_undo());
        assert!(!history.can_redo());
    }

    #[test]
    fn test_clear_for_flow() {
        let mut history = History::new();
        let flow_id1 = create_test_flow_id();
        let flow_id2 = create_test_flow_id();

        history.push(FlowOperation::CreateBlock {
            flow_id: flow_id1.clone(),
            block: create_test_block(),
        });
        history.push(FlowOperation::CreateBlock {
            flow_id: flow_id2.clone(),
            block: create_test_block(),
        });

        assert_eq!(history.undo_count(), 2);

        history.clear_for_flow(&flow_id1);

        assert_eq!(history.undo_count(), 1);
    }

    #[test]
    fn test_apply_operation_create_block() {
        let mut applier = DefaultOperationApplier;
        let mut flow = Flow::new("Test".to_string());
        let block = create_test_block();
        let block_id = block.id.clone();

        let operation = FlowOperation::CreateBlock {
            flow_id: flow.id.clone(),
            block,
        };

        applier.apply_operation(&mut flow, &operation).unwrap();

        assert!(flow.get_block(&block_id).is_some());
    }

    #[test]
    fn test_apply_operation_delete_block() {
        let mut applier = DefaultOperationApplier;
        let mut flow = Flow::new("Test".to_string());
        let block = create_test_block();
        let block_id = block.id.clone();
        flow.add_block(block.clone());

        let operation = FlowOperation::DeleteBlock {
            flow_id: flow.id.clone(),
            block,
            removed_connections: vec![],
        };

        applier.apply_operation(&mut flow, &operation).unwrap();

        assert!(flow.get_block(&block_id).is_none());
    }

    #[test]
    fn test_apply_operation_move_block() {
        let mut applier = DefaultOperationApplier;
        let mut flow = Flow::new("Test".to_string());
        let block = create_test_block();
        let block_id = block.id.clone();
        flow.add_block(block);

        let operation = FlowOperation::MoveBlock {
            flow_id: flow.id.clone(),
            block_id: block_id.clone(),
            old_position: BlockPosition::new(100.0, 200.0),
            new_position: BlockPosition::new(300.0, 400.0),
        };

        applier.apply_operation(&mut flow, &operation).unwrap();

        let moved_block = flow.get_block(&block_id).unwrap();
        assert_eq!(moved_block.position.x, 300.0);
        assert_eq!(moved_block.position.y, 400.0);
    }

    #[test]
    fn test_apply_operation_create_connection() {
        let mut applier = DefaultOperationApplier;
        let mut flow = Flow::new("Test".to_string());
        let block1 = create_test_block();
        let block2 = create_test_block();
        let id1 = block1.id.clone();
        let id2 = block2.id.clone();
        flow.add_block(block1);
        flow.add_block(block2);

        let connection = Connection::new(id1, id2);
        let conn_id = connection.id.clone();

        let operation = FlowOperation::CreateConnection {
            flow_id: flow.id.clone(),
            connection,
        };

        applier.apply_operation(&mut flow, &operation).unwrap();

        assert!(flow.connections.iter().any(|c| c.id == conn_id));
    }
}
