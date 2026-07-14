use std::fs;
use std::path::PathBuf;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn search_files(query: String) -> Vec<String> {
    if query.trim().is_empty() {
        return vec![];
    }

    let mut results = Vec::new();
    let home_dir = match std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
        Ok(dir) => PathBuf::from(dir),
        Err(_) => return vec![],
    };

    // For MVP, we will just scan the Desktop directory for speed
    // as scanning the entire home directory without an index is too slow for 50ms requirement
    let target_dir = home_dir.join("Desktop");

    let query_lower = query.to_lowercase();

    if let Ok(entries) = fs::read_dir(&target_dir) {
        for entry in entries.flatten() {
            if let Ok(name) = entry.file_name().into_string() {
                if name.to_lowercase().contains(&query_lower) {
                    if let Some(path_str) = entry.path().to_str() {
                        results.push(path_str.to_string());
                    }
                }
            }
        }
    }

    results
}

use tauri::{tray::TrayIconBuilder, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, shortcut, event| {
            if event.state == ShortcutState::Pressed {
                let ctrl_space = Shortcut::new(
                    Some(tauri_plugin_global_shortcut::Modifiers::CONTROL),
                    tauri_plugin_global_shortcut::Code::Space,
                );

                if shortcut == &ctrl_space {
                    if let Some(window) = app.get_webview_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            }
        }).build())
        .setup(|app| {
            // Keep the application running in the background even if the window is closed
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Add a simple system tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .build(app)?;

            // Register Ctrl+Space shortcut
            let ctrl_space = Shortcut::new(
                Some(tauri_plugin_global_shortcut::Modifiers::CONTROL),
                tauri_plugin_global_shortcut::Code::Space,
            );
            app.global_shortcut().register(ctrl_space)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, search_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
