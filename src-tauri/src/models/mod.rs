//! Data models for the Visual Automation Designer
//! 
//! This module defines the core data structures used throughout
//! the application for blocks, flows, and images.

pub mod block;
pub mod flow;
pub mod image;

// Re-export model types for convenience
pub use block::{BlockId, BlockType, ActionType, ControlType, BlockConfig, BlockNode, BlockPosition, ClickMode, ConditionOp};
pub use flow::{FlowId, ConnectionId, Connection, Flow, FlowMetadata};
pub use image::{ImageId, ImageMetadata, ImageFormat, ImageLibrary};
