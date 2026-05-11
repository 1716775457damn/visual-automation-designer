//! Image match result cache
//!
//! This module provides caching for image matching results to avoid
//! redundant matching operations when the screen hasn't changed significantly.
//!
//! Validates: Requirements 8.1, 8.5

use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::time::{Duration, Instant};

use image::{DynamicImage, GenericImageView};

use crate::models::ImageId;

use super::matcher::MatchResult;

/// Cache key combining image hash and screen region
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CacheKey {
    /// Hash of the template image
    pub image_hash: u64,
    /// Hash of the screen region (simplified - based on dimensions and sample)
    pub screen_hash: u64,
}

impl CacheKey {
    /// Create a new cache key from image ID and screen capture
    pub fn new(image_id: &ImageId, template: &DynamicImage, screen: &DynamicImage) -> Self {
        let image_hash = Self::hash_image(template);
        let screen_hash = Self::hash_screen_region(screen);
        
        Self {
            image_hash,
            screen_hash,
        }
    }
    
    /// Create a cache key from pre-computed hashes
    pub fn from_hashes(image_hash: u64, screen_hash: u64) -> Self {
        Self {
            image_hash,
            screen_hash,
        }
    }
    
    /// Hash an image using a simple but fast algorithm
    fn hash_image(image: &DynamicImage) -> u64 {
        use std::collections::hash_map::DefaultHasher;
        
        let mut hasher = DefaultHasher::new();
        
        // Hash dimensions
        image.width().hash(&mut hasher);
        image.height().hash(&mut hasher);
        
        // Sample pixels for hash (sample every 10 pixels for performance)
        let width = image.width();
        let height = image.height();
        
        for y in (0..height).step_by(10) {
            for x in (0..width).step_by(10) {
                let pixel = image.get_pixel(x, y);
                pixel[0].hash(&mut hasher);
                pixel[1].hash(&mut hasher);
                pixel[2].hash(&mut hasher);
            }
        }
        
        hasher.finish()
    }
    
    /// Hash a screen region using sampling
    fn hash_screen_region(screen: &DynamicImage) -> u64 {
        use std::collections::hash_map::DefaultHasher;
        
        let mut hasher = DefaultHasher::new();
        
        // Hash dimensions
        screen.width().hash(&mut hasher);
        screen.height().hash(&mut hasher);
        
        // Sample pixels more sparsely for screen (every 50 pixels)
        let width = screen.width();
        let height = screen.height();
        
        for y in (0..height).step_by(50) {
            for x in (0..width).step_by(50) {
                let pixel = screen.get_pixel(x, y);
                pixel[0].hash(&mut hasher);
                pixel[1].hash(&mut hasher);
                pixel[2].hash(&mut hasher);
            }
        }
        
        hasher.finish()
    }
}

/// Cached match result with timestamp
#[derive(Debug, Clone)]
pub struct CachedMatch {
    /// The match result
    pub result: MatchResult,
    /// When this result was cached
    pub cached_at: Instant,
    /// The cache key used
    pub key: CacheKey,
}

impl CachedMatch {
    /// Create a new cached match
    pub fn new(result: MatchResult, key: CacheKey) -> Self {
        Self {
            result,
            cached_at: Instant::now(),
            key,
        }
    }
    
    /// Check if this cached result is still valid
    pub fn is_valid(&self, max_age: Duration) -> bool {
        self.cached_at.elapsed() < max_age
    }
}

/// Configuration for the match cache
#[derive(Debug, Clone)]
pub struct MatchCacheConfig {
    /// Maximum number of entries in the cache
    pub max_entries: usize,
    /// Maximum age of a cache entry
    pub max_age: Duration,
    /// Whether to enable cache
    pub enabled: bool,
}

impl Default for MatchCacheConfig {
    fn default() -> Self {
        Self {
            max_entries: 100,
            max_age: Duration::from_secs(5),
            enabled: true,
        }
    }
}

impl MatchCacheConfig {
    /// Create a new cache config with custom settings
    pub fn new(max_entries: usize, max_age_secs: u64) -> Self {
        Self {
            max_entries,
            max_age: Duration::from_secs(max_age_secs),
            enabled: true,
        }
    }
}

/// Cache for image matching results
#[derive(Debug)]
pub struct MatchCache {
    /// Cache entries
    entries: HashMap<CacheKey, CachedMatch>,
    /// Configuration
    config: MatchCacheConfig,
    /// Total cache hits
    hits: u64,
    /// Total cache misses
    misses: u64,
}

impl Default for MatchCache {
    fn default() -> Self {
        Self::new()
    }
}

impl MatchCache {
    /// Create a new match cache
    pub fn new() -> Self {
        Self::with_config(MatchCacheConfig::default())
    }
    
    /// Create a match cache with custom config
    pub fn with_config(config: MatchCacheConfig) -> Self {
        Self {
            entries: HashMap::new(),
            config,
            hits: 0,
            misses: 0,
        }
    }
    
    /// Check if cache is enabled
    pub fn is_enabled(&self) -> bool {
        self.config.enabled
    }
    
    /// Enable or disable the cache
    pub fn set_enabled(&mut self, enabled: bool) {
        self.config.enabled = enabled;
    }
    
    /// Get a cached result
    pub fn get(&mut self, key: &CacheKey) -> Option<MatchResult> {
        if !self.config.enabled {
            return None;
        }
        
        if let Some(cached) = self.entries.get(key) {
            if cached.is_valid(self.config.max_age) {
                self.hits += 1;
                return Some(cached.result.clone());
            }
        }
        
        self.misses += 1;
        None
    }
    
    /// Insert a result into the cache
    pub fn insert(&mut self, key: CacheKey, result: MatchResult) {
        if !self.config.enabled {
            return;
        }
        
        // Evict old entries if at capacity
        if self.entries.len() >= self.config.max_entries {
            self.evict_expired();
            
            // If still at capacity, remove oldest
            if self.entries.len() >= self.config.max_entries {
                self.evict_oldest();
            }
        }
        
        self.entries.insert(key.clone(), CachedMatch::new(result, key));
    }
    
    /// Clear the cache
    pub fn clear(&mut self) {
        self.entries.clear();
    }
    
    /// Get cache statistics
    pub fn stats(&self) -> CacheStats {
        CacheStats {
            entries: self.entries.len(),
            hits: self.hits,
            misses: self.misses,
            hit_rate: if self.hits + self.misses > 0 {
                self.hits as f64 / (self.hits + self.misses) as f64
            } else {
                0.0
            },
        }
    }
    
    /// Reset statistics
    pub fn reset_stats(&mut self) {
        self.hits = 0;
        self.misses = 0;
    }
    
    /// Evict expired entries
    fn evict_expired(&mut self) {
        let max_age = self.config.max_age;
        self.entries.retain(|_, cached| cached.is_valid(max_age));
    }
    
    /// Evict the oldest entry
    fn evict_oldest(&mut self) {
        if let Some((oldest_key, _)) = self.entries
            .iter()
            .min_by_key(|(_, cached)| cached.cached_at)
        {
            let key = oldest_key.clone();
            self.entries.remove(&key);
        }
    }
}

/// Cache statistics
#[derive(Debug, Clone, Copy)]
pub struct CacheStats {
    /// Number of entries in cache
    pub entries: usize,
    /// Number of cache hits
    pub hits: u64,
    /// Number of cache misses
    pub misses: u64,
    /// Hit rate (0.0 to 1.0)
    pub hit_rate: f64,
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
    fn test_cache_key_creation() {
        let image_id = ImageId::new();
        let template = create_test_image(50, 50, Rgba([255, 0, 0, 255]));
        let screen = create_test_image(1920, 1080, Rgba([0, 0, 0, 255]));
        
        let key = CacheKey::new(&image_id, &template, &screen);
        assert!(key.image_hash != 0);
        assert!(key.screen_hash != 0);
    }
    
    #[test]
    fn test_cache_key_consistency() {
        let image_id = ImageId::new();
        let template = create_test_image(50, 50, Rgba([255, 0, 0, 255]));
        let screen = create_test_image(1920, 1080, Rgba([0, 0, 0, 255]));
        
        let key1 = CacheKey::new(&image_id, &template, &screen);
        let key2 = CacheKey::new(&image_id, &template, &screen);
        
        assert_eq!(key1, key2);
    }
    
    #[test]
    fn test_cache_insert_and_get() {
        let mut cache = MatchCache::new();
        let key = CacheKey::from_hashes(123, 456);
        let result = MatchResult::found(100, 200, 0.95, 50, 50);
        
        cache.insert(key.clone(), result.clone());
        
        let cached = cache.get(&key);
        assert!(cached.is_some());
        let cached_result = cached.unwrap();
        assert!(cached_result.found);
        assert_eq!(cached_result.center_x, Some(100));
    }
    
    #[test]
    fn test_cache_miss() {
        let mut cache = MatchCache::new();
        let key = CacheKey::from_hashes(123, 456);
        
        let cached = cache.get(&key);
        assert!(cached.is_none());
        
        let stats = cache.stats();
        assert_eq!(stats.misses, 1);
    }
    
    #[test]
    fn test_cache_stats() {
        let mut cache = MatchCache::new();
        let key1 = CacheKey::from_hashes(123, 456);
        let key2 = CacheKey::from_hashes(789, 012);
        let result = MatchResult::found(100, 200, 0.95, 50, 50);
        
        cache.insert(key1.clone(), result.clone());
        
        // Hit
        cache.get(&key1);
        // Miss
        cache.get(&key2);
        
        let stats = cache.stats();
        assert_eq!(stats.entries, 1);
        assert_eq!(stats.hits, 1);
        assert_eq!(stats.misses, 1);
        assert!((stats.hit_rate - 0.5).abs() < 0.001);
    }
    
    #[test]
    fn test_cache_disabled() {
        let config = MatchCacheConfig {
            enabled: false,
            ..Default::default()
        };
        let mut cache = MatchCache::with_config(config);
        let key = CacheKey::from_hashes(123, 456);
        let result = MatchResult::found(100, 200, 0.95, 50, 50);
        
        cache.insert(key.clone(), result);
        
        let cached = cache.get(&key);
        assert!(cached.is_none());
    }
    
    #[test]
    fn test_cache_clear() {
        let mut cache = MatchCache::new();
        let key = CacheKey::from_hashes(123, 456);
        let result = MatchResult::found(100, 200, 0.95, 50, 50);
        
        cache.insert(key.clone(), result);
        assert_eq!(cache.entries.len(), 1);
        
        cache.clear();
        assert_eq!(cache.entries.len(), 0);
    }
}
