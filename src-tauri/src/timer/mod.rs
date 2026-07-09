use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::db::{self, Database};
use crate::models::AppBinding;
use crate::monitor;
use crate::pomodoro::PomodoroEngine;
use tauri::{Emitter, Manager};

/// Emit an event to all known windows (workaround for Tauri 2.x multi-window issues)
fn emit_to_all<S: serde::Serialize + Clone>(app_handle: &tauri::AppHandle, event: &str, payload: S) {
    for label in &["main", "widget"] {
        if let Some(win) = app_handle.get_webview_window(label) {
            if let Err(e) = win.emit(event, payload.clone()) {
                log::error!("[emit_to_all] failed to emit '{}' to {}: {:?}", event, label, e);
            }
        } else {
            log::warn!("[emit_to_all] window '{}' not found", label);
        }
    }
}

/// Get system idle time in seconds
#[cfg(target_os = "macos")]
fn get_idle_seconds() -> f64 {
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(
            state: u32,    // CGEventSourceStateID
            event_type: u32, // CGEventType
        ) -> f64;
    }
    // kCGEventSourceStateHIDSystemState = 1, kCGEventNull = 0
    unsafe { CGEventSourceSecondsSinceLastEventType(1, 0) }
}

#[cfg(target_os = "windows")]
fn get_idle_seconds() -> f64 {
    use windows::Win32::UI::WindowsAndMessaging::{GetLastInputInfo, LASTINPUTINFO};
    unsafe {
        let mut info = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if GetLastInputInfo(&mut info).as_bool() {
            let tick = windows::Win32::UI::WindowsAndMessaging::GetTickCount();
            ((tick - info.dwTime) as f64) / 1000.0
        } else {
            0.0
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn get_idle_seconds() -> f64 {
    0.0
}

/// Active timer state for a bound app
#[derive(Debug, Clone)]
struct ActiveTimer {
    binding_id: String,
    app_name: String,
    start_time: i64,
    elapsed_seconds: i64,
}

/// TimerEngine — monitors foreground app and manages timers
#[derive(Clone)]
pub struct TimerEngine {
    bindings: Arc<Mutex<Vec<AppBinding>>>,
    active_timers: Arc<Mutex<HashMap<String, ActiveTimer>>>,
    current_app_bundle_id: Arc<Mutex<Option<String>>>,
    running: Arc<Mutex<bool>>,
    idle_paused: Arc<Mutex<bool>>,
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
            idle_paused: Arc::new(Mutex::new(false)),
        }
    }

    /// Update the list of bindings
    pub fn set_bindings(&self, bindings: Vec<AppBinding>) {
        let mut lock = self.bindings.lock().unwrap();
        *lock = bindings;
    }

    /// Start the monitoring loop (runs in a background thread)
    pub fn start(
        &self,
        app_handle: tauri::AppHandle,
        db: Arc<Database>,
        pomodoro: PomodoroEngine,
    ) {
        let bindings = self.bindings.clone();
        let active_timers = self.active_timers.clone();
        let current_app = self.current_app_bundle_id.clone();
        let running = self.running.clone();
        let idle_paused = self.idle_paused.clone();

        *running.lock().unwrap() = true;

        thread::spawn(move || {
            log::info!("[Timer] monitoring thread started");
            loop {
                if !*running.lock().unwrap() {
                    break;
                }

                log::info!("[Timer] loop tick");

                // ── Idle detection ──
                let idle_threshold = db::get_setting(&db, "idle_minutes")
                    .ok()
                    .flatten()
                    .and_then(|v| v.parse::<f64>().ok())
                    .unwrap_or(5.0)
                    * 60.0; // convert to seconds

                let idle_secs = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    get_idle_seconds()
                })).unwrap_or(0.0);
                let is_currently_idle = idle_secs > idle_threshold;
                let was_idle = *idle_paused.lock().unwrap();

                if is_currently_idle && !was_idle {
                    // Just became idle — pause everything
                    *idle_paused.lock().unwrap() = true;
                    let stopped_ids = pause_all_timers(&active_timers, &db);
                    for bundle_id in &stopped_ids {
                        pomodoro.pause_session(bundle_id);
                    }
                    emit_to_all(&app_handle, "idle-changed", true);
                } else if !is_currently_idle && was_idle {
                    // Just came back from idle — resume
                    *idle_paused.lock().unwrap() = false;

                    // Detect current foreground app and restart timer
                    if let Some(ref app) = monitor::get_current_app() {
                        let bundle_id = app.bundle_id.clone();
                        *current_app.lock().unwrap() = Some(bundle_id.clone());

                        let binding = {
                            let lock = bindings.lock().unwrap();
                            lock.iter()
                                .find(|b| b.bundle_id == bundle_id && b.tracking_enabled)
                                .cloned()
                        };

                        if let Some(binding) = binding {
                            start_timer(&binding, &active_timers);
                            pomodoro.resume_session(&binding.bundle_id);
                        }
                    }

                    emit_to_all(&app_handle, "idle-changed", false);
                }

                // Skip app monitoring while idle
                if is_currently_idle {
                    thread::sleep(Duration::from_secs(1));
                    continue;
                }

                // ── App monitoring ──
                let foreground = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    monitor::get_current_app()
                })).unwrap_or(None);

                log::info!("[Timer] get_current_app() returned: {:?}", foreground);

                let current_bundle = current_app.lock().unwrap().clone();

                if let Some(ref app) = foreground {
                    let new_bundle = app.bundle_id.clone();

                    log::info!("[Timer] foreground app: {} ({})", app.name, new_bundle);

                    // Check if app changed
                    if current_bundle.as_deref() != Some(&new_bundle) {
                        // App changed — stop timer and pause pomodoro for previous app
                        if let Some(prev_bundle) = &current_bundle {
                            stop_timer(prev_bundle, &active_timers, &db);
                            pomodoro.pause_session(prev_bundle);
                        }

                        // Start timer and resume pomodoro for new app if bound
                        let binding = {
                            let lock = bindings.lock().unwrap();
                            lock.iter()
                                .find(|b| b.bundle_id == new_bundle && b.tracking_enabled)
                                .cloned()
                        };

                        if let Some(binding) = binding {
                            start_timer(&binding, &active_timers);
                            pomodoro.resume_session(&binding.bundle_id);
                            emit_to_all(
                                &app_handle,
                                "app-changed",
                                AppChangedEvent {
                                    app_name: app.name.clone(),
                                    bundle_id: new_bundle.clone(),
                                    matched_binding_id: Some(binding.id.clone()),
                                },
                            );
                        } else {
                            emit_to_all(
                                &app_handle,
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
                    let timer_count = active_timers.lock().unwrap().len();
                    log::info!("[Timer] active_timers count: {}, calling update_timers", timer_count);
                    update_timers(&active_timers, &app_handle);
                } else {
                    log::info!("[Timer] no foreground app detected");
                    if current_bundle.is_some() {
                        // No foreground app — stop all timers and pause all pomodoros
                        let stopped_bundle_ids = stop_all_timers(&active_timers, &db);
                        for bundle_id in &stopped_bundle_ids {
                            pomodoro.pause_session(bundle_id);
                        }
                        *current_app.lock().unwrap() = None;
                    }
                }

                thread::sleep(Duration::from_secs(1));
            }
        });
    }

    /// Stop the monitoring loop
    pub fn stop(&self) {
        *self.running.lock().unwrap() = false;
    }

    /// Save all active timers to database (call on app exit)
    pub fn save_all(&self, db: &Arc<Database>) {
        let timers: Vec<(String, ActiveTimer)> = {
            let mut lock = self.active_timers.lock().unwrap();
            lock.drain().collect()
        };

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        for (_bundle_id, timer) in timers {
            let _ = db::create_usage_record(
                db,
                &timer.binding_id,
                timer.start_time,
                now,
            );
        }
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
        let _ = db::create_usage_record(
            db,
            &timer.binding_id,
            timer.start_time,
            now,
        );
    }
}

/// Pause all timers: save elapsed to DB, clear entries so they restart cleanly on resume
fn pause_all_timers(
    active_timers: &Arc<Mutex<HashMap<String, ActiveTimer>>>,
    db: &Arc<Database>,
) -> Vec<String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let mut lock = active_timers.lock().unwrap();
    let mut bundle_ids = Vec::new();
    for (bundle_id, timer) in lock.drain() {
        let _ = db::create_usage_record(
            db,
            &timer.binding_id,
            timer.start_time,
            now,
        );
        bundle_ids.push(bundle_id);
    }
    bundle_ids
}

fn stop_all_timers(
    active_timers: &Arc<Mutex<HashMap<String, ActiveTimer>>>,
    db: &Arc<Database>,
) -> Vec<String> {
    let timers: Vec<(String, ActiveTimer)> = {
        let mut lock = active_timers.lock().unwrap();
        lock.drain().collect()
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let mut bundle_ids = Vec::new();
    for (bundle_id, timer) in timers {
        let _ = db::create_usage_record(
            db,
            &timer.binding_id,
            timer.start_time,
            now,
        );
        bundle_ids.push(bundle_id);
    }
    bundle_ids
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
                log::info!(
                    "[Timer] update_timers: {} elapsed={}s",
                    t.app_name, t.elapsed_seconds
                );
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
        log::info!(
            "[Timer] emitting timer-update: binding={}, app={}, elapsed={}s",
            update.binding_id, update.app_name, update.elapsed_seconds
        );
        emit_to_all(app_handle, "timer-update", update);
    }
}
