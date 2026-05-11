//! Image data models for the Visual Automation Designer
//!
//! This module defines the core data structures for images (图片),
//! which are used for template matching in automation flows.
//!
//! Validates: Requirements 1.1, 1.2, 1.3

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Unique identifier for an image
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ImageId(pub Uuid);

impl ImageId {
    /// Create a new unique image ID
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for ImageId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for ImageId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Supported image formats
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageFormat {
    /// PNG format
    Png,
    /// JPEG format
    Jpg,
    /// BMP format
    Bmp,
}

impl ImageFormat {
    /// Get the file extension for this format
    pub fn extension(&self) -> &'static str {
        match self {
            ImageFormat::Png => "png",
            ImageFormat::Jpg => "jpg",
            ImageFormat::Bmp => "bmp",
        }
    }

    /// Parse from file extension
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_lowercase().as_str() {
            "png" => Some(ImageFormat::Png),
            "jpg" | "jpeg" => Some(ImageFormat::Jpg),
            "bmp" => Some(ImageFormat::Bmp),
            _ => None,
        }
    }

    /// Check if the format is supported
    pub fn is_supported(ext: &str) -> bool {
        Self::from_extension(ext).is_some()
    }
}

/// Image metadata (without the actual image data)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMetadata {
    /// Unique image identifier
    pub id: ImageId,
    /// Display name
    pub name: String,
    /// File path relative to the image library root
    pub file_path: String,
    /// Image width in pixels
    pub width: u32,
    /// Image height in pixels
    pub height: u32,
    /// Image format
    pub format: ImageFormat,
    /// Creation timestamp
    pub created_at: DateTime<Utc>,
    /// Perceptual hash for deduplication
    pub hash: String,
}

impl ImageMetadata {
    /// Create new image metadata
    pub fn new(
        name: String,
        file_path: String,
        width: u32,
        height: u32,
        format: ImageFormat,
        hash: String,
    ) -> Self {
        Self {
            id: ImageId::new(),
            name,
            file_path,
            width,
            height,
            format,
            created_at: Utc::now(),
            hash,
        }
    }

    /// Create metadata with a specific ID (for deserialization)
    pub fn with_id(
        id: ImageId,
        name: String,
        file_path: String,
        width: u32,
        height: u32,
        format: ImageFormat,
        hash: String,
        created_at: DateTime<Utc>,
    ) -> Self {
        Self {
            id,
            name,
            file_path,
            width,
            height,
            format,
            created_at,
            hash,
        }
    }

    /// Rename the image
    pub fn rename(&mut self, new_name: String) {
        self.name = new_name;
    }

    /// Get the aspect ratio of the image
    pub fn aspect_ratio(&self) -> f64 {
        self.width as f64 / self.height as f64
    }

    /// Check if dimensions match another image
    pub fn dimensions_match(&self, other: &ImageMetadata) -> bool {
        self.width == other.width && self.height == other.height
    }
}

/// Image library containing all stored images
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageLibrary {
    /// List of images in the library
    pub images: Vec<ImageMetadata>,
    /// Total size of all images in bytes
    pub total_size_bytes: u64,
}

impl ImageLibrary {
    /// Create an empty image library
    pub fn new() -> Self {
        Self {
            images: Vec::new(),
            total_size_bytes: 0,
        }
    }

    /// Add an image to the library
    pub fn add_image(&mut self, image: ImageMetadata) {
        self.images.push(image);
    }

    /// Remove an image by ID
    pub fn remove_image(&mut self, id: &ImageId) -> Option<ImageMetadata> {
        if let Some(pos) = self.images.iter().position(|img| img.id == *id) {
            Some(self.images.remove(pos))
        } else {
            None
        }
    }

    /// Get an image by ID
    pub fn get_image(&self, id: &ImageId) -> Option<&ImageMetadata> {
        self.images.iter().find(|img| img.id == *id)
    }

    /// Get a mutable image by ID
    pub fn get_image_mut(&mut self, id: &ImageId) -> Option<&mut ImageMetadata> {
        self.images.iter_mut().find(|img| img.id == *id)
    }

    /// List all images
    pub fn list_images(&self) -> &[ImageMetadata] {
        &self.images
    }

    /// Get the number of images
    pub fn count(&self) -> usize {
        self.images.len()
    }

    /// Check if an image with the given hash exists (for deduplication)
    pub fn has_duplicate(&self, hash: &str) -> bool {
        self.images.iter().any(|img| img.hash == hash)
    }

    /// Find images by name (partial match, case-insensitive)
    pub fn find_by_name(&self, query: &str) -> Vec<&ImageMetadata> {
        let query_lower = query.to_lowercase();
        self.images
            .iter()
            .filter(|img| img.name.to_lowercase().contains(&query_lower))
            .collect()
    }

    /// Rename an image
    pub fn rename_image(&mut self, id: &ImageId, new_name: String) -> bool {
        if let Some(image) = self.get_image_mut(id) {
            image.rename(new_name);
            true
        } else {
            false
        }
    }

    /// Update total size (should be called after add/remove operations)
    pub fn update_total_size(&mut self, size_bytes: u64) {
        self.total_size_bytes = size_bytes;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_image_id_uniqueness() {
        let id1 = ImageId::new();
        let id2 = ImageId::new();
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_image_format_extension() {
        assert_eq!(ImageFormat::Png.extension(), "png");
        assert_eq!(ImageFormat::Jpg.extension(), "jpg");
        assert_eq!(ImageFormat::Bmp.extension(), "bmp");
    }

    #[test]
    fn test_image_format_from_extension() {
        assert_eq!(ImageFormat::from_extension("png"), Some(ImageFormat::Png));
        assert_eq!(ImageFormat::from_extension("jpg"), Some(ImageFormat::Jpg));
        assert_eq!(ImageFormat::from_extension("jpeg"), Some(ImageFormat::Jpg));
        assert_eq!(ImageFormat::from_extension("bmp"), Some(ImageFormat::Bmp));
        assert_eq!(ImageFormat::from_extension("gif"), None);
    }

    #[test]
    fn test_image_metadata_creation() {
        let metadata = ImageMetadata::new(
            "test_image".to_string(),
            "/images/test.png".to_string(),
            100,
            200,
            ImageFormat::Png,
            "abc123".to_string(),
        );
        assert_eq!(metadata.name, "test_image");
        assert_eq!(metadata.width, 100);
        assert_eq!(metadata.height, 200);
    }

    #[test]
    fn test_image_library_crud() {
        let mut library = ImageLibrary::new();
        assert_eq!(library.count(), 0);

        let image = ImageMetadata::new(
            "test".to_string(),
            "/test.png".to_string(),
            50,
            50,
            ImageFormat::Png,
            "hash123".to_string(),
        );
        let id = image.id.clone();
        library.add_image(image);
        assert_eq!(library.count(), 1);

        assert!(library.get_image(&id).is_some());
        library.remove_image(&id);
        assert_eq!(library.count(), 0);
        assert!(library.get_image(&id).is_none());
    }

    #[test]
    fn test_image_library_duplicate_detection() {
        let mut library = ImageLibrary::new();
        let image = ImageMetadata::new(
            "test".to_string(),
            "/test.png".to_string(),
            50,
            50,
            ImageFormat::Png,
            "hash123".to_string(),
        );
        library.add_image(image);
        assert!(library.has_duplicate("hash123"));
        assert!(!library.has_duplicate("different_hash"));
    }

    #[test]
    fn test_image_library_rename() {
        let mut library = ImageLibrary::new();
        let image = ImageMetadata::new(
            "original".to_string(),
            "/test.png".to_string(),
            50,
            50,
            ImageFormat::Png,
            "hash123".to_string(),
        );
        let id = image.id.clone();
        library.add_image(image);
        
        assert!(library.rename_image(&id, "renamed".to_string()));
        assert_eq!(library.get_image(&id).unwrap().name, "renamed");
    }
}
