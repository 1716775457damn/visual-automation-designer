//! Screen capture module
//!
//! This module provides screen capture functionality for taking screenshots,
//! monitor enumeration, multi-monitor coordinate translation,
//! and DPI scaling support.
//!
//! Validates: Requirements 6.1

use image::{DynamicImage, ImageBuffer, Rgba};
use screenshots::Screen;
use tauri::AppHandle;

use crate::error::{AppError, Result};

/// Information about a single monitor/display
#[derive(Debug, Clone)]
pub struct MonitorInfo {
    /// Zero-based monitor index
    pub index: usize,
    /// Virtual desktop X coordinate (may be negative on some setups)
    pub x: i32,
    /// Virtual desktop Y coordinate (may be negative on some setups)
    pub y: i32,
    /// Width of the monitor in physical pixels
    pub width: u32,
    /// Height of the monitor in physical pixels
    pub height: u32,
    /// Display ID from the screenshots crate
    pub display_id: u32,
    /// DPI scale factor (1.0 = 100%, 1.5 = 150%, 2.0 = 200%).
    /// Defaults to 1.0 when unavailable from the platform crate.
    pub scale_factor: f32,
}

impl MonitorInfo {
    /// Check if a virtual desktop coordinate falls within this monitor
    pub fn contains(&self, vx: i32, vy: i32) -> bool {
        vx >= self.x
            && vx < self.x + self.width as i32
            && vy >= self.y
            && vy < self.y + self.height as i32
    }

    /// Convert a virtual desktop coordinate to this monitor's local coordinate
    pub fn virtual_to_local(&self, vx: i32, vy: i32) -> (i32, i32) {
        (vx - self.x, vy - self.y)
    }

    /// Convert a local monitor coordinate to a virtual desktop coordinate
    pub fn local_to_virtual(&self, lx: i32, ly: i32) -> (i32, i32) {
        (lx + self.x, ly + self.y)
    }

    /// Scale a logical (CSS) pixel coordinate to a physical pixel coordinate
    pub fn logical_to_physical(&self, lx: f64, ly: f64) -> (i32, i32) {
        (
            (lx * self.scale_factor as f64).round() as i32,
            (ly * self.scale_factor as f64).round() as i32,
        )
    }

    /// Scale a physical pixel coordinate to a logical (CSS) pixel coordinate
    pub fn physical_to_logical(&self, px: i32, py: i32) -> (f64, f64) {
        (
            px as f64 / self.scale_factor as f64,
            py as f64 / self.scale_factor as f64,
        )
    }
}

/// Result of a screen capture operation
#[derive(Debug, Clone)]
pub struct CaptureResult {
    /// The captured image
    pub image: DynamicImage,
    /// Width of the captured region
    pub width: u32,
    /// Height of the captured region
    pub height: u32,
    /// Which monitor the capture came from
    pub monitor_index: usize,
    /// Virtual desktop X coordinate of the capture origin
    pub origin_x: i32,
    /// Virtual desktop Y coordinate of the capture origin
    pub origin_y: i32,
}

/// Screen capture utility with multi-monitor support
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
    /// Create a new screen capture instance for the primary monitor
    pub fn new() -> Self {
        Self { screen_index: 0 }
    }

    /// Create a screen capture for a specific screen
    pub fn with_screen(screen_index: usize) -> Self {
        Self { screen_index }
    }

    // ========================================================================
    // Monitor Enumeration
    // ========================================================================

    /// Enumerate all available monitors with their virtual desktop coordinates
    pub fn list_monitors() -> Result<Vec<MonitorInfo>> {
        let screens = Screen::all().map_err(|e| {
            AppError::InternalError(format!("Failed to enumerate screens: {}", e))
        })?;

        Ok(screens
            .iter()
            .enumerate()
            .map(|(i, s)| MonitorInfo {
                index: i,
                x: s.display_info.x,
                y: s.display_info.y,
                width: s.display_info.width,
                height: s.display_info.height,
                display_id: s.display_info.id,
                scale_factor: 1.0, // screenshots v0.8 does not expose scale_factor per-monitor
            })
            .collect())
    }

    /// Enumerate all monitors with real DPI scale factors by bridging
    /// `screenshots::Screen` positions with `tauri::Monitor` scale factors.
    ///
    /// This method matches monitors by their top-left corner position (`x`, `y`)
    /// across the two APIs. The `screenshots` crate provides reliable dimensions,
    /// while `tauri::Monitor` provides the `scale_factor()` that varies per display.
    ///
    /// Falls back to `scale_factor: 1.0` for any monitor that cannot be matched.
    pub fn list_monitors_with_tauri(app_handle: &AppHandle) -> Result<Vec<MonitorInfo>> {
        let screenshots_screens = Screen::all().map_err(|e| {
            AppError::InternalError(format!("Failed to enumerate screenshots screens: {}", e))
        })?;

        let tauri_monitors = app_handle.available_monitors().map_err(|e| {
            AppError::InternalError(format!("Failed to enumerate Tauri monitors: {}", e))
        })?;

        let monitors: Vec<MonitorInfo> = screenshots_screens
            .iter()
            .enumerate()
            .map(|(i, screen)| {
                let sx = screen.display_info.x;
                let sy = screen.display_info.y;

                // Match by position (top-left corner)
                let scale_factor = tauri_monitors
                    .iter()
                    .find(|tm| {
                        let pos = tm.position();
                        pos.x == sx && pos.y == sy
                    })
                    .map(|tm| tm.scale_factor() as f32)
                    .unwrap_or(1.0);

                MonitorInfo {
                    index: i,
                    x: sx,
                    y: sy,
                    width: screen.display_info.width,
                    height: screen.display_info.height,
                    display_id: screen.display_info.id,
                    scale_factor,
                }
            })
            .collect();

        Ok(monitors)
    }

    /// Find which monitor contains the given virtual desktop coordinate
    pub fn monitor_at(vx: i32, vy: i32) -> Result<Option<MonitorInfo>> {
        let monitors = Self::list_monitors()?;
        Ok(monitors.into_iter().find(|m| m.contains(vx, vy)))
    }

    /// Get the number of available screens
    pub fn screen_count() -> Result<usize> {
        let screens = Screen::all().map_err(|e| {
            AppError::InternalError(format!("Failed to enumerate screens: {}", e))
        })?;
        Ok(screens.len())
    }

    /// Get screen dimensions for the configured screen index
    pub fn screen_dimensions(&self) -> Result<(u32, u32)> {
        let screens = Screen::all().map_err(|e| {
            AppError::InternalError(format!("Failed to enumerate screens: {}", e))
        })?;

        let screen = screens.get(self.screen_index).ok_or_else(|| {
            AppError::InternalError(format!("Screen {} not found", self.screen_index))
        })?;

        Ok((screen.display_info.width, screen.display_info.height))
    }

    // ========================================================================
    // Screen Capture
    // ========================================================================

    /// Capture the entire configured screen
    pub fn capture_screen(&self) -> Result<CaptureResult> {
        let all_screens = Screen::all().map_err(|e| {
            AppError::InternalError(format!("Failed to enumerate screens: {}", e))
        })?;

        let screen = all_screens.get(self.screen_index).ok_or_else(|| {
            AppError::InternalError(format!("Screen {} not found", self.screen_index))
        })?;

        let image = screen.capture().map_err(|e| {
            AppError::InternalError(format!("Failed to capture screen: {}", e))
        })?;

        let width = image.width();
        let height = image.height();

        Ok(CaptureResult {
            image: DynamicImage::ImageRgba8(image),
            width,
            height,
            monitor_index: self.screen_index,
            origin_x: screen.display_info.x,
            origin_y: screen.display_info.y,
        })
    }

    /// Capture the entire virtual desktop (all monitors stitched together)
    ///
    /// Returns a single image containing all visible monitors.
    /// The image is padded to cover the full virtual desktop bounding box.
    pub fn capture_virtual_desktop() -> Result<CaptureResult> {
        let monitors = Self::list_monitors()?;
        if monitors.is_empty() {
            return Err(AppError::InternalError(
                "No monitors found".to_string(),
            ));
        }

        // Compute the bounding box of the virtual desktop
        let min_x = monitors.iter().map(|m| m.x).min().unwrap_or(0);
        let min_y = monitors.iter().map(|m| m.y).min().unwrap_or(0);
        let max_x = monitors
            .iter()
            .map(|m| m.x + m.width as i32)
            .max()
            .unwrap_or(0);
        let max_y = monitors
            .iter()
            .map(|m| m.y + m.height as i32)
            .max()
            .unwrap_or(0);
        let vd_width = (max_x - min_x) as u32;
        let vd_height = (max_y - min_y) as u32;

        // Create a black canvas for the virtual desktop
        let mut canvas = ImageBuffer::new(vd_width, vd_height);

        // Capture each monitor and blit onto the canvas at the correct offset
        let all_screens = Screen::all().map_err(|e| {
            AppError::InternalError(format!("Failed to enumerate screens: {}", e))
        })?;

        for (i, screen) in all_screens.iter().enumerate() {
            let capture = screen.capture().map_err(|e| {
                AppError::InternalError(format!("Failed to capture screen {}: {}", i, e))
            })?;

            let offset_x = (screen.display_info.x - min_x) as u32;
            let offset_y = (screen.display_info.y - min_y) as u32;

            for (py, row) in capture.enumerate_rows() {
                let canvas_y = py + offset_y;
                if canvas_y >= vd_height {
                    continue;
                }
                for (px, _, pixel) in row {
                    let canvas_x = px + offset_x;
                    if canvas_x >= vd_width {
                        continue;
                    }
                    canvas.put_pixel(canvas_x, canvas_y, *pixel);
                }
            }
        }

        Ok(CaptureResult {
            image: DynamicImage::ImageRgba8(canvas),
            width: vd_width,
            height: vd_height,
            monitor_index: 0,
            origin_x: min_x,
            origin_y: min_y,
        })
    }

    /// Capture a specific region in virtual desktop coordinates.
    ///
    /// Automatically identifies which monitor the region lies on
    /// and adjusts capture coordinates accordingly.
    ///
    /// # Arguments
    /// * `vx` - Virtual desktop X coordinate of the region's top-left corner
    /// * `vy` - Virtual desktop Y coordinate of the region's top-left corner
    /// * `width` - Width of the region
    /// * `height` - Height of the region
    pub fn capture_virtual_region(
        vx: i32,
        vy: i32,
        width: u32,
        height: u32,
    ) -> Result<CaptureResult> {
        let monitors = Self::list_monitors()?;

        // Find which monitor contains the region's top-left corner
        let target_monitor = monitors.iter().find(|m| m.contains(vx, vy));
        let fallback_monitor = monitors.first();

        let monitor = target_monitor.or(fallback_monitor).ok_or_else(|| {
            AppError::InternalError("No monitors available".to_string())
        })?;

        let all_screens = Screen::all().map_err(|e| {
            AppError::InternalError(format!("Failed to enumerate screens: {}", e))
        })?;

        let screen = all_screens.get(monitor.index).ok_or_else(|| {
            AppError::InternalError(format!("Screen {} not found", monitor.index))
        })?;

        // Convert virtual desktop coordinates to monitor-local coordinates
        let local_x = vx - monitor.x;
        let local_y = vy - monitor.y;

        let full_image = screen.capture().map_err(|e| {
            AppError::InternalError(format!("Failed to capture screen: {}", e))
        })?;

        let cropped = Self::crop_image_static(&full_image, local_x, local_y, width, height)?;

        Ok(CaptureResult {
            image: DynamicImage::ImageRgba8(cropped),
            width,
            height,
            monitor_index: monitor.index,
            origin_x: vx,
            origin_y: vy,
        })
    }

    // ========================================================================
    // Coordinate Translation (static helpers)
    // ========================================================================

    /// Convert virtual desktop coordinates to all-monitor-relative coordinates
    /// suitable for `capture_virtual_desktop` output.
    pub fn virtual_to_desktop_offset(vx: i32, vy: i32) -> Result<(i32, i32)> {
        let monitors = Self::list_monitors()?;
        if monitors.is_empty() {
            return Err(AppError::InternalError("No monitors found".to_string()));
        }
        let min_x = monitors.iter().map(|m| m.x).min().unwrap_or(0);
        let min_y = monitors.iter().map(|m| m.y).min().unwrap_or(0);
        Ok((vx - min_x, vy - min_y))
    }

    // ========================================================================
    // Internal Helpers
    // ========================================================================

    /// Crop an image to a specific region (static, no self needed)
    fn crop_image_static(
        image: &ImageBuffer<Rgba<u8>, Vec<u8>>,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    ) -> Result<ImageBuffer<Rgba<u8>, Vec<u8>>> {
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

    #[test]
    fn test_list_monitors() {
        let monitors = ScreenCapture::list_monitors().unwrap();
        assert!(!monitors.is_empty());
        // Each monitor should have a name and valid dimensions
        for m in &monitors {
            assert!(m.width > 0);
            assert!(m.height > 0);
            assert!(m.scale_factor > 0.0);
        }
    }

    #[test]
    fn test_monitor_info_contains() {
        let info = MonitorInfo {
            index: 0,
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            display_id: 0,
            scale_factor: 1.0,
        };
        assert!(info.contains(0, 0));
        assert!(info.contains(1919, 1079));
        assert!(!info.contains(1920, 1080));
        assert!(!info.contains(-1, 0));
    }

    #[test]
    fn test_monitor_info_contains_negative_offset() {
        // Secondary monitor positioned to the left (negative x)
        let left_monitor = MonitorInfo {
            index: 1,
            x: -1920,
            y: 0,
            width: 1920,
            height: 1080,
            display_id: 1,
            scale_factor: 1.0,
        };
        assert!(left_monitor.contains(-1920, 0));
        assert!(left_monitor.contains(-1, 539));
        assert!(!left_monitor.contains(0, 0));
        assert!(!left_monitor.contains(-1921, 0));
    }

    #[test]
    fn test_monitor_info_staggered_layout() {
        // Two monitors side by side, secondary offset vertically
        let left = MonitorInfo { index: 0, x: 0, y: 0, width: 1920, height: 1080, display_id: 0, scale_factor: 1.0 };
        let right = MonitorInfo { index: 1, x: 1920, y: -200, width: 1920, height: 1080, display_id: 1, scale_factor: 2.0 };

        // Left monitor covers standard area
        assert!(left.contains(100, 100));
        assert!(!left.contains(2000, 0));

        // Right monitor is at y=-200 with 2x scaling
        assert!(right.contains(1920, -200));
        assert!(right.contains(2000, 0));
        assert!(!right.contains(1919, 0));
        assert!(!right.contains(1920, -201));

        // DPI scaling on right monitor (2.0x)
        let (px, py) = right.logical_to_physical(100.0, 100.0);
        assert_eq!(px, 200);
        assert_eq!(py, 200);
    }

    #[test]
    fn test_monitor_info_coordinate_conversion() {
        let info = MonitorInfo {
            index: 0,
            x: 1920,
            y: 0,
            width: 1920,
            height: 1080,
            display_id: 1,
            scale_factor: 1.5,
        };
        // Virtual (1920, 0) should be local (0, 0)
        let (lx, ly) = info.virtual_to_local(1920, 0);
        assert_eq!(lx, 0);
        assert_eq!(ly, 0);
        // Local (100, 100) should be virtual (2020, 100)
        let (vx, vy) = info.local_to_virtual(100, 100);
        assert_eq!(vx, 2020);
        assert_eq!(vy, 100);
    }

    #[test]
    fn test_monitor_info_dpi_scaling_various_factors() {
        // 125% scaling (common on small laptops)
        let m125 = MonitorInfo { index: 0, x: 0, y: 0, width: 1920, height: 1080, display_id: 0, scale_factor: 1.25 };
        let (px, py) = m125.logical_to_physical(200.0, 300.0);
        assert_eq!(px, 250); // 200 * 1.25 = 250
        assert_eq!(py, 375); // 300 * 1.25 = 375
        let (lx, ly) = m125.physical_to_logical(250, 375);
        assert!((lx - 200.0).abs() < 0.01);
        assert!((ly - 300.0).abs() < 0.01);

        // 150% scaling (common on 4K displays)
        let m150 = MonitorInfo { index: 0, x: 0, y: 0, width: 3840, height: 2160, display_id: 0, scale_factor: 1.5 };
        let (px, py) = m150.logical_to_physical(200.0, 300.0);
        assert_eq!(px, 300); // 200 * 1.5 = 300
        assert_eq!(py, 450); // 300 * 1.5 = 450

        // 200% scaling (high-DPI)
        let m200 = MonitorInfo { index: 0, x: 0, y: 0, width: 3840, height: 2160, display_id: 0, scale_factor: 2.0 };
        let (px, py) = m200.logical_to_physical(200.0, 300.0);
        assert_eq!(px, 400); // 200 * 2.0 = 400
        assert_eq!(py, 600); // 300 * 2.0 = 600
    }

    #[test]
    fn test_monitor_at() {
        // We can't predict actual monitor layout, but we can verify
        // that the primary monitor's (0,0) returns Some
        // In most single-monitor setups this should pass
        if let Ok(Some(primary)) = ScreenCapture::monitor_at(0, 0) {
            assert!(primary.width > 0);
        }
    }

    // Note: capture_screen(), capture_virtual_region(), and capture_virtual_desktop()
    // tests would require an actual display and are better suited for integration tests
}
