//! Flow data models for the Visual Automation Designer
//!
//! This module defines the core data structures for flows (流程),
//! which represent complete automation workflows composed of blocks.
//!
//! Validates: Requirements 2.7, 7.1

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

use super::block::{BlockId, BlockNode};

/// Unique identifier for a flow
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct FlowId(pub Uuid);

impl FlowId {
    /// Create a new unique flow ID
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for FlowId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for FlowId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Unique identifier for a connection
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ConnectionId(pub Uuid);

impl ConnectionId {
    /// Create a new unique connection ID
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for ConnectionId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for ConnectionId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Connection between two blocks in a flow
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    /// Unique connection identifier
    pub id: ConnectionId,
    /// Source block ID
    pub source: BlockId,
    /// Target block ID
    pub target: BlockId,
    /// Source handle identifier (for conditional branches)
    /// - None: default output
    /// - Some("true"): true branch output
    /// - Some("false"): false branch output
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_handle: Option<String>,
}

impl Connection {
    /// Create a new connection
    pub fn new(source: BlockId, target: BlockId) -> Self {
        Self {
            id: ConnectionId::new(),
            source,
            target,
            source_handle: None,
        }
    }

    /// Create a connection with a specific handle
    pub fn with_handle(source: BlockId, target: BlockId, source_handle: String) -> Self {
        Self {
            id: ConnectionId::new(),
            source,
            target,
            source_handle: Some(source_handle),
        }
    }
}

/// Complete flow definition
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Flow {
    /// Unique flow identifier
    pub id: FlowId,
    /// Flow name
    pub name: String,
    /// Optional description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Map of block ID to block node
    pub blocks: HashMap<BlockId, BlockNode>,
    /// List of connections between blocks
    pub connections: Vec<Connection>,
    /// Entry point block ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entry_block: Option<BlockId>,
    /// Creation timestamp
    pub created_at: DateTime<Utc>,
    /// Last update timestamp
    pub updated_at: DateTime<Utc>,
}

impl Flow {
    /// Create a new flow with the given name
    pub fn new(name: String) -> Self {
        let now = Utc::now();
        Self {
            id: FlowId::new(),
            name,
            description: None,
            blocks: HashMap::new(),
            connections: Vec::new(),
            entry_block: None,
            created_at: now,
            updated_at: now,
        }
    }

    /// Create a new flow with a specific ID (for deserialization)
    pub fn with_id(id: FlowId, name: String) -> Self {
        let now = Utc::now();
        Self {
            id,
            name,
            description: None,
            blocks: HashMap::new(),
            connections: Vec::new(),
            entry_block: None,
            created_at: now,
            updated_at: now,
        }
    }

    /// Update the timestamp to now
    pub fn touch(&mut self) {
        self.updated_at = Utc::now();
    }

    /// Add a block to the flow
    pub fn add_block(&mut self, block: BlockNode) -> &BlockNode {
        let block_id = block.id.clone();
        self.blocks.insert(block_id.clone(), block);
        self.touch();
        self.blocks.get(&block_id).unwrap()
    }

    /// Remove a block from the flow
    pub fn remove_block(&mut self, block_id: &BlockId) -> Option<BlockNode> {
        let removed = self.blocks.remove(block_id);
        if removed.is_some() {
            // Remove connections involving this block
            self.connections.retain(|c| c.source != *block_id && c.target != *block_id);
            // Clear entry block if it was this block
            if self.entry_block.as_ref() == Some(block_id) {
                self.entry_block = None;
            }
            self.touch();
        }
        removed
    }

    /// Get a block by ID
    pub fn get_block(&self, block_id: &BlockId) -> Option<&BlockNode> {
        self.blocks.get(block_id)
    }

    /// Get a mutable block by ID
    pub fn get_block_mut(&mut self, block_id: &BlockId) -> Option<&mut BlockNode> {
        self.touch();
        self.blocks.get_mut(block_id)
    }

    /// Add a connection to the flow
    pub fn add_connection(&mut self, connection: Connection) {
        self.connections.push(connection);
        self.touch();
    }

    /// Remove a connection by ID
    pub fn remove_connection(&mut self, connection_id: &ConnectionId) -> Option<Connection> {
        if let Some(pos) = self.connections.iter().position(|c| c.id == *connection_id) {
            let removed = self.connections.remove(pos);
            self.touch();
            Some(removed)
        } else {
            None
        }
    }

    /// Set the entry block
    pub fn set_entry_block(&mut self, block_id: Option<BlockId>) {
        self.entry_block = block_id;
        self.touch();
    }

    /// Get the number of blocks
    pub fn block_count(&self) -> usize {
        self.blocks.len()
    }
}

/// Flow metadata for list display (lighter weight than full Flow)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowMetadata {
    /// Flow ID
    pub id: FlowId,
    /// Flow name
    pub name: String,
    /// Optional description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Number of blocks in the flow
    pub block_count: usize,
    /// Creation timestamp
    pub created_at: DateTime<Utc>,
    /// Last update timestamp
    pub updated_at: DateTime<Utc>,
}

impl From<&Flow> for FlowMetadata {
    fn from(flow: &Flow) -> Self {
        Self {
            id: flow.id.clone(),
            name: flow.name.clone(),
            description: flow.description.clone(),
            block_count: flow.block_count(),
            created_at: flow.created_at,
            updated_at: flow.updated_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::block::{ActionType, BlockConfig, BlockPosition, BlockType};

    #[test]
    fn test_flow_id_uniqueness() {
        let id1 = FlowId::new();
        let id2 = FlowId::new();
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_flow_creation() {
        let flow = Flow::new("Test Flow".to_string());
        assert_eq!(flow.name, "Test Flow");
        assert!(flow.blocks.is_empty());
        assert!(flow.connections.is_empty());
        assert!(flow.entry_block.is_none());
    }

    #[test]
    fn test_flow_add_block() {
        let mut flow = Flow::new("Test".to_string());
        let block = BlockNode::new(
            BlockType::Action {
                action: ActionType::Click,
            },
            BlockPosition::new(100.0, 200.0),
            BlockConfig::Click {
                mode: crate::models::block::ClickMode::Coordinates { x: 10, y: 20 },
                count: 1,
            },
        );
        let block_id = block.id.clone();
        flow.add_block(block);
        assert_eq!(flow.block_count(), 1);
        assert!(flow.get_block(&block_id).is_some());
    }

    #[test]
    fn test_flow_remove_block_removes_connections() {
        let mut flow = Flow::new("Test".to_string());
        let block1 = BlockNode::new(
            BlockType::Action {
                action: ActionType::Click,
            },
            BlockPosition::new(0.0, 0.0),
            BlockConfig::Click {
                mode: crate::models::block::ClickMode::Coordinates { x: 0, y: 0 },
                count: 1,
            },
        );
        let block2 = BlockNode::new(
            BlockType::Action {
                action: ActionType::WaitTime,
            },
            BlockPosition::new(100.0, 0.0),
            BlockConfig::WaitTime { duration_ms: 1000 },
        );
        let id1 = block1.id.clone();
        let id2 = block2.id.clone();
        flow.add_block(block1);
        flow.add_block(block2);
        flow.add_connection(Connection::new(id1.clone(), id2));
        assert_eq!(flow.connections.len(), 1);
        flow.remove_block(&id1);
        assert_eq!(flow.connections.len(), 0);
    }

    #[test]
    fn test_flow_metadata_from_flow() {
        let flow = Flow::new("Test".to_string());
        let metadata = FlowMetadata::from(&flow);
        assert_eq!(metadata.name, "Test");
        assert_eq!(metadata.block_count, 0);
    }
}
