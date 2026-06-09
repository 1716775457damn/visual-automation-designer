//! Image matching module
//! 
//! This module provides image matching functionality using
//! template matching algorithms for finding images on screen.
//!
//! Features:
//! - Normalized Cross-Correlation (NCC) template matching
//! - Result caching for improved performance
//! - Concurrent matching support
//! - Performance metrics logging
//!
//! Validates: Requirements 6.1, 6.2, 6.3, 6.4, 8.1, 8.5

pub mod matcher;
pub mod cache;

// Re-export matching types
pub use matcher::{ImageMatcher, MatchResult, MatchConfig, CachedImageMatcher, ConcurrentMatcher, MatchMetrics, DiffResult};
pub use cache::{MatchCache, MatchCacheConfig, CacheKey, CachedMatch, CacheStats};
