use tauri::State;

use crate::db::Database;
use crate::models::{AppBinding, ForegroundApp, UsageRecord};
use crate::monitor;

// ── Binding Commands ──

#[tauri::command]
pub fn get_bindings(db: State<'_, Database>) -> Result<Vec<AppBinding>, String> {
    crate::db::get_bindings(&db).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_binding(
    db: State<'_, Database>,
    app_name: String,
    bundle_id: String,
    icon_path: String,
) -> Result<AppBinding, String> {
    crate::db::create_binding(&db, &app_name, &bundle_id, &icon_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_binding(db: State<'_, Database>, id: String) -> Result<(), String> {
    crate::db::delete_binding(&db, &id).map_err(|e| e.to_string())
}

// ── Monitor Commands ──

#[tauri::command]
pub fn get_current_app() -> Option<ForegroundApp> {
    monitor::get_current_app()
}

#[tauri::command]
pub fn get_running_apps() -> Vec<ForegroundApp> {
    monitor::get_running_apps()
}

#[tauri::command]
pub fn search_installed_apps(query: String) -> Vec<ForegroundApp> {
    monitor::search_installed_apps(&query)
}

// ── Usage Record Commands ──

#[tauri::command]
pub fn get_usage_records(db: State<'_, Database>, date: String) -> Result<Vec<UsageRecord>, String> {
    crate::db::get_usage_records(&db, &date).map_err(|e| e.to_string())
}

// ── Health Check ──

#[tauri::command]
pub fn ping() -> String {
    "pong".to_string()
}
