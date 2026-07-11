use std::sync::Arc;
use tauri::State;

use crate::db::Database;
use crate::models::{AppBinding, ForegroundApp, PomodoroSession, TaskGroup, TaskGroupWithBindings, UsageRecord};
use crate::monitor;
use crate::pomodoro::{PomodoroEngine, PomodoroUpdate, RottenTomatoResult};
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
pub fn update_binding(
    db: State<'_, Arc<Database>>,
    engine: State<'_, TimerEngine>,
    pomodoro: State<'_, PomodoroEngine>,
    id: String,
    app_name: Option<String>,
    tracking_enabled: Option<bool>,
    pomodoro_enabled: Option<bool>,
    focus_minutes: Option<i32>,
    break_minutes: Option<i32>,
    long_break_minutes: Option<i32>,
    long_break_interval: Option<i32>,
) -> Result<AppBinding, String> {
    let binding = crate::db::update_binding(
        &db,
        &id,
        app_name.as_deref(),
        tracking_enabled,
        pomodoro_enabled,
        focus_minutes,
        break_minutes,
        long_break_minutes,
        long_break_interval,
    )
    .map_err(|e| e.to_string())?;

    // Refresh timer engine with updated bindings
    let bindings = crate::db::get_bindings(&db).unwrap_or_default();
    engine.set_bindings(bindings.clone());

    // Refresh pomodoro engine with updated binding
    if let Some(updated) = bindings.iter().find(|b| b.id == id) {
        if updated.pomodoro_enabled {
            pomodoro.start_session(updated);
        } else {
            // Remove existing pomodoro session when disabled
            pomodoro.remove_session(&updated.bundle_id, Some(&db));
        }
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
        pomodoro.remove_session(&bundle_id, Some(&db));
    } else {
        return Err("Binding not found".to_string());
    }

    Ok(())
}

// ── Task Group Commands ──

#[tauri::command]
pub fn get_task_groups(db: State<'_, Arc<Database>>) -> Result<Vec<TaskGroupWithBindings>, String> {
    crate::db::get_all_task_groups_with_bindings(&db).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_task_group(
    db: State<'_, Arc<Database>>,
    engine: State<'_, TimerEngine>,
    name: String,
    focus_minutes: i32,
    break_minutes: i32,
    long_break_minutes: i32,
    long_break_interval: i32,
) -> Result<TaskGroup, String> {
    let group = crate::db::create_task_group(&db, &name, focus_minutes, break_minutes, long_break_minutes, long_break_interval)
        .map_err(|e| e.to_string())?;

    // Refresh timer engine bindings
    let bindings = crate::db::get_bindings(&db).unwrap_or_default();
    engine.set_bindings(bindings);

    Ok(group)
}

#[tauri::command]
pub fn update_task_group(
    db: State<'_, Arc<Database>>,
    pomodoro: State<'_, PomodoroEngine>,
    id: String,
    name: Option<String>,
    focus_minutes: Option<i32>,
    break_minutes: Option<i32>,
    long_break_minutes: Option<i32>,
    long_break_interval: Option<i32>,
) -> Result<TaskGroup, String> {
    let group = crate::db::update_task_group(
        &db,
        &id,
        name.as_deref(),
        focus_minutes,
        break_minutes,
        long_break_minutes,
        long_break_interval,
    )
    .map_err(|e| e.to_string())?;

    // If settings changed and group has active pomodoro, remove it so it restarts with new settings
    if focus_minutes.is_some() || break_minutes.is_some() || long_break_minutes.is_some() || long_break_interval.is_some() {
        if pomodoro.has_group_session(&id) {
            pomodoro.remove_group_session(&id, Some(&db));
        }
    }

    Ok(group)
}

#[tauri::command]
pub fn delete_task_group(
    db: State<'_, Arc<Database>>,
    engine: State<'_, TimerEngine>,
    pomodoro: State<'_, PomodoroEngine>,
    id: String,
) -> Result<(), String> {
    // Remove group pomodoro session
    pomodoro.remove_group_session(&id, Some(&db));

    // Delete from database (also clears task_group_id on bindings)
    crate::db::delete_task_group(&db, &id).map_err(|e| e.to_string())?;

    // Refresh timer engine bindings (task_group_id changed)
    let bindings = crate::db::get_bindings(&db).unwrap_or_default();
    engine.set_bindings(bindings);

    Ok(())
}

#[tauri::command]
pub fn add_binding_to_group(
    db: State<'_, Arc<Database>>,
    engine: State<'_, TimerEngine>,
    pomodoro: State<'_, PomodoroEngine>,
    group_id: String,
    binding_id: String,
) -> Result<(), String> {
    // Remove individual pomodoro session if active
    let bindings = crate::db::get_bindings(&db).unwrap_or_default();
    if let Some(binding) = bindings.iter().find(|b| b.id == binding_id) {
        pomodoro.remove_session(&binding.bundle_id, Some(&db));
    }

    crate::db::add_binding_to_group(&db, &group_id, &binding_id).map_err(|e| e.to_string())?;

    // Refresh timer engine bindings
    let bindings = crate::db::get_bindings(&db).unwrap_or_default();
    engine.set_bindings(bindings);

    Ok(())
}

#[tauri::command]
pub fn remove_binding_from_group(
    db: State<'_, Arc<Database>>,
    engine: State<'_, TimerEngine>,
    binding_id: String,
) -> Result<(), String> {
    crate::db::remove_binding_from_group(&db, &binding_id).map_err(|e| e.to_string())?;

    // Refresh timer engine bindings
    let bindings = crate::db::get_bindings(&db).unwrap_or_default();
    engine.set_bindings(bindings);

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

#[tauri::command]
pub fn get_pomodoro_range(
    db: State<'_, Arc<Database>>,
    start_ts: i64,
    end_ts: i64,
) -> Result<Vec<PomodoroSession>, String> {
    crate::db::get_pomodoro_range(&db, start_ts, end_ts).map_err(|e| e.to_string())
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

// ── Close Confirmation ──

#[tauri::command]
pub fn confirm_close(
    app: tauri::AppHandle,
    db: State<'_, Arc<Database>>,
    engine: State<'_, TimerEngine>,
    pomodoro: State<'_, PomodoroEngine>,
) -> Result<RottenTomatoResult, String> {
    // Save as rotten tomato (interrupted session), grace period check included
    let result = pomodoro.save_rotten_tomato(&db);
    // Save pending timer usage records
    engine.save_all(&db);
    // Exit the app
    app.exit(0);
    Ok(result)
}

#[tauri::command]
pub fn has_active_pomodoro(pomodoro: State<'_, PomodoroEngine>) -> bool {
    pomodoro.has_active_session()
}

// ── Pomodoro Pause ──

/// Toggle pause for a pomodoro session. Accepts a binding_id to identify which session.
/// Returns the new paused state (true = paused, false = running).
#[tauri::command]
pub fn toggle_pomodoro_pause(
    binding_id: String,
    db: State<'_, Arc<Database>>,
    pomodoro: State<'_, PomodoroEngine>,
) -> Result<bool, String> {
    pomodoro.toggle_pause_by_binding(&binding_id, &db)
        .ok_or_else(|| "No active pomodoro session found for this binding".to_string())
}

/// Mark the current active focus session as a rotten tomato (user stayed away too long).
#[tauri::command]
pub fn mark_rotten_tomato(
    db: State<'_, Arc<Database>>,
    pomodoro: State<'_, PomodoroEngine>,
) -> Result<bool, String> {
    Ok(pomodoro.mark_active_as_rotten(&db))
}

// ── Health Check ──

#[tauri::command]
pub fn ping() -> String {
    "pong".to_string()
}
