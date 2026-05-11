//! Image Library management module
//!
//! This module provides functionality for managing the image library,
//! including file storage, metadata management, and deduplication.
//!
//! Validates: Requirements 1.1, 1.2, 1.3, 1.5

mod library;
mod metadata;

pub use library::ImageLibraryManager;
pub use metadata::compute_image_hash;
