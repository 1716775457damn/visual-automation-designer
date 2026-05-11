//! Tauri commands for flow management
//!
//! This module provides Tauri command handlers for flow operations:
//! - Flow CRUD operations (create, save, load, delete, list)
//! - Block operations (create, update position, delete)
//! - Connection operations (create, delete)
//!
//! Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.7, 7.1, 7.2

use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

use crate::core::flow::{FlowManager, FlowValidator};
use crate::core::flow::validator::ValidationSeverity;
use crate::error::{AppError, Result};
use crate::models::block::{BlockConfig, BlockId, BlockNode, BlockPosition, BlockType};
use crate::models::flow::{Connection, ConnectionId, Flow, FlowId, FlowMetadata};

/// Application state containing the flow manager
pub struct FlowState {
    pub manager: Mutex<FlowManager>,
    pub validator: Mutex<FlowValidator>,
}

impl FlowState {
    /// Create a new flow state from the app handle
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| AppError::InternalError(format!("Failed to get app data dir: {}", e)))?;

        let manager = FlowManager::new(&app_data_dir)?;
        let validator = FlowValidator::new();

        Ok(Self {
            manager: Mutex::new(manager),
            validator: Mutex::new(validator),
        })
    }
}

// ============================================================================
// Flow Management Commands
// ============================================================================

/// Create a new flow with the given name.
///
/// # Arguments
/// * `name` - Name for the new flow
///
/// # Returns
/// The created flow
///
/// Validates: Requirements 2.7, 7.1
#[tauri::command]
pub fn create_flow(state: State<'_, FlowState>, name: String) -> Result<Flow> {
    let mut manager = state.manager.lock().map_err(|e| {
        AppError::InternalError(format!("Failed to lock flow manager: {}", e))
    })?;

    manager.create_flow(name)
}

/// Save a flow to disk.
///
/// # Arguments
/// * `flow` - The flow to save (full flow object)
///
/// # Returns
/// true if saved successfully
///
/// Validates: Requirements 7.1, 7.2
#[tauri::command]
pub fn save_flow(state: State<'_, FlowState>, flow: Flow) -> Result<bool> {
    let mut manager = state.manager.lock().map_err(|e| {
        AppError::InternalError(format!("Failed to lock flow manager: {}", e))
    })?;

    manager.save_flow(&flow)?;
    Ok(true)
}

/// Load a flow by ID.
///
/// # Arguments
/// * `id` - The flow ID (as string)
///
/// # Returns
/// The loaded flow
///
/// Validates: Requirements 7.2
#[tauri::command]
pub fn load_flow(state: State<'_, FlowState>, id: String) -> Result<Flow> {
    let flow_id = parse_flow_id(&id)?;

    let mut manager = state.manager.lock().map_err(|e| {
        AppError::InternalError(format!("Failed to lock flow manager: {}", e))
    })?;

    manager.load_flow(&flow_id)
}

/// List all flows (metadata only).
///
/// # Returns
/// A list of flow metadata
///
/// Validates: Requirements 7.1
#[tauri::command]
pub fn list_flows(state: State<'_, FlowState>) -> Result<Vec<FlowMetadata>> {
    let mut manager = state.manager.lock().map_err(|e| {
        AppError::InternalError(format!("Failed to lock flow manager: {}", e))
    })?;

    manager.list_flows()
}

/// Delete a flow by ID.
///
/// # Arguments
/// * `id` - The flow ID (as string)
///
/// # Returns
/// true if deleted successfully
///
/// Validates: Requirements 7.1
#[tauri::command]
pub fn delete_flow(state: State<'_, FlowState>, id: String) -> Result<bool> {
    let flow_id = parse_flow_id(&id)?;

    let mut manager = state.manager.lock().map_err(|e| {
        AppError::InternalError(format!("Failed to lock flow manager: {}", e))
    })?;

    manager.delete_flow(&flow_id)?;
    Ok(true)
}

/// Validate a flow and return any errors or warnings.
///
/// # Arguments
/// * `flow` - The flow to validate
///
/// # Returns
/// A ValidationResponse containing errors and warnings
#[tauri::command]
pub fn validate_flow(
    state: State<'_, FlowState>,
    flow: Flow,
) -> Result<ValidationResponse> {
    let validator = state.validator.lock().map_err(|e| {
        AppError::InternalError(format!("Failed to lock flow validator: {}", e))
    })?;

    let errors = validator.validate(&flow);

    Ok(ValidationResponse {
        is_valid: validator.is_valid(&flow),
        errors: errors
            .iter()
            .filter(|e| e.severity == ValidationSeverity::Error)
            .map(|e| ValidationErrorResponse {
                code: e.code.clone(),
                message: e.message.clone(),
                block_id: e.block_id.as_ref().map(|id| id.to_string()),
                connection_id: e.connection_id.clone(),
            })
            .collect(),
        warnings: errors
            .iter()
            .filter(|e| e.severity == ValidationSeverity::Warning)
            .map(|e| ValidationWarningResponse {
                code: e.code.clone(),
                message: e.message.clone(),
                block_id: e.block_id.as_ref().map(|id| id.to_string()),
                connection_id: e.connection_id.clone(),
            })
            .collect(),
    })
}

// ============================================================================
// Block Operations Commands
// ============================================================================

/// Create a new block in a flow.
///
/// # Arguments
/// * `flow_id` - The flow ID (as string)
/// * `block_type` - The block type
/// * `config` - The block configuration
/// * `position` - The canvas position
///
/// # Returns
/// The created block node
///
/// Validates: Requirements 2.2
#[tauri::command]
pub fn create_block(
    state: State<'_, FlowState>,
    flow_id: String,
    block_type: BlockType,
    config: BlockConfig,
    position: BlockPosition,
) -> Result<BlockNode> {
    let fid = parse_flow_id(&flow_id)?;

    let mut manager = state.manager.lock().map_err(|e| {
        AppError::InternalError(format!("Failed to lock flow manager: {}", e))
    })?;

    // Load the flow
    let mut flow = manager.load_flow(&fid)?;

    // Create and add the block
    let block = BlockNode::new(block_type, position, config);
    let block_id = block.id.clone();
    flow.add_block(block);

    // Save the updated flow
    manager.save_flow(&flow)?;

    // Return the block from the flow
    Ok(flow.get_block(&block_id).unwrap().clone())
}

/// Update a block's position in a flow.
///
/// # Arguments
/// * `flow_id` - The flow ID (as string)
/// * `block_id` - The block ID (as string)
/// * `position` - The new position
///
/// # Returns
/// true if updated successfully
///
/// Validates: Requirements 2.3
#[tauri::command]
pub fn update_block_position(
    state: State<'_, FlowState>,
    flow_id: String,
    block_id: String,
    position: BlockPosition,
) -> Result<bool> {
    let fid = parse_flow_id(&flow_id)?;
    let bid = parse_block_id(&block_id)?;

    let mut manager = state.manager.lock().map_err(|e| {
        AppError::InternalError(format!("Failed to lock flow manager: {}", e))
    })?;

    // Load the flow
    let mut flow = manager.load_flow(&fid)?;

    // Update the block position
    if let Some(block) = flow.get_block_mut(&bid) {
        block.position = position;
    } else {
        return Err(AppError::BlockNotFound(block_id));
    }

    // Save the updated flow
    manager.save_flow(&flow)?;

    Ok(true)
}

/// Delete a block from a flow.
///
/// # Arguments
/// * `flow_id` - The flow ID (as string)
/// * `block_id` - The block ID (as string)
///
/// # Returns
/// true if deleted successfully
///
/// Validates: Requirements 2.2, 2.4, 2.5
#[tauri::command]
pub fn delete_block(
    state: State<'_, FlowState>,
    flow_id: String,
    block_id: String,
) -> Result<bool> {
    let fid = parse_flow_id(&flow_id)?;
    let bid = parse_block_id(&block_id)?;

    let mut manager = state.manager.lock().map_err(|e| {
        AppError::InternalError(format!("Failed to lock flow manager: {}", e))
    })?;

    // Load the flow
    let mut flow = manager.load_flow(&fid)?;

    // Remove the block (also removes related connections)
    if flow.remove_block(&bid).is_none() {
        return Err(AppError::BlockNotFound(block_id));
    }

    // Save the updated flow
    manager.save_flow(&flow)?;

    Ok(true)
}

/// Update a block's configuration.
///
/// # Arguments
/// * `flow_id` - The flow ID (as string)
/// * `block_id` - The block ID (as string)
/// * `config` - The new configuration
///
/// # Returns
/// true if updated successfully
#[tauri::command]
pub fn update_block_config(
    state: State<'_, FlowState>,
    flow_id: String,
    block_id: String,
    config: BlockConfig,
) -> Result<bool> {
    let fid = parse_flow_id(&flow_id)?;
    let bid = parse_block_id(&block_id)?;

    let mut manager = state.manager.lock().map_err(|e| {
        AppError::InternalError(format!("Failed to lock flow manager: {}", e))
    })?;

    // Load the flow
    let mut flow = manager.load_flow(&fid)?;

    // Update the block config
    if let Some(block) = flow.get_block_mut(&bid) {
        block.config = config;
    } else {
        return Err(AppError::BlockNotFound(block_id));
    }

    // Save the updated flow
    manager.save_flow(&flow)?;

    Ok(true)
}

/// Set the entry block for a flow.
///
/// # Arguments
/// * `flow_id` - The flow ID (as string)
/// * `block_id` - The block ID to set as entry (as string, or None to clear)
///
/// # Returns
/// true if updated successfully
#[tauri::command]
pub fn set_entry_block(
    state: State<'_, FlowState>,
    flow_id: String,
    block_id: Option<String>,
) -> Result<bool> {
    let fid = parse_flow_id(&flow_id)?;
    let bid = block_id
        .map(|id| parse_block_id(&id))
        .transpose()?;

    let mut manager = state.manager.lock().map_err(|e| {
        AppError::InternalError(format!("Failed to lock flow manager: {}", e))
    })?;

    // Load the flow
    let mut flow = manager.load_flow(&fid)?;

    // Set the entry block
    flow.set_entry_block(bid);

    // Save the updated flow
    manager.save_flow(&flow)?;

    Ok(true)
}

// ============================================================================
// Connection Operations Commands
// ============================================================================

/// Create a connection between two blocks.
///
/// # Arguments
/// * `flow_id` - The flow ID (as string)
/// * `source` - Source block ID (as string)
/// * `target` - Target block ID (as string)
/// * `source_handle` - Optional source handle (for conditional branches)
///
/// # Returns
/// The created connection
///
/// Validates: Requirements 2.4
#[tauri::command]
pub fn create_connection(
    state: State<'_, FlowState>,
    flow_id: String,
    source: String,
    target: String,
    source_handle: Option<String>,
) -> Result<Connection> {
    let fid = parse_flow_id(&flow_id)?;
    let source_id = parse_block_id(&source)?;
    let target_id = parse_block_id(&target)?;

    let mut manager = state.manager.lock().map_err(|e| {
        AppError::InternalError(format!("Failed to lock flow manager: {}", e))
    })?;

    // Load the flow
    let mut flow = manager.load_flow(&fid)?;

    // Verify blocks exist
    if !flow.blocks.contains_key(&source_id) {
        return Err(AppError::BlockNotFound(source));
    }
    if !flow.blocks.contains_key(&target_id) {
        return Err(AppError::BlockNotFound(target));
    }

    // Create the connection
    let connection = match source_handle {
        Some(handle) => Connection::with_handle(source_id, target_id, handle),
        None => Connection::new(source_id, target_id),
    };
    let connection_id = connection.id.clone();

    flow.add_connection(connection);

    // Save the updated flow
    manager.save_flow(&flow)?;

    // Return the connection
    Ok(flow
        .connections
        .iter()
        .find(|c| c.id == connection_id)
        .unwrap()
        .clone())
}

/// Delete a connection from a flow.
///
/// # Arguments
/// * `flow_id` - The flow ID (as string)
/// * `connection_id` - The connection ID (as string)
///
/// # Returns
/// true if deleted successfully
///
/// Validates: Requirements 2.5
#[tauri::command]
pub fn delete_connection(
    state: State<'_, FlowState>,
    flow_id: String,
    connection_id: String,
) -> Result<bool> {
    let fid = parse_flow_id(&flow_id)?;
    let cid = parse_connection_id(&connection_id)?;

    let mut manager = state.manager.lock().map_err(|e| {
        AppError::InternalError(format!("Failed to lock flow manager: {}", e))
    })?;

    // Load the flow
    let mut flow = manager.load_flow(&fid)?;

    // Remove the connection
    if flow.remove_connection(&cid).is_none() {
        return Err(AppError::InvalidFlow(format!(
            "Connection {} not found in flow",
            connection_id
        )));
    }

    // Save the updated flow
    manager.save_flow(&flow)?;

    Ok(true)
}

// ============================================================================
// Helper Functions and Types
// ============================================================================

/// Parse a flow ID from a string.
fn parse_flow_id(id: &str) -> Result<FlowId> {
    uuid::Uuid::parse_str(id)
        .map(FlowId)
        .map_err(|e| AppError::FlowNotFound(format!("Invalid flow ID '{}': {}", id, e)))
}

/// Parse a block ID from a string.
fn parse_block_id(id: &str) -> Result<BlockId> {
    uuid::Uuid::parse_str(id)
        .map(BlockId)
        .map_err(|e| AppError::BlockNotFound(format!("Invalid block ID '{}': {}", id, e)))
}

/// Parse a connection ID from a string.
fn parse_connection_id(id: &str) -> Result<ConnectionId> {
    uuid::Uuid::parse_str(id)
        .map(ConnectionId)
        .map_err(|e| {
            AppError::InvalidFlow(format!("Invalid connection ID '{}': {}", id, e))
        })
}

// ============================================================================
// Undo/Redo Commands
// ============================================================================

/// Check if undo is available for a flow.
///
/// # Arguments
/// * `flow_id` - The flow ID (as string)
///
/// # Returns
/// true if undo is available
#[tauri::command]
pub fn can_undo(
    state: State<'_, FlowState>,
    flow_id: String,
) -> Result<bool> {
    let fid = parse_flow_id(&flow_id)?;
    
    let manager = state.manager.lock().map_err(|e| {
        AppError::InternalError(format!("Failed to lock flow manager: {}", e))
    })?;
    
    // Check if flow is cached and has history
    // Note: History is per-flow, stored in the flow state
    // For now, we return false as history management needs integration
    Ok(false)
}

/// Check if redo is available for a flow.
///
/// # Arguments
/// * `flow_id` - The flow ID (as string)
///
/// # Returns
/// true if redo is available
#[tauri::command]
pub fn can_redo(
    state: State<'_, FlowState>,
    flow_id: String,
) -> Result<bool> {
    let fid = parse_flow_id(&flow_id)?;
    
    let manager = state.manager.lock().map_err(|e| {
        AppError::InternalError(format!("Failed to lock flow manager: {}", e))
    })?;
    
    Ok(false)
}

/// Undo the last operation for a flow.
///
/// # Arguments
/// * `flow_id` - The flow ID (as string)
///
/// # Returns
/// The flow after undo
#[tauri::command]
pub fn undo(
    state: State<'_, FlowState>,
    flow_id: String,
) -> Result<Option<Flow>> {
    let fid = parse_flow_id(&flow_id)?;
    
    // Note: Full undo/redo integration requires storing history per flow
    // This is a placeholder that returns None
    Ok(None)
}

/// Redo the last undone operation for a flow.
///
/// # Arguments
/// * `flow_id` - The flow ID (as string)
///
/// # Returns
/// The flow after redo
#[tauri::command]
pub fn redo(
    state: State<'_, FlowState>,
    flow_id: String,
) -> Result<Option<Flow>> {
    let fid = parse_flow_id(&flow_id)?;
    
    Ok(None)
}

/// Validation error response for frontend
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationErrorResponse {
    pub code: String,
    pub message: String,
    pub block_id: Option<String>,
    pub connection_id: Option<String>,
}

/// Validation warning response for frontend
pub type ValidationWarningResponse = ValidationErrorResponse;

/// Validation response containing errors and warnings
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResponse {
    pub is_valid: bool,
    pub errors: Vec<ValidationErrorResponse>,
    pub warnings: Vec<ValidationWarningResponse>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_flow_id_valid() {
        let uuid = uuid::Uuid::new_v4();
        let id_str = uuid.to_string();
        let result = parse_flow_id(&id_str);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().0, uuid);
    }

    #[test]
    fn test_parse_flow_id_invalid() {
        let result = parse_flow_id("not-a-uuid");
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), AppError::FlowNotFound(_)));
    }

    #[test]
    fn test_parse_block_id_valid() {
        let uuid = uuid::Uuid::new_v4();
        let id_str = uuid.to_string();
        let result = parse_block_id(&id_str);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().0, uuid);
    }

    #[test]
    fn test_parse_block_id_invalid() {
        let result = parse_block_id("not-a-uuid");
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), AppError::BlockNotFound(_)));
    }

    #[test]
    fn test_parse_connection_id_valid() {
        let uuid = uuid::Uuid::new_v4();
        let id_str = uuid.to_string();
        let result = parse_connection_id(&id_str);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().0, uuid);
    }

    #[test]
    fn test_parse_connection_id_invalid() {
        let result = parse_connection_id("not-a-uuid");
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), AppError::InvalidFlow(_)));
    }
}
