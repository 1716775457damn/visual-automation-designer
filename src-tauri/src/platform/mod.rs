//! Platform abstraction layer
//! 
//! This module provides cross-platform abstractions for:
//! - Screen capture
//! - Mouse and keyboard input simulation
//!
//! Validates: Requirements 6.1, 6.5, 6.6

pub mod screen;
pub mod input;

// Re-export platform types
pub use screen::{ScreenCapture, CaptureResult, MonitorInfo};
pub use input::{InputController, MouseButton, KeyModifier};
