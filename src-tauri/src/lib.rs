mod commands;
mod db;
mod models;
mod monitor;
mod pomodoro;
mod timer;

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;

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

            // Load bindings
            let db = Arc::new(database);
            let bindings = crate::db::get_bindings(&db).unwrap_or_default();

            // Start pomodoro engine
            let pomodoro_engine = pomodoro::PomodoroEngine::new();
            for binding in &bindings {
                if binding.pomodoro_enabled {
                    pomodoro_engine.start_session(binding);
                }
            }
            pomodoro_engine.start(app.handle().clone(), db.clone());

            // Start timer engine (passes pomodoro engine for linkage)
            let engine = timer::TimerEngine::new();
            engine.set_bindings(bindings.clone());
            engine.start(app.handle().clone(), db.clone(), pomodoro_engine.clone_ref());

            // Register state
            app.manage(db);
            app.manage(engine);
            app.manage(pomodoro_engine);

            // Clone state references for closures
            let engine_ref = app.state::<timer::TimerEngine>().inner().clone();
            let db_ref = app.state::<Arc<db::Database>>().inner().clone();

            // Main window: hide on close instead of quitting
            if let Some(main_window) = app.get_webview_window("main") {
                let win_clone = main_window.clone();
                let engine_close = engine_ref.clone();
                let db_close = db_ref.clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        engine_close.save_all(&db_close);
                        let _ = win_clone.hide();
                    }
                });
            }

            // ── System Tray ──
            let show_item = MenuItemBuilder::with_id("show", "打开主窗口").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("FocusFlow — 就绪")
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                        "quit" => {
                            // Save timers before quitting
                            if let Some(engine) = app.try_state::<timer::TimerEngine>() {
                                if let Some(db) = app.try_state::<Arc<db::Database>>() {
                                    engine.save_all(&db);
                                }
                            }
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            // Tray status update loop
            let app_handle = app.handle().clone();
            let engine_tray_ref = {
                let state = app.state::<timer::TimerEngine>();
                state.inner().clone()
            };

            thread::spawn(move || {
                loop {
                    let states = engine_tray_ref.get_timer_states();
                    let title = if states.is_empty() {
                        "就绪 ⏱️".to_string()
                    } else {
                        // Find the active timer
                        if let Some(active) = states.iter().find(|t| t.is_running) {
                            let m = active.elapsed_seconds / 60;
                            let s = active.elapsed_seconds % 60;
                            format!("{} · {:02}:{:02} 🍅", active.app_name, m, s)
                        } else {
                            "已暂停 ⏸".to_string()
                        }
                    };

                    // Update all tray icons
                    if let Some(tray) = app_handle.tray_by_id("main") {
                        let _ = tray.set_tooltip(Some(&title));
                        // On macOS, set_title shows text in menu bar
                        #[cfg(target_os = "macos")]
                        let _ = tray.set_title(Some(&title));
                    }

                    thread::sleep(Duration::from_secs(1));
                }
            });

            // Restore widget position from settings
            if let Some(widget_window) = app.get_webview_window("widget") {
                if let Ok(Some(pos_x)) = crate::db::get_setting(&db_ref, "widget_x") {
                    if let Ok(Some(pos_y)) = crate::db::get_setting(&db_ref, "widget_y") {
                        if let (Ok(x), Ok(y)) = (pos_x.parse::<f64>(), pos_y.parse::<f64>()) {
                            // Use PhysicalPosition since we save physical pixels
                            let _ = widget_window.set_position(tauri::Position::Physical(
                                tauri::PhysicalPosition::new(x as i32, y as i32),
                            ));
                        }
                    }
                }

                // Save widget position on move (save physical pixels)
                let db_widget = db_ref.clone();
                widget_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Moved(pos) = event {
                        // pos is PhysicalPosition<i32>
                        let _ = crate::db::set_setting(
                            &db_widget,
                            "widget_x",
                            &pos.x.to_string(),
                        );
                        let _ = crate::db::set_setting(
                            &db_widget,
                            "widget_y",
                            &pos.y.to_string(),
                        );
                    }
                });
            }

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
            commands::get_usage_range,
            commands::get_timer_states,
            commands::get_pomodoro_states,
            commands::refresh_bindings,
            commands::get_setting,
            commands::set_setting,
            commands::clear_all_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
