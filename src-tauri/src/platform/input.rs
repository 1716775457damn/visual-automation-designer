//! Input controller module
//!
//! This module provides mouse and keyboard input simulation.
//!
//! Validates: Requirements 6.5, 6.6

use std::thread;
use std::time::Duration;

use enigo::{Button, Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings};

use crate::error::{AppError, Result};

/// Mouse button types
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

impl From<MouseButton> for Button {
    fn from(button: MouseButton) -> Self {
        match button {
            MouseButton::Left => Button::Left,
            MouseButton::Right => Button::Right,
            MouseButton::Middle => Button::Middle,
        }
    }
}

/// Key modifiers
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyModifier {
    Shift,
    Ctrl,
    Alt,
    Meta,
}

/// Input controller for mouse and keyboard operations
pub struct InputController {
    enigo: Enigo,
    /// Default click interval in milliseconds
    click_interval_ms: u64,
    /// Default key press interval in milliseconds
    key_interval_ms: u64,
}

impl Default for InputController {
    fn default() -> Self {
        Self::new().expect("InputController::default requires a valid input backend")
    }
}

impl InputController {
    /// Create a new input controller
    pub fn new() -> Result<Self> {
        let enigo = Enigo::new(&Settings::default())
            .map_err(|e| AppError::ExecutionFailed(format!("Failed to initialize input controller: {:?}", e)))?;

        Ok(Self {
            enigo,
            click_interval_ms: 50,
            key_interval_ms: 10,
        })
    }

    /// Create an input controller with custom intervals
    pub fn with_intervals(click_interval_ms: u64, key_interval_ms: u64) -> Result<Self> {
        let mut controller = Self::new()?;
        controller.click_interval_ms = click_interval_ms;
        controller.key_interval_ms = key_interval_ms;
        Ok(controller)
    }

    // ========================================================================
    // Mouse Operations
    // ========================================================================

    /// Move mouse to absolute coordinates
    ///
    /// # Arguments
    /// * `x` - X coordinate
    /// * `y` - Y coordinate
    pub fn move_to(&mut self, x: u32, y: u32) -> Result<()> {
        self.enigo
            .move_mouse(x as i32, y as i32, Coordinate::Abs)
            .map_err(|e| {
                AppError::ExecutionFailed(format!("Failed to move mouse: {:?}", e))
            })?;
        Ok(())
    }

    /// Move mouse by relative offset
    ///
    /// # Arguments
    /// * `dx` - X offset
    /// * `dy` - Y offset
    pub fn move_by(&mut self, dx: i32, dy: i32) -> Result<()> {
        self.enigo
            .move_mouse(dx, dy, Coordinate::Rel)
            .map_err(|e| {
                AppError::ExecutionFailed(format!("Failed to move mouse: {:?}", e))
            })?;
        Ok(())
    }

    /// Perform a single click at current position
    ///
    /// # Arguments
    /// * `button` - Mouse button to click
    pub fn click(&mut self, button: MouseButton) -> Result<()> {
        self.mouse_down(button)?;
        thread::sleep(Duration::from_millis(self.click_interval_ms));
        self.mouse_up(button)?;
        Ok(())
    }

    /// Perform a click at specific coordinates
    ///
    /// # Arguments
    /// * `x` - X coordinate
    /// * `y` - Y coordinate
    /// * `button` - Mouse button to click
    pub fn click_at(&mut self, x: u32, y: u32, button: MouseButton) -> Result<()> {
        self.move_to(x, y)?;
        thread::sleep(Duration::from_millis(self.click_interval_ms));
        self.click(button)?;
        Ok(())
    }

    /// Perform a double click at current position
    ///
    /// # Arguments
    /// * `button` - Mouse button to click
    pub fn double_click(&mut self, button: MouseButton) -> Result<()> {
        self.click(button)?;
        thread::sleep(Duration::from_millis(self.click_interval_ms));
        self.click(button)?;
        Ok(())
    }

    /// Perform a double click at specific coordinates
    ///
    /// # Arguments
    /// * `x` - X coordinate
    /// * `y` - Y coordinate
    /// * `button` - Mouse button to click
    pub fn double_click_at(&mut self, x: u32, y: u32, button: MouseButton) -> Result<()> {
        self.move_to(x, y)?;
        thread::sleep(Duration::from_millis(self.click_interval_ms));
        self.double_click(button)?;
        Ok(())
    }

    /// Press mouse button down (without releasing)
    ///
    /// # Arguments
    /// * `button` - Mouse button to press
    pub fn mouse_down(&mut self, button: MouseButton) -> Result<()> {
        self.enigo.button(button.into(), Direction::Press).map_err(|e| {
            AppError::ExecutionFailed(format!("Failed to press mouse button: {:?}", e))
        })?;
        Ok(())
    }

    /// Release mouse button
    ///
    /// # Arguments
    /// * `button` - Mouse button to release
    pub fn mouse_up(&mut self, button: MouseButton) -> Result<()> {
        self.enigo.button(button.into(), Direction::Release).map_err(|e| {
            AppError::ExecutionFailed(format!("Failed to release mouse button: {:?}", e))
        })?;
        Ok(())
    }

    /// Scroll mouse wheel
    ///
    /// # Arguments
    /// * `amount` - Scroll amount (positive = up, negative = down)
    pub fn scroll(&mut self, amount: i32) -> Result<()> {
        // Use mouse scroll with button
        let direction = if amount > 0 {
            Button::ScrollUp
        } else {
            Button::ScrollDown
        };
        
        for _ in 0..amount.abs() {
            self.enigo.button(direction, Direction::Click).map_err(|e| {
                AppError::ExecutionFailed(format!("Failed to scroll: {:?}", e))
            })?;
        }
        Ok(())
    }

    // ========================================================================
    // Keyboard Operations
    // ========================================================================

    /// Type text character by character
    ///
    /// # Arguments
    /// * `text` - Text to type
    pub fn type_text(&mut self, text: &str) -> Result<()> {
        for c in text.chars() {
            self.enigo.text(&c.to_string()).map_err(|e| {
                AppError::ExecutionFailed(format!("Failed to type character: {:?}", e))
            })?;
            thread::sleep(Duration::from_millis(self.key_interval_ms));
        }
        Ok(())
    }

    /// Type text with custom interval
    ///
    /// # Arguments
    /// * `text` - Text to type
    /// * `interval_ms` - Interval between keystrokes in milliseconds
    pub fn type_text_with_interval(&mut self, text: &str, interval_ms: u64) -> Result<()> {
        for c in text.chars() {
            self.enigo.text(&c.to_string()).map_err(|e| {
                AppError::ExecutionFailed(format!("Failed to type character: {:?}", e))
            })?;
            thread::sleep(Duration::from_millis(interval_ms));
        }
        Ok(())
    }

    /// Press a key
    ///
    /// # Arguments
    /// * `key` - Key to press (as string, e.g., "Enter", "Tab", "Escape")
    pub fn key_press(&mut self, key: &str) -> Result<()> {
        let key_code = self.parse_key(key)?;
        self.enigo.key(key_code, Direction::Click).map_err(|e| {
            AppError::ExecutionFailed(format!("Failed to press key: {:?}", e))
        })?;
        Ok(())
    }

    /// Press key down (without releasing)
    ///
    /// # Arguments
    /// * `key` - Key to press
    pub fn key_down(&mut self, key: &str) -> Result<()> {
        let key_code = self.parse_key(key)?;
        self.enigo.key(key_code, Direction::Press).map_err(|e| {
            AppError::ExecutionFailed(format!("Failed to press key down: {:?}", e))
        })?;
        Ok(())
    }

    /// Release key
    ///
    /// # Arguments
    /// * `key` - Key to release
    pub fn key_up(&mut self, key: &str) -> Result<()> {
        let key_code = self.parse_key(key)?;
        self.enigo.key(key_code, Direction::Release).map_err(|e| {
            AppError::ExecutionFailed(format!("Failed to release key: {:?}", e))
        })?;
        Ok(())
    }

    /// Press a key combination (e.g., Ctrl+C)
    ///
    /// # Arguments
    /// * `modifiers` - Modifier keys to hold
    /// * `key` - Main key to press
    pub fn key_combination(&mut self, modifiers: &[KeyModifier], key: &str) -> Result<()> {
        // Press modifiers
        for modifier in modifiers {
            let modifier_key = self.modifier_to_key(*modifier);
            self.enigo.key(modifier_key, Direction::Press).map_err(|e| {
                AppError::ExecutionFailed(format!("Failed to press modifier: {:?}", e))
            })?;
        }

        thread::sleep(Duration::from_millis(self.key_interval_ms));

        // Press main key
        let key_code = self.parse_key(key)?;
        self.enigo.key(key_code, Direction::Click).map_err(|e| {
            AppError::ExecutionFailed(format!("Failed to press key: {:?}", e))
        })?;

        thread::sleep(Duration::from_millis(self.key_interval_ms));

        // Release modifiers
        for modifier in modifiers {
            let modifier_key = self.modifier_to_key(*modifier);
            self.enigo.key(modifier_key, Direction::Release).map_err(|e| {
                AppError::ExecutionFailed(format!("Failed to release modifier: {:?}", e))
            })?;
        }

        Ok(())
    }

    /// Parse a key string to a Key enum
    fn parse_key(&self, key: &str) -> Result<Key> {
        match key.to_lowercase().as_str() {
            "enter" | "return" => Ok(Key::Return),
            "tab" => Ok(Key::Tab),
            "space" => Ok(Key::Space),
            "escape" | "esc" => Ok(Key::Escape),
            "backspace" => Ok(Key::Backspace),
            "delete" | "del" => Ok(Key::Delete),
            "insert" => Ok(Key::Unicode('\u{2380}')),
            "home" => Ok(Key::Home),
            "end" => Ok(Key::End),
            "pageup" | "page_up" => Ok(Key::PageUp),
            "pagedown" | "page_down" => Ok(Key::PageDown),
            "arrow_up" | "up" => Ok(Key::UpArrow),
            "arrow_down" | "down" => Ok(Key::DownArrow),
            "arrow_left" | "left" => Ok(Key::LeftArrow),
            "arrow_right" | "right" => Ok(Key::RightArrow),
            "f1" => Ok(Key::F1),
            "f2" => Ok(Key::F2),
            "f3" => Ok(Key::F3),
            "f4" => Ok(Key::F4),
            "f5" => Ok(Key::F5),
            "f6" => Ok(Key::F6),
            "f7" => Ok(Key::F7),
            "f8" => Ok(Key::F8),
            "f9" => Ok(Key::F9),
            "f10" => Ok(Key::F10),
            "f11" => Ok(Key::F11),
            "f12" => Ok(Key::F12),
            s if s.len() == 1 => {
                let c = s.chars().next().unwrap();
                if c.is_ascii_alphabetic() {
                    Ok(Key::Unicode(c))
                } else if c.is_ascii_digit() {
                    Ok(Key::Unicode(c))
                } else {
                    Ok(Key::Unicode(c))
                }
            }
            _ => Err(AppError::ExecutionFailed(format!("Unknown key: {}", key))),
        }
    }

    /// Convert KeyModifier to Key
    fn modifier_to_key(&self, modifier: KeyModifier) -> Key {
        match modifier {
            KeyModifier::Shift => Key::Shift,
            KeyModifier::Ctrl => Key::Control,
            KeyModifier::Alt => Key::Alt,
            KeyModifier::Meta => Key::Meta,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_input_controller_creation() {
        // This test may fail in CI environments without display
        // but should work on a local machine
        if let Ok(_controller) = Enigo::new(&Settings::default()) {
            let controller = InputController::new();
            assert_eq!(controller.click_interval_ms, 50);
            assert_eq!(controller.key_interval_ms, 10);
        }
    }

    #[test]
    fn test_mouse_button_conversion() {
        assert_eq!(Button::from(MouseButton::Left), Button::Left);
        assert_eq!(Button::from(MouseButton::Right), Button::Right);
        assert_eq!(Button::from(MouseButton::Middle), Button::Middle);
    }

    #[test]
    fn test_parse_key() {
        let controller = InputController::new();
        
        assert!(matches!(controller.parse_key("Enter"), Ok(Key::Return)));
        assert!(matches!(controller.parse_key("Tab"), Ok(Key::Tab)));
        assert!(matches!(controller.parse_key("Space"), Ok(Key::Space)));
        assert!(matches!(controller.parse_key("Escape"), Ok(Key::Escape)));
        assert!(matches!(controller.parse_key("a"), Ok(Key::Unicode('a'))));
        assert!(matches!(controller.parse_key("F1"), Ok(Key::F1)));
    }
}
