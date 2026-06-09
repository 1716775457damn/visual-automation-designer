//! Connection validation
//!
//! Connection integrity: type compatibility, port count limits, duplicate
//! detection, self-loop prevention, and control-block sub-chain restrictions.
//!
//! Validates: Requirements 5.4

use std::collections::{HashMap, HashSet};

use crate::models::block::{BlockConfig, BlockId, BlockType, ControlType};
use crate::models::flow::{Connection, Flow};

use super::flow_validator::{FlowValidator, ValidationError};

/// Validate connections in the flow
pub(super) fn validate_connections(
    _validator: &FlowValidator,
    flow: &Flow,
) -> Vec<ValidationError> {
    let mut errors = Vec::new();
    let mut outgoing_by_source: HashMap<BlockId, Vec<&Connection>> =
        HashMap::new();

    for connection in &flow.connections {
        outgoing_by_source
            .entry(connection.source.clone())
            .or_default()
            .push(connection);

        // Check source block exists
        if !flow.blocks.contains_key(&connection.source) {
            errors.push(
                ValidationError::error(
                    "INVALID_CONNECTION_SOURCE",
                    format!(
                        "Connection source block {} does not exist",
                        connection.source
                    ),
                )
                .with_connection(connection.id.to_string()),
            );
        }

        // Check target block exists
        if !flow.blocks.contains_key(&connection.target) {
            errors.push(
                ValidationError::error(
                    "INVALID_CONNECTION_TARGET",
                    format!(
                        "Connection target block {} does not exist",
                        connection.target
                    ),
                )
                .with_connection(connection.id.to_string()),
            );
        }

        // Check for self-loops
        if connection.source == connection.target {
            errors.push(
                ValidationError::error(
                    "SELF_LOOP",
                    "Block cannot connect to itself".to_string(),
                )
                .with_block(connection.source.clone())
                .with_connection(connection.id.to_string()),
            );
        }
    }

    // Check for duplicate connections
    let mut seen_connections: HashSet<(BlockId, BlockId)> = HashSet::new();
    for connection in &flow.connections {
        let key = (connection.source.clone(), connection.target.clone());
        if seen_connections.contains(&key) {
            errors.push(
                ValidationError::warning(
                    "DUPLICATE_CONNECTION",
                    format!(
                        "Duplicate connection from {} to {}",
                        connection.source, connection.target
                    ),
                )
                .with_connection(connection.id.to_string())
                .with_block(connection.source.clone()),
            );
        }
        seen_connections.insert(key);
    }

    errors.extend(validate_control_block_structure(
        flow,
        &outgoing_by_source,
    ));

    errors
}

/// Validate that control blocks (condition, loop) don't have unsupported
/// outgoing connection patterns.
fn validate_control_block_structure(
    flow: &Flow,
    outgoing_by_source: &HashMap<BlockId, Vec<&Connection>>,
) -> Vec<ValidationError> {
    let mut errors = Vec::new();

    for (block_id, block) in &flow.blocks {
        let BlockType::Control { control } = &block.block_type else {
            continue;
        };

        match control {
            ControlType::Condition | ControlType::TextCheck => {
                let outgoing = outgoing_by_source
                    .get(block_id)
                    .cloned()
                    .unwrap_or_default();
                let default_outgoing = outgoing
                    .iter()
                    .filter(|connection| connection.source_handle.is_none())
                    .count();

                if default_outgoing > 0 {
                    errors.push(
                        ValidationError::error(
                            "CONDITION_DEFAULT_OUTGOING_UNSUPPORTED",
                            "Condition/TextCheck blocks only support true/false branch connections during execution. Remove default outgoing connections or move continuation into each branch.".to_string(),
                        )
                        .with_block(block_id.clone()),
                    );
                }

                let branch_targets: HashSet<BlockId> = match &block.config {
                    BlockConfig::Condition {
                        true_branch,
                        false_branch,
                        ..
                    }
                    | BlockConfig::TextCheck {
                        true_branch,
                        false_branch,
                        ..
                    } => true_branch
                        .iter()
                        .chain(false_branch.iter())
                        .cloned()
                        .collect(),
                    _ => HashSet::new(),
                };

                for branch_target in branch_targets {
                    if let Some(branch_outgoing) =
                        outgoing_by_source.get(&branch_target)
                    {
                        if !branch_outgoing.is_empty() {
                            errors.push(
                                ValidationError::error(
                                    "CONDITION_BRANCH_SUBCHAIN_UNSUPPORTED",
                                    "Condition/TextCheck branches currently support only direct branch nodes. A branch node has further outgoing connections that runtime execution cannot safely follow yet.".to_string(),
                                )
                                .with_block(branch_target.clone()),
                            );
                            break;
                        }
                    }
                }
            }
            ControlType::Loop | ControlType::LoopInfinite => {
                for child_id in &block.children {
                    if let Some(child_outgoing) =
                        outgoing_by_source.get(child_id)
                    {
                        if !child_outgoing.is_empty() {
                            errors.push(
                                ValidationError::error(
                                    "LOOP_SUBCHAIN_UNSUPPORTED",
                                    "Loop bodies currently support only direct child nodes. A loop child has further outgoing connections that runtime execution cannot safely follow yet.".to_string(),
                                )
                                .with_block(child_id.clone()),
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::flow::ValidationSeverity;
    use crate::models::block::{BlockConfig, BlockId, BlockNode, BlockPosition, BlockType, ConditionOp, ControlType, ActionType};

    fn make_test_flow() -> Flow {
        Flow::new("test".to_string())
    }

    fn make_action_block(config: BlockConfig) -> BlockNode {
        BlockNode::new(
            BlockType::Action { action: ActionType::Click },
            BlockPosition::new(0.0, 0.0),
            config,
        )
    }

    fn make_connection(
        source: BlockId,
        target: BlockId,
        handle: Option<String>,
    ) -> Connection {
        Connection {
            id: crate::models::flow::ConnectionId::new(),
            source,
            target,
            source_handle: handle,
        }
    }

    // ========================================================================
    // validate_connections tests
    // ========================================================================

    #[test]
    fn should_error_on_missing_source_block() {
        let mut flow = make_test_flow();
        let valid_block = make_action_block(BlockConfig::WaitTime { duration_ms: 100 });
        let valid_id = valid_block.id.clone();
        flow.add_block(valid_block);

        let unknown_id = BlockId::new();
        let conn = make_connection(unknown_id.clone(), valid_id, None);
        flow.connections.push(conn);

        let validator = FlowValidator::new();
        let errors = validate_connections(&validator, &flow);
        assert!(errors.iter().any(|e| e.code == "INVALID_CONNECTION_SOURCE"));
    }

    #[test]
    fn should_error_on_missing_target_block() {
        let mut flow = make_test_flow();
        let valid_block = make_action_block(BlockConfig::WaitTime { duration_ms: 100 });
        let valid_id = valid_block.id.clone();
        flow.add_block(valid_block);

        let unknown_id = BlockId::new();
        let conn = make_connection(valid_id, unknown_id, None);
        flow.connections.push(conn);

        let validator = FlowValidator::new();
        let errors = validate_connections(&validator, &flow);
        assert!(errors.iter().any(|e| e.code == "INVALID_CONNECTION_TARGET"));
    }

    #[test]
    fn should_error_on_self_loop() {
        let mut flow = make_test_flow();
        let block = make_action_block(BlockConfig::WaitTime { duration_ms: 100 });
        let block_id = block.id.clone();
        flow.add_block(block);

        let conn = make_connection(block_id.clone(), block_id, None);
        flow.connections.push(conn);

        let validator = FlowValidator::new();
        let errors = validate_connections(&validator, &flow);
        assert!(errors.iter().any(|e| e.code == "SELF_LOOP"));
    }

    #[test]
    fn should_warn_on_duplicate_connection() {
        let mut flow = make_test_flow();
        let block_a = make_action_block(BlockConfig::WaitTime { duration_ms: 100 });
        let block_b = make_action_block(BlockConfig::WaitTime { duration_ms: 200 });
        let id_a = block_a.id.clone();
        let id_b = block_b.id.clone();
        flow.add_block(block_a);
        flow.add_block(block_b);

        flow.connections.push(make_connection(id_a.clone(), id_b.clone(), None));
        flow.connections.push(make_connection(id_a, id_b, None));

        let validator = FlowValidator::new();
        let errors = validate_connections(&validator, &flow);
        assert!(errors.iter().any(|e| e.code == "DUPLICATE_CONNECTION"));
    }

    #[test]
    fn should_accept_valid_connections() {
        let mut flow = make_test_flow();
        let block_a = make_action_block(BlockConfig::WaitTime { duration_ms: 100 });
        let block_b = make_action_block(BlockConfig::WaitTime { duration_ms: 200 });
        let id_a = block_a.id.clone();
        let id_b = block_b.id.clone();
        flow.add_block(block_a);
        flow.add_block(block_b);

        flow.connections.push(make_connection(id_a, id_b, None));

        let validator = FlowValidator::new();
        let errors = validate_connections(&validator, &flow);
        assert!(!errors.iter().any(|e| e.severity == ValidationSeverity::Error));
    }

    // ========================================================================
    // validate_control_block_structure tests
    // ========================================================================

    #[test]
    fn should_error_on_condition_default_outgoing() {
        let mut flow = make_test_flow();

        let cond_block = BlockNode::new(
            BlockType::Control { control: ControlType::Condition },
            BlockPosition::new(0.0, 0.0),
            BlockConfig::Condition {
                image_id: None,
                condition: ConditionOp::ImageExists,
                true_branch: vec![],
                false_branch: vec![],
            },
        );
        let cond_id = cond_block.id.clone();
        flow.add_block(cond_block);

        let target = make_action_block(BlockConfig::WaitTime { duration_ms: 100 });
        let target_id = target.id.clone();
        flow.add_block(target);

        flow.connections
            .push(make_connection(cond_id, target_id, None));

        let validator = FlowValidator::new();
        let errors = validate_connections(&validator, &flow);
        assert!(errors.iter().any(|e| e.code == "CONDITION_DEFAULT_OUTGOING_UNSUPPORTED"));
    }

    #[test]
    fn should_error_on_condition_branch_subchain() {
        let mut flow = make_test_flow();

        let branch_block = make_action_block(BlockConfig::WaitTime { duration_ms: 100 });
        let branch_id = branch_block.id.clone();
        flow.add_block(branch_block);

        let extra_target = make_action_block(BlockConfig::WaitTime { duration_ms: 200 });
        let extra_id = extra_target.id.clone();
        flow.add_block(extra_target);

        flow.connections
            .push(make_connection(branch_id.clone(), extra_id, None));

        let cond_block = BlockNode::new(
            BlockType::Control { control: ControlType::Condition },
            BlockPosition::new(0.0, 0.0),
            BlockConfig::Condition {
                image_id: None,
                condition: ConditionOp::ImageExists,
                true_branch: vec![branch_id],
                false_branch: vec![],
            },
        );
        flow.add_block(cond_block);

        let validator = FlowValidator::new();
        let errors = validate_connections(&validator, &flow);
        assert!(errors.iter().any(|e| e.code == "CONDITION_BRANCH_SUBCHAIN_UNSUPPORTED"));
    }

    #[test]
    fn should_error_on_loop_subchain() {
        let mut flow = make_test_flow();

        let child_block = make_action_block(BlockConfig::WaitTime { duration_ms: 100 });
        let child_id = child_block.id.clone();
        flow.add_block(child_block);

        let outside_block = make_action_block(BlockConfig::WaitTime { duration_ms: 200 });
        let outside_id = outside_block.id.clone();
        flow.add_block(outside_block);

        flow.connections
            .push(make_connection(child_id.clone(), outside_id, None));

        let loop_block = BlockNode {
            children: vec![child_id],
            ..BlockNode::new(
                BlockType::Control { control: ControlType::Loop },
                BlockPosition::new(0.0, 0.0),
                BlockConfig::Loop { count: 3 },
            )
        };
        flow.add_block(loop_block);

        let validator = FlowValidator::new();
        let errors = validate_connections(&validator, &flow);
        assert!(errors.iter().any(|e| e.code == "LOOP_SUBCHAIN_UNSUPPORTED"));
    }

    #[test]
    fn should_accept_condition_with_only_branch_connections() {
        let mut flow = make_test_flow();

        let true_target = make_action_block(BlockConfig::WaitTime { duration_ms: 100 });
        let true_id = true_target.id.clone();
        flow.add_block(true_target);

        let false_target = make_action_block(BlockConfig::WaitTime { duration_ms: 200 });
        let false_id = false_target.id.clone();
        flow.add_block(false_target);

        let cond_block = BlockNode::new(
            BlockType::Control { control: ControlType::Condition },
            BlockPosition::new(0.0, 0.0),
            BlockConfig::Condition {
                image_id: None,
                condition: ConditionOp::ImageExists,
                true_branch: vec![true_id],
                false_branch: vec![false_id],
            },
        );
        flow.add_block(cond_block);

        let validator = FlowValidator::new();
        let errors = validate_connections(&validator, &flow);
        assert!(!errors.iter().any(|e| e.severity == ValidationSeverity::Error));
    }

    #[test]
    fn should_accept_loop_with_direct_children_only() {
        let mut flow = make_test_flow();

        let child_block = make_action_block(BlockConfig::WaitTime { duration_ms: 100 });
        let child_id = child_block.id.clone();
        flow.add_block(child_block);

        let loop_block = BlockNode {
            children: vec![child_id],
            ..BlockNode::new(
                BlockType::Control { control: ControlType::Loop },
                BlockPosition::new(0.0, 0.0),
                BlockConfig::Loop { count: 3 },
            )
        };
        flow.add_block(loop_block);

        let validator = FlowValidator::new();
        let errors = validate_connections(&validator, &flow);
        assert!(!errors.iter().any(|e| e.severity == ValidationSeverity::Error));
    }
}