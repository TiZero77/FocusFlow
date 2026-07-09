use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::db::Database;
use crate::models::AppBinding;
use tauri::Emitter;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PomodoroUpdate {
    pub binding_id: String,
    pub state: String,         // "idle" | "focus" | "break" | "longBreak"
    pub remaining_seconds: i64,
    pub pomodoro_index: i32,   // current pomodoro number (1-based)
    pub session_count: i32,    // completed pomodoros today
}

#[derive(Debug, Clone)]
struct PomodoroState {
    binding_id: String,
    app_name: String,
    phase: PomodoroPhase,
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
}

pub struct PomodoroEngine {
    states: Arc<Mutex<HashMap<String, PomodoroState>>>,
    running: Arc<Mutex<bool>>,
}

impl PomodoroEngine {
    pub fn new() -> Self {
        Self {
            states: Arc::new(Mutex::new(HashMap::new())),
            running: Arc::new(Mutex::new(false)),
        }
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

    /// Remove a pomodoro session
    pub fn remove_session(&self, bundle_id: &str) {
        let mut states = self.states.lock().unwrap();
        states.remove(bundle_id);
    }

    /// Start the tick loop (runs in background thread)
    pub fn start(&self, app_handle: tauri::AppHandle) {
        let states = self.states.clone();
        let running = self.running.clone();

        *running.lock().unwrap() = true;

        thread::spawn(move || {
            loop {
                if !*running.lock().unwrap() {
                    break;
                }

                let updates: Vec<PomodoroUpdate> = {
                    let mut lock = states.lock().unwrap();
                    let mut updates = Vec::new();

                    for (_bundle_id, state) in lock.iter_mut() {
                        if state.paused {
                            continue;
                        }

                        state.remaining_seconds -= 1;

                        if state.remaining_seconds <= 0 {
                            // Phase complete — transition to next
                            match state.phase {
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
                        }

                        updates.push(PomodoroUpdate {
                            binding_id: state.binding_id.clone(),
                            state: state.phase.as_str().to_string(),
                            remaining_seconds: state.remaining_seconds,
                            pomodoro_index: state.pomodoro_index,
                            session_count: state.completed_today,
                        });
                    }

                    updates
                };

                for update in updates {
                    let _ = app_handle.emit("pomodoro-update", update);
                }

                thread::sleep(Duration::from_secs(1));
            }
        });
    }

    /// Stop the tick loop
    pub fn stop(&self) {
        *self.running.lock().unwrap() = false;
    }
}
