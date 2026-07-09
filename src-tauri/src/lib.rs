mod commands;
mod db;
mod models;
mod monitor;
mod timer;

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Determine database path
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("failed to create app data dir");

            let db_path: PathBuf = app_data_dir.join("focusflow.db");
            let conn = Connection::open(&db_path).expect("failed to open database");

            // Enable WAL mode
            conn.execute_batch("PRAGMA journal_mode=WAL;")
                .expect("failed to set WAL mode");

            let database = db::Database::new(conn);
            database.init().expect("failed to initialize database");

            // Load bindings and start timer engine
            let db = Arc::new(database);
            let bindings = crate::db::get_bindings(&db).unwrap_or_default();

            let engine = timer::TimerEngine::new();
            engine.set_bindings(bindings);
            engine.start(app.handle().clone(), db.clone());

            // Register state
            app.manage(db);
            app.manage(engine);

            log::info!("FocusFlow initialized. Database: {:?}", db_path);

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::get_bindings,
            commands::create_binding,
            commands::delete_binding,
            commands::get_current_app,
            commands::get_running_apps,
            commands::search_installed_apps,
            commands::get_usage_records,
            commands::get_timer_states,
            commands::refresh_bindings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
