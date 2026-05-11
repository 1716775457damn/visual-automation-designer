//! Tauri commands for image library management
//!
//! This module provides Tauri command handlers for image library operations.
//!
//! Validates: Requirements 1.1, 1.2, 1.4, 1.5, 1.6

use tauri::{AppHandle, State};
use std::sync::Mutex;

use crate::core::image_library::ImageLibraryManager;
use crate::error::{AppError, Result};
use crate::models::image::{ImageId, ImageMetadata};

/// Application state containing the image library manager
pub struct ImageLibraryState {
    pub manager: Mutex<ImageLibraryManager>,
}

impl ImageLibraryState {
    /// Create a new image library state from the app handle
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let manager = ImageLibraryManager::from_app_handle(app_handle)?;
        Ok(Self {
            manager: Mutex::new(manager),
        })
    }
}

/// Add an image to the library from a file path.
///
/// # Arguments
/// * `file_path` - Path to the source image file
/// * `name` - Display name for the image
///
/// # Returns
/// The created ImageMetadata on success, or an error
///
/// Validates: Requirements 1.1, 1.4
#[tauri::command]
pub fn add_image(
    state: State<'_, ImageLibraryState>,
    file_path: String,
    name: String,
) -> Result<ImageMetadata> {
    let manager = state.manager.lock()
        .map_err(|e| AppError::InternalError(
            format!("Failed to lock image library manager: {}", e)
        ))?;
    
    manager.add_image(&file_path, name)
}

/// Remove an image from the library.
///
/// # Arguments
/// * `id` - ID of the image to remove (as string)
///
/// # Returns
/// true if the image was removed, false if not found
///
/// Validates: Requirements 1.5
#[tauri::command]
pub fn remove_image(
    state: State<'_, ImageLibraryState>,
    id: String,
) -> Result<bool> {
    let image_id = parse_image_id(&id)?;
    
    let manager = state.manager.lock()
        .map_err(|e| AppError::InternalError(
            format!("Failed to lock image library manager: {}", e)
        ))?;
    
    manager.remove_image(&image_id)
}

/// Rename an image in the library.
///
/// # Arguments
/// * `id` - ID of the image to rename (as string)
/// * `new_name` - New name for the image
///
/// # Returns
/// true if the image was renamed, false if not found
///
/// Validates: Requirements 1.6
#[tauri::command]
pub fn rename_image(
    state: State<'_, ImageLibraryState>,
    id: String,
    new_name: String,
) -> Result<bool> {
    let image_id = parse_image_id(&id)?;
    
    let manager = state.manager.lock()
        .map_err(|e| AppError::InternalError(
            format!("Failed to lock image library manager: {}", e)
        ))?;
    
    manager.rename_image(&image_id, new_name)
}

/// List all images in the library.
///
/// # Returns
/// A list of all image metadata
///
/// Validates: Requirements 1.4
#[tauri::command]
pub fn list_images(
    state: State<'_, ImageLibraryState>,
) -> Result<Vec<ImageMetadata>> {
    let manager = state.manager.lock()
        .map_err(|e| AppError::InternalError(
            format!("Failed to lock image library manager: {}", e)
        ))?;
    
    manager.list_images()
}

/// Get an image's metadata by ID.
///
/// # Arguments
/// * `id` - ID of the image (as string)
///
/// # Returns
/// The image metadata, or None if not found
#[tauri::command]
pub fn get_image(
    state: State<'_, ImageLibraryState>,
    id: String,
) -> Result<Option<ImageMetadata>> {
    let image_id = parse_image_id(&id)?;
    
    let manager = state.manager.lock()
        .map_err(|e| AppError::InternalError(
            format!("Failed to lock image library manager: {}", e)
        ))?;
    
    manager.get_image(&image_id)
}

/// Parse an image ID from a string.
///
/// # Arguments
/// * `id` - String representation of the image ID
///
/// # Returns
/// The parsed ImageId, or an error
fn parse_image_id(id: &str) -> Result<ImageId> {
    uuid::Uuid::parse_str(id)
        .map(ImageId)
        .map_err(|e| AppError::ImageNotFound(
            format!("Invalid image ID '{}': {}", id, e)
        ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_image_id_valid() {
        let uuid = uuid::Uuid::new_v4();
        let id_str = uuid.to_string();
        let result = parse_image_id(&id_str);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().0, uuid);
    }

    #[test]
    fn test_parse_image_id_invalid() {
        let result = parse_image_id("not-a-uuid");
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), AppError::ImageNotFound(_)));
    }
}
