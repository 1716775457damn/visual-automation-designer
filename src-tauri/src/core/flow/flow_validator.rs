//! Flow-level validation
//!
//! Entry/exit node validation, cycle detection, reachability analysis,
//! and top-level flow integrity checks. Defines shared validation types
//! (ValidationError, ValidationSeverity, ValidationWarning) and the
//! FlowValidator orchestrator.
//!
//! Validates: Requirements 5.4

use std::collections::{HashMap, HashSet};

use crate::models::block::BlockId;
use crate::models::flow::Flow;

use super::block_validator;
use super::connection_validator;

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
    pub(super) min_timeout_ms: u64,
    /// Maximum timeout for wait blocks (ms)
    pub(super) max_timeout_ms: u64,
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
            errors.extend(block_validator::validate_block_config(
                self, block_id, &block.config,
            ));
        }

        // Validate connections
        errors.extend(connection_validator::validate_connections(self, flow));

        // Validate port requirements
        errors.extend(super::port_validator::validate_port_requirements(self, flow));

        // Check for cycles
        if let Some(cycle) = self.detect_cycle(flow) {
            errors.push(
                ValidationError::error(
                    "CYCLE_DETECTED",
                    format!(
                        "Flow contains a cycle: blocks cannot form an infinite loop (found cycle starting at {})",
                        cycle
                    ),
                )
                .with_block(cycle.clone()),
            );
        }

        // Check for orphan blocks (no incoming or outgoing connections)
        errors.extend(self.check_orphan_blocks(flow));

        // Check entry point
        if let Some(entry_id) = &flow.entry_block {
            if !flow.blocks.contains_key(entry_id) {
                errors.push(ValidationError::error(
                    "INVALID_ENTRY_POINT",
                    format!("Entry block {} does not exist in the flow", entry_id),
                ));
            }
        } else if !flow.blocks.is_empty() {
            errors.push(ValidationError::warning(
                "NO_ENTRY",
                "No entry point is set for the flow".to_string(),
            ));
        }

        // Check for missing image references
        errors.extend(block_validator::check_image_references(self, flow));

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
            if let Some(cycle_start) =
                self.dfs_cycle(block_id, &graph, &mut visited, &mut recursion_stack)
            {
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
                if let Some(cycle) =
                    self.dfs_cycle(neighbor, graph, visited, recursion_stack)
                {
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
                    ValidationError::warning(
                        "ORPHAN_BLOCK",
                        format!("Block {} is not connected to any other blocks", block_id),
                    )
                    .with_block(block_id.clone()),
                );
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
    use crate::models::block::{
        ActionType, BlockConfig, BlockNode, BlockPosition, BlockType,
    };
    use crate::models::flow::Connection;

    fn create_test_flow() -> Flow {
        Flow::new("Test Flow".to_string())
    }

    fn add_click_block(flow: &mut Flow, x: u32, y: u32) -> BlockId {
        let block = BlockNode::new(
            BlockType::Action {
                action: ActionType::Click,
            },
            BlockPosition::new(100.0, 100.0),
            BlockConfig::Click {
                mode: crate::models::block::ClickMode::Coordinates { x, y },
                count: 1,
            },
        );
        let id = block.id.clone();
        flow.add_block(block);
        id
    }

    fn add_wait_block(flow: &mut Flow, duration_ms: u64) -> BlockId {
        let block = BlockNode::new(
            BlockType::Action {
                action: ActionType::WaitTime,
            },
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
        assert!(errors.is_empty()
            || errors
                .iter()
                .all(|e| e.severity == ValidationSeverity::Warning));
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
    fn test_validate_cycle_contains_block_id() {
        let validator = FlowValidator::new();
        let mut flow = create_test_flow();

        let block1 = add_click_block(&mut flow, 10, 20);
        let block2 = add_wait_block(&mut flow, 1000);

        flow.add_connection(Connection::new(block1.clone(), block2.clone()));
        flow.add_connection(Connection::new(block2, block1.clone()));

        let errors = validator.get_errors(&flow);
        let cycle_error = errors.iter().find(|e| e.code == "CYCLE_DETECTED");
        assert!(cycle_error.is_some());
        assert!(cycle_error.unwrap().block_id.is_some());
    }

    #[test]
    fn test_validate_no_entry_warning() {
        let validator = FlowValidator::new();
        let mut flow = create_test_flow();
        add_click_block(&mut flow, 10, 20);

        let warnings = validator.get_warnings(&flow);
        assert!(warnings.iter().any(|e| e.code == "NO_ENTRY"));
    }

    #[test]
    fn should_error_on_empty_flow_name() {
        let validator = FlowValidator::new();
        let flow = Flow::new("   ".to_string());
        let errors = validator.validate(&flow);
        assert!(errors.iter().any(|e| e.code == "EMPTY_NAME"));
    }

    #[test]
    fn should_accept_non_empty_flow_name() {
        let validator = FlowValidator::new();
        let flow = Flow::new("Valid Name".to_string());
        let errors = validator.validate(&flow);
        assert!(!errors.iter().any(|e| e.code == "EMPTY_NAME"));
    }

    #[test]
    fn should_error_on_invalid_entry_point() {
        let validator = FlowValidator::new();
        let mut flow = create_test_flow();
        add_click_block(&mut flow, 10, 20);

        let unknown_id = BlockId::new();
        flow.entry_block = Some(unknown_id);

        let errors = validator.validate(&flow);
        assert!(errors.iter().any(|e| e.code == "INVALID_ENTRY_POINT"));
    }

    #[test]
    fn should_warn_on_orphan_block() {
        let validator = FlowValidator::new();
        let mut flow = create_test_flow();

        let block_a = add_click_block(&mut flow, 10, 20);
        let block_b = add_wait_block(&mut flow, 1000);
        // block_c has no connections at all — orphan
        let _block_c = add_click_block(&mut flow, 30, 40);

        // Only connect A and B, leave C isolated
        flow.add_connection(Connection::new(block_a, block_b));

        let warnings = validator.get_warnings(&flow);
        assert!(warnings.iter().any(|e| e.code == "ORPHAN_BLOCK"));
    }

    #[test]
    fn should_not_warn_orphan_for_single_block() {
        let validator = FlowValidator::new();
        let mut flow = create_test_flow();
        add_click_block(&mut flow, 10, 20);

        // Single block without connections should not be flagged as orphan
        let warnings = validator.get_warnings(&flow);
        assert!(!warnings.iter().any(|e| e.code == "ORPHAN_BLOCK"));
    }

    #[test]
    fn should_detect_no_cycle_in_acyclic_graph() {
        let validator = FlowValidator::new();
        let mut flow = create_test_flow();

        let block1 = add_click_block(&mut flow, 10, 20);
        let block2 = add_wait_block(&mut flow, 1000);
        let block3 = add_click_block(&mut flow, 30, 40);

        flow.add_connection(Connection::new(block1, block2.clone()));
        flow.add_connection(Connection::new(block2, block3));

        let errors = validator.get_errors(&flow);
        assert!(!errors.iter().any(|e| e.code == "CYCLE_DETECTED"));
    }

    #[test]
    fn should_report_valid_flow_as_valid() {
        let validator = FlowValidator::new();
        let mut flow = create_test_flow();

        let block1 = add_click_block(&mut flow, 10, 20);
        let block2 = add_wait_block(&mut flow, 1000);

        flow.add_connection(Connection::new(block1.clone(), block2));
        flow.entry_block = Some(block1);

        assert!(validator.is_valid(&flow));
    }

    #[test]
    fn should_filter_warnings_only() {
        let validator = FlowValidator::new();
        let mut flow = create_test_flow();
        add_click_block(&mut flow, 10, 20);

        let warnings = validator.get_warnings(&flow);
        // All returned should be warnings
        assert!(warnings.iter().all(|e| e.severity == ValidationSeverity::Warning));
    }

    #[test]
    fn should_filter_errors_only() {
        let validator = FlowValidator::new();
        let mut flow = create_test_flow();

        let block1 = add_click_block(&mut flow, 10, 20);
        // Self-loop is an error
        flow.add_connection(Connection::new(block1.clone(), block1));

        let errors = validator.get_errors(&flow);
        assert!(errors.iter().all(|e| e.severity == ValidationSeverity::Error));
    }
}
