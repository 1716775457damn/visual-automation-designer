//! Port system for block node connections
//!
//! Defines port schemas for each block type. Ports define typed inputs and outputs
//! that control how data flows between blocks in the execution graph.
//!
//! Each block type has a fixed set of input and output ports defined by PortSchema.
//! The frontend uses these schemas to render compatible handles and prevent invalid
//! connections. The runtime executor uses them to validate data before execution.
//!
//! Validates: Phase A — Port System

use serde::{Deserialize, Serialize};

/// Direction of a port — data flows from Output to Input
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PortDirection {
    Input,
    Output,
}

/// Data type allowed on a port
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PortType {
    /// Text strings
    String,
    /// Numeric values (u64/f64)
    Number,
    /// Boolean flags
    Boolean,
    /// Reference to an image in the image library
    ImageRef,
    /// Screen coordinate pair (x, y)
    Coordinate,
    /// Accept any type (for dynamic/generic ports)
    Any,
}

impl PortType {
    /// Returns true if a value of `self` can be connected to a port expecting `target`
    pub fn is_compatible_with(&self, target: &PortType) -> bool {
        if *self == PortType::Any || *target == PortType::Any {
            return true;
        }
        self == target
    }
}

/// Schema definition for a single port on a block node
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortSchema {
    /// Port identifier (unique within the block type, e.g. "image_ref", "timeout")
    pub name: String,
    /// Display label shown in the UI
    pub label: String,
    /// Data type for validation
    pub port_type: PortType,
    /// Input or Output
    pub direction: PortDirection,
    /// Human-readable description
    pub description: String,
    /// Whether this port must be connected (for inputs) or always produces a value (for outputs)
    #[serde(default)]
    pub required: bool,
    /// Optional default value (JSON-serialized)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<serde_json::Value>,
}

impl PortSchema {
    pub fn new(
        name: impl Into<String>,
        label: impl Into<String>,
        port_type: PortType,
        direction: PortDirection,
        description: impl Into<String>,
    ) -> Self {
        Self {
            name: name.into(),
            label: label.into(),
            port_type,
            direction,
            description: description.into(),
            required: false,
            default: None,
        }
    }

    pub fn required(mut self, required: bool) -> Self {
        self.required = required;
        self
    }

    pub fn default_value(mut self, default: serde_json::Value) -> Self {
        self.default = Some(default);
        self
    }
}

/// Port definitions for a single block type
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortDefinitions {
    /// Block type identifier (e.g. "click", "condition")
    pub block_type: String,
    /// Input ports
    pub inputs: Vec<PortSchema>,
    /// Output ports
    pub outputs: Vec<PortSchema>,
}

/// Runtime value carried on a port during execution
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PortValue {
    String(String),
    Number(f64),
    Boolean(bool),
    ImageRef(String),
    Coordinate { x: u32, y: u32 },
    /// Array of values (e.g. OCR returns multiple strings)
    Array(Vec<PortValue>),
    /// Null / unset
    Null,
}

// ── Port definitions for all block types ────────────────────────────

/// Returns the port definitions for all known block types
pub fn all_port_definitions() -> Vec<PortDefinitions> {
    vec![
        click_ports(),
        wait_image_ports(),
        wait_time_ports(),
        input_text_ports(),
        screenshot_ports(),
        loop_ports(),
        loop_infinite_ports(),
        condition_ports(),
        text_extract_ports(),
        text_check_ports(),
        screenshot_assert_ports(),
    ]
}

/// Look up port definitions for a specific block type string
pub fn port_definitions_for(block_type: &str) -> Option<PortDefinitions> {
    all_port_definitions().into_iter().find(|p| p.block_type == block_type)
}

fn click_ports() -> PortDefinitions {
    PortDefinitions {
        block_type: "click".to_string(),
        inputs: vec![
            PortSchema::new(
                "image_ref", "目标图片", PortType::ImageRef, PortDirection::Input,
                "点击目标的参考图片（与坐标模式二选一）",
            ).required(false),
            PortSchema::new(
                "coordinates", "屏幕坐标", PortType::Coordinate, PortDirection::Input,
                "精确点击坐标（与图片模式二选一）",
            ).required(false),
            PortSchema::new(
                "count", "点击次数", PortType::Number, PortDirection::Input,
                "点击次数，默认为 1",
            ).required(false).default_value(serde_json::json!(1)),
        ],
        outputs: vec![
            PortSchema::new(
                "result", "点击结果", PortType::Any, PortDirection::Output,
                "包含执行状态和实际点击坐标",
            ),
        ],
    }
}

fn wait_image_ports() -> PortDefinitions {
    PortDefinitions {
        block_type: "wait_image".to_string(),
        inputs: vec![
            PortSchema::new(
                "image_ref", "目标图片", PortType::ImageRef, PortDirection::Input,
                "等待出现的参考图片",
            ).required(true),
            PortSchema::new(
                "timeout", "超时(ms)", PortType::Number, PortDirection::Input,
                "最长等待时间（毫秒），默认 5000",
            ).required(false).default_value(serde_json::json!(5000)),
            PortSchema::new(
                "region", "搜索区域", PortType::Any, PortDirection::Input,
                "限制搜索区域 {x, y, width, height}，默认全屏",
            ).required(false),
        ],
        outputs: vec![
            PortSchema::new(
                "found", "是否找到", PortType::Boolean, PortDirection::Output,
                "true=图片出现，false=超时未出现",
            ).required(true),
            PortSchema::new(
                "match_position", "匹配位置", PortType::Coordinate, PortDirection::Output,
                "图片匹配到的屏幕坐标",
            ),
        ],
    }
}

fn wait_time_ports() -> PortDefinitions {
    PortDefinitions {
        block_type: "wait_time".to_string(),
        inputs: vec![
            PortSchema::new(
                "duration_ms", "等待时长(ms)", PortType::Number, PortDirection::Input,
                "等待的毫秒数",
            ).required(true).default_value(serde_json::json!(1000)),
        ],
        outputs: vec![],
    }
}

fn input_text_ports() -> PortDefinitions {
    PortDefinitions {
        block_type: "input_text".to_string(),
        inputs: vec![
            PortSchema::new(
                "text", "输入文本", PortType::String, PortDirection::Input,
                "要输入的文本内容",
            ).required(true),
            PortSchema::new(
                "interval_ms", "按键间隔(ms)", PortType::Number, PortDirection::Input,
                "每个字符之间的输入间隔",
            ).required(false).default_value(serde_json::json!(0)),
        ],
        outputs: vec![
            PortSchema::new(
                "result", "输入结果", PortType::Any, PortDirection::Output,
                "输入操作执行结果",
            ),
        ],
    }
}

fn screenshot_ports() -> PortDefinitions {
    PortDefinitions {
        block_type: "screenshot".to_string(),
        inputs: vec![
            PortSchema::new(
                "region", "截取区域", PortType::Any, PortDirection::Input,
                "截取区域 {x, y, width, height}，默认全屏",
            ).required(false),
            PortSchema::new(
                "name", "截图名称", PortType::String, PortDirection::Input,
                "保存截图的文件名标识",
            ).required(false),
        ],
        outputs: vec![
            PortSchema::new(
                "screenshot_ref", "截图引用", PortType::ImageRef, PortDirection::Output,
                "截图的引用标识，可供后续节点使用",
            ).required(true),
        ],
    }
}

fn loop_ports() -> PortDefinitions {
    PortDefinitions {
        block_type: "loop".to_string(),
        inputs: vec![
            PortSchema::new(
                "count", "循环次数", PortType::Number, PortDirection::Input,
                "循环执行的次数",
            ).required(true),
        ],
        outputs: vec![
            PortSchema::new(
                "iteration_index", "当前轮次", PortType::Number, PortDirection::Output,
                "当前执行的轮次（从 0 开始）",
            ).required(true),
        ],
    }
}

fn loop_infinite_ports() -> PortDefinitions {
    PortDefinitions {
        block_type: "loop_infinite".to_string(),
        inputs: vec![],
        outputs: vec![
            PortSchema::new(
                "iteration_index", "当前轮次", PortType::Number, PortDirection::Output,
                "当前执行的轮次（从 0 开始）",
            ).required(true),
        ],
    }
}

fn condition_ports() -> PortDefinitions {
    PortDefinitions {
        block_type: "condition".to_string(),
        inputs: vec![
            PortSchema::new(
                "image_ref", "判断图片", PortType::ImageRef, PortDirection::Input,
                "要判断是否出现的参考图片",
            ).required(true),
            PortSchema::new(
                "operator", "判断方式", PortType::String, PortDirection::Input,
                "image_exists=图片存在, image_not_exists=图片不存在",
            ).required(false).default_value(serde_json::json!("image_exists")),
        ],
        outputs: vec![
            PortSchema::new(
                "true", "真分支", PortType::Any, PortDirection::Output,
                "条件成立时执行的分支",
            ).required(true),
            PortSchema::new(
                "false", "假分支", PortType::Any, PortDirection::Output,
                "条件不成立时执行的分支",
            ).required(true),
        ],
    }
}

fn text_extract_ports() -> PortDefinitions {
    PortDefinitions {
        block_type: "text_extract".to_string(),
        inputs: vec![
            PortSchema::new(
                "image_ref", "目标图片", PortType::ImageRef, PortDirection::Input,
                "要识别文字的图片区域（可选，默认全屏）",
            ).required(false),
            PortSchema::new(
                "language", "语言代码", PortType::String, PortDirection::Input,
                "OCR 语言代码（如 zh-CN、en），留空则自动检测",
            ).required(false),
        ],
        outputs: vec![
            PortSchema::new(
                "text", "识别文字", PortType::String, PortDirection::Output,
                "OCR 识别出的文字内容",
            ).required(true),
        ],
    }
}

fn screenshot_assert_ports() -> PortDefinitions {
    PortDefinitions {
        block_type: "screenshot_assert".to_string(),
        inputs: vec![
            PortSchema::new(
                "image_ref", "参考图片", PortType::ImageRef, PortDirection::Input,
                "要比对的参考图片",
            ).required(true),
            PortSchema::new(
                "threshold", "差异阈值", PortType::Number, PortDirection::Input,
                "允许的差异比例 0.0~1.0（0=完全一致，1=忽略全部差异）",
            ).required(false).default_value(serde_json::json!(0.0)),
            PortSchema::new(
                "region", "比对区域", PortType::Any, PortDirection::Input,
                "限制比对区域 {x, y, width, height}，默认全屏",
            ).required(false),
        ],
        outputs: vec![
            PortSchema::new(
                "passed", "是否通过", PortType::Boolean, PortDirection::Output,
                "true=图片一致（差异在阈值内），false=差异超阈值",
            ).required(true),
            PortSchema::new(
                "diff_image_ref", "差异图引用", PortType::ImageRef, PortDirection::Output,
                "差异热力图的引用标识，仅在差异 > 0 时有值",
            ).required(false),
            PortSchema::new(
                "diff_percentage", "差异比例", PortType::Number, PortDirection::Output,
                "实际像素差异比例 0.0~1.0",
            ).required(true),
        ],
    }
}

fn text_check_ports() -> PortDefinitions {
    PortDefinitions {
        block_type: "text_check".to_string(),
        inputs: vec![
            PortSchema::new(
                "image_ref", "目标图片", PortType::ImageRef, PortDirection::Input,
                "要检测文字的图片区域",
            ).required(true),
            PortSchema::new(
                "keyword", "关键字", PortType::String, PortDirection::Input,
                "要搜索的关键字（不区分大小写，部分匹配）",
            ).required(true),
        ],
        outputs: vec![
            PortSchema::new(
                "true", "真分支", PortType::Any, PortDirection::Output,
                "关键字存在时执行的分支",
            ).required(true),
            PortSchema::new(
                "false", "假分支", PortType::Any, PortDirection::Output,
                "关键字不存在时执行的分支",
            ).required(true),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_all_block_types_have_port_definitions() {
        let defs = all_port_definitions();
        // Should have at least the 11 known types (incl. screenshot_assert)
        assert!(defs.len() >= 11, "Expected >=11 port definitions, got {}", defs.len());
    }

    #[test]
    fn test_click_has_inputs() {
        let defs = port_definitions_for("click").unwrap();
        assert!(!defs.inputs.is_empty(), "Click should have input ports");
        assert!(defs.inputs.iter().any(|p| p.name == "image_ref"));
        assert!(defs.inputs.iter().any(|p| p.name == "coordinates"));
    }

    #[test]
    fn test_condition_has_outputs() {
        let defs = port_definitions_for("condition").unwrap();
        assert!(defs.outputs.iter().any(|p| p.name == "true"), "condition should have 'true' output");
        assert!(defs.outputs.iter().any(|p| p.name == "false"), "condition should have 'false' output");
    }

    #[test]
    fn test_wait_image_required_ports() {
        let defs = port_definitions_for("wait_image").unwrap();
        let image_ref = defs.inputs.iter().find(|p| p.name == "image_ref").unwrap();
        assert!(image_ref.required, "image_ref should be required");
    }

    #[test]
    fn test_port_type_compatibility() {
        assert!(PortType::String.is_compatible_with(&PortType::String));
        assert!(PortType::Number.is_compatible_with(&PortType::Any));
        assert!(PortType::Any.is_compatible_with(&PortType::ImageRef));
        assert!(!PortType::Number.is_compatible_with(&PortType::String));
        assert!(!PortType::Boolean.is_compatible_with(&PortType::Coordinate));
    }

    #[test]
    fn test_loop_has_count_input() {
        let defs = port_definitions_for("loop").unwrap();
        assert!(defs.inputs.iter().any(|p| p.name == "count" && p.required));
    }

    #[test]
    fn test_screenshot_has_output() {
        let defs = port_definitions_for("screenshot").unwrap();
        assert!(defs.outputs.iter().any(|p| p.name == "screenshot_ref"));
    }
}
