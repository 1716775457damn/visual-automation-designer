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
            ControlType::Condition => {
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
                            "Condition blocks only support true/false branch connections during execution. Remove default outgoing connections or move continuation into each branch.".to_string(),
                        )
                        .with_block(block_id.clone()),
                    );
                }

                let branch_targets: HashSet<BlockId> = match &block.config {
                    BlockConfig::Condition {
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
                                    "Condition branches currently support only direct branch nodes. A branch node has further outgoing connections that runtime execution cannot safely follow yet.".to_string(),
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
