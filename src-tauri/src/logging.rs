//! Logging module for the Visual Automation Designer application.
//!
//! This module provides logging utilities for recording errors, panics,
//! and other diagnostic information to files.
//!
//! Validates: Requirements 8.4

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use chrono::{DateTime, Utc};

/// Global logger instance
static LOGGER: Mutex<Option<ErrorLogger>> = Mutex::new(None);

/// Error logger that writes to a file
pub struct ErrorLogger {
    /// Log file path
    log_file_path: PathBuf,
}

/// Log entry structure
#[derive(Debug, serde::Serialize)]
pub struct LogEntry {
    /// Timestamp of the log entry
    pub timestamp: DateTime<Utc>,
    /// Log level (error, warn, info, etc.)
    pub level: String,
    /// Log message
    pub message: String,
    /// Optional error details
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
    /// Optional stack trace
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stack_trace: Option<String>,
}

impl ErrorLogger {
    /// Create a new error logger
    pub fn new(logs_dir: PathBuf) -> std::io::Result<Self> {
        // Ensure logs directory exists
        fs::create_dir_all(&logs_dir)?;
        
        // Create log file path with current date
        let today = Utc::now().format("%Y-%m-%d");
        let log_file_name = format!("error-{}.log", today);
        let log_file_path = logs_dir.join(log_file_name);
        
        Ok(Self { log_file_path })
    }
    
    /// Log an error entry
    pub fn log_error(&self, message: &str, details: Option<&str>, stack_trace: Option<&str>) {
        let entry = LogEntry {
            timestamp: Utc::now(),
            level: "error".to_string(),
            message: message.to_string(),
            details: details.map(|s| s.to_string()),
            stack_trace: stack_trace.map(|s| s.to_string()),
        };
        
        self.write_entry(&entry);
    }
    
    /// Log a panic entry
    pub fn log_panic(&self, panic_info: &str, location: Option<&str>) {
        let entry = LogEntry {
            timestamp: Utc::now(),
            level: "panic".to_string(),
            message: "Panic occurred".to_string(),
            details: Some(panic_info.to_string()),
            stack_trace: location.map(|s| s.to_string()),
        };
        
        self.write_entry(&entry);
    }
    
    /// Log a warning entry
    pub fn log_warning(&self, message: &str, details: Option<&str>) {
        let entry = LogEntry {
            timestamp: Utc::now(),
            level: "warn".to_string(),
            message: message.to_string(),
            details: details.map(|s| s.to_string()),
            stack_trace: None,
        };
        
        self.write_entry(&entry);
    }
    
    /// Write a log entry to file
    fn write_entry(&self, entry: &LogEntry) {
        if let Ok(mut file) = self.open_log_file() {
            let json = serde_json::to_string(entry).unwrap_or_else(|_| {
                format!(
                    "{{\"timestamp\":\"{}\",\"level\":\"{}\",\"message\":\"{}\"}}",
                    entry.timestamp, entry.level, entry.message
                )
            });
            let _ = writeln!(file, "{}", json);
        }
    }
    
    /// Open the log file for appending
    fn open_log_file(&self) -> std::io::Result<File> {
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_file_path)
    }
}

/// Initialize the global error logger
pub fn init_logger(app_data_dir: PathBuf) -> std::io::Result<()> {
    let logs_dir = app_data_dir.join("logs");
    let logger = ErrorLogger::new(logs_dir)?;
    
    let mut global_logger = LOGGER.lock().unwrap();
    *global_logger = Some(logger);
    
    Ok(())
}

/// Get the global logger
pub fn get_logger() -> Option<std::sync::MutexGuard<'static, Option<ErrorLogger>>> {
    Some(LOGGER.lock().unwrap())
}

/// Log an error using the global logger
pub fn log_error(message: &str, details: Option<&str>, stack_trace: Option<&str>) {
    if let Ok(logger_guard) = LOGGER.lock() {
        if let Some(logger) = logger_guard.as_ref() {
            logger.log_error(message, details, stack_trace);
        }
    }
}

/// Log a panic using the global logger
pub fn log_panic(panic_info: &str, location: Option<&str>) {
    if let Ok(logger_guard) = LOGGER.lock() {
        if let Some(logger) = logger_guard.as_ref() {
            logger.log_panic(panic_info, location);
        }
    }
}

/// Log a warning using the global logger
pub fn log_warning(message: &str, details: Option<&str>) {
    if let Ok(logger_guard) = LOGGER.lock() {
        if let Some(logger) = logger_guard.as_ref() {
            logger.log_warning(message, details);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    
    #[test]
    fn test_logger_creation() {
        let dir = tempdir().unwrap();
        let logger = ErrorLogger::new(dir.path().to_path_buf());
        assert!(logger.is_ok());
    }
    
    #[test]
    fn test_log_error() {
        let dir = tempdir().unwrap();
        let logger = ErrorLogger::new(dir.path().to_path_buf()).unwrap();
        
        // Should not panic
        logger.log_error("Test error", Some("Test details"), Some("Test stack"));
    }
    
    #[test]
    fn test_log_panic() {
        let dir = tempdir().unwrap();
        let logger = ErrorLogger::new(dir.path().to_path_buf()).unwrap();
        
        // Should not panic
        logger.log_panic("Test panic info", Some("test.rs:10"));
    }
    
    #[test]
    fn test_log_entry_serialization() {
        let entry = LogEntry {
            timestamp: Utc::now(),
            level: "error".to_string(),
            message: "Test message".to_string(),
            details: Some("Test details".to_string()),
            stack_trace: None,
        };
        
        let json = serde_json::to_string(&entry);
        assert!(json.is_ok());
    }
}
