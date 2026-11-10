#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn local_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("jan20-repertoire.json"))
}

/// Write the whole app state to a real file in the app config folder, and return its path.
#[tauri::command]
fn save_local(app: tauri::AppHandle, json: String) -> Result<String, String> {
    let path = local_path(&app)?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
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
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![save_local, load_local, local_path_hint])
        .run(tauri::generate_context!())
        .expect("error while running Jan20");
}
