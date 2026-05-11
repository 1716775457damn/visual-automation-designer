//! Flow manager implementation
//!
//! This module provides the core flow management functionality:
//! - Creating, saving, loading, and deleting flows
//! - Listing all available flows
//!
//! Validates: Requirements 2.7, 7.1, 7.2

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{AppError, Result};
use crate::models::flow::{Flow, FlowId, FlowMetadata};

use super::serializer::FlowSerializer;

/// Flow manager for CRUD operations on flows
pub struct FlowManager {
    /// Base directory for flow storage
    flows_dir: PathBuf,
    /// In-memory cache of loaded flows
    cache: HashMap<FlowId, Flow>,
    /// Serializer for JSON operations
    serializer: FlowSerializer,
}

impl FlowManager {
    /// Create a new flow manager with the given base directory
    ///
    /// # Arguments
    /// * `base_dir` - Base directory for application data
    ///
    /// # Returns
    /// A new FlowManager instance with flows stored in `base_dir/flows/`
    pub fn new<P: AsRef<Path>>(base_dir: P) -> Result<Self> {
        let flows_dir = base_dir.as_ref().join("flows");
        
        // Create flows directory if it doesn't exist
        if !flows_dir.exists() {
            fs::create_dir_all(&flows_dir).map_err(|e| {
                AppError::InternalError(format!("Failed to create flows directory: {}", e))
            })?;
        }
        
        Ok(Self {
            flows_dir,
            cache: HashMap::new(),
            serializer: FlowSerializer::new(),
        })
    }
    
    /// Create a new flow with the given name
    ///
    /// # Arguments
    /// * `name` - Name for the new flow
    ///
    /// # Returns
    /// The created flow
    pub fn create_flow(&mut self, name: String) -> Result<Flow> {
        let flow = Flow::new(name);
        let flow_id = flow.id.clone();
        
        // Save to disk
        self.save_flow_internal(&flow)?;
        
        // Cache the flow
        self.cache.insert(flow_id, flow.clone());
        
        Ok(flow)
    }
    
    /// Save a flow to disk
    ///
    /// # Arguments
    /// * `flow` - The flow to save
    ///
    /// # Returns
    /// Ok(()) if successful
    pub fn save_flow(&mut self, flow: &Flow) -> Result<()> {
        self.save_flow_internal(flow)?;
        
        // Update cache
        self.cache.insert(flow.id.clone(), flow.clone());
        
        Ok(())
    }
    
    /// Internal method to save flow to disk
    fn save_flow_internal(&self, flow: &Flow) -> Result<()> {
        let file_path = self.get_flow_path(&flow.id);
        
        // Ensure parent directory exists
        if let Some(parent) = file_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| {
                    AppError::InternalError(format!("Failed to create flow directory: {}", e))
                })?;
            }
        }
        
        // Serialize and write
        let json = self.serializer.serialize(flow)?;
        fs::write(&file_path, json).map_err(|e| {
            AppError::IoError(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to write flow file: {}", e),
            ))
        })?;
        
        Ok(())
    }
    
    /// Load a flow from disk by ID
    ///
    /// # Arguments
    /// * `id` - The flow ID to load
    ///
    /// # Returns
    /// The loaded flow, or an error if not found
    pub fn load_flow(&mut self, id: &FlowId) -> Result<Flow> {
        // Check cache first
        if let Some(flow) = self.cache.get(id) {
            return Ok(flow.clone());
        }
        
        // Load from disk
        let file_path = self.get_flow_path(id);
        
        if !file_path.exists() {
            return Err(AppError::FlowNotFound(id.to_string()));
        }
        
        let json = fs::read_to_string(&file_path).map_err(|e| {
            AppError::IoError(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to read flow file: {}", e),
            ))
        })?;
        
        let flow = self.serializer.deserialize(&json)?;
        
        // Validate the loaded flow ID matches
        if flow.id != *id {
            return Err(AppError::InvalidFlow(format!(
                "Flow ID mismatch: expected {}, found {}",
                id, flow.id
            )));
        }
        
        // Cache the flow
        self.cache.insert(flow.id.clone(), flow.clone());
        
        Ok(flow)
    }
    
    /// List all available flows (metadata only)
    ///
    /// # Returns
    /// A list of flow metadata for all saved flows
    pub fn list_flows(&mut self) -> Result<Vec<FlowMetadata>> {
        let mut flows = Vec::new();
        
        // Read all .json files from flows directory
        let entries = fs::read_dir(&self.flows_dir).map_err(|e| {
            AppError::IoError(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to read flows directory: {}", e),
            ))
        })?;
        
        for entry in entries {
            let entry = entry.map_err(|e| {
                AppError::IoError(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("Failed to read directory entry: {}", e),
                ))
            })?;
            
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                // Try to load the flow to get metadata
                match fs::read_to_string(&path) {
                    Ok(json) => {
                        match self.serializer.deserialize(&json) {
                            Ok(flow) => flows.push(FlowMetadata::from(&flow)),
                            Err(e) => {
                                // Log error but continue processing other flows
                                eprintln!("Warning: Failed to parse flow file {:?}: {}", path, e);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("Warning: Failed to read flow file {:?}: {}", path, e);
                    }
                }
            }
        }
        
        // Sort by updated_at descending (most recent first)
        flows.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        
        Ok(flows)
    }
    
    /// Delete a flow by ID
    ///
    /// # Arguments
    /// * `id` - The flow ID to delete
    ///
    /// # Returns
    /// Ok(()) if successful, or an error if the flow doesn't exist
    pub fn delete_flow(&mut self, id: &FlowId) -> Result<()> {
        let file_path = self.get_flow_path(id);
        
        if !file_path.exists() {
            return Err(AppError::FlowNotFound(id.to_string()));
        }
        
        // Remove from cache
        self.cache.remove(id);
        
        // Delete file
        fs::remove_file(&file_path).map_err(|e| {
            AppError::IoError(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to delete flow file: {}", e),
            ))
        })?;
        
        Ok(())
    }
    
    /// Check if a flow exists
    ///
    /// # Arguments
    /// * `id` - The flow ID to check
    ///
    /// # Returns
    /// true if the flow exists, false otherwise
    pub fn flow_exists(&self, id: &FlowId) -> bool {
        self.cache.contains_key(id) || self.get_flow_path(id).exists()
    }
    
    /// Get the file path for a flow
    fn get_flow_path(&self, id: &FlowId) -> PathBuf {
        self.flows_dir.join(format!("{}.json", id))
    }
    
    /// Get a flow from cache (does not load from disk)
    ///
    /// # Arguments
    /// * `id` - The flow ID to get
    ///
    /// # Returns
    /// The flow if cached, or None
    pub fn get_cached(&self, id: &FlowId) -> Option<&Flow> {
        self.cache.get(id)
    }
    
    /// Clear the internal cache
    pub fn clear_cache(&mut self) {
        self.cache.clear();
    }
    
    /// Export a flow to a specific path
    ///
    /// # Arguments
    /// * `id` - The flow ID to export
    /// * `export_path` - The path to export to
    ///
    /// # Returns
    /// Ok(()) if successful
    pub fn export_flow<P: AsRef<Path>>(&mut self, id: &FlowId, export_path: P) -> Result<()> {
        let flow = self.load_flow(id)?;
        let json = self.serializer.serialize(&flow)?;
        
        fs::write(export_path.as_ref(), json).map_err(|e| {
            AppError::IoError(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to export flow: {}", e),
            ))
        })?;
        
        Ok(())
    }
    
    /// Import a flow from a file
    ///
    /// # Arguments
    /// * `import_path` - The path to import from
    ///
    /// # Returns
    /// The imported flow with a new ID
    pub fn import_flow<P: AsRef<Path>>(&mut self, import_path: P) -> Result<Flow> {
        let json = fs::read_to_string(import_path.as_ref()).map_err(|e| {
            AppError::IoError(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to read import file: {}", e),
            ))
        })?;
        
        let mut flow = self.serializer.deserialize(&json)?;
        
        // Generate a new ID for the imported flow
        flow.id = FlowId::new();
        flow.name = format!("{} (imported)", flow.name);
        
        // Save to disk
        self.save_flow_internal(&flow)?;
        
        // Cache the flow
        self.cache.insert(flow.id.clone(), flow.clone());
        
        Ok(flow)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    
    #[test]
    fn test_flow_manager_creation() {
        let temp_dir = TempDir::new().unwrap();
        let manager = FlowManager::new(temp_dir.path());
        assert!(manager.is_ok());
    }
    
    #[test]
    fn test_create_flow() {
        let temp_dir = TempDir::new().unwrap();
        let mut manager = FlowManager::new(temp_dir.path()).unwrap();
        
        let flow = manager.create_flow("Test Flow".to_string()).unwrap();
        assert_eq!(flow.name, "Test Flow");
        assert!(flow.blocks.is_empty());
        
        // Verify file was created
        assert!(manager.flow_exists(&flow.id));
    }
    
    #[test]
    fn test_save_and_load_flow() {
        let temp_dir = TempDir::new().unwrap();
        let mut manager = FlowManager::new(temp_dir.path()).unwrap();
        
        let flow = manager.create_flow("Test Flow".to_string()).unwrap();
        let flow_id = flow.id.clone();
        
        // Clear cache to force load from disk
        manager.clear_cache();
        
        let loaded = manager.load_flow(&flow_id).unwrap();
        assert_eq!(loaded.name, "Test Flow");
    }
    
    #[test]
    fn test_load_nonexistent_flow() {
        let temp_dir = TempDir::new().unwrap();
        let mut manager = FlowManager::new(temp_dir.path()).unwrap();
        
        let fake_id = FlowId::new();
        let result = manager.load_flow(&fake_id);
        assert!(result.is_err());
    }
    
    #[test]
    fn test_delete_flow() {
        let temp_dir = TempDir::new().unwrap();
        let mut manager = FlowManager::new(temp_dir.path()).unwrap();
        
        let flow = manager.create_flow("Test Flow".to_string()).unwrap();
        let flow_id = flow.id.clone();
        
        assert!(manager.flow_exists(&flow_id));
        
        manager.delete_flow(&flow_id).unwrap();
        
        assert!(!manager.flow_exists(&flow_id));
    }
    
    #[test]
    fn test_list_flows() {
        let temp_dir = TempDir::new().unwrap();
        let mut manager = FlowManager::new(temp_dir.path()).unwrap();
        
        // Create multiple flows
        manager.create_flow("Flow 1".to_string()).unwrap();
        manager.create_flow("Flow 2".to_string()).unwrap();
        manager.create_flow("Flow 3".to_string()).unwrap();
        
        let flows = manager.list_flows().unwrap();
        assert_eq!(flows.len(), 3);
    }
    
    #[test]
    fn test_export_import_flow() {
        let temp_dir = TempDir::new().unwrap();
        let mut manager = FlowManager::new(temp_dir.path()).unwrap();
        
        let flow = manager.create_flow("Original Flow".to_string()).unwrap();
        let original_id = flow.id.clone();
        
        let export_path = temp_dir.path().join("exported.json");
        manager.export_flow(&original_id, &export_path).unwrap();
        
        let imported = manager.import_flow(&export_path).unwrap();
        
        // Imported flow should have a different ID and modified name
        assert_ne!(imported.id, original_id);
        assert!(imported.name.contains("imported"));
    }
}
