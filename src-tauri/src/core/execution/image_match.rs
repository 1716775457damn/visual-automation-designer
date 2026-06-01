//! Image matching operations
//!
//! Screenshot capture, template matching with caching, and performance
//! metrics for image-based automation blocks.
//!
//! Validates: Requirements 8.4

use std::time::Instant;

use crate::error::{AppError, Result};
use crate::models::ImageId;

use super::runner::{safe_execute, Executor};

impl Executor {
    /// Find an image on screen with caching and performance tracking
    ///
    /// This method uses the CachedImageMatcher for improved performance
    /// on repeated matches. It also logs performance metrics.
    ///
    /// Validates: Requirements 8.4 - Exception handling for image operations
    pub(super) async fn find_image_on_screen(
        &self,
        image_id: &ImageId,
    ) -> Result<(bool, (u32, u32))> {
        let start = Instant::now();

        // Get image metadata
        let metadata = self
            .image_library
            .get(image_id)
            .ok_or_else(|| AppError::ImageNotFound(image_id.to_string()))?
            .clone();

        // Load the template image with panic handling
        let image_path = self.images_dir.join(&metadata.file_path);
        let template: image::DynamicImage = safe_execute(
            || image::open(&image_path).map_err(|e| AppError::ImageError(e.to_string())),
            "Image loading",
        )??;

        // 1. Try primary monitor first (fast path)
        let capture_result = safe_execute(
            || crate::platform::ScreenCapture::new().capture_screen(),
            "Screen capture primary",
        );

        if let Ok(Ok(capture)) = capture_result {
            let result = {
                let mut matcher = self.matcher.lock().await;
                matcher.find_image_cached(&capture.image, &template, image_id)
            };

            if result.found {
                let center = (
                    (capture.origin_x as u32)
                        .saturating_add(result.center_x.unwrap_or(0)),
                    (capture.origin_y as u32)
                        .saturating_add(result.center_y.unwrap_or(0)),
                );
                let duration = start.elapsed();
                log::debug!(
                    "Image matching found on primary screen in {}ms for image_id: {}",
                    duration.as_millis(),
                    image_id
                );
                return Ok((true, center));
            }
        }

        // 2. If not found, try all other monitors (multi-monitor fallback path)
        if let Ok(count) = crate::platform::ScreenCapture::screen_count() {
            for i in 1..count {
                let capture_fallback_result = safe_execute(
                    || crate::platform::ScreenCapture::with_screen(i).capture_screen(),
                    "Screen capture fallback",
                );

                if let Ok(Ok(capture)) = capture_fallback_result {
                    let result = {
                        let mut matcher = self.matcher.lock().await;
                        matcher.find_image_cached(&capture.image, &template, image_id)
                    };

                    if result.found {
                        let center = (
                            (capture.origin_x as u32)
                                .saturating_add(result.center_x.unwrap_or(0)),
                            (capture.origin_y as u32)
                                .saturating_add(result.center_y.unwrap_or(0)),
                        );
                        let duration = start.elapsed();
                        log::info!(
                            "Image matching found on secondary screen {} in {}ms for image_id: {}",
                            i,
                            duration.as_millis(),
                            image_id
                        );
                        return Ok((true, center));
                    }
                }
            }
        }

        let duration = start.elapsed();
        log::warn!(
            "Image matching failed across all screens in {}ms for image_id: {}",
            duration.as_millis(),
            image_id
        );

        Ok((false, (0, 0)))
    }

    /// Get matcher performance metrics
    pub async fn matcher_metrics(&self) -> crate::matching::MatchMetrics {
        let matcher = self.matcher.lock().await;
        matcher.metrics().clone()
    }

    /// Clear matcher cache
    pub async fn clear_matcher_cache(&self) {
        let mut matcher = self.matcher.lock().await;
        matcher.clear_cache();
    }

    /// Get matcher cache statistics
    pub async fn cache_stats(&self) -> crate::matching::CacheStats {
        let matcher = self.matcher.lock().await;
        matcher.cache_stats()
    }
}
