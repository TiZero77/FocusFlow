use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::db::{self, Database};
use crate::models::AppBinding;
use serde::{Serialize, Deserialize};
use tauri::{Emitter, Manager};

/// Get current timestamp as seconds since epoch
fn now_ts() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

/// Emit an event to all known windows
fn emit_to_all<S: serde::Serialize + Clone>(app_handle: &tauri::AppHandle, event: &str, payload: S) {
    for label in &["main", "widget"] {
        if let Some(win) = app_handle.get_webview_window(label) {
            let _ = win.emit(event, payload.clone());
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PomodoroUpdate {
    pub binding_id: String,
    pub state: String,         // "idle" | "focus" | "break" | "longBreak"
    pub remaining_seconds: i64,
    pub planned_duration_seconds: i64, // total duration for current phase
    pub pomodoro_index: i32,   // current pomodoro number (1-based)
    pub session_count: i32,    // completed pomodoros today
}

#[derive(Debug, Clone)]
struct PomodoroState {
    binding_id: String,
    app_name: String,
    phase: PomodoroPhase,
    phase_started_at: i64,
    remaining_seconds: i64,
    pomodoro_index: i32,
    completed_today: i32,
    focus_minutes: i32,
    break_minutes: i32,
    long_break_minutes: i32,
    long_break_interval: i32,
    paused: bool,
}

#[derive(Debug, Clone, PartialEq)]
enum PomodoroPhase {
    Focus,
    Break,
    LongBreak,
}

impl PomodoroPhase {
    fn as_str(&self) -> &str {
        match self {
            PomodoroPhase::Focus => "focus",
            PomodoroPhase::Break => "break",
            PomodoroPhase::LongBreak => "longBreak",
        }
    }

    fn from_str(s: &str) -> Self {
        match s {
            "focus" => PomodoroPhase::Focus,
            "break" => PomodoroPhase::Break,
            "longBreak" => PomodoroPhase::LongBreak,
            _ => PomodoroPhase::Focus,
        }
    }
}

/// Serializable pomodoro state for persistence across app restarts
#[derive(Serialize, Deserialize)]
struct PersistedPomodoroState {
    bundle_id: String,
    binding_id: String,
    phase: String,
    phase_started_at: i64,
    remaining_seconds: i64,
    #[serde(default)]
    saved_at: i64,
    pomodoro_index: i32,
    completed_today: i32,
    focus_minutes: i32,
    break_minutes: i32,
    long_break_minutes: i32,
    long_break_interval: i32,
}

#[derive(Clone)]
pub struct PomodoroEngine {
    states: Arc<Mutex<HashMap<String, PomodoroState>>>,
    running: Arc<Mutex<bool>>,
}

const ACTIVE_POMODORO_KEY: &str = "active_pomodoro_state";

impl PomodoroEngine {
    pub fn new() -> Self {
        Self {
            states: Arc::new(Mutex::new(HashMap::new())),
            running: Arc::new(Mutex::new(false)),
        }
    }

    /// Create a shallow clone that shares the same state (for passing to TimerEngine)
    pub fn clone_ref(&self) -> Self {
        Self {
            states: self.states.clone(),
            running: self.running.clone(),
        }
    }

    /// Persist the first active pomodoro state to the settings table (paused or not)
    pub fn save_active_state(&self, db: &Database) {
        let lock = self.states.lock().unwrap();
        let now = now_ts();
        let persisted = lock.iter()
            .next()
            .map(|(bundle_id, s)| PersistedPomodoroState {
                bundle_id: bundle_id.clone(),
                binding_id: s.binding_id.clone(),
                phase: s.phase.as_str().to_string(),
                phase_started_at: s.phase_started_at,
                remaining_seconds: s.remaining_seconds,
                saved_at: now,
                pomodoro_index: s.pomodoro_index,
                completed_today: s.completed_today,
                focus_minutes: s.focus_minutes,
                break_minutes: s.break_minutes,
                long_break_minutes: s.long_break_minutes,
                long_break_interval: s.long_break_interval,
            });

        match persisted {
            Some(state) => {
                if let Ok(json) = serde_json::to_string(&state) {
                    log::info!("[Pomodoro] Saving active state: {} ({}s remaining)", state.bundle_id, state.remaining_seconds);
                    let _ = db::set_setting(db, ACTIVE_POMODORO_KEY, &json);
                }
            }
            None => {
                log::info!("[Pomodoro] No active session to save");
                let _ = db::set_setting(db, ACTIVE_POMODORO_KEY, "");
            }
        }
    }

    /// Restore pomodoro state from settings on app startup.
    /// If the persisted session has expired, writes an interrupted record instead of restoring.
    pub fn restore_active_state(&self, db: &Database) {
        let json = match db::get_setting(db, ACTIVE_POMODORO_KEY) {
            Ok(Some(v)) if !v.is_empty() => v,
            _ => {
                log::info!("[Pomodoro] No persisted state to restore");
                return;
            }
        };

        log::info!("[Pomodoro] Found persisted state: {}", &json[..json.len().min(200)]);

        let persisted: PersistedPomodoroState = match serde_json::from_str(&json) {
            Ok(s) => s,
            Err(e) => {
                log::warn!("[Pomodoro] Failed to deserialize persisted state: {}", e);
                return;
            }
        };

        // Look up the binding to get current settings and binding_id
        let bindings = db::get_bindings(db).unwrap_or_default();
        let binding = match bindings.iter().find(|b| b.bundle_id == persisted.bundle_id) {
            Some(b) => b,
            None => {
                // Binding was deleted — discard persisted state
                let _ = db::set_setting(db, ACTIVE_POMODORO_KEY, "");
                return;
            }
        };

        // Use saved_at for the interval (falls back to phase_started_at for old format)
        let saved_at = if persisted.saved_at > 0 { persisted.saved_at } else { persisted.phase_started_at };
        let since_save = now_ts() - saved_at;

        if persisted.phase == "focus" && since_save >= persisted.focus_minutes as i64 * 60 {
            // Focus session expired — write as interrupted
            let _ = db::create_pomodoro_session(
                db,
                &binding.id,
                "focus",
                persisted.focus_minutes as i64 * 60,
                since_save.min(persisted.focus_minutes as i64 * 60),
                false,
                persisted.phase_started_at,
                persisted.pomodoro_index,
            );
            let _ = db::set_setting(db, ACTIVE_POMODORO_KEY, "");
            log::info!("[Pomodoro] Restored session expired, saved as interrupted");
            return;
        }

        // Session still valid — resume from the exact moment it was saved (time is frozen)
        let remaining = persisted.remaining_seconds;
        if remaining <= 0 {
            let _ = db::set_setting(db, ACTIVE_POMODORO_KEY, "");
            return;
        }

        let state = PomodoroState {
            binding_id: persisted.binding_id.clone(),
            app_name: binding.app_name.clone(),
            phase: PomodoroPhase::from_str(&persisted.phase),
            phase_started_at: persisted.phase_started_at,
            remaining_seconds: remaining,
            pomodoro_index: persisted.pomodoro_index,
            completed_today: persisted.completed_today,
            focus_minutes: binding.focus_minutes,
            break_minutes: binding.break_minutes,
            long_break_minutes: binding.long_break_minutes,
            long_break_interval: binding.long_break_interval,
            paused: true, // Start paused — will resume when app gets focus
        };

        self.states.lock().unwrap().insert(persisted.bundle_id.clone(), state);
        log::info!("[Pomodoro] Restored session for {} ({}s remaining)", persisted.bundle_id, remaining);
    }

    /// Start a pomodoro session for a binding
    pub fn start_session(&self, binding: &AppBinding) {
        if !binding.pomodoro_enabled {
            return;
        }

        let mut states = self.states.lock().unwrap();
        if states.contains_key(&binding.bundle_id) {
            // Already running, just unpause
            if let Some(state) = states.get_mut(&binding.bundle_id) {
                state.paused = false;
            }
            return;
        }

        let state = PomodoroState {
            binding_id: binding.id.clone(),
            app_name: binding.app_name.clone(),
            phase: PomodoroPhase::Focus,
            phase_started_at: now_ts(),
            remaining_seconds: binding.focus_minutes as i64 * 60,
            pomodoro_index: 1,
            completed_today: 0,
            focus_minutes: binding.focus_minutes,
            break_minutes: binding.break_minutes,
            long_break_minutes: binding.long_break_minutes,
            long_break_interval: binding.long_break_interval,
            paused: false,
        };

        states.insert(binding.bundle_id.clone(), state);
    }

    /// Pause pomodoro for a binding (when app loses focus)
    pub fn pause_session(&self, bundle_id: &str) {
        let mut states = self.states.lock().unwrap();
        if let Some(state) = states.get_mut(bundle_id) {
            state.paused = true;
        }
    }

    /// Resume pomodoro for a binding (when app regains focus)
    pub fn resume_session(&self, bundle_id: &str) {
        let mut states = self.states.lock().unwrap();
        if let Some(state) = states.get_mut(bundle_id) {
            state.paused = false;
        }
    }

    /// Remove a pomodoro session. Clears persisted state if db is provided.
    pub fn remove_session(&self, bundle_id: &str, db: Option<&Database>) {
        let mut states = self.states.lock().unwrap();
        states.remove(bundle_id);
        if let Some(db) = db {
            // Only clear persisted state if it matches this bundle_id
            if let Ok(Some(json)) = db::get_setting(db, ACTIVE_POMODORO_KEY) {
                if let Ok(persisted) = serde_json::from_str::<PersistedPomodoroState>(&json) {
                    if persisted.bundle_id == bundle_id {
                        let _ = db::set_setting(db, ACTIVE_POMODORO_KEY, "");
                    }
                }
            }
        }
    }

    /// Start the tick loop (runs in background thread).
    /// Restores any persisted pomodoro state from the previous session.
    pub fn start(&self, app_handle: tauri::AppHandle, db: Arc<Database>) {
        // Restore persisted state from previous session
        self.restore_active_state(&db);

        let states = self.states.clone();
        let running = self.running.clone();

        *running.lock().unwrap() = true;

        thread::spawn(move || {
            let mut tick_count: u64 = 0;
            loop {
                if !*running.lock().unwrap() {
                    break;
                }

                tick_count += 1;

                let updates: Vec<PomodoroUpdate> = {
                    let mut lock = states.lock().unwrap();
                    let mut updates = Vec::new();

                    for (bundle_id, state) in lock.iter_mut() {
                        if state.paused {
                            continue;
                        }

                        state.remaining_seconds -= 1;

                        if state.remaining_seconds <= 0 {
                            // Phase complete — save to DB and transition
                            let completed_phase = state.phase.clone();
                            let planned_duration = match completed_phase {
                                PomodoroPhase::Focus => state.focus_minutes as i64 * 60,
                                PomodoroPhase::Break => state.break_minutes as i64 * 60,
                                PomodoroPhase::LongBreak => state.long_break_minutes as i64 * 60,
                            };

                            // Write completed session to database
                            let phase_started = state.phase_started_at;
                            let _ = db::create_pomodoro_session(
                                &db,
                                &state.binding_id,
                                completed_phase.as_str(),
                                planned_duration,
                                planned_duration, // actual = planned for completed sessions
                                true,
                                phase_started,
                                state.pomodoro_index,
                            );

                            match completed_phase {
                                PomodoroPhase::Focus => {
                                    state.completed_today += 1;
                                    state.pomodoro_index += 1;

                                    if state.completed_today % state.long_break_interval == 0 {
                                        state.phase = PomodoroPhase::LongBreak;
                                        state.remaining_seconds =
                                            state.long_break_minutes as i64 * 60;
                                    } else {
                                        state.phase = PomodoroPhase::Break;
                                        state.remaining_seconds =
                                            state.break_minutes as i64 * 60;
                                    }
                                }
                                PomodoroPhase::Break | PomodoroPhase::LongBreak => {
                                    state.phase = PomodoroPhase::Focus;
                                    state.remaining_seconds =
                                        state.focus_minutes as i64 * 60;
                                }
                            }
                            state.phase_started_at = now_ts();

                            // Persist updated state so it survives app restart
                            let now = now_ts();
                            let persisted = PersistedPomodoroState {
                                bundle_id: bundle_id.clone(),
                                binding_id: state.binding_id.clone(),
                                phase: state.phase.as_str().to_string(),
                                phase_started_at: state.phase_started_at,
                                remaining_seconds: state.remaining_seconds,
                                saved_at: now,
                                pomodoro_index: state.pomodoro_index,
                                completed_today: state.completed_today,
                                focus_minutes: state.focus_minutes,
                                break_minutes: state.break_minutes,
                                long_break_minutes: state.long_break_minutes,
                                long_break_interval: state.long_break_interval,
                            };
                            if let Ok(json) = serde_json::to_string(&persisted) {
                                let _ = db::set_setting(&db, ACTIVE_POMODORO_KEY, &json);
                            }
                        }

                        let planned = match state.phase {
                            PomodoroPhase::Focus => state.focus_minutes as i64 * 60,
                            PomodoroPhase::Break => state.break_minutes as i64 * 60,
                            PomodoroPhase::LongBreak => state.long_break_minutes as i64 * 60,
                        };

                        updates.push(PomodoroUpdate {
                            binding_id: state.binding_id.clone(),
                            state: state.phase.as_str().to_string(),
                            remaining_seconds: state.remaining_seconds,
                            planned_duration_seconds: planned,
                            pomodoro_index: state.pomodoro_index,
                            session_count: state.completed_today,
                        });
                    }

                    updates
                };

                for update in updates {
                    emit_to_all(&app_handle, "pomodoro-update", update);
                }

                // Periodic save every 30 seconds (survives abrupt process kill)
                if tick_count % 30 == 0 {
                    let lock = states.lock().unwrap();
                    if let Some((bundle_id, s)) = lock.iter().next() {
                        let now = now_ts();
                        let persisted = PersistedPomodoroState {
                            bundle_id: bundle_id.clone(),
                            binding_id: s.binding_id.clone(),
                            phase: s.phase.as_str().to_string(),
                            phase_started_at: s.phase_started_at,
                            remaining_seconds: s.remaining_seconds,
                            saved_at: now,
                            pomodoro_index: s.pomodoro_index,
                            completed_today: s.completed_today,
                            focus_minutes: s.focus_minutes,
                            break_minutes: s.break_minutes,
                            long_break_minutes: s.long_break_minutes,
                            long_break_interval: s.long_break_interval,
                        };
                        if let Ok(json) = serde_json::to_string(&persisted) {
                            let _ = db::set_setting(&db, ACTIVE_POMODORO_KEY, &json);
                        }
                    }
                }

                thread::sleep(Duration::from_secs(1));
            }
        });
    }

    /// Get current pomodoro states for all sessions (for polling)
    pub fn get_states(&self) -> Vec<PomodoroUpdate> {
        let lock = self.states.lock().unwrap();
        lock.values()
            .map(|s| {
                let planned = match s.phase {
                    PomodoroPhase::Focus => s.focus_minutes as i64 * 60,
                    PomodoroPhase::Break => s.break_minutes as i64 * 60,
                    PomodoroPhase::LongBreak => s.long_break_minutes as i64 * 60,
                };
                PomodoroUpdate {
                    binding_id: s.binding_id.clone(),
                    state: s.phase.as_str().to_string(),
                    remaining_seconds: s.remaining_seconds,
                    planned_duration_seconds: planned,
                    pomodoro_index: s.pomodoro_index,
                    session_count: s.completed_today,
                }
            })
            .collect()
    }

    /// Stop the tick loop
    pub fn stop(&self) {
        *self.running.lock().unwrap() = false;
    }
}
