//! Error types for the Visual Automation Designer application.

use serde::{Serialize, Serializer};
use thiserror::Error;

/// Application-wide error type
#[derive(Error, Debug)]
pub enum AppError {
    #[error("Flow not found: {0}")]
    FlowNotFound(String),

    #[error("Invalid flow: {0}")]
    InvalidFlow(String),

    #[error("Block not found: {0}")]
    BlockNotFound(String),

    #[error("Image not found: {0}")]
    ImageNotFound(String),

    #[error("Execution failed: {0}")]
    ExecutionFailed(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),

    #[error("Image processing error: {0}")]
    ImageError(String),

    #[error("Platform error: {0}")]
    PlatformError(String),

    #[error("Validation error: {0}")]
    ValidationError(String),

    #[error("Internal error: {0}")]
    InternalError(String),
}

/// Result type alias for Application errors
pub type Result<T> = std::result::Result<T, AppError>;

/// Error response for frontend consumption
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub code: String,
    pub message: String,
}

impl AppError {
    /// Convert error to error code string
    pub fn code(&self) -> &'static str {
        match self {
            AppError::FlowNotFound(_) => "FLOW_NOT_FOUND",
            AppError::InvalidFlow(_) => "INVALID_FLOW",
            AppError::BlockNotFound(_) => "BLOCK_NOT_FOUND",
            AppError::ImageNotFound(_) => "IMAGE_NOT_FOUND",
            AppError::ExecutionFailed(_) => "EXECUTION_FAILED",
            AppError::IoError(_) => "IO_ERROR",
            AppError::SerializationError(_) => "SERIALIZATION_ERROR",
            AppError::ImageError(_) => "IMAGE_ERROR",
            AppError::PlatformError(_) => "PLATFORM_ERROR",
            AppError::ValidationError(_) => "VALIDATION_ERROR",
            AppError::InternalError(_) => "INTERNAL_ERROR",
        }
    }

    /// Convert to frontend-friendly response
    pub fn to_response(&self) -> ErrorResponse {
        ErrorResponse {
            code: self.code().to_string(),
            message: self.to_string(),
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.to_response().serialize(serializer)
    }
}

// Implement From for image crate errors
impl From<image::ImageError> for AppError {
    fn from(err: image::ImageError) -> Self {
        AppError::ImageError(err.to_string())
    }
}
