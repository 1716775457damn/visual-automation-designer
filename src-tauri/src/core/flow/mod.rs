//! Flow management module
//!
//! This module contains the core business logic for flow management:
//! - FlowManager: CRUD operations for flows
//! - FlowValidator: Validation logic for flow integrity
//! - FlowSerializer: JSON serialization/deserialization
//!
//! Validates: Requirements 2.7, 5.4, 7.1, 7.2, 7.3

pub mod manager;
pub mod flow_validator;
pub mod block_validator;
pub mod connection_validator;
pub mod serializer;

pub use manager::FlowManager;
pub use flow_validator::{FlowValidator, ValidationError, ValidationSeverity, ValidationWarning};
pub use serializer::FlowSerializer;
