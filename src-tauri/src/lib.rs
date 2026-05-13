//! Visual Automation Designer
//! 
//! A visual programming tool for creating screen automation workflows.

/// Tauri command handlers
pub mod commands;

/// Core business logic modules
pub mod core;

/// Platform abstraction layer (screen capture, input)
pub mod platform;

/// Image matching module
pub mod matching;

/// Data models
pub mod models;

/// Error types
pub mod error;

/// Logging utilities for error and panic logging
pub mod logging;

// Re-export commonly used types
pub use error::{AppError, Result};

use commands::{FlowState, ImageLibraryState, ExecutionState};
use tauri::{Manager, Emitter};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use std::panic;
use std::io;

fn startup_error(message: impl Into<String>) -> io::Error {
    io::Error::other(message.into())
}

fn show_startup_error(app: &tauri::AppHandle, message: &str) {
    app.dialog()
        .message(message)
        .title("Startup Failed")
        .kind(MessageDialogKind::Error)
        .blocking_show();
}

/// Set up the panic handler to catch panics and log them
fn setup_panic_handler(app_handle: &tauri::AppHandle) {
    let app_handle_clone = app_handle.clone();
    
    panic::set_hook(Box::new(move |panic_info| {
        // Extract panic information
        let message = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic".to_string()
        };
        
        // Extract location information
        let location = panic_info.location().map(|loc| {
            format!("{}:{}:{}", loc.file(), loc.line(), loc.column())
        });
        
        // Log to file
        logging::log_panic(&message, location.as_deref());
        
        // Log to console
        log::error!("PANIC: {} at {:?}", message, location);
        
        // Emit error event to frontend if possible
        let _ = app_handle_clone.emit("application-error", serde_json::json!({
            "type": "panic",
            "message": message,
            "location": location,
        }));
    }));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Initialize logging
            env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
                .init();
            
            // Get app data directory
            let app_data_dir = match app.path().app_data_dir() {
                Ok(path) => path,
                Err(e) => {
                    let message = format!("Failed to get app data directory: {}", e);
                    show_startup_error(&app.handle(), &message);
                    return Err(startup_error(message).into());
                }
            };
            
            // Initialize error logger
            if let Err(e) = logging::init_logger(app_data_dir.clone()) {
                let message = format!("Failed to initialize error logger: {}", e);
                show_startup_error(&app.handle(), &message);
                return Err(startup_error(message).into());
            }
            
            // Set up panic handler
            setup_panic_handler(&app.handle());
            
            // Initialize image library state
            let image_library_state = match ImageLibraryState::new(&app.handle()) {
                Ok(state) => state,
                Err(e) => {
                    let message = format!("Failed to initialize image library state: {}", e);
                    show_startup_error(&app.handle(), &message);
                    return Err(startup_error(message).into());
                }
            };
            app.manage(image_library_state);
            
            // Initialize flow state
            let flow_state = match FlowState::new(&app.handle()) {
                Ok(state) => state,
                Err(e) => {
                    let message = format!("Failed to initialize flow state: {}", e);
                    show_startup_error(&app.handle(), &message);
                    return Err(startup_error(message).into());
                }
            };
            app.manage(flow_state);
            
            // Initialize execution state
            let execution_state = ExecutionState::new(&app.handle());
            app.manage(execution_state);
            
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Image library commands
            commands::add_image,
            commands::add_image_from_base64,
            commands::remove_image,
            commands::rename_image,
            commands::list_images,
            commands::get_image,
            // Flow management commands
            commands::create_flow,
            commands::save_flow,
            commands::load_flow,
            commands::list_flows,
            commands::delete_flow,
            commands::validate_flow,
            // Block operation commands
            commands::create_block,
            commands::update_block_position,
            commands::delete_block,
            commands::update_block_config,
            commands::set_entry_block,
            // Connection operation commands
            commands::create_connection,
            commands::delete_connection,
            // Undo/redo commands
            commands::can_undo,
            commands::can_redo,
            commands::undo,
            commands::redo,
            // Execution control commands
            commands::execute_flow,
            commands::step_execution,
            commands::stop_execution,
            commands::pause_execution,
            commands::resume_execution,
            commands::get_execution_status,
            commands::runtime_self_check,
        ])
        .run(tauri::generate_context!());

    if let Err(error) = app {
        logging::log_error("Failed to run tauri application", Some(&error.to_string()), None);
        panic!("error while running tauri application: {}", error);
    }
}
