use std::sync::Arc;
use tauri::State;

use crate::db::Database;
use crate::models::{AppBinding, ForegroundApp, UsageRecord};
use crate::monitor;
use crate::pomodoro::{PomodoroEngine, PomodoroUpdate};
use crate::timer::{TimerEngine, TimerUpdate};

// ── Binding Commands ──

#[tauri::command]
pub fn get_bindings(db: State<'_, Arc<Database>>) -> Result<Vec<AppBinding>, String> {
    crate::db::get_bindings(&db).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_binding(
    db: State<'_, Arc<Database>>,
    engine: State<'_, TimerEngine>,
    pomodoro: State<'_, PomodoroEngine>,
    app_name: String,
    bundle_id: String,
    icon_path: String,
) -> Result<AppBinding, String> {
    let binding =
        crate::db::create_binding(&db, &app_name, &bundle_id, &icon_path).map_err(|e| e.to_string())?;

    // Refresh timer engine bindings
    let bindings = crate::db::get_bindings(&db).unwrap_or_default();
    engine.set_bindings(bindings);

    // Start pomodoro session for the new binding
    if binding.pomodoro_enabled {
        pomodoro.start_session(&binding);
    }

    Ok(binding)
}

#[tauri::command]
pub fn delete_binding(
    db: State<'_, Arc<Database>>,
    engine: State<'_, TimerEngine>,
    pomodoro: State<'_, PomodoroEngine>,
    id: String,
) -> Result<(), String> {
    // Find the binding's bundle_id before deleting
    let bindings = crate::db::get_bindings(&db).unwrap_or_default();
    let binding = bindings.iter().find(|b| b.id == id);

    if let Some(binding) = binding {
        let bundle_id = binding.bundle_id.clone();

        // Delete from database
        crate::db::delete_binding(&db, &id).map_err(|e| e.to_string())?;

        // Remove timer from engine
        engine.remove_timer(&id);

        // Refresh timer engine bindings
        let bindings = crate::db::get_bindings(&db).unwrap_or_default();
        engine.set_bindings(bindings);

        // Remove pomodoro session
        pomodoro.remove_session(&bundle_id);
    } else {
        return Err("Binding not found".to_string());
    }

    Ok(())
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

// ── Timer Commands ──

#[tauri::command]
pub fn get_timer_states(engine: State<'_, TimerEngine>) -> Vec<TimerUpdate> {
    engine.get_timer_states()
}

#[tauri::command]
pub fn refresh_bindings(
    db: State<'_, Arc<Database>>,
    engine: State<'_, TimerEngine>,
) -> Result<(), String> {
    let bindings = crate::db::get_bindings(&db).map_err(|e| e.to_string())?;
    engine.set_bindings(bindings);
    Ok(())
}

// ── Usage Records ──

#[tauri::command]
pub fn get_usage_records(
    db: State<'_, Arc<Database>>,
    date: String,
) -> Result<Vec<UsageRecord>, String> {
    crate::db::get_usage_records(&db, &date).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_usage_range(
    db: State<'_, Arc<Database>>,
    start_date: String,
    end_date: String,
) -> Result<Vec<UsageRecord>, String> {
    crate::db::get_usage_range(&db, &start_date, &end_date).map_err(|e| e.to_string())
}

// ── Pomodoro States ──

#[tauri::command]
pub fn get_pomodoro_states(engine: State<'_, PomodoroEngine>) -> Vec<PomodoroUpdate> {
    engine.get_states()
}

// ── Settings ──

#[tauri::command]
pub fn get_setting(db: State<'_, Arc<Database>>, key: String) -> Result<Option<String>, String> {
    crate::db::get_setting(&db, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_setting(db: State<'_, Arc<Database>>, key: String, value: String) -> Result<(), String> {
    crate::db::set_setting(&db, &key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_all_data(db: State<'_, Arc<Database>>) -> Result<(), String> {
    crate::db::clear_all_data(&db).map_err(|e| e.to_string())
}

// ── Health Check ──

#[tauri::command]
pub fn ping() -> String {
    "pong".to_string()
}
