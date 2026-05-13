//! Flow validator implementation
//!
//! This module provides validation logic for flows:
//! - Cycle detection in the connection graph
//! - Block configuration validation
//! - Connection integrity verification
//!
//! Validates: Requirements 5.4

use std::collections::{HashMap, HashSet};

use crate::models::block::{BlockConfig, BlockId, BlockType, ControlType};
use crate::models::flow::Flow;

/// Validation error severity
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValidationSeverity {
    /// Error: flow cannot be executed
    Error,
    /// Warning: flow may not work as expected
    Warning,
}

/// Validation error representation
#[derive(Debug, Clone)]
pub struct ValidationError {
    /// Error code for frontend handling
    pub code: String,
    /// Human-readable error message
    pub message: String,
    /// Severity level
    pub severity: ValidationSeverity,
    /// Related block ID (if applicable)
    pub block_id: Option<BlockId>,
    /// Related connection ID (if applicable)
    pub connection_id: Option<String>,
}

impl ValidationError {
    /// Create a new validation error
    pub fn error(code: &str, message: String) -> Self {
        Self {
            code: code.to_string(),
            message,
            severity: ValidationSeverity::Error,
            block_id: None,
            connection_id: None,
        }
    }
    
    /// Create a new validation warning
    pub fn warning(code: &str, message: String) -> Self {
        Self {
            code: code.to_string(),
            message,
            severity: ValidationSeverity::Warning,
            block_id: None,
            connection_id: None,
        }
    }
    
    /// Attach a block ID to the error
    pub fn with_block(mut self, block_id: BlockId) -> Self {
        self.block_id = Some(block_id);
        self
    }
    
    /// Attach a connection ID to the error
    pub fn with_connection(mut self, connection_id: String) -> Self {
        self.connection_id = Some(connection_id);
        self
    }
}

/// Validation warning type alias for convenience
pub type ValidationWarning = ValidationError;

/// Flow validator for checking flow integrity
pub struct FlowValidator {
    /// Minimum timeout for wait blocks (ms)
    min_timeout_ms: u64,
    /// Maximum timeout for wait blocks (ms)
    max_timeout_ms: u64,
}

impl Default for FlowValidator {
    fn default() -> Self {
        Self::new()
    }
}

impl FlowValidator {
    /// Create a new flow validator with default settings
    pub fn new() -> Self {
        Self {
            min_timeout_ms: 100,
            max_timeout_ms: 60000, // 1 minute
        }
    }
    
    /// Validate a flow
    ///
    /// # Arguments
    /// * `flow` - The flow to validate
    ///
    /// # Returns
    /// A list of validation errors and warnings
    pub fn validate(&self, flow: &Flow) -> Vec<ValidationError> {
        let mut errors = Vec::new();
        
        // Validate flow name
        if flow.name.trim().is_empty() {
            errors.push(ValidationError::error(
                "EMPTY_NAME",
                "Flow name cannot be empty".to_string(),
            ));
        }
        
        // Validate blocks
        for (block_id, block) in &flow.blocks {
            errors.extend(self.validate_block_config(block_id, &block.config));
        }
        
        // Validate connections
        errors.extend(self.validate_connections(flow));
        
        // Check for cycles
        if let Some(cycle) = self.detect_cycle(flow) {
            errors.push(
                ValidationError::error("CYCLE_DETECTED", format!(
                    "Flow contains a cycle: blocks cannot form an infinite loop (found cycle starting at {})",
                    cycle
                ))
            );
        }
        
        // Check for orphan blocks (no incoming or outgoing connections)
        errors.extend(self.check_orphan_blocks(flow));
        
        // Check entry point
        if let Some(entry_id) = &flow.entry_block {
            if !flow.blocks.contains_key(entry_id) {
                errors.push(
                    ValidationError::error("INVALID_ENTRY_POINT", format!(
                        "Entry block {} does not exist in the flow",
                        entry_id
                    ))
                );
            }
        }
        
        // Check for missing image references
        errors.extend(self.check_image_references(flow));
        
        errors
    }
    
    /// Validate block configuration
    fn validate_block_config(&self, block_id: &BlockId, config: &BlockConfig) -> Vec<ValidationError> {
        let mut errors = Vec::new();
        
        match config {
            BlockConfig::Click { count, .. } => {
                if *count == 0 {
                    errors.push(
                        ValidationError::error("INVALID_CLICK_COUNT", "Click count must be at least 1".to_string())
                            .with_block(block_id.clone())
                    );
                }
            }
            BlockConfig::WaitImage { timeout_ms, .. } => {
                if let Some(timeout) = timeout_ms {
                    if *timeout < self.min_timeout_ms || *timeout > self.max_timeout_ms {
                        errors.push(
                            ValidationError::warning("TIMEOUT_OUT_OF_RANGE", format!(
                                "Timeout should be between {}ms and {}ms",
                                self.min_timeout_ms, self.max_timeout_ms
                            ))
                            .with_block(block_id.clone())
                        );
                    }
                }
            }
            BlockConfig::WaitTime { duration_ms } => {
                if *duration_ms == 0 {
                    errors.push(
                        ValidationError::warning("ZERO_WAIT_TIME", "Wait time is zero".to_string())
                            .with_block(block_id.clone())
                    );
                }
            }
            BlockConfig::InputText { text, .. } => {
                if text.is_empty() {
                    errors.push(
                        ValidationError::warning("EMPTY_INPUT_TEXT", "Input text is empty".to_string())
                            .with_block(block_id.clone())
                    );
                }
            }
            BlockConfig::Loop { count } => {
                if *count == 0 {
                    errors.push(
                        ValidationError::error("ZERO_LOOP_COUNT", "Loop count must be at least 1".to_string())
                            .with_block(block_id.clone())
                    );
                }
            }
            BlockConfig::LoopInfinite => {
                // Infinite loops are valid but we might want to warn about them
                // No error here as infinite loops are intentional
            }
            BlockConfig::Condition { true_branch, false_branch, .. } => {
                if true_branch.is_empty() && false_branch.is_empty() {
                    errors.push(
                        ValidationError::warning("EMPTY_CONDITION_BRANCHES", "Both condition branches are empty".to_string())
                            .with_block(block_id.clone())
                    );
                }
            }
        }
        
        errors
    }
    
    /// Validate connections in the flow
    fn validate_connections(&self, flow: &Flow) -> Vec<ValidationError> {
        let mut errors = Vec::new();
        let mut outgoing_by_source: HashMap<BlockId, Vec<&crate::models::Connection>> = HashMap::new();

        for connection in &flow.connections {
            outgoing_by_source
                .entry(connection.source.clone())
                .or_default()
                .push(connection);

            // Check source block exists
            if !flow.blocks.contains_key(&connection.source) {
                errors.push(
                    ValidationError::error("INVALID_CONNECTION_SOURCE", format!(
                        "Connection source block {} does not exist",
                        connection.source
                    ))
                    .with_connection(connection.id.to_string())
                );
            }
            
            // Check target block exists
            if !flow.blocks.contains_key(&connection.target) {
                errors.push(
                    ValidationError::error("INVALID_CONNECTION_TARGET", format!(
                        "Connection target block {} does not exist",
                        connection.target
                    ))
                    .with_connection(connection.id.to_string())
                );
            }
            
            // Check for self-loops
            if connection.source == connection.target {
                errors.push(
                    ValidationError::error("SELF_LOOP", "Block cannot connect to itself".to_string())
                        .with_block(connection.source.clone())
                        .with_connection(connection.id.to_string())
                );
            }
        }
        
        // Check for duplicate connections
        let mut seen_connections: HashSet<(BlockId, BlockId)> = HashSet::new();
        for connection in &flow.connections {
            let key = (connection.source.clone(), connection.target.clone());
            if seen_connections.contains(&key) {
                errors.push(
                    ValidationError::warning("DUPLICATE_CONNECTION", format!(
                        "Duplicate connection from {} to {}",
                        connection.source, connection.target
                    ))
                    .with_connection(connection.id.to_string())
                );
            }
            seen_connections.insert(key);
        }

        errors.extend(self.validate_control_block_structure(flow, &outgoing_by_source));
        
        errors
    }

    fn validate_control_block_structure(
        &self,
        flow: &Flow,
        outgoing_by_source: &HashMap<BlockId, Vec<&crate::models::Connection>>,
    ) -> Vec<ValidationError> {
        let mut errors = Vec::new();

        for (block_id, block) in &flow.blocks {
            let BlockType::Control { control } = &block.block_type else {
                continue;
            };

            match control {
                ControlType::Condition => {
                    let outgoing = outgoing_by_source.get(block_id).cloned().unwrap_or_default();
                    let default_outgoing = outgoing
                        .iter()
                        .filter(|connection| connection.source_handle.is_none())
                        .count();

                    if default_outgoing > 0 {
                        errors.push(
                            ValidationError::error(
                                "CONDITION_DEFAULT_OUTGOING_UNSUPPORTED",
                                "Condition blocks only support true/false branch connections during execution. Remove default outgoing connections or move continuation into each branch.".to_string(),
                            )
                            .with_block(block_id.clone())
                        );
                    }

                    let branch_targets: HashSet<BlockId> = match &block.config {
                        BlockConfig::Condition { true_branch, false_branch, .. } => true_branch
                            .iter()
                            .chain(false_branch.iter())
                            .cloned()
                            .collect(),
                        _ => HashSet::new(),
                    };

                    for branch_target in branch_targets {
                        if let Some(branch_outgoing) = outgoing_by_source.get(&branch_target) {
                            if !branch_outgoing.is_empty() {
                                errors.push(
                                    ValidationError::error(
                                        "CONDITION_BRANCH_SUBCHAIN_UNSUPPORTED",
                                        "Condition branches currently support only direct branch nodes. A branch node has further outgoing connections that runtime execution cannot safely follow yet.".to_string(),
                                    )
                                    .with_block(block_id.clone())
                                );
                                break;
                            }
                        }
                    }
                }
                ControlType::Loop | ControlType::LoopInfinite => {
                    for child_id in &block.children {
                        if let Some(child_outgoing) = outgoing_by_source.get(child_id) {
                            if !child_outgoing.is_empty() {
                                errors.push(
                                    ValidationError::error(
                                        "LOOP_SUBCHAIN_UNSUPPORTED",
                                        "Loop bodies currently support only direct child nodes. A loop child has further outgoing connections that runtime execution cannot safely follow yet.".to_string(),
                                    )
                                    .with_block(block_id.clone())
                                );
                                break;
                            }
                        }
                    }
                }
            }
        }

        errors
    }
    
    /// Detect cycles in the flow graph using DFS
    /// Returns the first block ID in a cycle if found
    fn detect_cycle(&self, flow: &Flow) -> Option<BlockId> {
        if flow.blocks.is_empty() {
            return None;
        }
        
        // Build adjacency list
        let mut graph: HashMap<BlockId, Vec<BlockId>> = HashMap::new();
        for block_id in flow.blocks.keys() {
            graph.insert(block_id.clone(), Vec::new());
        }
        
        for connection in &flow.connections {
            if let Some(neighbors) = graph.get_mut(&connection.source) {
                neighbors.push(connection.target.clone());
            }
        }
        
        // DFS for cycle detection
        let mut visited: HashSet<BlockId> = HashSet::new();
        let mut recursion_stack: HashSet<BlockId> = HashSet::new();
        
        for block_id in flow.blocks.keys() {
            if let Some(cycle_start) = self.dfs_cycle(block_id, &graph, &mut visited, &mut recursion_stack) {
                return Some(cycle_start);
            }
        }
        
        None
    }
    
    /// DFS helper for cycle detection
    fn dfs_cycle(
        &self,
        current: &BlockId,
        graph: &HashMap<BlockId, Vec<BlockId>>,
        visited: &mut HashSet<BlockId>,
        recursion_stack: &mut HashSet<BlockId>,
    ) -> Option<BlockId> {
        if recursion_stack.contains(current) {
            return Some(current.clone());
        }
        
        if visited.contains(current) {
            return None;
        }
        
        visited.insert(current.clone());
        recursion_stack.insert(current.clone());
        
        if let Some(neighbors) = graph.get(current) {
            for neighbor in neighbors {
                if let Some(cycle) = self.dfs_cycle(neighbor, graph, visited, recursion_stack) {
                    return Some(cycle);
                }
            }
        }
        
        recursion_stack.remove(current);
        None
    }
    
    /// Check for orphan blocks (blocks with no connections)
    fn check_orphan_blocks(&self, flow: &Flow) -> Vec<ValidationError> {
        let mut errors = Vec::new();
        
        if flow.blocks.len() <= 1 {
            // Single block or empty flow - no orphans
            return errors;
        }
        
        let mut connected_blocks: HashSet<BlockId> = HashSet::new();
        
        for connection in &flow.connections {
            connected_blocks.insert(connection.source.clone());
            connected_blocks.insert(connection.target.clone());
        }
        
        for block_id in flow.blocks.keys() {
            if !connected_blocks.contains(block_id) {
                errors.push(
                    ValidationError::warning("ORPHAN_BLOCK", format!(
                        "Block {} is not connected to any other blocks",
                        block_id
                    ))
                    .with_block(block_id.clone())
                );
            }
        }
        
        errors
    }
    
    /// Check for image references (placeholder - actual image existence check would require ImageLibrary)
    fn check_image_references(&self, flow: &Flow) -> Vec<ValidationError> {
        let mut errors = Vec::new();
        
        for (block_id, block) in &flow.blocks {
            match &block.config {
                BlockConfig::Click { mode, .. } => {
                    if let crate::models::block::ClickMode::Image { image_id } = mode {
                        // Note: We can't check if the image actually exists here
                        // That check should be done at execution time or with ImageLibrary access
                        if image_id.0.is_nil() {
                            errors.push(
                                ValidationError::error("INVALID_IMAGE_REFERENCE", "Image ID is invalid (nil UUID)".to_string())
                                    .with_block(block_id.clone())
                            );
                        }
                    }
                }
                BlockConfig::WaitImage { image_id, .. } => {
                    if image_id.0.is_nil() {
                        errors.push(
                            ValidationError::error("INVALID_IMAGE_REFERENCE", "Image ID is invalid (nil UUID)".to_string())
                                .with_block(block_id.clone())
                        );
                    }
                }
                BlockConfig::Condition { image_id, .. } => {
                    if image_id.0.is_nil() {
                        errors.push(
                            ValidationError::error("INVALID_IMAGE_REFERENCE", "Image ID is invalid (nil UUID)".to_string())
                                .with_block(block_id.clone())
                        );
                    }
                }
                _ => {}
            }
        }
        
        errors
    }
    
    /// Check if a flow is valid (no errors, warnings are acceptable)
    pub fn is_valid(&self, flow: &Flow) -> bool {
        self.validate(flow)
            .iter()
            .all(|e| e.severity == ValidationSeverity::Warning)
    }
    
    /// Get only errors (not warnings)
    pub fn get_errors(&self, flow: &Flow) -> Vec<ValidationError> {
        self.validate(flow)
            .into_iter()
            .filter(|e| e.severity == ValidationSeverity::Error)
            .collect()
    }
    
    /// Get only warnings (not errors)
    pub fn get_warnings(&self, flow: &Flow) -> Vec<ValidationWarning> {
        self.validate(flow)
            .into_iter()
            .filter(|e| e.severity == ValidationSeverity::Warning)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::block::{ActionType, BlockConfig, BlockNode, BlockPosition, BlockType, ClickMode};
    use crate::models::flow::Connection;
    
    fn create_test_flow() -> Flow {
        Flow::new("Test Flow".to_string())
    }
    
    fn add_click_block(flow: &mut Flow, x: u32, y: u32) -> BlockId {
        let block = BlockNode::new(
            BlockType::Action { action: ActionType::Click },
            BlockPosition::new(100.0, 100.0),
            BlockConfig::Click {
                mode: ClickMode::Coordinates { x, y },
                count: 1,
            },
        );
        let id = block.id.clone();
        flow.add_block(block);
        id
    }
    
    fn add_wait_block(flow: &mut Flow, duration_ms: u64) -> BlockId {
        let block = BlockNode::new(
            BlockType::Action { action: ActionType::WaitTime },
            BlockPosition::new(200.0, 100.0),
            BlockConfig::WaitTime { duration_ms },
        );
        let id = block.id.clone();
        flow.add_block(block);
        id
    }
    
    #[test]
    fn test_validate_empty_flow() {
        let validator = FlowValidator::new();
        let flow = create_test_flow();
        let errors = validator.validate(&flow);
        
        // Empty flow is valid (just no blocks)
        assert!(errors.is_empty() || errors.iter().all(|e| e.severity == ValidationSeverity::Warning));
    }
    
    #[test]
    fn test_validate_flow_with_blocks() {
        let validator = FlowValidator::new();
        let mut flow = create_test_flow();
        
        let block1 = add_click_block(&mut flow, 10, 20);
        let block2 = add_wait_block(&mut flow, 1000);
        
        flow.add_connection(Connection::new(block1.clone(), block2));
        
        let errors = validator.get_errors(&flow);
        assert!(errors.is_empty());
    }
    
    #[test]
    fn test_validate_self_loop() {
        let validator = FlowValidator::new();
        let mut flow = create_test_flow();
        
        let block1 = add_click_block(&mut flow, 10, 20);
        flow.add_connection(Connection::new(block1.clone(), block1.clone()));
        
        let errors = validator.get_errors(&flow);
        assert!(!errors.is_empty());
        assert!(errors.iter().any(|e| e.code == "SELF_LOOP"));
    }
    
    #[test]
    fn test_detect_cycle() {
        let validator = FlowValidator::new();
        let mut flow = create_test_flow();
        
        let block1 = add_click_block(&mut flow, 10, 20);
        let block2 = add_wait_block(&mut flow, 1000);
        
        // Create cycle: block1 -> block2 -> block1
        flow.add_connection(Connection::new(block1.clone(), block2.clone()));
        flow.add_connection(Connection::new(block2, block1));
        
        let errors = validator.get_errors(&flow);
        assert!(errors.iter().any(|e| e.code == "CYCLE_DETECTED"));
    }
    
    #[test]
    fn test_validate_invalid_click_count() {
        let validator = FlowValidator::new();
        let mut flow = create_test_flow();
        
        let block = BlockNode::new(
            BlockType::Action { action: ActionType::Click },
            BlockPosition::new(100.0, 100.0),
            BlockConfig::Click {
                mode: ClickMode::Coordinates { x: 10, y: 20 },
                count: 0, // Invalid
            },
        );
        flow.add_block(block);
        
        let errors = validator.get_errors(&flow);
        assert!(errors.iter().any(|e| e.code == "INVALID_CLICK_COUNT"));
    }
    
    #[test]
    fn test_validate_zero_loop_count() {
        let validator = FlowValidator::new();
        let mut flow = create_test_flow();
        
        let block = BlockNode::new(
            BlockType::Control { control: crate::models::block::ControlType::Loop },
            BlockPosition::new(100.0, 100.0),
            BlockConfig::Loop { count: 0 }, // Invalid
        );
        flow.add_block(block);
        
        let errors = validator.get_errors(&flow);
        assert!(errors.iter().any(|e| e.code == "ZERO_LOOP_COUNT"));
    }
    
    #[test]
    fn test_validate_orphan_blocks() {
        let validator = FlowValidator::new();
        let mut flow = create_test_flow();
        
        add_click_block(&mut flow, 10, 20);
        add_wait_block(&mut flow, 1000);
        
        // No connections - both blocks are orphans
        let warnings = validator.get_warnings(&flow);
        assert!(warnings.iter().any(|e| e.code == "ORPHAN_BLOCK"));
    }
    
    #[test]
    fn test_validate_empty_name() {
        let validator = FlowValidator::new();
        let flow = Flow::new("".to_string());
        
        let errors = validator.get_errors(&flow);
        assert!(errors.iter().any(|e| e.code == "EMPTY_NAME"));
    }
    
    #[test]
    fn test_validate_condition_default_outgoing_is_unsupported() {
        let validator = FlowValidator::new();
        let mut flow = create_test_flow();

        let condition_block = BlockNode::new(
            BlockType::Control { control: ControlType::Condition },
            BlockPosition::new(100.0, 100.0),
            BlockConfig::Condition {
                image_id: crate::models::ImageId::new(),
                condition: crate::models::ConditionOp::ImageExists,
                true_branch: vec![],
                false_branch: vec![],
            },
        );
        let condition_id = condition_block.id.clone();
        flow.add_block(condition_block);

        let next_block = add_wait_block(&mut flow, 1000);
        flow.add_connection(Connection::new(condition_id, next_block));

        let errors = validator.get_errors(&flow);
        assert!(errors.iter().any(|e| e.code == "CONDITION_DEFAULT_OUTGOING_UNSUPPORTED"));
    }

    #[test]
    fn test_validate_condition_branch_subchain_is_unsupported() {
        let validator = FlowValidator::new();
        let mut flow = create_test_flow();

        let branch_a = add_click_block(&mut flow, 10, 20);
        let branch_b = add_wait_block(&mut flow, 1000);

        let condition_block = BlockNode::new(
            BlockType::Control { control: ControlType::Condition },
            BlockPosition::new(100.0, 100.0),
            BlockConfig::Condition {
                image_id: crate::models::ImageId::new(),
                condition: crate::models::ConditionOp::ImageExists,
                true_branch: vec![branch_a.clone()],
                false_branch: vec![],
            },
        );
        let condition_id = condition_block.id.clone();
        flow.add_block(condition_block);

        flow.add_connection(Connection::with_handle(condition_id, branch_a.clone(), "true".to_string()));
        flow.add_connection(Connection::new(branch_a, branch_b));

        let errors = validator.get_errors(&flow);
        assert!(errors.iter().any(|e| e.code == "CONDITION_BRANCH_SUBCHAIN_UNSUPPORTED"));
    }

    #[test]
    fn test_validate_loop_subchain_is_unsupported() {
        let validator = FlowValidator::new();
        let mut flow = create_test_flow();

        let loop_child = add_click_block(&mut flow, 10, 20);
        let loop_child_next = add_wait_block(&mut flow, 1000);

        let loop_block = BlockNode::new(
            BlockType::Control { control: ControlType::Loop },
            BlockPosition::new(100.0, 100.0),
            BlockConfig::Loop { count: 2 },
        );
        let loop_id = loop_block.id.clone();
        flow.add_block(loop_block.clone());

        if let Some(block) = flow.get_block_mut(&loop_id) {
            block.children = vec![loop_child.clone()];
        }

        flow.add_connection(Connection::new(loop_id, loop_child.clone()));
        flow.add_connection(Connection::new(loop_child, loop_child_next));

        let errors = validator.get_errors(&flow);
        assert!(errors.iter().any(|e| e.code == "LOOP_SUBCHAIN_UNSUPPORTED"));
    }
}

