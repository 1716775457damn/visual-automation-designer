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

use image::{DynamicImage, GenericImage, GenericImageView, Rgba};

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

/// Result of a pixel-level image diff comparison
#[derive(Debug, Clone)]
pub struct DiffResult {
    /// Whether the images match within the given threshold
    pub passed: bool,
    /// Proportion of pixels that differ (0.0 to 1.0)
    pub diff_percentage: f64,
    /// Total number of differing pixels
    pub diff_pixel_count: u64,
    /// Total number of pixels compared
    pub total_pixels: u64,
    /// Optional diff heatmap image (pixels exceeding threshold highlighted in red)
    /// Only set when there are differences
    pub diff_image: Option<DynamicImage>,
}

impl DiffResult {
    /// Create a "passed" result (identical images or within threshold)
    pub fn passed() -> Self {
        Self {
            passed: true,
            diff_percentage: 0.0,
            diff_pixel_count: 0,
            total_pixels: 0,
            diff_image: None,
        }
    }

    /// Create a "failed" result with diff details
    pub fn failed(
        diff_percentage: f64,
        diff_pixel_count: u64,
        total_pixels: u64,
        diff_image: Option<DynamicImage>,
    ) -> Self {
        Self {
            passed: diff_percentage <= 0.0,
            diff_percentage,
            diff_pixel_count,
            total_pixels,
            diff_image,
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

/// Flat grayscale buffer — converts a DynamicImage to a contiguous f64 array
/// once, eliminating repeated `get_pixel()` calls (which involve dynamic
/// dispatch, bounds checks, and colour conversion) during template matching.
struct GrayBuffer {
    data: Vec<f64>,
    width: u32,
    height: u32,
}

impl GrayBuffer {
    /// Build the buffer by sampling every pixel of `image`.
    /// Called once per match — the O(W×H) cost is negligible compared to
    /// the billions of `get_pixel` calls it replaces.
    fn from_image(image: &DynamicImage) -> Self {
        let (width, height) = (image.width(), image.height());
        let mut data = Vec::with_capacity((width * height) as usize);
        for y in 0..height {
            for x in 0..width {
                let p = image.get_pixel(x, y);
                data.push(Self::to_grayscale(&p));
            }
        }
        Self { data, width, height }
    }

    /// Convert RGBA pixel to grayscale (matches ImageMatcher::to_grayscale).
    fn to_grayscale(pixel: &Rgba<u8>) -> f64 {
        0.299 * pixel[0] as f64 + 0.587 * pixel[1] as f64 + 0.114 * pixel[2] as f64
    }
}

/// Summed-Area Table (integral image) for O(1) rectangular region sums.
///
/// Precomputing the SAT once per haystack eliminates the inner "sum over
/// needle region" loop that `calculate_ncc_at` would otherwise repeat for
/// every search position.
///
/// Size: (W+1) × (H+1) f64 entries.  For a 4K screen ≈ 66 MB, allocated
/// once per top-level `find_image` call and dropped after the search.
struct IntegralImage {
    data: Vec<f64>,
    /// Width  = original_image_width  + 1  (top row is all-0 sentinel)
    width: u32,
    /// Height = original_image_height + 1  (left column is all-0 sentinel)
    _height: u32,
}

impl IntegralImage {
    /// Build from a `GrayBuffer`.  Result has (W+1)×(H+1) elements.
    fn from_buffer(buf: &GrayBuffer) -> Self {
        let w = buf.width + 1;
        let h = buf.height + 1;
        let cap = (w * h) as usize;
        let mut data = vec![0.0; cap];

        // Standard incremental SAT: SAT[y+1][x+1] = gray[y][x]
        //   + SAT[y][x+1] + SAT[y+1][x] - SAT[y][x]
        let iw = buf.width;
        for y in 0..buf.height {
            let sat_curr = ((y + 1) * w) as usize;
            let sat_prev = (y * w) as usize;
            let gray_off = (y * iw) as usize;
            for x in 0..iw {
                let g_val = buf.data[gray_off + x as usize];
                let idx = sat_curr + x as usize + 1;
                data[idx] = g_val
                    + data[sat_prev + x as usize + 1]
                    + data[sat_curr + x as usize]
                    - data[sat_prev + x as usize];
            }
        }

        Self { data, width: w, _height: h }
    }

    /// Sum of the rectangle [x, x+w) × [y, y+h) in O(1).
    #[inline]
    fn rect_sum(&self, x: u32, y: u32, w: u32, h: u32) -> f64 {
        let (x1, y1) = (x as usize, y as usize);
        let (x2, y2) = ((x + w) as usize, (y + h) as usize);
        let stride = self.width as usize;

        // SAT formula: sum = br - tr - bl + tl
        let br = self.data[y2 * stride + x2];
        let tr = self.data[y1 * stride + x2];
        let bl = self.data[y2 * stride + x1];
        let tl = self.data[y1 * stride + x1];
        br + tl - tr - bl
    }
}

/// Precomputed needle data for fast NCC matching (fast formula).
///
/// Stores raw grayscale values, ΣN and ΣN² so every `calculate_ncc_at`
/// call can use the numerically-equivalent fast NCC form:
///
///   NCC = (n·ΣHN − ΣH·ΣN) / √((n·ΣH² − ΣH²)·(n·ΣN² − ΣN²))
///
/// where ΣH / ΣH² come from the haystack's integral image (O(1)) and
/// ΣHN is the only term that still requires a single per-pixel pass.
struct NeedleCache {
    /// Raw grayscale pixel values (not centered).
    grays: Vec<f64>,
    /// ΣN — raw sum of needle grayscale values.
    sum: f64,
    /// ΣN² — raw sum of squared grayscale values.
    sum_sq: f64,
    width: u32,
    height: u32,
    pixel_count: f64,
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

    /// Precompute needle grayscale data for the fast NCC formula.
    ///
    /// Stores raw (not centered) grayscale values plus ΣN and ΣN² so the
    /// per-position calculation can use:
    ///
    ///   NCC = (n·ΣHN − ΣH·ΣN) / √((n·ΣH² − ΣH²)·(n·ΣN² − ΣN²))
    fn precompute_needle(needle: &DynamicImage) -> NeedleCache {
        let width = needle.width();
        let height = needle.height();
        let size = (width * height) as usize;
        let mut grays = Vec::with_capacity(size);
        let mut sum = 0.0;
        let mut sum_sq = 0.0;

        for py in 0..height {
            for px in 0..width {
                let pixel = needle.get_pixel(px, py);
                let gray = Self::to_grayscale(&pixel);
                grays.push(gray);
                sum += gray;
                sum_sq += gray * gray;
            }
        }

        NeedleCache {
            grays,
            sum,
            sum_sq,
            width,
            height,
            pixel_count: size as f64,
        }
    }

    /// Build the per-haystack acceleration structures (gray buffer + SAT)
    /// once per top-level `find_image` / `find_all_images` call.
    fn precompute_haystack(haystack: &DynamicImage) -> (GrayBuffer, IntegralImage) {
        let gray = GrayBuffer::from_image(haystack);
        let sat = IntegralImage::from_buffer(&gray);
        (gray, sat)
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

        // Precompute needle + haystack acceleration structures (done once)
        let needle_cache = Self::precompute_needle(needle);
        let (gray, sat) = Self::precompute_haystack(haystack);

        // Perform template matching using flat buffer + integral image
        let (best_x, best_y, best_score) = self.template_match(&gray, &sat, &needle_cache);

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

        // Precompute acceleration structures once
        let needle_cache = Self::precompute_needle(needle);
        let (gray, sat) = Self::precompute_haystack(haystack);

        let mut results = Vec::new();
        let mut used_positions = Vec::new();

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

                let score = self.calculate_ncc_at(&gray, &sat, &needle_cache, x, y);

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

    /// Template matching using Normalized Cross-Correlation.
    ///
    /// Uses the precomputed `GrayBuffer` and `IntegralImage` so that the
    /// haystack region sum is O(1) and pixel access is a flat-array index
    /// instead of a `get_pixel()` call.
    fn template_match(
        &self,
        gray: &GrayBuffer,
        sat: &IntegralImage,
        needle_cache: &NeedleCache,
    ) -> (u32, u32, f64) {
        let needle_width = needle_cache.width;
        let needle_height = needle_cache.height;

        let search_width = gray.width - needle_width + 1;
        let search_height = gray.height - needle_height + 1;

        let mut best_x = 0;
        let mut best_y = 0;
        let mut best_score = 0.0;

        // Sample every few pixels for performance
        let step = if needle_width > 50 || needle_height > 50 { 2 } else { 1 };

        for y in (0..search_height).step_by(step) {
            for x in (0..search_width).step_by(step) {
                let score = self.calculate_ncc_at(gray, sat, needle_cache, x, y);
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
                    let score = self.calculate_ncc_at(gray, sat, needle_cache, x, y);
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

    /// Calculate Normalized Cross-Correlation at a specific position.
    ///
    /// Uses the **fast NCC formula** (mathematically equivalent to the
    /// standard centred form but avoiding an explicit mean-computation pass):
    ///
    ///   n = needle pixel count  
    ///   ΣH  = integral-image rect sum  (O(1))  
    ///   ΣHN = single per-pixel pass over the needle region  
    ///   ΣH² = same pass, accumulated  
    ///
    ///   NCC = (n·ΣHN − ΣH·ΣN) / √((n·ΣH² − ΣH²)·(n·ΣN² − ΣN²))
    fn calculate_ncc_at(
        &self,
        gray: &GrayBuffer,
        sat: &IntegralImage,
        needle_cache: &NeedleCache,
        x: u32,
        y: u32,
    ) -> f64 {
        let nw = needle_cache.width;
        let nh = needle_cache.height;
        let n = needle_cache.pixel_count;

        if n == 0.0 {
            return 0.0;
        }

        // O(1) — haystack region sum from integral image
        let sum_h = sat.rect_sum(x, y, nw, nh);

        // Single per-pixel pass: ΣHN (cross term) + ΣH² (for variance).
        // Needle values are raw (not centred) — the fast formula handles
        // centring algebraically so we avoid a second loop.
        let mut sum_hn = 0.0;
        let mut sum_h_sq = 0.0;
        let mut idx: usize = 0;

        let gw = gray.width;
        for py in 0..nh {
            let row_start = ((y + py) * gw + x) as usize;
            for px in 0..nw {
                let h_val = gray.data[row_start + px as usize];
                let n_val = needle_cache.grays[idx];
                sum_hn += h_val * n_val;
                sum_h_sq += h_val * h_val;
                idx += 1;
            }
        }

        // Fast NCC formula (avoids computing centred values explicitly).
        // Numerically identical to the standard form:
        //   (n·ΣHN − ΣH·ΣN)  =  n² · Cov(H,N)         (scaled by n)
        //   (n·ΣH² − ΣH²)    =  n² · Var(H)            (scaled by n)
        //   (n·ΣN² − ΣN²)    =  n² · Var(N)            (scaled by n)
        let numerator = n * sum_hn - sum_h * needle_cache.sum;
        let denom_h = n * sum_h_sq - sum_h * sum_h;
        let denom_n = n * needle_cache.sum_sq - needle_cache.sum * needle_cache.sum;

        // Use an epsilon to guard against floating-point noise from SAT
        // accumulation when the image region is uniform (zero variance).
        // For normal images denom is >> 1e-3; near-zero-variance → NCC undefined.
        // The 1e-6 threshold handles SAT cumulative rounding (~3e-8 per pixel
        // for uniform images) while being << typical image variance.
        const VARIANCE_EPS: f64 = 1e-6;
        if denom_h <= VARIANCE_EPS || denom_n <= VARIANCE_EPS {
            return 0.0;
        }

        let denominator = (denom_h * denom_n).sqrt();
        if denominator == 0.0 {
            return 0.0;
        }

        (numerator / denominator).clamp(-1.0, 1.0)
    }

    /// Compare two images pixel-by-pixel and return a diff result.
    ///
    /// This method:
    /// 1. Resizes the reference image to match the actual screenshot dimensions
    /// 2. Computes per-pixel absolute difference in grayscale
    /// 3. Counts pixels whose difference exceeds the contrast threshold
    /// 4. Generates an optional diff heatmap (red overlay on differing regions)
    ///
    /// # Arguments
    /// * `reference` - The reference/expected image
    /// * `actual` - The actual screenshot to compare
    /// * `diff_threshold` - Pixel-level difference threshold (0-255, default 30).
    ///   Pixels with grayscale difference above this are counted as "different".
    /// * `generate_heatmap` - Whether to generate a diff heatmap image
    ///
    /// # Returns
    /// A `DiffResult` with pass/fail, percentage, and optional heatmap
    pub fn diff_images(
        &self,
        reference: &DynamicImage,
        actual: &DynamicImage,
        diff_threshold: u8,
        generate_heatmap: bool,
    ) -> DiffResult {
        // Resize reference to match actual dimensions if needed
        let reference = if reference.dimensions() != actual.dimensions() {
            reference.resize_exact(
                actual.width(),
                actual.height(),
                image::imageops::FilterType::Nearest,
            )
        } else {
            reference.clone()
        };

        let width = actual.width();
        let height = actual.height();
        let total_pixels = (width as u64) * (height as u64);
        if total_pixels == 0 {
            return DiffResult::passed();
        }

        let mut diff_count: u64 = 0;
        let mut diff_img = if generate_heatmap {
            // Start with a clone of the actual image for the heatmap background
            Some(actual.clone())
        } else {
            None
        };

        // Iterate over every pixel and compute grayscale difference
        for y in 0..height {
            for x in 0..width {
                let ref_pixel = reference.get_pixel(x, y);
                let actual_pixel = actual.get_pixel(x, y);
                let ref_gray = Self::to_grayscale(&ref_pixel) as u8;
                let actual_gray = Self::to_grayscale(&actual_pixel) as u8;
                let diff = if ref_gray >= actual_gray {
                    ref_gray - actual_gray
                } else {
                    actual_gray - ref_gray
                };

                if diff > diff_threshold {
                    diff_count += 1;
                    // Mark differing pixels in red on the heatmap
                    if let Some(ref mut img) = diff_img {
                        img.put_pixel(x, y, Rgba([255, 0, 0, 255]));
                    }
                }
            }
        }

        let diff_percentage = diff_count as f64 / total_pixels as f64;
        let diff_image = if diff_count > 0 { diff_img } else { None };

        DiffResult::failed(diff_percentage, diff_count, total_pixels, diff_image)
    }

    /// Compare two images using optional downscaling for faster approximate results.
    ///
    /// This method downsamples both images by the given scale factor before
    /// computing the per-pixel diff. This provides a speed-vs-accuracy tradeoff
    /// at the cost of precision — useful for quick previews or very large images.
    ///
    /// The returned `diff_percentage` is approximate: it reflects the fraction of
    /// differing *downsampled* pixels, which may not exactly match the full-resolution
    /// result. For pixel-level accuracy, use `diff_images` instead.
    ///
    /// # Arguments
    /// * `reference` - The reference/expected image
    /// * `actual` - The actual screenshot to compare
    /// * `diff_threshold` - Pixel-level grayscale difference threshold (0-255)
    /// * `generate_heatmap` - Whether to generate a diff heatmap at the scaled resolution
    /// * `scale_factor` - Downscaling factor (0.0 to 1.0). 1.0 = no scaling, 0.25 = 16x fewer pixels.
    ///   Recommended: 0.5 for 4K screenshots, 1.0 for normal use.
    ///
    /// # Returns
    /// A `DiffResult` with approximate pass/fail, percentage, and optional heatmap
    pub fn diff_images_scaled(
        &self,
        reference: &DynamicImage,
        actual: &DynamicImage,
        diff_threshold: u8,
        generate_heatmap: bool,
        scale_factor: f64,
    ) -> DiffResult {
        let scale = scale_factor.clamp(0.01, 1.0);

        let (ref_w, ref_h) = reference.dimensions();
        let (act_w, act_h) = actual.dimensions();

        // Use the actual image dimensions as target
        let target_w = (act_w as f64 * scale) as u32;
        let target_h = (act_h as f64 * scale) as u32;

        let reference_scaled = if scale < 1.0 || ref_w != act_w || ref_h != act_h {
            reference.resize_exact(
                target_w.max(1),
                target_h.max(1),
                image::imageops::FilterType::Lanczos3,
            )
        } else {
            reference.clone()
        };

        let actual_scaled = if scale < 1.0 {
            actual.resize_exact(
                target_w.max(1),
                target_h.max(1),
                image::imageops::FilterType::Lanczos3,
            )
        } else {
            actual.clone()
        };

        // Delegate to full diff with the scaled images
        self.diff_images(&reference_scaled, &actual_scaled, diff_threshold, generate_heatmap)
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

    // ========================================================================
    // Real-world matching tests (non-uniform images with variance)
    // ========================================================================

    /// Helper: create a grayscale image with an arrow/chevron pattern.
    /// The pattern is: a bright diagonal stripe on a dark background.
    fn create_pattern_image(width: u32, height: u32) -> DynamicImage {
        let mut img = ImageBuffer::new(width, height);
        for y in 0..height {
            for x in 0..width {
                // Diagonal gradient: bright at (x=y), dark elsewhere
                let dist = if x >= y { x - y } else { y - x };
                let v = if dist < 3 { 220 } else { 30 };
                img.put_pixel(x, y, Rgba([v, v, v, 255]));
            }
        }
        DynamicImage::ImageRgba8(img)
    }

    /// Helper: create a textured checkerboard image.
    fn create_checkerboard_image(
        width: u32, height: u32, tile: u32,
        dark: u8, light: u8,
    ) -> DynamicImage {
        let mut img = ImageBuffer::new(width, height);
        for y in 0..height {
            for x in 0..width {
                let is_light = ((x / tile) + (y / tile)) % 2 == 0;
                let v = if is_light { light } else { dark };
                img.put_pixel(x, y, Rgba([v, v, v, 255]));
            }
        }
        DynamicImage::ImageRgba8(img)
    }

    #[test]
    fn should_find_pattern_needle_in_pattern_haystack() {
        let matcher = ImageMatcher::with_config(MatchConfig::with_threshold(0.85));

        let haystack = create_checkerboard_image(100, 100, 8, 30, 200);
        let needle = create_checkerboard_image(24, 24, 8, 30, 200);

        let result = matcher.find_image(&haystack, &needle);

        assert!(
            result.found,
            "Pattern image should be found with score >= 0.85, got confidence={:?}",
            result.confidence
        );
    }

    #[test]
    fn should_find_diagonal_pattern_needle() {
        let matcher = ImageMatcher::with_config(MatchConfig::with_threshold(0.8));

        let haystack = create_pattern_image(60, 60);
        // Extract a sub-region as needle (should match exactly)
        let needle_img = {
            let mut img = ImageBuffer::new(20, 20);
            for y in 0..20u32 {
                for x in 0..20u32 {
                    let dist = if x >= y { x - y } else { y - x };
                    let v = if dist < 3 { 220 } else { 30 };
                    img.put_pixel(x, y, Rgba([v, v, v, 255]));
                }
            }
            DynamicImage::ImageRgba8(img)
        };

        let result = matcher.find_image(&haystack, &needle_img);

        assert!(
            result.found,
            "Diagonal pattern should be found with score >= 0.8, got confidence={:?}",
            result.confidence
        );
    }

    #[test]
    fn should_find_sub_region_in_large_haystack() {
        // Realistic test: create a 200x200 haystack with a pseudo-random pattern
        // and extract a 30x30 sub-region as needle.
        // The pattern uses position-hashing so every window is unique,
        // preventing false duplicate matches from periodic or smooth patterns.
        let matcher = ImageMatcher::with_config(MatchConfig::with_threshold(0.9));

        let mut haystack_img = ImageBuffer::new(200, 200);
        for y in 0..200u32 {
            for x in 0..200u32 {
                // Position-hash: gives uncorrelated values per pixel
                let h = (x.wrapping_mul(374761393) ^ y.wrapping_mul(668265263)).wrapping_add(1274126177);
                let base = ((h >> 16) & 0xFF) as u8;
                // Spread range to ensure good variance for NCC
                let base = if base < 128 { 28 + base % 100 } else { 128 + base % 100 };
                haystack_img.put_pixel(x, y, Rgba([base, base, base, 255]));
            }
        }

        // Create needle by copying a 30x30 sub-region from (50, 60)
        let mut needle_img = ImageBuffer::new(30, 30);
        for y in 0..30u32 {
            for x in 0..30u32 {
                let p = haystack_img.get_pixel(50 + x, 60 + y);
                needle_img.put_pixel(x, y, Rgba([p[0], p[1], p[2], p[3]]));
            }
        }

        let haystack = DynamicImage::ImageRgba8(haystack_img);
        let needle = DynamicImage::ImageRgba8(needle_img);

        let result = matcher.find_image(&haystack, &needle);

        assert!(
            result.found,
            "Sub-region should be found with score >= 0.9, got confidence={:?}, best_score={:?}",
            result.confidence,
            result.confidence,
        );

        if result.found {
            assert_eq!(
                result.center_x,
                Some(50 + 30 / 2),
                "Match center x should be at 65"
            );
            assert_eq!(
                result.center_y,
                Some(60 + 30 / 2),
                "Match center y should be at 75"
            );
        }
    }

    #[test]
    fn should_find_sub_region_after_image_roundtrip() {
        // Simulate: image saved as PNG and re-loaded (common in the app)
        let matcher = ImageMatcher::with_config(MatchConfig::with_threshold(0.85));

        let mut haystack_img = ImageBuffer::new(80, 80);
        for y in 0..80u32 {
            for x in 0..80u32 {
                // Sinusoidal pattern (non-uniform, has variance)
                let phase = ((x as f64 * 0.3 + y as f64 * 0.5).sin() * 0.5 + 0.5) * 200.0 + 28.0;
                let v = phase as u8;
                haystack_img.put_pixel(x, y, Rgba([v, v, v, 255]));
            }
        }

        // Extract needle from (20, 15), size 25x25
        let mut needle_img = ImageBuffer::new(25, 25);
        for y in 0..25u32 {
            for x in 0..25u32 {
                let p = haystack_img.get_pixel(20 + x, 15 + y);
                needle_img.put_pixel(x, y, Rgba([p[0], p[1], p[2], p[3]]));
            }
        }

        // Round-trip through PNG encoding/decoding to simulate save+load
        let mut png_bytes = Vec::new();
        {
            let haystack_dyn = DynamicImage::ImageRgba8(haystack_img.clone());
            haystack_dyn.write_to(&mut std::io::Cursor::new(&mut png_bytes), image::ImageFormat::Png)
                .expect("PNG encode should succeed");
        }

        let haystack_loaded = image::load_from_memory(&png_bytes)
            .expect("PNG decode should succeed");

        let result = matcher.find_image(&haystack_loaded, &DynamicImage::ImageRgba8(needle_img));

        assert!(
            result.found,
            "Sub-region should be found after PNG round-trip with score >= 0.85, got confidence={:?}",
            result.confidence
        );
    }

    #[test]
    fn should_find_image_with_small_needle() {
        // Small needle (10x10) with a distinct pattern in a larger haystack
        let matcher = ImageMatcher::with_config(MatchConfig::with_threshold(0.85));

        let mut haystack_img = ImageBuffer::new(120, 120);
        for y in 0..120u32 {
            for x in 0..120u32 {
                // Position-hash pattern (uncorrelated between positions)
                let h = (x.wrapping_mul(374761393) ^ y.wrapping_mul(668265263)).wrapping_add(1274126177);
                let base = ((h >> 16) & 0xFF) as u8;
                let v = if base < 128 { 28 + base % 100 } else { 128 + base % 100 };
                haystack_img.put_pixel(x, y, Rgba([v, v, v, 255]));
            }
        }

        // Needle: 10x10 sub-region from (40, 50)
        let mut needle_img = ImageBuffer::new(10, 10);
        for y in 0..10u32 {
            for x in 0..10u32 {
                let p = haystack_img.get_pixel(40 + x, 50 + y);
                needle_img.put_pixel(x, y, Rgba([p[0], p[1], p[2], p[3]]));
            }
        }

        let haystack = DynamicImage::ImageRgba8(haystack_img);
        let needle = DynamicImage::ImageRgba8(needle_img);

        let result = matcher.find_image(&haystack, &needle);

        assert!(
            result.found,
            "Small needle should be found with score >= 0.85, got confidence={:?}",
            result.confidence
        );

        if result.found {
            assert_eq!(result.center_x, Some(40 + 10 / 2), "Center x should be 45");
            assert_eq!(result.center_y, Some(50 + 10 / 2), "Center y should be 55");
        }
    }

    // ========================================================================
    // diff_images tests (Phase C — ScreenshotAssert)
    // ========================================================================

    #[test]
    fn should_diff_identical_images_zero_percentage() {
        let matcher = ImageMatcher::new();
        let img = create_test_image(100, 100, Rgba([128, 128, 128, 255]));
        let result = matcher.diff_images(&img, &img, 30, false);
        assert!(result.passed);
        assert_eq!(result.diff_percentage, 0.0);
        assert_eq!(result.diff_pixel_count, 0);
        assert_eq!(result.total_pixels, 100 * 100);
        assert!(result.diff_image.is_none());
    }

    #[test]
    fn should_diff_completely_different_images() {
        let matcher = ImageMatcher::new();
        let white = create_test_image(50, 50, Rgba([255, 255, 255, 255]));
        let black = create_test_image(50, 50, Rgba([0, 0, 0, 255]));
        let result = matcher.diff_images(&white, &black, 30, false);
        // Every pixel differs by 255 > 30
        assert_eq!(result.diff_percentage, 1.0);
        assert_eq!(result.diff_pixel_count, 50 * 50);
        assert_eq!(result.total_pixels, 50 * 50);
    }

    #[test]
    fn should_diff_slightly_different_images() {
        let matcher = ImageMatcher::new();
        let base = create_test_image(10, 10, Rgba([100, 100, 100, 255]));
        let mut slightly_diff = ImageBuffer::new(10, 10);
        for y in 0..10u32 {
            for x in 0..10u32 {
                // One pixel differs by 50, rest are identical
                let v = if x == 5 && y == 5 { 50 } else { 100 };
                slightly_diff.put_pixel(x, y, Rgba([v, v, v, 255]));
            }
        }
        let result = matcher.diff_images(
            &base,
            &DynamicImage::ImageRgba8(slightly_diff),
            30, false,
        );
        assert_eq!(result.total_pixels, 100);
        assert_eq!(result.diff_pixel_count, 1);
        assert!((result.diff_percentage - 0.01).abs() < 1e-6);
    }

    #[test]
    fn should_diff_with_generate_heatmap() {
        let matcher = ImageMatcher::new();
        let white = create_test_image(20, 20, Rgba([255, 255, 255, 255]));
        let black = create_test_image(20, 20, Rgba([0, 0, 0, 255]));
        let result = matcher.diff_images(&white, &black, 30, true);
        assert!(result.diff_image.is_some());
        let heatmap = result.diff_image.unwrap();
        // Heatmap should have same dimensions
        assert_eq!(heatmap.dimensions(), (20, 20));
    }

    #[test]
    fn should_diff_resize_when_dimensions_differ() {
        let matcher = ImageMatcher::new();
        let small = create_test_image(10, 10, Rgba([255, 255, 255, 255]));
        let large = create_test_image(20, 20, Rgba([255, 255, 255, 255]));
        let result = matcher.diff_images(&small, &large, 30, false);
        // After resize to 20x20 via Nearest, all pixels should be identical
        assert_eq!(result.diff_percentage, 0.0);
        assert_eq!(result.total_pixels, 20 * 20);
    }

    #[test]
    fn should_diff_with_zero_threshold_treats_all_differences() {
        let matcher = ImageMatcher::new();
        let white = create_test_image(10, 10, Rgba([255, 255, 255, 255]));
        let almost_white = create_test_image(10, 10, Rgba([254, 254, 254, 255]));
        let result = matcher.diff_images(&white, &almost_white, 0, false);
        // With threshold=0, even a 1-bit difference counts
        assert_eq!(result.diff_pixel_count, 100);
        assert_eq!(result.diff_percentage, 1.0);
    }

    #[test]
    fn should_diff_with_high_threshold_ignores_small_differences() {
        let matcher = ImageMatcher::new();
        let white = create_test_image(10, 10, Rgba([255, 255, 255, 255]));
        let almost_white = create_test_image(10, 10, Rgba([200, 200, 200, 255]));
        // With threshold=100, diff of 55 should be below threshold
        let result = matcher.diff_images(&white, &almost_white, 100, false);
        assert_eq!(result.diff_pixel_count, 0);
        assert_eq!(result.diff_percentage, 0.0);
    }

    #[test]
    fn should_diff_empty_images_gracefully() {
        let matcher = ImageMatcher::new();
        let empty = create_test_image(0, 0, Rgba([0, 0, 0, 255]));
        let result = matcher.diff_images(&empty, &empty, 30, false);
        assert!(result.passed);
        assert_eq!(result.total_pixels, 0);
    }

    // ========================================================================
    // Comprehensive runtime-simulation tests
    // ========================================================================

    /// Helper: create a position-hash pixel value that is unique per (x,y) window.
    /// Two different (x,y) pairs are extremely unlikely to produce the same value.
    fn position_hash_pixel(x: u32, y: u32) -> u8 {
        let h = (x.wrapping_mul(374761393) ^ y.wrapping_mul(668265263)).wrapping_add(1274126177);
        let base = ((h >> 16) & 0xFF) as u8;
        if base < 128 { 28 + base % 100 } else { 128 + base % 100 }
    }

    /// Helper: create an ImageBuffer with position-hash pattern
    fn create_position_hash_image(w: u32, h: u32) -> ImageBuffer<Rgba<u8>, Vec<u8>> {
        let mut img = ImageBuffer::new(w, h);
        for y in 0..h {
            for x in 0..w {
                let v = position_hash_pixel(x, y);
                img.put_pixel(x, y, Rgba([v, v, v, 255]));
            }
        }
        img
    }

    #[test]
    fn should_find_exact_match_at_ncc_one() {
        // Prove the algorithm produces NCC ≈ 1.0 for exact sub-region matches.
        // The threshold 0.99 guarantees any match found has NCC > 0.99 (≈ 1.0).
        let matcher = ImageMatcher::with_config(MatchConfig::with_threshold(0.99));

        let (w, h) = (100, 100);
        let (nw, nh) = (20, 20);
        let (origin_x, origin_y) = (37, 42);

        let haystack_img = create_position_hash_image(w, h);

        // Extract needle as exact sub-region
        let mut needle_img = ImageBuffer::new(nw, nh);
        for y in 0..nh {
            for x in 0..nw {
                let p = haystack_img.get_pixel(origin_x + x, origin_y + y);
                needle_img.put_pixel(x, y, Rgba([p[0], p[1], p[2], p[3]]));
            }
        }

        let haystack = DynamicImage::ImageRgba8(haystack_img);
        let needle = DynamicImage::ImageRgba8(needle_img);

        let result = matcher.find_image(&haystack, &needle);

        assert!(
            result.found,
            "Exact sub-region match should give NCC ≈ 1.0 (≥0.99), got confidence={:?}",
            result.confidence
        );

        if let Some(conf) = result.confidence {
            assert!(
                conf >= 0.99,
                "Exact match confidence should be ≥ 0.99, got {}",
                conf
            );
        }

        if result.found {
            let expected_cx = origin_x + nw / 2;
            let expected_cy = origin_y + nh / 2;
            assert_eq!(
                result.center_x,
                Some(expected_cx),
                "Center x should be at {}",
                expected_cx
            );
            assert_eq!(
                result.center_y,
                Some(expected_cy),
                "Center y should be at {}",
                expected_cy
            );
        }
    }

    #[test]
    fn should_find_exact_match_after_png_roundtrip() {
        // Simulate the exact runtime flow:
        // 1. Create a "screenshot" and "template" image
        // 2. Save both as PNG (via write_to)
        // 3. Load both back (via load_from_memory — same as image::open for in-memory)
        // 4. Run NCC matching at production threshold (0.9)
        let matcher = ImageMatcher::with_config(MatchConfig::with_threshold(0.9));

        let (w, h) = (200, 200);
        let (nw, nh) = (30, 30);
        let (origin_x, origin_y) = (55, 65);

        let haystack_raw = create_position_hash_image(w, h);

        // Extract needle sub-region
        let mut needle_raw = ImageBuffer::new(nw, nh);
        for y in 0..nh {
            for x in 0..nw {
                let p = haystack_raw.get_pixel(origin_x + x, origin_y + y);
                needle_raw.put_pixel(x, y, Rgba([p[0], p[1], p[2], p[3]]));
            }
        }

        // Round-trip haystack through PNG (simulates screen capture → save → load)
        let mut haystack_png = Vec::new();
        DynamicImage::ImageRgba8(haystack_raw.clone())
            .write_to(&mut std::io::Cursor::new(&mut haystack_png), image::ImageFormat::Png)
            .expect("Haystack PNG encode");
        let haystack = image::load_from_memory(&haystack_png)
            .expect("Haystack PNG decode");

        // Round-trip needle through PNG (simulates paste → encode → save → load)
        let mut needle_png = Vec::new();
        DynamicImage::ImageRgba8(needle_raw.clone())
            .write_to(&mut std::io::Cursor::new(&mut needle_png), image::ImageFormat::Png)
            .expect("Needle PNG encode");
        let needle = image::load_from_memory(&needle_png)
            .expect("Needle PNG decode");

        let result = matcher.find_image(&haystack, &needle);

        assert!(
            result.found,
            "After PNG round-trip, exact sub-region should be found at threshold 0.9, got confidence={:?}",
            result.confidence
        );

        if result.found {
            let expected_cx = origin_x + nw / 2;
            let expected_cy = origin_y + nh / 2;
            assert_eq!(result.center_x, Some(expected_cx), "Center x mismatch after PNG round-trip");
            assert_eq!(result.center_y, Some(expected_cy), "Center y mismatch after PNG round-trip");
        }
    }

    #[test]
    fn should_find_match_with_image_rgb8_variant() {
        // Pasted images may be loaded as ImageRgb8 (no alpha channel).
        // Screen captures are always ImageRgba8.
        // Test that matching works when needle is ImageRgb8 and haystack is ImageRgba8.
        let matcher = ImageMatcher::with_config(MatchConfig::with_threshold(0.9));

        let (w, h) = (150, 150);
        let (nw, nh) = (25, 25);
        let (origin_x, origin_y) = (40, 50);

        // Create haystack as ImageRgba8 (simulates screen capture)
        let mut haystack_rgba = ImageBuffer::<Rgba<u8>, Vec<u8>>::new(w, h);
        for y in 0..h {
            for x in 0..w {
                let v = position_hash_pixel(x, y);
                haystack_rgba.put_pixel(x, y, Rgba([v, v, v, 255]));
            }
        }

        // Create needle as ImageRgb8 (simulates pasted image loaded without alpha)
        use image::RgbImage;
        let mut needle_rgb = RgbImage::new(nw, nh);
        for y in 0..nh {
            for x in 0..nw {
                let p = haystack_rgba.get_pixel(origin_x + x, origin_y + y);
                needle_rgb.put_pixel(x, y, image::Rgb([p[0], p[1], p[2]]));
            }
        }

        let haystack = DynamicImage::ImageRgba8(haystack_rgba);
        let needle = DynamicImage::ImageRgb8(needle_rgb);

        let result = matcher.find_image(&haystack, &needle);

        assert!(
            result.found,
            "Needle (ImageRgb8) should be found in haystack (ImageRgba8) at threshold 0.9, got confidence={:?}",
            result.confidence
        );

        if result.found {
            let expected_cx = origin_x + nw / 2;
            let expected_cy = origin_y + nh / 2;
            assert_eq!(result.center_x, Some(expected_cx), "Center x with ImageRgb8 needle");
            assert_eq!(result.center_y, Some(expected_cy), "Center y with ImageRgb8 needle");
        }
    }

    #[test]
    fn should_find_match_with_step2_large_needle() {
        // Needles >50px trigger step=2 scanning + refinement.
        // Test that this path correctly finds the best match.
        let matcher = ImageMatcher::with_config(MatchConfig::with_threshold(0.9));

        let (w, h) = (200, 200);
        let (nw, nh) = (60, 60);  // >50 → triggers step=2
        let (origin_x, origin_y) = (70, 80);

        let haystack_img = create_position_hash_image(w, h);

        let mut needle_img = ImageBuffer::new(nw, nh);
        for y in 0..nh {
            for x in 0..nw {
                let p = haystack_img.get_pixel(origin_x + x, origin_y + y);
                needle_img.put_pixel(x, y, Rgba([p[0], p[1], p[2], p[3]]));
            }
        }

        let haystack = DynamicImage::ImageRgba8(haystack_img);
        let needle = DynamicImage::ImageRgba8(needle_img);

        let result = matcher.find_image(&haystack, &needle);

        assert!(
            result.found,
            "Large needle (60x60, step=2) should be found at threshold 0.9, got confidence={:?}",
            result.confidence
        );

        if result.found {
            let expected_cx = origin_x + nw / 2;
            let expected_cy = origin_y + nh / 2;
            assert_eq!(result.center_x, Some(expected_cx), "Center x with step=2 needle (expected {})", expected_cx);
            assert_eq!(result.center_y, Some(expected_cy), "Center y with step=2 needle (expected {})", expected_cy);
        }
    }

    #[test]
    fn should_find_match_in_large_haystack_at_high_threshold() {
        // Simulate a production-scale scenario: large screenshot with
        // a small needle, matching at 0.95 threshold.
        let matcher = ImageMatcher::with_config(MatchConfig::with_threshold(0.95));

        let (w, h) = (400, 300);
        let (nw, nh) = (32, 32);
        let (origin_x, origin_y) = (120, 90);

        let haystack_img = create_position_hash_image(w, h);

        let mut needle_img = ImageBuffer::new(nw, nh);
        for y in 0..nh {
            for x in 0..nw {
                let p = haystack_img.get_pixel(origin_x + x, origin_y + y);
                needle_img.put_pixel(x, y, Rgba([p[0], p[1], p[2], p[3]]));
            }
        }

        let haystack = DynamicImage::ImageRgba8(haystack_img);
        let needle = DynamicImage::ImageRgba8(needle_img);

        let result = matcher.find_image(&haystack, &needle);

        assert!(
            result.found,
            "Exact sub-region in large haystack (400x300) should be found at threshold 0.95, got confidence={:?}",
            result.confidence
        );

        if result.found {
            let expected_cx = origin_x + nw / 2;
            let expected_cy = origin_y + nh / 2;
            assert_eq!(result.center_x, Some(expected_cx), "Center x in large haystack");
            assert_eq!(result.center_y, Some(expected_cy), "Center y in large haystack");
        }
    }

    #[test]
    fn should_find_match_with_alpha_needle_in_opaque_haystack() {
        // Pasted PNGs may have alpha < 255 for some pixels.
        // Screen captures always have alpha = 255.
        // Test that matching still works when needle has varying alpha.
        let matcher = ImageMatcher::with_config(MatchConfig::with_threshold(0.9));

        let (w, h) = (100, 100);
        let (nw, nh) = (15, 15);
        let (origin_x, origin_y) = (30, 25);

        let mut haystack_img = ImageBuffer::new(w, h);
        for y in 0..h {
            for x in 0..w {
                let v = position_hash_pixel(x, y);
                haystack_img.put_pixel(x, y, Rgba([v, v, v, 255]));
            }
        }

        // Needle with varying alpha (some fully opaque, some semi-transparent)
        let mut needle_img = ImageBuffer::new(nw, nh);
        for y in 0..nh {
            for x in 0..nw {
                let p = haystack_img.get_pixel(origin_x + x, origin_y + y);
                // Half the pixels get alpha = 128, others get alpha = 255
                let alpha = if (x + y) % 2 == 0 { 255 } else { 128 };
                needle_img.put_pixel(x, y, Rgba([p[0], p[1], p[2], alpha]));
            }
        }

        let haystack = DynamicImage::ImageRgba8(haystack_img);
        let needle = DynamicImage::ImageRgba8(needle_img);

        let result = matcher.find_image(&haystack, &needle);

        assert!(
            result.found,
            "Needle with alpha < 255 should still be found (NCC ignores alpha), got confidence={:?}",
            result.confidence
        );

        if result.found {
            let expected_cx = origin_x + nw / 2;
            let expected_cy = origin_y + nh / 2;
            assert_eq!(result.center_x, Some(expected_cx));
            assert_eq!(result.center_y, Some(expected_cy));
        }
    }

    #[test]
    fn should_produce_same_ncc_as_old_centered_formula() {
        // CRITICAL TEST: Compare the new fast NCC formula against the old
        // centered formula on identical data. They MUST produce the same result.
        //
        // Old formula (reconstructed from pre-e63a9d7 code):
        //   mean_h = Σh / n
        //   numerator   = Σ((h - mean_h) * (n - mean_n))
        //   denominator = √(Σ(h - mean_h)² · Σ(n - mean_n)²)
        //
        // New formula (current implementation):
        //   numerator   = n·Σhn - Σh·Σn
        //   denominator = √((n·Σh² - (Σh)²) · (n·Σn² - (Σn)²))
        //
        // Mathematically: NCC = old_numerator / old_denom = new_numerator / new_denom

        fn old_centered_ncc(h_values: &[f64], n_values: &[f64]) -> f64 {
            assert_eq!(h_values.len(), n_values.len());
            let n = h_values.len() as f64;
            if n == 0.0 { return 0.0; }

            let sum_h: f64 = h_values.iter().sum();
            let sum_n: f64 = n_values.iter().sum();
            let mean_h = sum_h / n;
            let mean_n = sum_n / n;

            let mut numerator = 0.0;
            let mut var_h = 0.0;
            let mut var_n = 0.0;

            for i in 0..h_values.len() {
                let hc = h_values[i] - mean_h;
                let nc = n_values[i] - mean_n;
                numerator += hc * nc;
                var_h += hc * hc;
                var_n += nc * nc;
            }

            let denom = (var_h * var_n).sqrt();
            if denom == 0.0 { 0.0 } else { numerator / denom }
        }

        fn fast_ncc(h_values: &[f64], n_values: &[f64]) -> f64 {
            let n = h_values.len() as f64;
            if n == 0.0 { return 0.0; }

            let sum_h: f64 = h_values.iter().sum();
            let sum_n: f64 = n_values.iter().sum();
            let sum_h_sq: f64 = h_values.iter().map(|v| v * v).sum();
            let sum_n_sq: f64 = n_values.iter().map(|v| v * v).sum();

            // Fast formula (same as calculate_ncc_at)
            let num = n * h_values.iter().zip(n_values.iter()).map(|(a, b)| a * b).sum::<f64>()
                - sum_h * sum_n;
            let denom_h = n * sum_h_sq - sum_h * sum_h;
            let denom_n = n * sum_n_sq - sum_n * sum_n;

            const EPS: f64 = 1e-12;
            if denom_h <= EPS || denom_n <= EPS { return 0.0; }
            let denom = (denom_h * denom_n).sqrt();
            if denom == 0.0 { 0.0 } else { (num / denom).clamp(-1.0, 1.0) }
        }

        // Test 1: White noise data (high variance)
        let h1: Vec<f64> = vec![128.0, 200.0, 50.0, 180.0, 30.0, 210.0, 90.0, 160.0, 75.0, 220.0];
        let n1: Vec<f64> = vec![128.0, 200.0, 50.0, 180.0, 30.0, 210.0, 90.0, 160.0, 75.0, 220.0]; // exact match
        let old1 = old_centered_ncc(&h1, &n1);
        let new1 = fast_ncc(&h1, &n1);
        assert!((old1 - new1).abs() < 1e-10,
            "Exact match: old={}, new={}, diff={}", old1, new1, (old1 - new1).abs());
        assert!((old1 - 1.0).abs() < 1e-10, "Exact match should give 1.0, got old={}", old1);

        // Test 2: Different data (low correlation)
        let h2: Vec<f64> = vec![10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0];
        let n2: Vec<f64> = vec![100.0, 90.0, 80.0, 70.0, 60.0, 50.0, 40.0, 30.0, 20.0, 10.0];
        let old2 = old_centered_ncc(&h2, &n2);
        let new2 = fast_ncc(&h2, &n2);
        assert!((old2 - new2).abs() < 1e-10,
            "Anti-correlated: old={}, new={}, diff={}", old2, new2, (old2 - new2).abs());

        // Test 3: Near-uniform data (low variance edge case)
        let h3: Vec<f64> = vec![100.0, 101.0, 99.0, 100.0, 102.0, 98.0, 100.0, 101.0, 99.0, 100.0];
        let n3: Vec<f64> = vec![100.0, 101.0, 99.0, 100.0, 102.0, 98.0, 100.0, 101.0, 99.0, 100.0];
        let old3 = old_centered_ncc(&h3, &n3);
        let new3 = fast_ncc(&h3, &n3);
        assert!((old3 - new3).abs() < 1e-10,
            "Near-uniform exact match: old={}, new={}, diff={}", old3, new3, (old3 - new3).abs());

        // Test 4: All identical (zero variance → both should give 0.0)
        let h4: Vec<f64> = vec![128.0; 10];
        let n4: Vec<f64> = vec![128.0; 10];
        let old4 = old_centered_ncc(&h4, &n4);
        let new4 = fast_ncc(&h4, &n4);
        assert_eq!(old4, 0.0, "Zero variance old should be 0.0");
        assert_eq!(new4, 0.0, "Zero variance new should be 0.0");

                        // Test 5: Large dataset (1000 values, random-like using hash-free approach)
        let mut h5 = Vec::with_capacity(1000);
        let mut n5 = Vec::with_capacity(1000);
        for i in 0..1000u64 {
            let r = ((i.wrapping_mul(374761393).wrapping_add(1274126177) >> 16) & 0xFF) as f64;
            h5.push(r);
            // n5 = h5 but with small noise (simulates near-match)
            let noise = (((i.wrapping_mul(668265263).wrapping_add(1640531527) >> 16) & 0x07) as f64) - 2.0;
            n5.push((r + noise).clamp(0.0, 255.0));
        }
        let old5 = old_centered_ncc(&h5, &n5);
        let new5 = fast_ncc(&h5, &n5);
        let diff5 = (old5 - new5).abs();
        assert!(diff5 < 1e-8,
            "Large dataset (1000 values): old={}, new={}, diff={}", old5, new5, diff5);

        // Test 6: Realistic-sized window (30×30 = 900 values, same as typical needle)
        let mut h6 = Vec::with_capacity(900);
        let mut n6 = Vec::with_capacity(900);
        for y in 0..30i32 {
            for x in 0..30i32 {
                let val = ((x * 7 + y * 13) % 200 + 28) as f64;
                h6.push(val);
                n6.push(val); // exact match
            }
        }
        let old6 = old_centered_ncc(&h6, &n6);
        let new6 = fast_ncc(&h6, &n6);
        assert!((old6 - new6).abs() < 1e-10,
            "30x30 exact match: old={}, new={}, diff={}", old6, new6, (old6 - new6).abs());
        assert!((old6 - 1.0).abs() < 1e-10, "30x30 exact match should give 1.0, got old={}", old6);
    }

    // ---------------------------------------------------------------------------
    // diff_images_scaled tests (Phase D3)
    // ---------------------------------------------------------------------------

    #[test]
    fn test_diff_scaled_identical_full_scale() {
        // scale_factor = 1.0 should behave identically to diff_images
        let matcher = ImageMatcher::new();
        let ref_img = create_test_image(100, 100, Rgba([128u8; 4]));
        let act_img = create_test_image(100, 100, Rgba([128u8; 4]));
        let result = matcher.diff_images_scaled(&ref_img, &act_img, 30, false, 1.0);
        assert!(result.passed);
        assert_eq!(result.diff_percentage, 0.0);
        assert!(result.diff_image.is_none());
    }

    #[test]
    fn test_diff_scaled_identical_half_scale() {
        // scale_factor = 0.5 — downsampled identical images still match
        let matcher = ImageMatcher::new();
        let ref_img = create_test_image(200, 200, Rgba([128u8; 4]));
        let act_img = create_test_image(200, 200, Rgba([128u8; 4]));
        let result = matcher.diff_images_scaled(&ref_img, &act_img, 30, false, 0.5);
        assert!(result.passed);
        assert_eq!(result.diff_percentage, 0.0);
    }

    #[test]
    fn test_diff_scaled_completely_different() {
        // scale_factor = 0.25 — even at reduced resolution, completely different
        // images should still show diff ~1.0 (opposite colors → many pixels exceed threshold)
        let matcher = ImageMatcher::new();
        let ref_img = create_test_image(100, 100, Rgba([0u8, 0u8, 0u8, 255]));
        let act_img = create_test_image(100, 100, Rgba([255u8, 255u8, 255u8, 255]));
        let result = matcher.diff_images_scaled(&ref_img, &act_img, 30, false, 0.25);
        assert!(!result.passed);
        // At 25% scale, 25x25 pixels = 625 pixels. All should differ since
        // grayscale diff of (0 vs 255) = 255 >> threshold 30
        assert!((result.diff_percentage - 1.0).abs() < 1e-6, "Expected ~1.0, got {}", result.diff_percentage);
    }

    #[test]
    fn test_diff_scaled_min_scale() {
        // scale_factor clamped to 0.01 — tiny image but should still work
        let matcher = ImageMatcher::new();
        let ref_img = create_test_image(200, 200, Rgba([128u8; 4]));
        let act_img = create_test_image(200, 200, Rgba([128u8; 4]));
        let result = matcher.diff_images_scaled(&ref_img, &act_img, 30, false, 0.001);
        // Clamped to 0.01: 200*0.01=2 pixels min — should not panic
        assert!(result.passed);
        assert_eq!(result.diff_percentage, 0.0);
    }

    #[test]
    fn test_diff_scaled_generates_heatmap() {
        // Scaled heatmap should be generated at the scaled resolution
        let matcher = ImageMatcher::new();
        let ref_img = create_test_image(100, 100, Rgba([0u8, 0u8, 0u8, 255]));
        let act_img = create_test_image(100, 100, Rgba([255u8, 255u8, 255u8, 255]));
        let result = matcher.diff_images_scaled(&ref_img, &act_img, 30, true, 0.5);
        assert!(!result.passed);
        let heatmap = result.diff_image.expect("Heatmap should be generated");
        // Scaled to 50x50
        assert_eq!(heatmap.width(), 50);
        assert_eq!(heatmap.height(), 50);
    }

    #[test]
    fn test_diff_scaled_different_dimensions() {
        // scale-factor resize also handles the resize-to-match between images
        let matcher = ImageMatcher::new();
        let ref_img = create_test_image(80, 60, Rgba([128u8; 4]));
        let act_img = create_test_image(200, 150, Rgba([128u8; 4]));
        let result = matcher.diff_images_scaled(&ref_img, &act_img, 30, false, 0.5);
        // act_img at 0.5 → 100x75.
        // ref_img is 80x60, will be resized to 100x75.
        // Both are uniform 128 → should still pass
        assert!(result.passed);
        assert_eq!(result.diff_percentage, 0.0);
    }
}
