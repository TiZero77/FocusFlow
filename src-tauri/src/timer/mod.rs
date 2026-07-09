use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::db::Database;
use crate::models::AppBinding;
use crate::monitor;
use tauri::Emitter;

/// Active timer state for a bound app
#[derive(Debug, Clone)]
struct ActiveTimer {
    binding_id: String,
    app_name: String,
    start_time: i64,
    elapsed_seconds: i64,
}

/// TimerEngine — monitors foreground app and manages timers
pub struct TimerEngine {
    bindings: Arc<Mutex<Vec<AppBinding>>>,
    active_timers: Arc<Mutex<HashMap<String, ActiveTimer>>>,
    current_app_bundle_id: Arc<Mutex<Option<String>>>,
    running: Arc<Mutex<bool>>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerUpdate {
    pub binding_id: String,
    pub app_name: String,
    pub elapsed_seconds: i64,
    pub is_running: bool,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppChangedEvent {
    pub app_name: String,
    pub bundle_id: String,
    pub matched_binding_id: Option<String>,
}

impl TimerEngine {
    pub fn new() -> Self {
        Self {
            bindings: Arc::new(Mutex::new(Vec::new())),
            active_timers: Arc::new(Mutex::new(HashMap::new())),
            current_app_bundle_id: Arc::new(Mutex::new(None)),
            running: Arc::new(Mutex::new(false)),
        }
    }

    /// Update the list of bindings
    pub fn set_bindings(&self, bindings: Vec<AppBinding>) {
        let mut lock = self.bindings.lock().unwrap();
        *lock = bindings;
    }

    /// Start the monitoring loop (runs in a background thread)
    pub fn start(&self, app_handle: tauri::AppHandle, db: Arc<Database>) {
        let bindings = self.bindings.clone();
        let active_timers = self.active_timers.clone();
        let current_app = self.current_app_bundle_id.clone();
        let running = self.running.clone();

        *running.lock().unwrap() = true;

        thread::spawn(move || {
            loop {
                if !*running.lock().unwrap() {
                    break;
                }

                // Get current foreground app
                let foreground = monitor::get_current_app();

                let current_bundle = current_app.lock().unwrap().clone();

                if let Some(ref app) = foreground {
                    let new_bundle = app.bundle_id.clone();

                    // Check if app changed
                    if current_bundle.as_deref() != Some(&new_bundle) {
                        // App changed — stop timer for previous app
                        if let Some(prev_bundle) = &current_bundle {
                            stop_timer(prev_bundle, &active_timers, &db);
                        }

                        // Start timer for new app if bound
                        let binding = {
                            let lock = bindings.lock().unwrap();
                            lock.iter()
                                .find(|b| b.bundle_id == new_bundle && b.tracking_enabled)
                                .cloned()
                        };

                        if let Some(binding) = binding {
                            start_timer(&binding, &active_timers);
                            let _ = app_handle.emit(
                                "app-changed",
                                AppChangedEvent {
                                    app_name: app.name.clone(),
                                    bundle_id: new_bundle.clone(),
                                    matched_binding_id: Some(binding.id.clone()),
                                },
                            );
                        } else {
                            let _ = app_handle.emit(
                                "app-changed",
                                AppChangedEvent {
                                    app_name: app.name.clone(),
                                    bundle_id: new_bundle.clone(),
                                    matched_binding_id: None,
                                },
                            );
                        }

                        *current_app.lock().unwrap() = Some(new_bundle);
                    }

                    // Update elapsed time for active timers
                    update_timers(&active_timers, &app_handle);
                } else if current_bundle.is_some() {
                    // No foreground app — stop all timers
                    stop_all_timers(&active_timers, &db);
                    *current_app.lock().unwrap() = None;
                }

                thread::sleep(Duration::from_secs(1));
            }
        });
    }

    /// Stop the monitoring loop
    pub fn stop(&self) {
        *self.running.lock().unwrap() = false;
    }

    /// Get current timer states for frontend
    pub fn get_timer_states(&self) -> Vec<TimerUpdate> {
        let lock = self.active_timers.lock().unwrap();
        lock.values()
            .map(|t| TimerUpdate {
                binding_id: t.binding_id.clone(),
                app_name: t.app_name.clone(),
                elapsed_seconds: t.elapsed_seconds,
                is_running: true,
            })
            .collect()
    }
}

fn start_timer(binding: &AppBinding, active_timers: &Arc<Mutex<HashMap<String, ActiveTimer>>>) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let timer = ActiveTimer {
        binding_id: binding.id.clone(),
        app_name: binding.app_name.clone(),
        start_time: now,
        elapsed_seconds: 0,
    };

    let mut lock = active_timers.lock().unwrap();
    lock.insert(binding.bundle_id.clone(), timer);
}

fn stop_timer(
    bundle_id: &str,
    active_timers: &Arc<Mutex<HashMap<String, ActiveTimer>>>,
    db: &Arc<Database>,
) {
    let timer = {
        let mut lock = active_timers.lock().unwrap();
        lock.remove(bundle_id)
    };

    if let Some(timer) = timer {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        // Save usage record to database
        let _ = crate::db::create_usage_record(
            db,
            &timer.binding_id,
            timer.start_time,
            now,
        );
    }
}

fn stop_all_timers(
    active_timers: &Arc<Mutex<HashMap<String, ActiveTimer>>>,
    db: &Arc<Database>,
) {
    let timers: Vec<(String, ActiveTimer)> = {
        let mut lock = active_timers.lock().unwrap();
        lock.drain().collect()
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    for (_bundle_id, timer) in timers {
        let _ = crate::db::create_usage_record(
            db,
            &timer.binding_id,
            timer.start_time,
            now,
        );
    }
}

fn update_timers(
    active_timers: &Arc<Mutex<HashMap<String, ActiveTimer>>>,
    app_handle: &tauri::AppHandle,
) {
    let updates: Vec<TimerUpdate> = {
        let mut lock = active_timers.lock().unwrap();
        lock.values_mut()
            .map(|t| {
                t.elapsed_seconds += 1;
                TimerUpdate {
                    binding_id: t.binding_id.clone(),
                    app_name: t.app_name.clone(),
                    elapsed_seconds: t.elapsed_seconds,
                    is_running: true,
                }
            })
            .collect()
    };

    for update in updates {
        let _ = app_handle.emit("timer-update", update);
    }
}
