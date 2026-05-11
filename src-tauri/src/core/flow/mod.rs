//! Flow management module
//! 
//! This module contains the core business logic for flow management:
//! - FlowManager: CRUD operations for flows
//! - FlowValidator: Validation logic for flow integrity
//! - FlowSerializer: JSON serialization/deserialization
//!
//! Validates: Requirements 2.7, 5.4, 7.1, 7.2, 7.3

pub mod manager;
pub mod validator;
pub mod serializer;

pub use manager::FlowManager;
pub use validator::{FlowValidator, ValidationError, ValidationWarning};
pub use serializer::FlowSerializer;
