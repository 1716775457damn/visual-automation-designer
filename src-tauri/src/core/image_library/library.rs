//! Image Library Manager implementation
//!
//! This module provides the main ImageLibraryManager that handles
//! file system operations for the image library.
//!
//! Validates: Requirements 1.1, 1.3, 1.5

use std::path::{Path, PathBuf};
use std::fs;
use std::sync::{Arc, Mutex};

use image::io::Reader as ImageReader;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, Result};
use crate::models::image::{ImageFormat, ImageId, ImageMetadata, ImageLibrary};
use super::metadata::compute_hash_from_file;

/// Manager for the image library, handling file system operations
pub struct ImageLibraryManager {
    /// The in-memory image library
    library: Arc<Mutex<ImageLibrary>>,
    /// The directory where images are stored
    images_dir: PathBuf,
    /// Path to the library metadata file
    metadata_path: PathBuf,
}

impl ImageLibraryManager {
    /// Create a new ImageLibraryManager with the given images directory.
    ///
    /// This will create the images directory if it doesn't exist,
    /// and load any existing library metadata.
    ///
    /// # Arguments
    /// * `images_dir` - Directory to store image files
    ///
    /// # Returns
    /// A new ImageLibraryManager instance
    pub fn new<P: Into<PathBuf>>(images_dir: P) -> Result<Self> {
        let images_dir = images_dir.into();
        
        // Create images directory if it doesn't exist
        if !images_dir.exists() {
            fs::create_dir_all(&images_dir)
                .map_err(|e| AppError::InternalError(
                    format!("Failed to create images directory: {}", e)
                ))?;
        }
        
        let metadata_path = images_dir.join("library_metadata.json");
        
        // Load existing library or create new one
        let library = Self::load_library(&metadata_path)?;
        
        Ok(Self {
            library: Arc::new(Mutex::new(library)),
            images_dir,
            metadata_path,
        })
    }
    
    /// Create an ImageLibraryManager from a Tauri AppHandle.
    ///
    /// This uses the app's data directory to store images.
    ///
    /// # Arguments
    /// * `app_handle` - Tauri application handle
    ///
    /// # Returns
    /// A new ImageLibraryManager instance
    pub fn from_app_handle(app_handle: &AppHandle) -> Result<Self> {
        let data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| AppError::InternalError(
                format!("Failed to get app data directory: {}", e)
            ))?;
        
        let images_dir = data_dir.join("images");
        Self::new(images_dir)
    }
    
    /// Load the library metadata from disk.
    fn load_library(path: &Path) -> Result<ImageLibrary> {
        if path.exists() {
            let content = fs::read_to_string(path)?;
            let library: ImageLibrary = serde_json::from_str(&content)?;
            Ok(library)
        } else {
            Ok(ImageLibrary::new())
        }
    }
    
    /// Save the library metadata to disk.
    fn save_library(&self) -> Result<()> {
        let library = self.library.lock()
            .map_err(|e| AppError::InternalError(
                format!("Failed to lock library: {}", e)
            ))?;
        
        let content = serde_json::to_string_pretty(&*library)?;
        fs::write(&self.metadata_path, content)?;
        
        Ok(())
    }
    
    /// Add an image to the library from a file path.
    ///
    /// This will:
    /// 1. Validate the image format
    /// 2. Read the image dimensions
    /// 3. Compute a hash for deduplication
    /// 4. Copy the file to the images directory
    /// 5. Add metadata to the library
    ///
    /// # Arguments
    /// * `source_path` - Path to the source image file
    /// * `name` - Display name for the image
    ///
    /// # Returns
    /// The created ImageMetadata
    pub fn add_image<P: AsRef<Path>>(&self, source_path: P, name: String) -> Result<ImageMetadata> {
        let source_path = source_path.as_ref();
        
        // Validate file exists
        if !source_path.exists() {
            return Err(AppError::ImageNotFound(
                format!("Image file not found: {}", source_path.display())
            ));
        }
        
        // Determine format from extension
        let extension = source_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        
        let format = ImageFormat::from_extension(extension)
            .ok_or_else(|| AppError::ImageError(
                format!("Unsupported image format: {}", extension)
            ))?;
        
        // Load image to get dimensions and compute hash
        let img = ImageReader::open(source_path)
            .map_err(|e| AppError::ImageError(e.to_string()))?
            .decode()
            .map_err(|e| AppError::ImageError(e.to_string()))?;
        
        let (width, height) = (img.width(), img.height());
        
        // Compute hash for deduplication
        let hash = compute_hash_from_file(source_path)?;
        
        // Check for duplicates
        {
            let library = self.library.lock()
                .map_err(|e| AppError::InternalError(
                    format!("Failed to lock library: {}", e)
                ))?;
            
            if library.has_duplicate(&hash) {
                return Err(AppError::ValidationError(
                    "An identical image already exists in the library".to_string()
                ));
            }
        }
        
        // Generate unique filename
        let id = ImageId::new();
        let filename = format!("{}.{}", id.0, format.extension());
        let dest_path = self.images_dir.join(&filename);
        
        // Copy file to images directory
        fs::copy(source_path, &dest_path)?;
        
        // Create metadata
        let metadata = ImageMetadata::new(
            name,
            filename,
            width,
            height,
            format,
            hash,
        );
        
        // Add to library
        {
            let mut library = self.library.lock()
                .map_err(|e| AppError::InternalError(
                    format!("Failed to lock library: {}", e)
                ))?;
            
            library.add_image(metadata.clone());
        }
        
        // Save library metadata
        self.save_library()?;
        
        Ok(metadata)
    }
    
    /// Add an image from raw bytes.
    ///
    /// # Arguments
    /// * `bytes` - Raw image data
    /// * `name` - Display name for the image
    /// * `format` - Image format
    ///
    /// # Returns
    /// The created ImageMetadata
    pub fn add_image_from_bytes(
        &self,
        bytes: &[u8],
        name: String,
        format: ImageFormat,
    ) -> Result<ImageMetadata> {
        // Decode image from bytes
        let img = image::load_from_memory_with_format(
            bytes,
            match format {
                ImageFormat::Png => image::ImageFormat::Png,
                ImageFormat::Jpg => image::ImageFormat::Jpeg,
                ImageFormat::Bmp => image::ImageFormat::Bmp,
            },
        ).map_err(|e| AppError::ImageError(e.to_string()))?;
        
        let (width, height) = (img.width(), img.height());
        
        // Compute hash for deduplication
        let hash = super::metadata::compute_hash_from_bytes(bytes)?;
        
        // Check for duplicates
        {
            let library = self.library.lock()
                .map_err(|e| AppError::InternalError(
                    format!("Failed to lock library: {}", e)
                ))?;
            
            if library.has_duplicate(&hash) {
                return Err(AppError::ValidationError(
                    "An identical image already exists in the library".to_string()
                ));
            }
        }
        
        // Generate unique filename
        let id = ImageId::new();
        let filename = format!("{}.{}", id.0, format.extension());
        let dest_path = self.images_dir.join(&filename);
        
        // Save image file
        img.save(&dest_path)
            .map_err(|e| AppError::ImageError(e.to_string()))?;
        
        // Create metadata
        let metadata = ImageMetadata::new(
            name,
            filename,
            width,
            height,
            format,
            hash,
        );
        
        // Add to library
        {
            let mut library = self.library.lock()
                .map_err(|e| AppError::InternalError(
                    format!("Failed to lock library: {}", e)
                ))?;
            
            library.add_image(metadata.clone());
        }
        
        // Save library metadata
        self.save_library()?;
        
        Ok(metadata)
    }
    
    /// Remove an image from the library.
    ///
    /// This will:
    /// 1. Remove the metadata from the library
    /// 2. Delete the image file
    /// 3. Save the updated library metadata
    ///
    /// # Arguments
    /// * `id` - ID of the image to remove
    ///
    /// # Returns
    /// true if the image was removed, false if not found
    pub fn remove_image(&self, id: &ImageId) -> Result<bool> {
        let metadata = {
            let mut library = self.library.lock()
                .map_err(|e| AppError::InternalError(
                    format!("Failed to lock library: {}", e)
                ))?;
            
            let metadata = library.remove_image(id);
            metadata
        };
        
        if let Some(metadata) = metadata {
            // Delete the file
            let file_path = self.images_dir.join(&metadata.file_path);
            if file_path.exists() {
                fs::remove_file(file_path)?;
            }
            
            // Save library metadata
            self.save_library()?;
            
            Ok(true)
        } else {
            Ok(false)
        }
    }
    
    /// Get an image's metadata by ID.
    ///
    /// # Arguments
    /// * `id` - ID of the image
    ///
    /// # Returns
    /// The image metadata, or None if not found
    pub fn get_image(&self, id: &ImageId) -> Result<Option<ImageMetadata>> {
        let library = self.library.lock()
            .map_err(|e| AppError::InternalError(
                format!("Failed to lock library: {}", e)
            ))?;
        
        Ok(library.get_image(id).cloned())
    }
    
    /// List all images in the library.
    ///
    /// # Returns
    /// A list of all image metadata
    pub fn list_images(&self) -> Result<Vec<ImageMetadata>> {
        let library = self.library.lock()
            .map_err(|e| AppError::InternalError(
                format!("Failed to lock library: {}", e)
            ))?;
        
        Ok(library.list_images().to_vec())
    }
    
    /// Rename an image.
    ///
    /// # Arguments
    /// * `id` - ID of the image to rename
    /// * `new_name` - New name for the image
    ///
    /// # Returns
    /// true if the image was renamed, false if not found
    pub fn rename_image(&self, id: &ImageId, new_name: String) -> Result<bool> {
        let success = {
            let mut library = self.library.lock()
                .map_err(|e| AppError::InternalError(
                    format!("Failed to lock library: {}", e)
                ))?;
            
            library.rename_image(id, new_name)
        };
        
        if success {
            self.save_library()?;
        }
        
        Ok(success)
    }
    
    /// Get the full path to an image file.
    ///
    /// # Arguments
    /// * `id` - ID of the image
    ///
    /// # Returns
    /// The full path to the image file, or None if not found
    pub fn get_image_path(&self, id: &ImageId) -> Result<Option<PathBuf>> {
        let library = self.library.lock()
            .map_err(|e| AppError::InternalError(
                format!("Failed to lock library: {}", e)
            ))?;
        
        Ok(library.get_image(id).map(|img| self.images_dir.join(&img.file_path)))
    }
    
    /// Get the count of images in the library.
    pub fn count(&self) -> Result<usize> {
        let library = self.library.lock()
            .map_err(|e| AppError::InternalError(
                format!("Failed to lock library: {}", e)
            ))?;
        
        Ok(library.count())
    }
    
    /// Check if an image with the given hash exists (for deduplication).
    pub fn has_duplicate(&self, hash: &str) -> Result<bool> {
        let library = self.library.lock()
            .map_err(|e| AppError::InternalError(
                format!("Failed to lock library: {}", e)
            ))?;
        
        Ok(library.has_duplicate(hash))
    }
    
    /// Find images by name (partial match, case-insensitive).
    pub fn find_by_name(&self, query: &str) -> Result<Vec<ImageMetadata>> {
        let library = self.library.lock()
            .map_err(|e| AppError::InternalError(
                format!("Failed to lock library: {}", e)
            ))?;
        
        Ok(library.find_by_name(query).into_iter().cloned().collect())
    }
    
    /// Get a reference to the underlying ImageLibrary (for serialization).
    pub fn library(&self) -> Result<Arc<Mutex<ImageLibrary>>> {
        Ok(self.library.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use image::{ImageBuffer, Rgb};
    use std::io::Write;

    fn create_test_image_file(dir: &Path, name: &str, format: ImageFormat) -> PathBuf {
        create_test_image_file_with_color(dir, name, format, Rgb([128, 128, 128]))
    }
    
    fn create_test_image_file_with_color(dir: &Path, name: &str, format: ImageFormat, color: Rgb<u8>) -> PathBuf {
        let path = dir.join(name);
        let img: ImageBuffer<Rgb<u8>, Vec<u8>> = 
            ImageBuffer::from_pixel(100, 100, color);
        
        let img_format = match format {
            ImageFormat::Png => image::ImageFormat::Png,
            ImageFormat::Jpg => image::ImageFormat::Jpeg,
            ImageFormat::Bmp => image::ImageFormat::Bmp,
        };
        
        img.save_with_format(&path, img_format).unwrap();
        path
    }

    #[test]
    fn test_image_library_manager_new() {
        let temp_dir = tempdir().unwrap();
        let images_dir = temp_dir.path().join("images");
        
        let manager = ImageLibraryManager::new(&images_dir).unwrap();
        assert!(images_dir.exists());
        assert_eq!(manager.count().unwrap(), 0);
    }

    #[test]
    fn test_add_image() {
        let temp_dir = tempdir().unwrap();
        let source_dir = temp_dir.path().join("source");
        let images_dir = temp_dir.path().join("images");
        fs::create_dir_all(&source_dir).unwrap();
        
        let image_path = create_test_image_file(&source_dir, "test.png", ImageFormat::Png);
        
        let manager = ImageLibraryManager::new(&images_dir).unwrap();
        let metadata = manager.add_image(&image_path, "Test Image".to_string()).unwrap();
        
        assert_eq!(metadata.name, "Test Image");
        assert_eq!(metadata.width, 100);
        assert_eq!(metadata.height, 100);
        assert_eq!(metadata.format, ImageFormat::Png);
        assert_eq!(manager.count().unwrap(), 1);
    }

    #[test]
    fn test_add_duplicate_image_fails() {
        let temp_dir = tempdir().unwrap();
        let source_dir = temp_dir.path().join("source");
        let images_dir = temp_dir.path().join("images");
        fs::create_dir_all(&source_dir).unwrap();
        
        let image_path = create_test_image_file(&source_dir, "test.png", ImageFormat::Png);
        
        let manager = ImageLibraryManager::new(&images_dir).unwrap();
        
        // First add should succeed
        manager.add_image(&image_path, "Image 1".to_string()).unwrap();
        
        // Second add with same content should fail
        let result = manager.add_image(&image_path, "Image 2".to_string());
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), AppError::ValidationError(_)));
    }

    #[test]
    fn test_remove_image() {
        let temp_dir = tempdir().unwrap();
        let source_dir = temp_dir.path().join("source");
        let images_dir = temp_dir.path().join("images");
        fs::create_dir_all(&source_dir).unwrap();
        
        let image_path = create_test_image_file(&source_dir, "test.png", ImageFormat::Png);
        
        let manager = ImageLibraryManager::new(&images_dir).unwrap();
        let metadata = manager.add_image(&image_path, "Test".to_string()).unwrap();
        
        assert!(manager.remove_image(&metadata.id).unwrap());
        assert_eq!(manager.count().unwrap(), 0);
        assert!(!manager.get_image(&metadata.id).unwrap().is_some());
    }

    #[test]
    fn test_rename_image() {
        let temp_dir = tempdir().unwrap();
        let source_dir = temp_dir.path().join("source");
        let images_dir = temp_dir.path().join("images");
        fs::create_dir_all(&source_dir).unwrap();
        
        let image_path = create_test_image_file(&source_dir, "test.png", ImageFormat::Png);
        
        let manager = ImageLibraryManager::new(&images_dir).unwrap();
        let metadata = manager.add_image(&image_path, "Original".to_string()).unwrap();
        
        assert!(manager.rename_image(&metadata.id, "Renamed".to_string()).unwrap());
        
        let updated = manager.get_image(&metadata.id).unwrap().unwrap();
        assert_eq!(updated.name, "Renamed");
    }

    #[test]
    fn test_list_images() {
        let temp_dir = tempdir().unwrap();
        let source_dir = temp_dir.path().join("source");
        let images_dir = temp_dir.path().join("images");
        fs::create_dir_all(&source_dir).unwrap();
        
        // Create two images with different horizontal gradient patterns
        // Horizontal gradient (increasing)
        let mut img1 = ImageBuffer::from_pixel(100, 100, Rgb([0u8, 0, 0]));
        for y in 0..100 {
            for x in 0..100 {
                let pixel = img1.get_pixel_mut(x, y);
                *pixel = Rgb([(x * 255 / 100) as u8, 0, 0]);
            }
        }
        let png_path = source_dir.join("test.png");
        img1.save_with_format(&png_path, image::ImageFormat::Png).unwrap();
        
        // Checkerboard pattern (alternating columns)
        let mut img2 = ImageBuffer::from_pixel(100, 100, Rgb([0u8, 0, 0]));
        for y in 0..100 {
            for x in 0..100 {
                let pixel = img2.get_pixel_mut(x, y);
                *pixel = Rgb([if x % 2 == 0 { 255 } else { 0 }, 0, 0]);
            }
        }
        let bmp_path = source_dir.join("test.bmp");
        img2.save_with_format(&bmp_path, image::ImageFormat::Bmp).unwrap();
        
        let manager = ImageLibraryManager::new(&images_dir).unwrap();
        manager.add_image(&png_path, "PNG Image".to_string()).unwrap();
        manager.add_image(&bmp_path, "BMP Image".to_string()).unwrap();
        
        let images = manager.list_images().unwrap();
        assert_eq!(images.len(), 2);
    }

    #[test]
    fn test_persistence() {
        let temp_dir = tempdir().unwrap();
        let source_dir = temp_dir.path().join("source");
        let images_dir = temp_dir.path().join("images");
        fs::create_dir_all(&source_dir).unwrap();
        
        let image_path = create_test_image_file(&source_dir, "test.png", ImageFormat::Png);
        
        // Create manager and add image
        {
            let manager = ImageLibraryManager::new(&images_dir).unwrap();
            manager.add_image(&image_path, "Persistent Image".to_string()).unwrap();
        }
        
        // Create new manager and verify persistence
        {
            let manager = ImageLibraryManager::new(&images_dir).unwrap();
            assert_eq!(manager.count().unwrap(), 1);
            
            let images = manager.list_images().unwrap();
            assert_eq!(images[0].name, "Persistent Image");
        }
    }

    #[test]
    fn test_unsupported_format() {
        let temp_dir = tempdir().unwrap();
        let source_dir = temp_dir.path().join("source");
        let images_dir = temp_dir.path().join("images");
        fs::create_dir_all(&source_dir).unwrap();
        
        // Create a non-image file
        let txt_path = source_dir.join("test.txt");
        let mut file = fs::File::create(&txt_path).unwrap();
        file.write_all(b"not an image").unwrap();
        
        let manager = ImageLibraryManager::new(&images_dir).unwrap();
        let result = manager.add_image(&txt_path, "Text File".to_string());
        
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), AppError::ImageError(_)));
    }
}
