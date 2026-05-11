//! Screen capture module
//!
//! This module provides screen capture functionality for taking screenshots.
//!
//! Validates: Requirements 6.1

use image::{DynamicImage, ImageBuffer, Rgba};
use screenshots::Screen;

use crate::error::{AppError, Result};

/// Result of a screen capture operation
#[derive(Debug, Clone)]
pub struct CaptureResult {
    /// The captured image
    pub image: DynamicImage,
    /// Width of the captured region
    pub width: u32,
    /// Height of the captured region
    pub height: u32,
}

/// Screen capture utility
pub struct ScreenCapture {
    /// Screen index to capture from (0 = primary)
    screen_index: usize,
}

impl Default for ScreenCapture {
    fn default() -> Self {
        Self::new()
    }
}

impl ScreenCapture {
    /// Create a new screen capture instance
    pub fn new() -> Self {
        Self { screen_index: 0 }
    }

    /// Create a screen capture for a specific screen
    pub fn with_screen(screen_index: usize) -> Self {
        Self { screen_index }
    }

    /// Get the number of available screens
    pub fn screen_count() -> Result<usize> {
        let screens = Screen::all().map_err(|e| {
            AppError::InternalError(format!("Failed to enumerate screens: {}", e))
        })?;
        Ok(screens.len())
    }

    /// Get screen dimensions
    pub fn screen_dimensions(&self) -> Result<(u32, u32)> {
        let screens = Screen::all().map_err(|e| {
            AppError::InternalError(format!("Failed to enumerate screens: {}", e))
        })?;

        let screen = screens.get(self.screen_index).ok_or_else(|| {
            AppError::InternalError(format!("Screen {} not found", self.screen_index))
        })?;

        Ok((screen.display_info.width, screen.display_info.height))
    }

    /// Capture the entire screen
    pub fn capture_screen(&self) -> Result<CaptureResult> {
        let screens = Screen::all().map_err(|e| {
            AppError::InternalError(format!("Failed to enumerate screens: {}", e))
        })?;

        let screen = screens.get(self.screen_index).ok_or_else(|| {
            AppError::InternalError(format!("Screen {} not found", self.screen_index))
        })?;

        let image = screen.capture().map_err(|e| {
            AppError::InternalError(format!("Failed to capture screen: {}", e))
        })?;

        let width = image.width();
        let height = image.height();

        // Convert image::RgbaImage to DynamicImage
        let dynamic_image = DynamicImage::ImageRgba8(image);

        Ok(CaptureResult {
            image: dynamic_image,
            width,
            height,
        })
    }

    /// Capture a specific region of the screen
    ///
    /// # Arguments
    /// * `x` - X coordinate of the region's top-left corner
    /// * `y` - Y coordinate of the region's top-left corner
    /// * `width` - Width of the region
    /// * `height` - Height of the region
    pub fn capture_region(&self, x: i32, y: i32, width: u32, height: u32) -> Result<CaptureResult> {
        let screens = Screen::all().map_err(|e| {
            AppError::InternalError(format!("Failed to enumerate screens: {}", e))
        })?;

        let screen = screens.get(self.screen_index).ok_or_else(|| {
            AppError::InternalError(format!("Screen {} not found", self.screen_index))
        })?;

        // Capture the entire screen first
        let full_image = screen.capture().map_err(|e| {
            AppError::InternalError(format!("Failed to capture screen: {}", e))
        })?;

        // Crop to the requested region
        let cropped = self.crop_image(&full_image, x, y, width, height)?;

        Ok(CaptureResult {
            image: DynamicImage::ImageRgba8(cropped),
            width,
            height,
        })
    }

    /// Crop an image to a specific region
    fn crop_image(
        &self,
        image: &ImageBuffer<Rgba<u8>, Vec<u8>>,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    ) -> Result<ImageBuffer<Rgba<u8>, Vec<u8>>> {
        // Clamp coordinates to image bounds
        let img_width = image.width() as i32;
        let img_height = image.height() as i32;

        let start_x = x.clamp(0, img_width - 1) as u32;
        let start_y = y.clamp(0, img_height - 1) as u32;
        let end_x = (x + width as i32).clamp(0, img_width) as u32;
        let end_y = (y + height as i32).clamp(0, img_height) as u32;

        let actual_width = end_x.saturating_sub(start_x);
        let actual_height = end_y.saturating_sub(start_y);

        if actual_width == 0 || actual_height == 0 {
            return Err(AppError::InternalError(
                "Invalid capture region: resulting size is zero".to_string(),
            ));
        }

        // Create a new image buffer for the cropped region
        let mut cropped = ImageBuffer::new(actual_width, actual_height);

        for (py, row) in image.enumerate_rows() {
            if py < start_y || py >= end_y {
                continue;
            }
            for (px, _, pixel) in row {
                if px < start_x || px >= end_x {
                    continue;
                }
                cropped.put_pixel(px - start_x, py - start_y, *pixel);
            }
        }

        Ok(cropped)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_screen_capture_creation() {
        let capture = ScreenCapture::new();
        assert_eq!(capture.screen_index, 0);
    }

    #[test]
    fn test_screen_capture_with_screen() {
        let capture = ScreenCapture::with_screen(1);
        assert_eq!(capture.screen_index, 1);
    }

    #[test]
    fn test_screen_count() {
        // Should have at least one screen
        let count = ScreenCapture::screen_count().unwrap();
        assert!(count >= 1);
    }

    // Note: capture_screen() and capture_region() tests would require
    // an actual display and are better suited for integration tests
}
