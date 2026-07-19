use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct Snippet {
    pub title: String,
    pub content: String,
    pub tags: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub shortcut: String,
    pub theme_color: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            shortcut: "Ctrl+Space".to_string(),
            theme_color: "zinc".to_string(),
        }
    }
}

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

fn get_snippets_file_path() -> Option<PathBuf> {
    let home_dir = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).ok()?;
    let path = PathBuf::from(home_dir).join(".nitro");
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    Some(path.join("snippets.json"))
}

#[tauri::command]
fn get_snippets() -> Vec<Snippet> {
    let path = match get_snippets_file_path() {
        Some(p) => p,
        None => return vec![],
    };

    if !path.exists() {
        return vec![];
    }

    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| vec![]),
        Err(_) => vec![],
    }
}

#[tauri::command]
fn save_snippet(title: String, content: String, tags: Option<Vec<String>>) -> Result<(), String> {
    let path = get_snippets_file_path().ok_or("Failed to get config path")?;

    let mut snippets = get_snippets();
    snippets.push(Snippet { title, content, tags });

    let json = serde_json::to_string_pretty(&snippets).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;

    Ok(())
}

fn get_settings_file_path() -> Option<PathBuf> {
    let home_dir = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).ok()?;
    let path = PathBuf::from(home_dir).join(".nitro");
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    Some(path.join("settings.json"))
}

#[tauri::command]
fn get_settings() -> AppSettings {
    let path = match get_settings_file_path() {
        Some(p) => p,
        None => return AppSettings::default(),
    };

    if !path.exists() {
        return AppSettings::default();
    }

    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| AppSettings::default()),
        Err(_) => AppSettings::default(),
    }
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, shortcut: String, theme_color: String) -> Result<(), String> {
    let path = get_settings_file_path().ok_or("Failed to get config path")?;

    let old_settings = get_settings();
    let settings = AppSettings { shortcut: shortcut.clone(), theme_color };
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;

    // Unregister old shortcut
    if let Ok(old_shortcut) = old_settings.shortcut.parse::<tauri_plugin_global_shortcut::Shortcut>() {
        let _ = app.global_shortcut().unregister(old_shortcut);
    }

    // Register new shortcut
    if let Ok(new_shortcut) = shortcut.parse::<tauri_plugin_global_shortcut::Shortcut>() {
        let _ = app.global_shortcut().register(new_shortcut);
    }

    Ok(())
}

use tauri::{menu::{Menu, MenuItem}, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent}, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        }).build())
        .setup(|app| {
            // Keep the application running in the background even if the window is closed
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let toggle_i = MenuItem::with_id(app, "toggle", "開く", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_i, &quit_i])?;

            // Add a simple system tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => {
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Register configured shortcut
            let settings = get_settings();
            let parsed_shortcut: Shortcut = settings.shortcut.parse().unwrap_or_else(|_| {
                Shortcut::new(
                    Some(tauri_plugin_global_shortcut::Modifiers::CONTROL),
                    tauri_plugin_global_shortcut::Code::Space,
                )
            });
            let _ = app.global_shortcut().register(parsed_shortcut);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, search_files, get_snippets, save_snippet, get_settings, save_settings])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
