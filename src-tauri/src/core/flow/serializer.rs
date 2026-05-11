//! Flow serializer implementation
//!
//! This module provides JSON serialization/deserialization for flows:
//! - Flow to JSON serialization
//! - JSON to Flow deserialization
//! - Support for embedding image data or references
//!
//! Validates: Requirements 7.1, 7.2, 7.3

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};
use crate::models::block::{BlockConfig, ClickMode};
use crate::models::flow::Flow;
use crate::models::image::ImageId;

/// Flow serializer for JSON operations
pub struct FlowSerializer {
    /// Pretty print JSON output
    pretty: bool,
}

impl Default for FlowSerializer {
    fn default() -> Self {
        Self::new()
    }
}

impl FlowSerializer {
    /// Create a new flow serializer
    pub fn new() -> Self {
        Self { pretty: false }
    }
    
    /// Create a serializer that outputs pretty JSON
    pub fn pretty() -> Self {
        Self { pretty: true }
    }
    
    /// Serialize a flow to JSON string
    ///
    /// # Arguments
    /// * `flow` - The flow to serialize
    ///
    /// # Returns
    /// JSON string representation of the flow
    pub fn serialize(&self, flow: &Flow) -> Result<String> {
        let json = if self.pretty {
            serde_json::to_string_pretty(flow)
        } else {
            serde_json::to_string(flow)
        };
        
        json.map_err(|e| {
            AppError::SerializationError(e)
        })
    }
    
    /// Deserialize a flow from JSON string
    ///
    /// # Arguments
    /// * `json` - The JSON string to deserialize
    ///
    /// # Returns
    /// The deserialized flow
    pub fn deserialize(&self, json: &str) -> Result<Flow> {
        let flow: Flow = serde_json::from_str(json).map_err(|e| {
            AppError::SerializationError(e)
        })?;
        
        Ok(flow)
    }
    
    /// Serialize a flow to JSON value
    ///
    /// # Arguments
    /// * `flow` - The flow to serialize
    ///
    /// # Returns
    /// JSON value representation of the flow
    pub fn to_json_value(&self, flow: &Flow) -> Result<serde_json::Value> {
        serde_json::to_value(flow).map_err(|e| {
            AppError::SerializationError(e)
        })
    }
    
    /// Deserialize a flow from JSON value
    ///
    /// # Arguments
    /// * `value` - The JSON value to deserialize
    ///
    /// # Returns
    /// The deserialized flow
    pub fn from_json_value(&self, value: serde_json::Value) -> Result<Flow> {
        serde_json::from_value(value).map_err(|e| {
            AppError::SerializationError(e)
        })
    }
}

/// Export format options for flows
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExportFormat {
    /// Standard JSON format with image references
    Standard,
    /// Embedded format with base64 image data
    Embedded,
}

/// Flow export data with optional embedded images
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowExport {
    /// The flow data
    pub flow: Flow,
    /// Export format
    pub format: String,
    /// Embedded images (image_id -> base64 data)
    #[serde(skip_serializing_if = "HashMap::is_empty", default)]
    pub embedded_images: HashMap<String, String>,
    /// Version for compatibility checking
    pub version: String,
}

impl FlowExport {
    /// Current export format version
    pub const VERSION: &'static str = "1.0.0";
    
    /// Create a standard export (image references only)
    pub fn standard(flow: Flow) -> Self {
        Self {
            flow,
            format: "standard".to_string(),
            embedded_images: HashMap::new(),
            version: Self::VERSION.to_string(),
        }
    }
    
    /// Create an embedded export with image data
    pub fn embedded(flow: Flow, images: HashMap<String, String>) -> Self {
        Self {
            flow,
            format: "embedded".to_string(),
            embedded_images: images,
            version: Self::VERSION.to_string(),
        }
    }
}

/// Serializer for flow exports (with optional embedded images)
pub struct FlowExportSerializer {
    #[allow(dead_code)]
    serializer: FlowSerializer,
}

impl Default for FlowExportSerializer {
    fn default() -> Self {
        Self::new()
    }
}

impl FlowExportSerializer {
    /// Create a new flow export serializer
    pub fn new() -> Self {
        Self {
            serializer: FlowSerializer::new(),
        }
    }
    
    /// Serialize a flow export to JSON
    pub fn serialize(&self, export: &FlowExport) -> Result<String> {
        serde_json::to_string(export).map_err(|e| {
            AppError::SerializationError(e)
        })
    }
    
    /// Deserialize a flow export from JSON
    pub fn deserialize(&self, json: &str) -> Result<FlowExport> {
        serde_json::from_str(json).map_err(|e| {
            AppError::SerializationError(e)
        })
    }
    
    /// Extract image IDs referenced in a flow
    ///
    /// # Arguments
    /// * `flow` - The flow to analyze
    ///
    /// # Returns
    /// A set of image IDs referenced in the flow
    pub fn extract_image_references(flow: &Flow) -> Vec<ImageId> {
        let mut image_ids = Vec::new();
        
        for block in flow.blocks.values() {
            match &block.config {
                BlockConfig::Click { mode, .. } => {
                    if let ClickMode::Image { image_id } = mode {
                        image_ids.push(image_id.clone());
                    }
                }
                BlockConfig::WaitImage { image_id, .. } => {
                    image_ids.push(image_id.clone());
                }
                BlockConfig::Condition { image_id, .. } => {
                    image_ids.push(image_id.clone());
                }
                _ => {}
            }
        }
        
        // Deduplicate
        image_ids.sort_by(|a, b| a.0.cmp(&b.0));
        image_ids.dedup();
        
        image_ids
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::block::{ActionType, BlockId, BlockNode, BlockPosition, BlockType, ControlType};
    use crate::models::flow::Connection;
    use crate::models::image::ImageId;
    
    fn create_test_flow() -> Flow {
        let mut flow = Flow::new("Test Flow".to_string());
        flow.description = Some("A test flow for serialization".to_string());
        
        let block1 = BlockNode::new(
            BlockType::Action { action: ActionType::Click },
            BlockPosition::new(100.0, 200.0),
            BlockConfig::Click {
                mode: ClickMode::Coordinates { x: 10, y: 20 },
                count: 1,
            },
        );
        let block2 = BlockNode::new(
            BlockType::Action { action: ActionType::WaitTime },
            BlockPosition::new(300.0, 200.0),
            BlockConfig::WaitTime { duration_ms: 1000 },
        );
        
        let id1 = block1.id.clone();
        let id2 = block2.id.clone();
        
        flow.add_block(block1);
        flow.add_block(block2);
        flow.add_connection(Connection::new(id1, id2));
        
        flow
    }
    
    #[test]
    fn test_serialize_deserialize_flow() {
        let serializer = FlowSerializer::new();
        let flow = create_test_flow();
        let flow_id = flow.id.clone();
        
        let json = serializer.serialize(&flow).unwrap();
        let deserialized = serializer.deserialize(&json).unwrap();
        
        assert_eq!(deserialized.id, flow_id);
        assert_eq!(deserialized.name, "Test Flow");
        assert_eq!(deserialized.blocks.len(), 2);
        assert_eq!(deserialized.connections.len(), 1);
    }
    
    #[test]
    fn test_serialize_pretty() {
        let serializer = FlowSerializer::pretty();
        let flow = create_test_flow();
        
        let json = serializer.serialize(&flow).unwrap();
        
        // Pretty output should have newlines
        assert!(json.contains('\n'));
    }
    
    #[test]
    fn test_serialize_compact() {
        let serializer = FlowSerializer::new();
        let flow = create_test_flow();
        
        let json = serializer.serialize(&flow).unwrap();
        
        // Compact output should be single line (no newlines within the JSON structure)
        // Note: The JSON itself might have escaped newlines in string values, but not formatting newlines
        let lines: Vec<&str> = json.lines().collect();
        assert_eq!(lines.len(), 1);
    }
    
    #[test]
    fn test_deserialize_invalid_json() {
        let serializer = FlowSerializer::new();
        
        let result = serializer.deserialize("not valid json");
        assert!(result.is_err());
    }
    
    #[test]
    fn test_to_from_json_value() {
        let serializer = FlowSerializer::new();
        let flow = create_test_flow();
        
        let value = serializer.to_json_value(&flow).unwrap();
        let deserialized = serializer.from_json_value(value).unwrap();
        
        assert_eq!(deserialized.id, flow.id);
    }
    
    #[test]
    fn test_flow_export_standard() {
        let flow = create_test_flow();
        let export = FlowExport::standard(flow.clone());
        
        assert_eq!(export.format, "standard");
        assert!(export.embedded_images.is_empty());
        assert_eq!(export.version, FlowExport::VERSION);
    }
    
    #[test]
    fn test_flow_export_embedded() {
        let flow = create_test_flow();
        let mut images = HashMap::new();
        images.insert("image-id-1".to_string(), "base64data".to_string());
        
        let export = FlowExport::embedded(flow.clone(), images);
        
        assert_eq!(export.format, "embedded");
        assert_eq!(export.embedded_images.len(), 1);
    }
    
    #[test]
    fn test_flow_export_serializer() {
        let serializer = FlowExportSerializer::new();
        let flow = create_test_flow();
        let export = FlowExport::standard(flow);
        
        let json = serializer.serialize(&export).unwrap();
        let deserialized = serializer.deserialize(&json).unwrap();
        
        assert_eq!(deserialized.format, "standard");
        assert_eq!(deserialized.version, FlowExport::VERSION);
    }
    
    #[test]
    fn test_extract_image_references_empty() {
        let flow = Flow::new("No images".to_string());
        let refs = FlowExportSerializer::extract_image_references(&flow);
        assert!(refs.is_empty());
    }
    
    #[test]
    fn test_extract_image_references_with_images() {
        let mut flow = Flow::new("With images".to_string());
        
        let image_id = ImageId::new();
        let block = BlockNode::new(
            BlockType::Action { action: ActionType::WaitImage },
            BlockPosition::new(100.0, 100.0),
            BlockConfig::WaitImage {
                image_id: image_id.clone(),
                timeout_ms: Some(5000),
            },
        );
        flow.add_block(block);
        
        let refs = FlowExportSerializer::extract_image_references(&flow);
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0], image_id);
    }
    
    #[test]
    fn test_extract_image_references_dedup() {
        let mut flow = Flow::new("Multiple references".to_string());
        
        let image_id = ImageId::new();
        
        // Two blocks referencing the same image
        let block1 = BlockNode::new(
            BlockType::Action { action: ActionType::WaitImage },
            BlockPosition::new(100.0, 100.0),
            BlockConfig::WaitImage {
                image_id: image_id.clone(),
                timeout_ms: Some(5000),
            },
        );
        let block2 = BlockNode::new(
            BlockType::Action { action: ActionType::Click },
            BlockPosition::new(200.0, 100.0),
            BlockConfig::Click {
                mode: ClickMode::Image { image_id: image_id.clone() },
                count: 1,
            },
        );
        
        flow.add_block(block1);
        flow.add_block(block2);
        
        let refs = FlowExportSerializer::extract_image_references(&flow);
        // Should be deduplicated to 1
        assert_eq!(refs.len(), 1);
    }
    
    #[test]
    fn test_round_trip_preserves_all_data() {
        let serializer = FlowSerializer::new();
        
        let mut flow = Flow::new("Complex Flow".to_string());
        flow.description = Some("A more complex flow".to_string());
        
        // Add various block types
        let click_block = BlockNode::new(
            BlockType::Action { action: ActionType::Click },
            BlockPosition::new(100.0, 100.0),
            BlockConfig::Click {
                mode: ClickMode::Coordinates { x: 50, y: 100 },
                count: 2,
            },
        );
        let wait_block = BlockNode::new(
            BlockType::Action { action: ActionType::WaitTime },
            BlockPosition::new(200.0, 100.0),
            BlockConfig::WaitTime { duration_ms: 2000 },
        );
        let input_block = BlockNode::new(
            BlockType::Action { action: ActionType::InputText },
            BlockPosition::new(300.0, 100.0),
            BlockConfig::InputText {
                text: "Hello, World!".to_string(),
                interval_ms: Some(50),
            },
        );
        let loop_block = BlockNode::new(
            BlockType::Control { control: ControlType::Loop },
            BlockPosition::new(150.0, 200.0),
            BlockConfig::Loop { count: 5 },
        );
        
        let ids: Vec<BlockId> = vec![
            click_block.id.clone(),
            wait_block.id.clone(),
            input_block.id.clone(),
            loop_block.id.clone(),
        ];
        
        flow.add_block(click_block);
        flow.add_block(wait_block);
        flow.add_block(input_block);
        flow.add_block(loop_block);
        
        flow.add_connection(Connection::new(ids[0].clone(), ids[1].clone()));
        flow.add_connection(Connection::new(ids[1].clone(), ids[2].clone()));
        flow.add_connection(Connection::new(ids[2].clone(), ids[3].clone()));
        
        flow.set_entry_block(Some(ids[0].clone()));
        
        let json = serializer.serialize(&flow).unwrap();
        let deserialized = serializer.deserialize(&json).unwrap();
        
        // Verify all data preserved
        assert_eq!(deserialized.name, flow.name);
        assert_eq!(deserialized.description, flow.description);
        assert_eq!(deserialized.blocks.len(), 4);
        assert_eq!(deserialized.connections.len(), 3);
        assert_eq!(deserialized.entry_block, Some(ids[0].clone()));
    }
}
