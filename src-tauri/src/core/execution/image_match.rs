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

/// Compute the screen-global center coordinates from a capture offset and match result.
fn match_center(
    origin_x: &i32,
    origin_y: &i32,
    result: &crate::matching::MatchResult,
) -> (u32, u32) {
    (
        (*origin_x as u32).saturating_add(result.center_x.unwrap_or(0)),
        (*origin_y as u32).saturating_add(result.center_y.unwrap_or(0)),
    )
}

impl Executor {
    /// Find an image on screen with caching and performance tracking.
    ///
    /// `threshold` overrides the matcher's default threshold for this call.
    /// Returns `(found, center_coords, best_confidence)` — the confidence is
    /// the highest NCC score seen even when `found` is false, so callers can
    /// give specific feedback like "匹配准确率 15% 低于阈值 70%".
    ///
    /// This method uses the CachedImageMatcher for improved performance
    /// on repeated matches. It also logs performance metrics.
    ///
    /// Validates: Requirements 8.4 - Exception handling for image operations
    pub(super) async fn find_image_on_screen(
        &self,
        image_id: &ImageId,
        threshold: Option<f64>,
    ) -> Result<(bool, (u32, u32), f64)> {
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

        // Track best confidence across all monitors
        let mut best_confidence: f64 = 0.0;

        // 1. Try primary monitor first (fast path)
        let capture_result = safe_execute(
            || crate::platform::ScreenCapture::new().capture_screen(),
            "Screen capture primary",
        );

        if let Ok(Ok(capture)) = capture_result {
            let result = {
                let mut matcher = self.matcher.lock().await;
                // Apply optional threshold override
                if let Some(t) = threshold {
                    matcher.set_threshold(t);
                }
                matcher.find_image_cached(&capture.image, &template, image_id)
            };

            // Track best confidence even on failure
            if let Some(c) = result.confidence {
                best_confidence = best_confidence.max(c);
            }

            if result.found {
                let duration = start.elapsed();
                log::debug!(
                    "Image matching found on primary screen in {}ms for image_id: {}",
                    duration.as_millis(),
                    image_id
                );
                return Ok((true, match_center(&capture.origin_x, &capture.origin_y, &result), best_confidence));
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
                        if let Some(t) = threshold {
                            matcher.set_threshold(t);
                        }
                        matcher.find_image_cached(&capture.image, &template, image_id)
                    };

                    if let Some(c) = result.confidence {
                        best_confidence = best_confidence.max(c);
                    }

                    if result.found {
                        let duration = start.elapsed();
                        log::info!(
                            "Image matching found on secondary screen {} in {}ms for image_id: {}",
                            i,
                            duration.as_millis(),
                            image_id
                        );
                        return Ok((true, match_center(&capture.origin_x, &capture.origin_y, &result), best_confidence));
                    }
                }
            }
        }

        let duration = start.elapsed();
        let current_threshold = threshold.unwrap_or(0.7);
        if best_confidence > 0.0 && best_confidence < current_threshold {
            log::warn!(
                "Image matching failed: {} — 最佳匹配准确率 {:.1}% 低于阈值 {:.0}% (用时 {}ms)",
                image_id,
                best_confidence * 100.0,
                current_threshold * 100.0,
                duration.as_millis(),
            );
        } else {
            log::warn!(
                "Image matching failed across all screens in {}ms for image_id: {}",
                duration.as_millis(),
                image_id
            );
        }

        Ok((false, (0, 0), best_confidence))
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
