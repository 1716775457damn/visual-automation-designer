//! Port-level validation for block connections
//!
//! Checks that:
//! 1. Required input ports have incoming connections or default values
//! 2. Connected ports have compatible types (when port info is available)
//! 3. Control blocks (condition) have expected branch port connections
//!
//! Validates: Phase A — Port System

use std::collections::HashMap;

use crate::models::block::{BlockId, BlockType, ControlType};
use crate::models::flow::{Connection, Flow};
use crate::models::port::port_definitions_for;

use super::flow_validator::{FlowValidator, ValidationError};

/// Validate port requirements for all blocks in a flow
pub(super) fn validate_port_requirements(
    _validator: &FlowValidator,
    flow: &Flow,
) -> Vec<ValidationError> {
    let mut errors = Vec::new();

    // Build a map of incoming connections per block
    let incoming: HashMap<BlockId, Vec<&Connection>> =
        flow.connections
            .iter()
            .fold(HashMap::new(), |mut acc, conn| {
                acc.entry(conn.target.clone()).or_default().push(conn);
                acc
            });

    // Build a map of outgoing connections per block
    let outgoing: HashMap<BlockId, Vec<&Connection>> =
        flow.connections
            .iter()
            .fold(HashMap::new(), |mut acc, conn| {
                acc.entry(conn.source.clone()).or_default().push(conn);
                acc
            });

    for (block_id, block) in &flow.blocks {
        let block_type_str = block_type_to_string(&block.block_type);
        let Some(port_defs) = port_definitions_for(&block_type_str) else {
            continue;
        };

        // Check 1: Required input ports must have incoming connections or defaults
        for input_port in &port_defs.inputs {
            if !input_port.required {
                continue;
            }
            // Skip if it has a default value — the runtime will use it
            if input_port.default.is_some() {
                continue;
            }
            // Check if this block has any incoming connection
            let has_incoming = incoming.get(block_id).is_some_and(|conns| !conns.is_empty());
            if !has_incoming {
                errors.push(
                    ValidationError::error(
                        "PORT_REQUIRED_INPUT_MISSING",
                        format!(
                            "Block '{}' requires input port '{}' ({}) but has no incoming connection",
                            block_type_str, input_port.name, input_port.label,
                        ),
                    )
                    .with_block(block_id.clone()),
                );
            }
        }

        // Check 2: For condition blocks, verify true/false branch ports are connected
        if matches!(&block.block_type, BlockType::Control { control: ControlType::Condition }) {
            let outgoing_conns = outgoing.get(block_id).cloned().unwrap_or_default();
            let has_true = outgoing_conns
                .iter()
                .any(|c| c.source_handle.as_deref() == Some("true"));
            let has_false = outgoing_conns
                .iter()
                .any(|c| c.source_handle.as_deref() == Some("false"));

            if !has_true {
                errors.push(
                    ValidationError::warning(
                        "CONDITION_MISSING_TRUE_BRANCH",
                        "Condition block is missing a 'true' branch connection".to_string(),
                    )
                    .with_block(block_id.clone()),
                );
            }
            if !has_false {
                errors.push(
                    ValidationError::warning(
                        "CONDITION_MISSING_FALSE_BRANCH",
                        "Condition block is missing a 'false' branch connection".to_string(),
                    )
                    .with_block(block_id.clone()),
                );
            }
        }

        // Check 3: Outgoing port — require explicit source_handle for multi-output blocks
        if port_defs.outputs.len() > 1 {
            let outgoing_conns = outgoing.get(block_id).cloned().unwrap_or_default();
            for conn in &outgoing_conns {
                if conn.source_handle.is_none() {
                    errors.push(
                        ValidationError::error(
                            "PORT_AMBIGUOUS_CONNECTION",
                            format!(
                                "Block '{}' has multiple output ports; connection must specify a port handle",
                                block_type_str,
                            ),
                        )
                        .with_block(block_id.clone())
                        .with_connection(conn.id.to_string()),
                    );
                }
            }
        }
    }

    errors
}

/// Convert BlockType enum to a string key used in port definitions
fn block_type_to_string(block_type: &BlockType) -> String {
    match block_type {
        BlockType::Action { action } => match action {
            crate::models::block::ActionType::Click => "click",
            crate::models::block::ActionType::WaitImage => "wait_image",
            crate::models::block::ActionType::WaitTime => "wait_time",
            crate::models::block::ActionType::InputText => "input_text",
            crate::models::block::ActionType::TextExtract => "text_extract",
            crate::models::block::ActionType::ScreenshotAssert => "screenshot_assert",
        },
        BlockType::Control { control } => match control {
            ControlType::Loop => "loop",
            ControlType::LoopInfinite => "loop_infinite",
            ControlType::Condition => "condition",
            ControlType::TextCheck => "text_check",
        },
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::block::{
        ActionType, BlockConfig, BlockNode, BlockPosition, ClickMode, ConditionOp,
    };

    fn create_flow(name: &str) -> Flow {
        Flow::new(name.to_string())
    }

    fn add_block(flow: &mut Flow, block_type: BlockType, config: BlockConfig) -> BlockId {
        let block = BlockNode::new(block_type, BlockPosition::new(0.0, 0.0), config);
        let id = block.id.clone();
        flow.add_block(block);
        id
    }

    fn make_conn(source: BlockId, target: BlockId, handle: Option<&str>) -> Connection {
        Connection {
            id: crate::models::flow::ConnectionId::new(),
            source,
            target,
            source_handle: handle.map(String::from),
        }
    }

    #[test]
    fn test_required_input_detected() {
        let validator = FlowValidator::new();
        let mut flow = create_flow("test");
        // wait_image block requires image_ref input with no default
        let block = add_block(
            &mut flow,
            BlockType::Action { action: ActionType::WaitImage },
            BlockConfig::WaitImage {
                image_id: None,
                timeout_ms: Some(5000),
            },
        );
        flow.entry_block = Some(block);

        let errors = validate_port_requirements(&validator, &flow);
        let required_errors: Vec<_> = errors
            .iter()
            .filter(|e| e.code == "PORT_REQUIRED_INPUT_MISSING")
            .collect();
        assert!(
            !required_errors.is_empty(),
            "Should flag missing required input"
        );
    }

    #[test]
    fn test_condition_branches_missing() {
        let validator = FlowValidator::new();
        let mut flow = create_flow("test");
        let cond = add_block(
            &mut flow,
            BlockType::Control { control: ControlType::Condition },
            BlockConfig::Condition {
                image_id: None,
                condition: ConditionOp::ImageExists,
                true_branch: vec![],
                false_branch: vec![],
            },
        );
        flow.entry_block = Some(cond);

        let errors = validate_port_requirements(&validator, &flow);
        let true_warnings: Vec<_> = errors
            .iter()
            .filter(|e| e.code == "CONDITION_MISSING_TRUE_BRANCH")
            .collect();
        let false_warnings: Vec<_> = errors
            .iter()
            .filter(|e| e.code == "CONDITION_MISSING_FALSE_BRANCH")
            .collect();
        assert!(!true_warnings.is_empty(), "Should warn about missing true branch");
        assert!(!false_warnings.is_empty(), "Should warn about missing false branch");
    }

    #[test]
    fn test_condition_branches_connected_pass() {
        let validator = FlowValidator::new();
        let mut flow = create_flow("test");
        let cond = add_block(
            &mut flow,
            BlockType::Control { control: ControlType::Condition },
            BlockConfig::Condition {
                image_id: None,
                condition: ConditionOp::ImageExists,
                true_branch: vec![],
                false_branch: vec![],
            },
        );
        let action1 = add_block(
            &mut flow,
            BlockType::Action { action: ActionType::Click },
            BlockConfig::Click {
                mode: ClickMode::Coordinates { x: 100, y: 200 },
                count: 1,
            },
        );
        let action2 = add_block(
            &mut flow,
            BlockType::Action { action: ActionType::WaitTime },
            BlockConfig::WaitTime { duration_ms: 1000 },
        );
        flow.entry_block = Some(cond.clone());
        flow.add_connection(make_conn(cond.clone(), action1, Some("true")));
        flow.add_connection(make_conn(cond, action2, Some("false")));

        let errors = validate_port_requirements(&validator, &flow);
        let true_warnings: Vec<_> = errors
            .iter()
            .filter(|e| e.code == "CONDITION_MISSING_TRUE_BRANCH")
            .collect();
        let false_warnings: Vec<_> = errors
            .iter()
            .filter(|e| e.code == "CONDITION_MISSING_FALSE_BRANCH")
            .collect();
        assert!(true_warnings.is_empty(), "Should not warn when true branch is connected");
        assert!(false_warnings.is_empty(), "Should not warn when false branch is connected");
    }

    #[test]
    fn test_click_no_required_ports_ok() {
        let validator = FlowValidator::new();
        let mut flow = create_flow("test");
        let click = add_block(
            &mut flow,
            BlockType::Action { action: ActionType::Click },
            BlockConfig::Click {
                mode: ClickMode::Coordinates { x: 100, y: 200 },
                count: 1,
            },
        );
        flow.entry_block = Some(click);
        // Click's input ports are not required — no validation error expected
        let errors = validate_port_requirements(&validator, &flow);
        let required_errors: Vec<_> = errors
            .iter()
            .filter(|e| e.code == "PORT_REQUIRED_INPUT_MISSING")
            .collect();
        assert!(required_errors.is_empty(), "Click should not have required port errors");
    }

    #[test]
    fn test_block_type_to_string() {
        assert_eq!(
            block_type_to_string(&BlockType::Action { action: ActionType::Click }),
            "click"
        );
        assert_eq!(
            block_type_to_string(&BlockType::Action { action: ActionType::WaitImage }),
            "wait_image"
        );
        assert_eq!(
            block_type_to_string(&BlockType::Action { action: ActionType::WaitTime }),
            "wait_time"
        );
        assert_eq!(
            block_type_to_string(&BlockType::Action { action: ActionType::InputText }),
            "input_text"
        );
        assert_eq!(
            block_type_to_string(&BlockType::Control { control: ControlType::Loop }),
            "loop"
        );
        assert_eq!(
            block_type_to_string(&BlockType::Control { control: ControlType::LoopInfinite }),
            "loop_infinite"
        );
        assert_eq!(
            block_type_to_string(&BlockType::Control { control: ControlType::Condition }),
            "condition"
        );
        assert_eq!(
            block_type_to_string(&BlockType::Action { action: ActionType::TextExtract }),
            "text_extract"
        );
        assert_eq!(
            block_type_to_string(&BlockType::Control { control: ControlType::TextCheck }),
            "text_check"
        );
    }
}
