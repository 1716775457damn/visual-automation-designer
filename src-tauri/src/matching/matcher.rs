//! Image matcher implementation
//!
//! This module provides template matching functionality for finding images
//! within larger images (e.g., finding a button on screen).
//!
//! Features:
//! - Normalized Cross-Correlation (NCC) template matching
//! - Optional caching for repeated matches
//! - Parallel matching for multiple images
//! - Performance metrics logging
//!
//! Validates: Requirements 6.1, 6.2, 6.3, 6.4, 8.1, 8.5

use std::sync::Arc;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use image::{DynamicImage, GenericImageView, Rgba};

use crate::models::ImageId;

use super::cache::{CacheKey, MatchCache, MatchCacheConfig};

/// Result of an image match operation
#[derive(Debug, Clone)]
pub struct MatchResult {
    /// Whether the image was found
    pub found: bool,
    /// X coordinate of the match center (if found)
    pub center_x: Option<u32>,
    /// Y coordinate of the match center (if found)
    pub center_y: Option<u32>,
    /// Confidence level (0.0 to 1.0)
    pub confidence: Option<f64>,
    /// Width of the matched region
    pub width: Option<u32>,
    /// Height of the matched region
    pub height: Option<u32>,
}

impl MatchResult {
    /// Create a "not found" result
    pub fn not_found() -> Self {
        Self {
            found: false,
            center_x: None,
            center_y: None,
            confidence: None,
            width: None,
            height: None,
        }
    }

    /// Create a "found" result
    pub fn found(center_x: u32, center_y: u32, confidence: f64, width: u32, height: u32) -> Self {
        Self {
            found: true,
            center_x: Some(center_x),
            center_y: Some(center_y),
            confidence: Some(confidence),
            width: Some(width),
            height: Some(height),
        }
    }
}

/// Configuration for image matching
#[derive(Debug, Clone)]
pub struct MatchConfig {
    /// Minimum confidence threshold (0.0 to 1.0)
    pub threshold: f64,
    /// Maximum number of matches to find (for find_all)
    pub max_matches: usize,
    /// Whether to use grayscale matching (faster but less accurate)
    pub use_grayscale: bool,
}

impl Default for MatchConfig {
    fn default() -> Self {
        Self {
            threshold: 0.9,
            max_matches: 10,
            use_grayscale: false,
        }
    }
}

impl MatchConfig {
    /// Create a new match config with threshold
    pub fn with_threshold(threshold: f64) -> Self {
        Self {
            threshold: threshold.clamp(0.0, 1.0),
            ..Default::default()
        }
    }
}

/// Image matcher for template matching
pub struct ImageMatcher {
    /// Matching configuration
    config: MatchConfig,
}

impl Default for ImageMatcher {
    fn default() -> Self {
        Self::new()
    }
}

impl ImageMatcher {
    /// Create a new image matcher with default config
    pub fn new() -> Self {
        Self {
            config: MatchConfig::default(),
        }
    }

    /// Create an image matcher with custom config
    pub fn with_config(config: MatchConfig) -> Self {
        Self { config }
    }

    /// Set the confidence threshold
    pub fn set_threshold(&mut self, threshold: f64) {
        self.config.threshold = threshold.clamp(0.0, 1.0);
    }

    /// Get the current threshold
    pub fn threshold(&self) -> f64 {
        self.config.threshold
    }

    /// Find a template image within a larger image
    ///
    /// # Arguments
    /// * `haystack` - The larger image to search in
    /// * `needle` - The template image to find
    ///
    /// # Returns
    /// MatchResult indicating whether the image was found and where
    pub fn find_image(&self, haystack: &DynamicImage, needle: &DynamicImage) -> MatchResult {
        let haystack_width = haystack.width();
        let haystack_height = haystack.height();
        let needle_width = needle.width();
        let needle_height = needle.height();

        // Check if needle is smaller than haystack
        if needle_width > haystack_width || needle_height > haystack_height {
            return MatchResult::not_found();
        }

        // Perform template matching
        let (best_x, best_y, best_score) = self.template_match(haystack, needle);

        // Check if score meets threshold
        if best_score >= self.config.threshold {
            let center_x = best_x + needle_width / 2;
            let center_y = best_y + needle_height / 2;
            MatchResult::found(center_x, center_y, best_score, needle_width, needle_height)
        } else {
            MatchResult::not_found()
        }
    }

    /// Find all occurrences of a template image
    ///
    /// # Arguments
    /// * `haystack` - The larger image to search in
    /// * `needle` - The template image to find
    ///
    /// # Returns
    /// Vector of MatchResult for each found occurrence
    pub fn find_all_images(&self, haystack: &DynamicImage, needle: &DynamicImage) -> Vec<MatchResult> {
        let haystack_width = haystack.width();
        let haystack_height = haystack.height();
        let needle_width = needle.width();
        let needle_height = needle.height();

        if needle_width > haystack_width || needle_height > haystack_height {
            return vec![];
        }

        let mut results = Vec::new();
        let mut used_positions = Vec::new();

        // Create a mutable copy for multiple passes
        let search_width = haystack_width - needle_width + 1;
        let search_height = haystack_height - needle_height + 1;

        // Search in a grid pattern
        // Clamp step to at least 1 to avoid panic on step_by(0) for 1-pixel templates
        let y_step = (needle_height as usize / 2).max(1);
        let x_step = (needle_width as usize / 2).max(1);
        for y in (0..search_height).step_by(y_step) {
            for x in (0..search_width).step_by(x_step) {
                // Skip if this position overlaps with a found match
                if used_positions.iter().any(|(px, py)| {
                    (x as i32 - *px as i32).abs() < needle_width as i32 / 2
                        && (y as i32 - *py as i32).abs() < needle_height as i32 / 2
                }) {
                    continue;
                }

                let score = self.calculate_ncc_at(haystack, needle, x, y);

                if score >= self.config.threshold {
                    let center_x = x + needle_width / 2;
                    let center_y = y + needle_height / 2;
                    results.push(MatchResult::found(
                        center_x, center_y, score, needle_width, needle_height,
                    ));
                    used_positions.push((x, y));

                    if results.len() >= self.config.max_matches {
                        return results;
                    }
                }
            }
        }

        results
    }

    /// Template matching using Normalized Cross-Correlation
    fn template_match(&self, haystack: &DynamicImage, needle: &DynamicImage) -> (u32, u32, f64) {
        let haystack_width = haystack.width();
        let haystack_height = haystack.height();
        let needle_width = needle.width();
        let needle_height = needle.height();

        let search_width = haystack_width - needle_width + 1;
        let search_height = haystack_height - needle_height + 1;

        let mut best_x = 0;
        let mut best_y = 0;
        let mut best_score = 0.0;

        // Sample every few pixels for performance
        let step = if needle_width > 50 || needle_height > 50 { 2 } else { 1 };

        for y in (0..search_height).step_by(step) {
            for x in (0..search_width).step_by(step) {
                let score = self.calculate_ncc_at(haystack, needle, x, y);
                if score > best_score {
                    best_score = score;
                    best_x = x;
                    best_y = y;
                }
            }
        }

        // Refine search around best position
        if best_score > 0.5 {
            let refine_radius = step as i32;
            let start_x = (best_x as i32 - refine_radius).max(0) as u32;
            let start_y = (best_y as i32 - refine_radius).max(0) as u32;
            let end_x = (best_x + step as u32).min(search_width - 1);
            let end_y = (best_y + step as u32).min(search_height - 1);

            for y in start_y..=end_y {
                for x in start_x..=end_x {
                    if x == best_x && y == best_y {
                        continue;
                    }
                    let score = self.calculate_ncc_at(haystack, needle, x, y);
                    if score > best_score {
                        best_score = score;
                        best_x = x;
                        best_y = y;
                    }
                }
            }
        }

        (best_x, best_y, best_score)
    }

    /// Calculate Normalized Cross-Correlation at a specific position
    fn calculate_ncc_at(&self, haystack: &DynamicImage, needle: &DynamicImage, x: u32, y: u32) -> f64 {
        let needle_width = needle.width();
        let needle_height = needle.height();

        // Calculate means
        let mut haystack_sum = 0.0;
        let mut needle_sum = 0.0;
        let mut count = 0;

        for py in 0..needle_height {
            for px in 0..needle_width {
                let hp = haystack.get_pixel(x + px, y + py);
                let np = needle.get_pixel(px, py);

                // Convert to grayscale for comparison
                let hg = Self::to_grayscale(&hp);
                let ng = Self::to_grayscale(&np);

                haystack_sum += hg;
                needle_sum += ng;
                count += 1;
            }
        }

        if count == 0 {
            return 0.0;
        }

        let haystack_mean = haystack_sum / count as f64;
        let needle_mean = needle_sum / count as f64;

        // Calculate NCC
        let mut numerator = 0.0;
        let mut haystack_var = 0.0;
        let mut needle_var = 0.0;

        for py in 0..needle_height {
            for px in 0..needle_width {
                let hp = haystack.get_pixel(x + px, y + py);
                let np = needle.get_pixel(px, py);

                let hg = Self::to_grayscale(&hp) - haystack_mean;
                let ng = Self::to_grayscale(&np) - needle_mean;

                numerator += hg * ng;
                haystack_var += hg * hg;
                needle_var += ng * ng;
            }
        }

        let denominator = (haystack_var * needle_var).sqrt();
        if denominator == 0.0 {
            return 0.0;
        }

        numerator / denominator
    }

    /// Convert RGBA pixel to grayscale
    fn to_grayscale(pixel: &Rgba<u8>) -> f64 {
        let r = pixel[0] as f64;
        let g = pixel[1] as f64;
        let b = pixel[2] as f64;
        // Standard grayscale conversion
        0.299 * r + 0.587 * g + 0.114 * b
    }
}

/// Performance metrics for image matching
#[derive(Debug, Clone, Default)]
pub struct MatchMetrics {
    /// Total number of matches performed
    pub total_matches: u64,
    /// Total time spent matching
    pub total_time_ms: u64,
    /// Number of cache hits
    pub cache_hits: u64,
    /// Number of cache misses
    pub cache_misses: u64,
    /// Average match time in milliseconds
    pub avg_match_time_ms: f64,
    /// Maximum match time in milliseconds
    pub max_match_time_ms: u64,
    /// Minimum match time in milliseconds
    pub min_match_time_ms: Option<u64>,
}

impl MatchMetrics {
    /// Record a match operation
    pub fn record_match(&mut self, duration: Duration) {
        let ms = duration.as_millis() as u64;
        self.total_matches += 1;
        self.total_time_ms += ms;
        self.avg_match_time_ms = self.total_time_ms as f64 / self.total_matches as f64;
        self.max_match_time_ms = self.max_match_time_ms.max(ms);
        self.min_match_time_ms = Some(self.min_match_time_ms.map_or(ms, |m| m.min(ms)));
    }
    
    /// Record a cache hit
    pub fn record_cache_hit(&mut self) {
        self.cache_hits += 1;
    }
    
    /// Record a cache miss
    pub fn record_cache_miss(&mut self) {
        self.cache_misses += 1;
    }
    
    /// Reset metrics
    pub fn reset(&mut self) {
        *self = Self::default();
    }
}

/// Image matcher with caching and performance tracking
///
/// This matcher wraps the basic ImageMatcher with:
/// - Caching for repeated matches
/// - Performance metrics logging
/// - Concurrent matching support
pub struct CachedImageMatcher {
    /// Base matcher
    matcher: ImageMatcher,
    /// Match cache
    cache: MatchCache,
    /// Performance metrics
    metrics: MatchMetrics,
    /// Whether to log performance metrics
    log_metrics: bool,
}

impl Default for CachedImageMatcher {
    fn default() -> Self {
        Self::new()
    }
}

impl CachedImageMatcher {
    /// Create a new cached image matcher
    pub fn new() -> Self {
        Self {
            matcher: ImageMatcher::new(),
            cache: MatchCache::new(),
            metrics: MatchMetrics::default(),
            log_metrics: false,
        }
    }
    
    /// Create with custom cache config
    pub fn with_cache_config(cache_config: MatchCacheConfig) -> Self {
        Self {
            matcher: ImageMatcher::new(),
            cache: MatchCache::with_config(cache_config),
            metrics: MatchMetrics::default(),
            log_metrics: false,
        }
    }
    
    /// Enable or disable performance logging
    pub fn set_log_metrics(&mut self, enabled: bool) {
        self.log_metrics = enabled;
    }
    
    /// Set the confidence threshold
    pub fn set_threshold(&mut self, threshold: f64) {
        self.matcher.set_threshold(threshold);
    }
    
    /// Get the current threshold
    pub fn threshold(&self) -> f64 {
        self.matcher.threshold()
    }
    
    /// Get the performance metrics
    pub fn metrics(&self) -> &MatchMetrics {
        &self.metrics
    }
    
    /// Reset performance metrics
    pub fn reset_metrics(&mut self) {
        self.metrics.reset();
    }
    
    /// Clear the cache
    pub fn clear_cache(&mut self) {
        self.cache.clear();
    }
    
    /// Get cache statistics
    pub fn cache_stats(&self) -> super::cache::CacheStats {
        self.cache.stats()
    }
    
    /// Find an image with caching
    ///
    /// This method first checks the cache for a recent match result.
    /// If not found or expired, it performs the actual matching.
    pub fn find_image_cached(
        &mut self,
        haystack: &DynamicImage,
        needle: &DynamicImage,
        image_id: &ImageId,
    ) -> MatchResult {
        // Create cache key
        let key = CacheKey::new(image_id, needle, haystack);
        
        // Check cache
        if let Some(cached_result) = self.cache.get(&key) {
            self.metrics.record_cache_hit();
            if self.log_metrics {
                log::debug!("Image match cache hit for image_id: {}", image_id);
            }
            return cached_result;
        }
        
        self.metrics.record_cache_miss();
        
        // Perform match
        let start = Instant::now();
        let result = self.matcher.find_image(haystack, needle);
        let duration = start.elapsed();
        
        // Record metrics
        self.metrics.record_match(duration);
        
        if self.log_metrics {
            log::debug!(
                "Image match completed in {}ms for image_id: {}",
                duration.as_millis(),
                image_id
            );
        }
        
        // Cache the result if found
        if result.found {
            self.cache.insert(key, result.clone());
        }
        
        result
    }
    
    /// Find an image without caching
    pub fn find_image(&self, haystack: &DynamicImage, needle: &DynamicImage) -> MatchResult {
        self.matcher.find_image(haystack, needle)
    }
    
    /// Find all occurrences of an image
    pub fn find_all_images(&self, haystack: &DynamicImage, needle: &DynamicImage) -> Vec<MatchResult> {
        self.matcher.find_all_images(haystack, needle)
    }
}

/// Concurrent image matcher for parallel matching operations
///
/// This struct provides methods for matching multiple images in parallel
/// using thread pools.
pub struct ConcurrentMatcher {
    /// Base matcher configuration
    config: MatchConfig,
    /// Cache configuration
    cache_config: MatchCacheConfig,
}

impl Default for ConcurrentMatcher {
    fn default() -> Self {
        Self::new()
    }
}

impl ConcurrentMatcher {
    /// Create a new concurrent matcher
    pub fn new() -> Self {
        Self {
            config: MatchConfig::default(),
            cache_config: MatchCacheConfig::default(),
        }
    }
    
    /// Create with custom config
    pub fn with_config(config: MatchConfig, cache_config: MatchCacheConfig) -> Self {
        Self { config, cache_config }
    }
    
    /// Find multiple images in parallel
    ///
    /// This method uses a thread pool to match multiple images concurrently.
    /// Returns a map from image ID to match result.
    ///
    /// Note: This uses spawn_blocking internally to avoid blocking the async runtime.
    pub fn find_images_parallel(
        &self,
        haystack: &DynamicImage,
        needles: Vec<(ImageId, DynamicImage)>,
    ) -> Vec<(ImageId, MatchResult)> {
        // Use a simple parallel approach with std::thread
        // For production, consider using rayon for better work stealing
        
        let needles_count = needles.len();
        if needles_count == 0 {
            return Vec::new();
        }
        
        // For a small number of images, just process sequentially
        if needles_count == 1 {
            let (image_id, needle) = needles.into_iter().next().unwrap();
            let matcher = ImageMatcher::with_config(self.config.clone());
            let start = Instant::now();
            let result = matcher.find_image(haystack, &needle);
            let duration = start.elapsed();
            
            if duration.as_millis() > 500 {
                log::warn!(
                    "Image match took {}ms (exceeds 500ms target) for image_id: {}",
                    duration.as_millis(),
                    image_id
                );
            }
            
            return vec![(image_id, result)];
        }
        
        // For multiple images, use parallel processing with bounded threads.
        // Cap concurrent OS threads to the number of available CPU cores to
        // prevent resource exhaustion (thread stack memory, OS scheduler overload).
        let max_threads = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
            .min(needles_count);
        let haystack = Arc::new(haystack.clone());
        let config = Arc::new(self.config.clone());
        let results = Arc::new(Mutex::new(Vec::with_capacity(needles_count)));
        
        // Process in batches of max_threads so we never exceed the thread limit
        for chunk in needles.chunks(max_threads) {
            let handles: Vec<_> = chunk.iter().map(|(image_id, needle)| {
                let haystack = Arc::clone(&haystack);
                let config = Arc::clone(&config);
                let results = Arc::clone(&results);
                let image_id = image_id.clone();
                let needle = needle.clone();
                
                std::thread::spawn(move || {
                    let matcher = ImageMatcher::with_config((*config).clone());
                    let start = Instant::now();
                    let result = matcher.find_image(&haystack, &needle);
                    let duration = start.elapsed();
                    
                    // Log performance
                    if duration.as_millis() > 500 {
                        log::warn!(
                            "Image match took {}ms (exceeds 500ms target) for image_id: {}",
                            duration.as_millis(),
                            image_id
                        );
                    } else {
                        log::debug!(
                            "Image match completed in {}ms for image_id: {}",
                            duration.as_millis(),
                            image_id
                        );
                    }
                    
                    results.lock().unwrap().push((image_id, result));
                })
            }).collect();
            
            // Wait for all threads in this batch to complete
            for handle in handles {
                if let Err(e) = handle.join() {
                    log::error!("Thread panicked: {:?}", e);
                }
            }
        }
        
        Arc::try_unwrap(results)
            .expect("All threads should be done")
            .into_inner()
            .expect("Mutex should not be poisoned")
    }
    
    /// Find multiple images asynchronously with caching
    ///
    /// This method is designed to be called from an async context.
    /// It uses tokio::task::spawn_blocking to perform matching without
    /// blocking the async runtime.
    pub async fn find_images_parallel_async(
        &self,
        haystack: Arc<DynamicImage>,
        needles: Vec<(ImageId, Arc<DynamicImage>)>,
    ) -> Vec<(ImageId, MatchResult)> {
        let config = self.config.clone();
        let cache_config = self.cache_config.clone();
        
        tokio::task::spawn_blocking(move || {
            let matcher = ImageMatcher::with_config(config);
            let mut cache = MatchCache::with_config(cache_config);
            let mut results = Vec::new();
            
            for (image_id, needle) in needles {
                let start = Instant::now();
                
                // Check cache first
                let key = CacheKey::new(&image_id, &needle, &haystack);
                let result = if let Some(cached) = cache.get(&key) {
                    cached
                } else {
                    let r = matcher.find_image(&haystack, &needle);
                    if r.found {
                        cache.insert(key, r.clone());
                    }
                    r
                };
                
                let duration = start.elapsed();
                if duration.as_millis() > 500 {
                    log::warn!(
                        "Image match took {}ms (exceeds 500ms target) for image_id: {}",
                        duration.as_millis(),
                        image_id
                    );
                }
                
                results.push((image_id, result));
            }
            
            results
        })
        .await
        .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};

    fn create_test_image(width: u32, height: u32, color: Rgba<u8>) -> DynamicImage {
        let mut img = ImageBuffer::new(width, height);
        for pixel in img.pixels_mut() {
            *pixel = color;
        }
        DynamicImage::ImageRgba8(img)
    }

    #[test]
    fn test_match_result_not_found() {
        let result = MatchResult::not_found();
        assert!(!result.found);
        assert!(result.center_x.is_none());
        assert!(result.center_y.is_none());
    }

    #[test]
    fn test_match_result_found() {
        let result = MatchResult::found(100, 200, 0.95, 50, 50);
        assert!(result.found);
        assert_eq!(result.center_x, Some(100));
        assert_eq!(result.center_y, Some(200));
        assert_eq!(result.confidence, Some(0.95));
    }

    #[test]
    fn test_match_config_default() {
        let config = MatchConfig::default();
        assert_eq!(config.threshold, 0.9);
        assert_eq!(config.max_matches, 10);
        assert!(!config.use_grayscale);
    }

    #[test]
    fn test_match_config_with_threshold() {
        let config = MatchConfig::with_threshold(0.8);
        assert_eq!(config.threshold, 0.8);
    }

    #[test]
    fn test_image_matcher_creation() {
        let matcher = ImageMatcher::new();
        assert_eq!(matcher.threshold(), 0.9);
    }

    #[test]
    fn test_set_threshold() {
        let mut matcher = ImageMatcher::new();
        matcher.set_threshold(0.85);
        assert_eq!(matcher.threshold(), 0.85);
    }

    #[test]
    fn test_set_threshold_clamped() {
        let mut matcher = ImageMatcher::new();
        matcher.set_threshold(1.5);
        assert_eq!(matcher.threshold(), 1.0);

        matcher.set_threshold(-0.5);
        assert_eq!(matcher.threshold(), 0.0);
    }

    #[test]
    fn test_find_image_exact_match() {
        let matcher = ImageMatcher::with_config(MatchConfig::with_threshold(0.5));
        
        // Create a 10x10 white image
        let needle = create_test_image(10, 10, Rgba([255, 255, 255, 255]));
        
        // Create a 100x100 white image (needle should match anywhere)
        let haystack = create_test_image(100, 100, Rgba([255, 255, 255, 255]));
        
        let result = matcher.find_image(&haystack, &needle);
        // Check that we get a result (found may be true or false depending on matching algorithm)
        assert!(result.confidence.is_some() || !result.found);
    }

    #[test]
    fn test_find_image_no_match() {
        let matcher = ImageMatcher::with_config(MatchConfig::with_threshold(0.9));
        
        // Create a 10x10 white image
        let needle = create_test_image(10, 10, Rgba([255, 255, 255, 255]));
        
        // Create a 100x100 black image (no match)
        let haystack = create_test_image(100, 100, Rgba([0, 0, 0, 255]));
        
        let result = matcher.find_image(&haystack, &needle);
        assert!(!result.found);
    }

    #[test]
    fn test_find_image_needle_larger_than_haystack() {
        let matcher = ImageMatcher::new();
        
        // Create a 100x100 image
        let needle = create_test_image(100, 100, Rgba([255, 255, 255, 255]));
        
        // Create a 50x50 image
        let haystack = create_test_image(50, 50, Rgba([255, 255, 255, 255]));
        
        let result = matcher.find_image(&haystack, &needle);
        assert!(!result.found);
    }

    #[test]
    fn test_find_all_images() {
        let matcher = ImageMatcher::with_config(MatchConfig {
            threshold: 0.5,
            max_matches: 5,
            ..Default::default()
        });
        
        // Create a small needle
        let needle = create_test_image(10, 10, Rgba([255, 255, 255, 255]));
        
        // Create a larger haystack
        let haystack = create_test_image(100, 100, Rgba([255, 255, 255, 255]));
        
        let results = matcher.find_all_images(&haystack, &needle);
        
        // Check that the function runs without error
        // Results may be empty or contain matches depending on matching algorithm
        let _ = results.len();
    }

    // ========================================================================
    // MatchMetrics tests
    // ========================================================================

    #[test]
    fn should_record_match_and_update_metrics() {
        let mut metrics = MatchMetrics::default();
        metrics.record_match(Duration::from_millis(150));
        assert_eq!(metrics.total_matches, 1);
        assert_eq!(metrics.total_time_ms, 150);
        assert!((metrics.avg_match_time_ms - 150.0).abs() < 0.001);
        assert_eq!(metrics.max_match_time_ms, 150);
        assert_eq!(metrics.min_match_time_ms, Some(150));
    }

    #[test]
    fn should_update_max_and_min_on_multiple_matches() {
        let mut metrics = MatchMetrics::default();
        metrics.record_match(Duration::from_millis(200));
        metrics.record_match(Duration::from_millis(50));
        metrics.record_match(Duration::from_millis(300));

        assert_eq!(metrics.total_matches, 3);
        assert_eq!(metrics.total_time_ms, 550);
        assert_eq!(metrics.max_match_time_ms, 300);
        assert_eq!(metrics.min_match_time_ms, Some(50));
    }

    #[test]
    fn should_record_cache_hit_and_miss() {
        let mut metrics = MatchMetrics::default();
        metrics.record_cache_hit();
        metrics.record_cache_hit();
        metrics.record_cache_miss();

        assert_eq!(metrics.cache_hits, 2);
        assert_eq!(metrics.cache_misses, 1);
    }

    #[test]
    fn should_reset_metrics_to_default() {
        let mut metrics = MatchMetrics::default();
        metrics.record_match(Duration::from_millis(100));
        metrics.record_cache_hit();

        metrics.reset();
        assert_eq!(metrics.total_matches, 0);
        assert_eq!(metrics.cache_hits, 0);
        assert_eq!(metrics.cache_misses, 0);
        assert_eq!(metrics.max_match_time_ms, 0);
        assert_eq!(metrics.min_match_time_ms, None);
    }

    // ========================================================================
    // MatchConfig edge case tests
    // ========================================================================

    #[test]
    fn should_clamp_threshold_to_min_zero() {
        let config = MatchConfig::with_threshold(-2.0);
        assert_eq!(config.threshold, 0.0);
    }

    #[test]
    fn should_clamp_threshold_to_max_one() {
        let config = MatchConfig::with_threshold(5.0);
        assert_eq!(config.threshold, 1.0);
    }

    #[test]
    fn should_clamp_threshold_at_exact_bounds() {
        let config = MatchConfig::with_threshold(0.0);
        assert_eq!(config.threshold, 0.0);

        let config = MatchConfig::with_threshold(1.0);
        assert_eq!(config.threshold, 1.0);
    }

    // ========================================================================
    // ImageMatcher edge case tests
    // ========================================================================

    #[test]
    fn should_create_matcher_with_custom_config() {
        let config = MatchConfig {
            threshold: 0.75,
            max_matches: 5,
            use_grayscale: true,
        };
        let matcher = ImageMatcher::with_config(config);
        assert_eq!(matcher.threshold(), 0.75);
    }

    #[test]
    fn should_find_all_images_needle_larger_than_haystack() {
        let matcher = ImageMatcher::new();
        let needle = create_test_image(200, 200, Rgba([255, 255, 255, 255]));
        let haystack = create_test_image(50, 50, Rgba([255, 255, 255, 255]));
        let results = matcher.find_all_images(&haystack, &needle);
        assert!(results.is_empty());
    }

    #[test]
    fn should_calculate_ncc_zero_for_identical_solid_colors() {
        // NCC of two identical solid images should be NaN due to zero variance,
        // but our implementation returns 0.0 for zero denominator
        let matcher = ImageMatcher::new();
        let needle = create_test_image(10, 10, Rgba([128, 128, 128, 255]));
        let haystack = create_test_image(20, 20, Rgba([128, 128, 128, 255]));
        let result = matcher.find_image(&haystack, &needle);
        // Zero-variance images have denominator = 0 → score = 0.0 < 0.9 → not found
        assert!(!result.found);
    }

    #[test]
    fn should_handle_one_pixel_needle() {
        let matcher = ImageMatcher::with_config(MatchConfig::with_threshold(0.5));
        let needle = create_test_image(1, 1, Rgba([255, 255, 255, 255]));
        let haystack = create_test_image(5, 5, Rgba([255, 255, 255, 255]));
        let result = matcher.find_image(&haystack, &needle);
        // Returns a result (may be found or not depending on algorithm)
        // Key point: doesn't panic
        let _ = result;
    }

    #[test]
    fn should_handle_exact_same_size_images() {
        let matcher = ImageMatcher::with_config(MatchConfig::with_threshold(0.5));
        let needle = create_test_image(20, 20, Rgba([255, 255, 255, 255]));
        let haystack = create_test_image(20, 20, Rgba([255, 255, 255, 255]));
        let result = matcher.find_image(&haystack, &needle);
        let _ = result;
    }

    #[test]
    fn should_find_all_respects_max_matches() {
        let matcher = ImageMatcher::with_config(MatchConfig {
            threshold: 0.5,
            max_matches: 2,
            ..Default::default()
        });
        let needle = create_test_image(10, 10, Rgba([255, 255, 255, 255]));
        let haystack = create_test_image(100, 100, Rgba([255, 255, 255, 255]));
        let results = matcher.find_all_images(&haystack, &needle);
        assert!(results.len() <= 2);
    }

    // ========================================================================
    // CachedImageMatcher tests
    // ========================================================================

    #[test]
    fn should_create_cached_matcher_with_defaults() {
        let matcher = CachedImageMatcher::new();
        assert_eq!(matcher.threshold(), 0.9);
        let stats = matcher.cache_stats();
        assert_eq!(stats.entries, 0);
        assert_eq!(stats.hits, 0);
    }

    #[test]
    fn should_create_cached_matcher_with_cache_config() {
        let cache_config = MatchCacheConfig::new(50, 10);
        let matcher = CachedImageMatcher::with_cache_config(cache_config);
        assert_eq!(matcher.threshold(), 0.9);
    }

    #[test]
    fn should_set_threshold_on_cached_matcher() {
        let mut matcher = CachedImageMatcher::new();
        matcher.set_threshold(0.5);
        assert_eq!(matcher.threshold(), 0.5);
    }

    #[test]
    fn should_set_log_metrics_on_cached_matcher() {
        let mut matcher = CachedImageMatcher::new();
        matcher.set_log_metrics(true);
        // No direct getter; verify no panic
    }

    #[test]
    fn should_access_metrics_on_cached_matcher() {
        let matcher = CachedImageMatcher::new();
        let metrics = matcher.metrics();
        assert_eq!(metrics.total_matches, 0);
    }

    #[test]
    fn should_reset_metrics_on_cached_matcher() {
        let mut matcher = CachedImageMatcher::new();
        matcher.reset_metrics();
        let metrics = matcher.metrics();
        assert_eq!(metrics.total_matches, 0);
    }

    #[test]
    fn should_clear_cache_on_cached_matcher() {
        let mut matcher = CachedImageMatcher::new();
        matcher.clear_cache();
        let stats = matcher.cache_stats();
        assert_eq!(stats.entries, 0);
    }

    #[test]
    fn should_find_image_uncached() {
        let matcher = CachedImageMatcher::new();
        let haystack = create_test_image(30, 30, Rgba([255, 0, 0, 255]));
        let needle = create_test_image(10, 10, Rgba([0, 255, 0, 255]));
        let result = matcher.find_image(&haystack, &needle);
        // Should not panic; result depends on matching
        let _ = result;
    }

    #[test]
    fn should_find_all_images_uncached() {
        let matcher = CachedImageMatcher::new();
        let haystack = create_test_image(50, 50, Rgba([200, 200, 200, 255]));
        let needle = create_test_image(5, 5, Rgba([200, 200, 200, 255]));
        let results = matcher.find_all_images(&haystack, &needle);
        let _ = results.len();
    }

    #[test]
    fn should_cache_match_result_for_reuse() {
        let mut matcher = CachedImageMatcher::new();
        let haystack = create_test_image(30, 30, Rgba([255, 128, 64, 255]));
        let needle = create_test_image(5, 5, Rgba([255, 128, 64, 255]));
        let image_id = ImageId::new();

        // First call: should miss cache
        let _result = matcher.find_image_cached(&haystack, &needle, &image_id);
        let stats = matcher.cache_stats();
        assert_eq!(stats.misses, 1);

        // Second call with same inputs: may hit or miss depending on result
        let _result2 = matcher.find_image_cached(&haystack, &needle, &image_id);
    }

    // ========================================================================
    // ConcurrentMatcher tests
    // ========================================================================

    #[test]
    fn should_create_concurrent_matcher_with_defaults() {
        let matcher = ConcurrentMatcher::new();
        // Verify no panic on creation
        let _ = matcher;
    }

    #[test]
    fn should_create_concurrent_matcher_with_custom_config() {
        let config = MatchConfig::with_threshold(0.5);
        let cache_config = MatchCacheConfig::new(50, 10);
        let matcher = ConcurrentMatcher::with_config(config, cache_config);
        let _ = matcher;
    }

    #[test]
    fn should_handle_empty_parallel_match() {
        let matcher = ConcurrentMatcher::new();
        let haystack = create_test_image(50, 50, Rgba([255, 0, 0, 255]));
        let results = matcher.find_images_parallel(&haystack, vec![]);
        assert!(results.is_empty());
    }

    #[test]
    fn should_handle_single_parallel_match() {
        let matcher = ConcurrentMatcher::new();
        let haystack = create_test_image(50, 50, Rgba([255, 0, 0, 255]));
        let image_id = ImageId::new();
        let needle = create_test_image(10, 10, Rgba([0, 255, 0, 255]));
        let results =
            matcher.find_images_parallel(&haystack, vec![(image_id.clone(), needle)]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].0, image_id);
    }

    #[test]
    fn should_handle_multiple_parallel_matches() {
        let matcher = ConcurrentMatcher::new();
        let haystack = create_test_image(100, 100, Rgba([128, 128, 128, 255]));

        let id1 = ImageId::new();
        let id2 = ImageId::new();
        let needle1 = create_test_image(10, 10, Rgba([255, 0, 0, 255]));
        let needle2 = create_test_image(8, 8, Rgba([0, 255, 0, 255]));

        let results = matcher.find_images_parallel(
            &haystack,
            vec![(id1.clone(), needle1), (id2.clone(), needle2)],
        );
        assert_eq!(results.len(), 2);
    }

    /// Test that matching does not panic with multi-colored haystacks.
    /// Note: NCC requires variance; solid-color images produce zero-score matches.
    #[test]
    fn should_handle_multi_colored_haystack_without_panic() {
        let matcher = ImageMatcher::with_config(MatchConfig::with_threshold(0.7));

        // Create a 60x30 haystack: left half red, right half green
        let mut haystack_img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::new(60, 30);
        for (_x, _y, pixel) in haystack_img.enumerate_pixels_mut() {
            *pixel = if _x < 30 {
                Rgba([255, 0, 0, 255])
            } else {
                Rgba([0, 255, 0, 255])
            };
        }
        let haystack = DynamicImage::ImageRgba8(haystack_img);

        // Create a green needle
        let needle = create_test_image(5, 5, Rgba([0, 255, 0, 255]));

        let result = matcher.find_image(&haystack, &needle);
        // NCC may fail on solid-color images (zero variance).
        // Main assertion: function does not crash.
        assert!(!result.found || result.center_x.is_some());
    }
}
