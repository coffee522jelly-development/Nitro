use tauri::Emitter;
use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

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
    pub search_dirs: Vec<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        let mut default_dirs = Vec::new();
        if let Some(home_dir) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).ok() {
            let desktop_path = PathBuf::from(home_dir).join("Desktop");
            if let Some(path_str) = desktop_path.to_str() {
                default_dirs.push(path_str.to_string());
            }
        }

        Self {
            shortcut: "Ctrl+Space".to_string(),
            theme_color: "zinc".to_string(),
            search_dirs: default_dirs,
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
    let query_lower = query.to_lowercase();

    let settings = get_settings();
    let mut count = 0;
    let max_results = 500;

    for dir_str in settings.search_dirs {
        let target_dir = PathBuf::from(&dir_str);
        if !target_dir.exists() || !target_dir.is_dir() {
            continue;
        }

        // For massive folders, we should only return a slice. To not freeze we cap max_results tightly.
        for entry in WalkDir::new(target_dir).into_iter().filter_map(|e| e.ok()) {
            if count >= max_results {
                break;
            }
            if let Some(name) = entry.file_name().to_str() {
                if name.to_lowercase().contains(&query_lower) {
                    if let Some(path_str) = entry.path().to_str() {
                        results.push(path_str.to_string());
                        count += 1;
                    }
                }
            }
        }
        if count >= max_results {
            break;
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
fn save_settings(app: tauri::AppHandle, shortcut: String, theme_color: String, search_dirs: Option<Vec<String>>) -> Result<(), String> {
    let path = get_settings_file_path().ok_or("Failed to get config path")?;

    let old_settings = get_settings();

    let dirs = search_dirs.unwrap_or(old_settings.search_dirs.clone());

    let settings = AppSettings { shortcut: shortcut.clone(), theme_color, search_dirs: dirs };
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

            app.on_menu_event(move |app, event| {
                if event.id() == "open_context_menu" {
                    let _ = app.emit("context_menu_open_selected", ());
                }
            });

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
        .invoke_handler(tauri::generate_handler![greet, search_files, get_snippets, save_snippet, get_settings, save_settings, show_context_menu, app_get_open_windows, focus_window])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


#[derive(serde::Serialize, Clone)]
pub struct AppWindow {
    pub id: u32,
    pub title: String,
    pub app_name: String,
}

#[tauri::command]
fn app_get_open_windows() -> Vec<AppWindow> {
    use x_win::get_open_windows;

    let mut results = Vec::new();
    if let Ok(windows) = get_open_windows() {
        for window in windows {
            results.push(AppWindow {
                id: window.id,
                title: window.title.clone(),
                app_name: window.info.name.clone(),
            });
        }
    }
    results
}

#[tauri::command]
#[allow(unused_variables)]
fn focus_window(id: u32, app_name: String) {
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let id_hex = format!("0x{:x}", id);
        let _ = Command::new("wmctrl")
            .args(&["-i", "-a", &id_hex])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let safe_name = app_name.replace('"', "");
        let script = format!("tell application \"{}\" to activate", safe_name);
        let _ = Command::new("osascript")
            .args(&["-e", &script])
            .spawn();
    }
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let safe_name = app_name.replace("'", "''");
        let script = format!("(New-Object -ComObject WScript.Shell).AppActivate('{}')", safe_name);
        let _ = Command::new("powershell")
            .args(&["-Command", &script])
            .spawn();
    }
}

#[tauri::command]
fn show_context_menu(app: tauri::AppHandle, _path: String) {
    use tauri::menu::{Menu, MenuItem};
    use tauri::Manager;

    let _app_handle = app.clone();
    let open_i = MenuItem::with_id(&app, "open_context_menu", "既定のアプリで開く", true, None::<&str>).unwrap();
    let menu = Menu::with_items(&app, &[&open_i]).unwrap();

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.popup_menu(&menu);
    }
}
