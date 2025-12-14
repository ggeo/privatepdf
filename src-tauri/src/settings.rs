use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct AppSettings {
    pub theme: String,
    pub ollama_model: String,
    pub temperature: f32,
    pub top_p: f32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            ollama_model: "gemma3:1b-it-q4_K_M".to_string(),
            temperature: 0.2,
            top_p: 0.7,
        }
    }
}

/// Get the path to the settings file
fn get_settings_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    // Ensure directory exists
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }

    Ok(app_data_dir.join("settings.json"))
}

/// Save app settings to disk
#[tauri::command]
pub async fn save_settings(
    app_handle: tauri::AppHandle,
    settings: AppSettings,
) -> Result<(), String> {
    log::info!("Saving app settings...");

    let path = get_settings_path(&app_handle)?;

    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&path, json).map_err(|e| format!("Failed to write settings file: {}", e))?;

    log::info!("Settings saved successfully to: {:?}", path);
    Ok(())
}

/// Load app settings from disk
#[tauri::command]
pub async fn load_settings(app_handle: tauri::AppHandle) -> Result<AppSettings, String> {
    log::info!("Loading app settings...");

    let path = get_settings_path(&app_handle)?;

    if !path.exists() {
        log::info!("No settings file found, returning defaults");
        return Ok(AppSettings::default());
    }

    let json = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read settings file: {}", e))?;

    let settings: AppSettings = serde_json::from_str(&json)
        .map_err(|e| format!("Failed to parse settings: {}", e))?;

    log::info!("Settings loaded successfully");
    Ok(settings)
}

/// Reset settings to defaults
#[tauri::command]
pub async fn reset_settings(app_handle: tauri::AppHandle) -> Result<AppSettings, String> {
    log::info!("Resetting settings to defaults...");

    let path = get_settings_path(&app_handle)?;

    // Delete existing settings file if it exists
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to delete settings file: {}", e))?;
    }

    let defaults = AppSettings::default();
    save_settings(app_handle, defaults.clone()).await?;

    Ok(defaults)
}
