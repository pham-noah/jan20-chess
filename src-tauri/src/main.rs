#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::Manager;

/// The last state the frontend handed us, kept so the file can still be written when the window closes —
/// the JS side cannot finish an async write once the webview is torn down.
struct LastState(Mutex<String>);

fn local_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("jan20-repertoire.json"))
}

/// Write the whole app state to a real file in the app config folder, and return its path.
#[tauri::command]
fn save_local(app: tauri::AppHandle, json: String) -> Result<String, String> {
    let path = local_path(&app)?;
    if let Some(st) = app.try_state::<LastState>() {
        if let Ok(mut g) = st.0.lock() {
            *g = json.clone();
        }
    }
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

/// Write the last known state on the way out, so closing the window never loses the newest edit.
fn flush_on_close(app: &tauri::AppHandle) {
    if let Some(st) = app.try_state::<LastState>() {
        if let Ok(g) = st.0.lock() {
            if !g.is_empty() {
                if let Ok(path) = local_path(app) {
                    let _ = std::fs::write(path, &*g);
                }
            }
        }
    }
}

/// Read that file back at start-up. `None` means nothing has been saved yet.
#[tauri::command]
fn load_local(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = local_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

/// Where that file lives, so Settings can show it.
#[tauri::command]
fn local_path_hint(app: tauri::AppHandle) -> Result<String, String> {
    Ok(local_path(&app)?.display().to_string())
}

fn main() {
    let app = tauri::Builder::default()
        .manage(LastState(Mutex::new(String::new())))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![save_local, load_local, local_path_hint])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                flush_on_close(&window.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Jan20");
    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            flush_on_close(handle);
        }
    });
}
