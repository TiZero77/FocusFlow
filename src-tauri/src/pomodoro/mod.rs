use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::db::{self, Database};
use crate::models::{AppBinding, TaskGroup};
use serde::{Serialize, Deserialize};
use tauri::{Emitter, Manager};

/// Grace period: focus sessions abandoned within this duration are silently discarded
/// instead of being recorded as "rotten tomatoes".
const GRACE_PERIOD_SECONDS: i64 = 5 * 60;

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
    pub is_paused: bool,       // whether the pomodoro is currently paused
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_group_id: Option<String>, // set when this update belongs to a task group
    /// Per-binding elapsed seconds within the current focus pomodoro (group only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub binding_elapsed: Option<HashMap<String, i64>>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
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

/// Group pomodoro state — shared across multiple bindings in a task group
#[derive(Debug, Clone)]
#[allow(dead_code)]
struct GroupPomodoroState {
    group_id: String,
    group_name: String,
    /// The binding_id that triggered this group session (for frontend display)
    active_binding_id: String,
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
    /// Per-binding elapsed seconds within the current focus pomodoro (resets each focus phase)
    binding_elapsed: HashMap<String, i64>,
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

/// Result of saving rotten tomatoes, indicating how many were truly rotten
/// vs how many were silently discarded due to the grace period.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RottenTomatoResult {
    pub rotten_count: usize,   // actual rotten tomatoes saved to DB
    pub grace_count: usize,    // sessions silently discarded (within grace period)
    pub had_session: bool,     // whether there was any active session at all
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
    #[serde(default)]
    task_group_id: Option<String>,
    #[serde(default)]
    group_name: Option<String>,
}

#[derive(Clone)]
pub struct PomodoroEngine {
    states: Arc<Mutex<HashMap<String, PomodoroState>>>,
    group_states: Arc<Mutex<HashMap<String, GroupPomodoroState>>>,
    running: Arc<Mutex<bool>>,
}

const ACTIVE_POMODORO_KEY: &str = "active_pomodoro_state";

impl PomodoroEngine {
    pub fn new() -> Self {
        Self {
            states: Arc::new(Mutex::new(HashMap::new())),
            group_states: Arc::new(Mutex::new(HashMap::new())),
            running: Arc::new(Mutex::new(false)),
        }
    }

    /// Create a shallow clone that shares the same state (for passing to TimerEngine)
    pub fn clone_ref(&self) -> Self {
        Self {
            states: self.states.clone(),
            group_states: self.group_states.clone(),
            running: self.running.clone(),
        }
    }

    /// Persist the first active pomodoro state to the settings table (paused or not).
    /// Checks both individual and group states; group states take priority.
    pub fn save_active_state(&self, db: &Database) {
        let now = now_ts();

        // Check group states first (they take priority)
        let group_lock = self.group_states.lock().unwrap();
        let group_persisted = group_lock.iter().next().map(|(group_id, s)| PersistedPomodoroState {
            bundle_id: String::new(),
            binding_id: s.active_binding_id.clone(),
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
            task_group_id: Some(group_id.clone()),
            group_name: Some(s.group_name.clone()),
        });
        drop(group_lock);

        let lock = self.states.lock().unwrap();
        let individual_persisted = lock.iter().next().map(|(bundle_id, s)| PersistedPomodoroState {
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
            task_group_id: None,
            group_name: None,
        });

        let persisted = group_persisted.or(individual_persisted);

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

    /// Save the current pomodoro as a "rotten tomato" (interrupted session) and clear persistence.
    /// For group pomodoros, creates one record per binding using binding_elapsed.
    /// Focus sessions within the grace period (< 5 min) are silently discarded.
    pub fn save_rotten_tomato(&self, db: &Database) -> RottenTomatoResult {
        let mut rotten_count = 0;
        let mut grace_count = 0;
        let mut had_session = false;

        // ── Group pomodoro ──
        {
            let group_states = self.group_states.lock().unwrap();
            for (_group_id, state) in group_states.iter() {
                if state.phase == PomodoroPhase::Focus {
                    let planned = state.focus_minutes as i64 * 60;
                    // Check grace period: use remaining_seconds to calculate total elapsed
                    let total_elapsed = planned - state.remaining_seconds;
                    if total_elapsed < GRACE_PERIOD_SECONDS {
                        grace_count += 1;
                        log::info!("[Pomodoro] Grace period: discarding group session ({}s elapsed)", total_elapsed);
                        had_session = true;
                        continue;
                    }
                    // Save per-binding records
                    for (binding_id, elapsed) in &state.binding_elapsed {
                        if *elapsed <= 0 { continue; }
                        let _ = db::create_interrupted_session(
                            db,
                            binding_id,
                            "focus",
                            planned,
                            *elapsed,
                            state.phase_started_at,
                            state.pomodoro_index,
                            "user_close",
                        );
                        rotten_count += 1;
                        log::info!("[Pomodoro] Rotten tomato saved for binding {} ({}s / {}s)", binding_id, elapsed, planned);
                    }
                    // If no binding_elapsed but session is active, save for the active binding
                    if state.binding_elapsed.is_empty() {
                        let elapsed = planned - state.remaining_seconds;
                        if elapsed > 0 {
                            let _ = db::create_interrupted_session(
                                db,
                                &state.active_binding_id,
                                "focus",
                                planned,
                                elapsed,
                                state.phase_started_at,
                                state.pomodoro_index,
                                "user_close",
                            );
                            rotten_count += 1;
                        }
                    }
                    had_session = true;
                }
            }
        }

        // ── Individual pomodoro ──
        {
            let states = self.states.lock().unwrap();
            for (_bundle_id, state) in states.iter() {
                if state.phase == PomodoroPhase::Focus {
                    let planned = state.focus_minutes as i64 * 60;
                    let elapsed = planned - state.remaining_seconds;
                    // Check grace period
                    if elapsed < GRACE_PERIOD_SECONDS {
                        grace_count += 1;
                        log::info!("[Pomodoro] Grace period: discarding session for {} ({}s elapsed)", state.binding_id, elapsed);
                        had_session = true;
                        continue;
                    }
                    if elapsed > 0 {
                        let _ = db::create_interrupted_session(
                            db,
                            &state.binding_id,
                            "focus",
                            planned,
                            elapsed,
                            state.phase_started_at,
                            state.pomodoro_index,
                            "user_close",
                        );
                        rotten_count += 1;
                        log::info!("[Pomodoro] Rotten tomato saved for {} ({}s / {}s)", state.binding_id, elapsed, planned);
                    }
                    had_session = true;
                }
            }
        }

        // Clear all active states
        self.states.lock().unwrap().clear();
        self.group_states.lock().unwrap().clear();
        let _ = db::set_setting(db, ACTIVE_POMODORO_KEY, "");

        RottenTomatoResult { rotten_count, grace_count, had_session }
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

        // Use saved_at for the interval (falls back to phase_started_at for old format)
        let saved_at = if persisted.saved_at > 0 { persisted.saved_at } else { persisted.phase_started_at };
        let since_save = now_ts() - saved_at;

        // ── Group pomodoro restore ──
        if let Some(ref group_id) = persisted.task_group_id {
            // Verify the group still exists
            let groups = db::get_task_groups(db).unwrap_or_default();
            let group = groups.iter().find(|g| &g.id == group_id);
            if group.is_none() {
                let _ = db::set_setting(db, ACTIVE_POMODORO_KEY, "");
                log::info!("[Pomodoro] Group {} was deleted, discarding persisted state", group_id);
                return;
            }
            let group = group.unwrap();

            if persisted.phase == "focus" && since_save >= persisted.focus_minutes as i64 * 60 {
                // Focus session expired — write as interrupted (use first binding in group)
                let bindings = db::get_bindings_for_group(db, group_id).unwrap_or_default();
                let binding_id = bindings.first().map(|b| b.id.as_str()).unwrap_or(&persisted.binding_id);
                let _ = db::create_pomodoro_session(
                    db,
                    binding_id,
                    "focus",
                    persisted.focus_minutes as i64 * 60,
                    since_save.min(persisted.focus_minutes as i64 * 60),
                    false,
                    persisted.phase_started_at,
                    persisted.pomodoro_index,
                );
                let _ = db::set_setting(db, ACTIVE_POMODORO_KEY, "");
                log::info!("[Pomodoro] Restored group session expired, saved as interrupted");
                return;
            }

            let remaining = persisted.remaining_seconds;
            if remaining <= 0 {
                let _ = db::set_setting(db, ACTIVE_POMODORO_KEY, "");
                return;
            }

            let state = GroupPomodoroState {
                group_id: group_id.clone(),
                group_name: group.name.clone(),
                active_binding_id: persisted.binding_id.clone(),
                phase: PomodoroPhase::from_str(&persisted.phase),
                phase_started_at: persisted.phase_started_at,
                remaining_seconds: remaining,
                pomodoro_index: persisted.pomodoro_index,
                completed_today: persisted.completed_today,
                focus_minutes: group.focus_minutes,
                break_minutes: group.break_minutes,
                long_break_minutes: group.long_break_minutes,
                long_break_interval: group.long_break_interval,
                paused: true,
                binding_elapsed: HashMap::new(),
            };

            self.group_states.lock().unwrap().insert(group_id.clone(), state);
            log::info!("[Pomodoro] Restored group session for {} ({}s remaining)", group_id, remaining);
            return;
        }

        // ── Individual pomodoro restore ──
        let bindings = db::get_bindings(db).unwrap_or_default();
        let binding = match bindings.iter().find(|b| b.bundle_id == persisted.bundle_id) {
            Some(b) => b,
            None => {
                let _ = db::set_setting(db, ACTIVE_POMODORO_KEY, "");
                return;
            }
        };

        if persisted.phase == "focus" && since_save >= persisted.focus_minutes as i64 * 60 {
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
            paused: true,
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
    #[allow(dead_code)]
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
                    if persisted.bundle_id == bundle_id && persisted.task_group_id.is_none() {
                        let _ = db::set_setting(db, ACTIVE_POMODORO_KEY, "");
                    }
                }
            }
        }
    }

    // ── Group Pomodoro Methods ──

    /// Start a group pomodoro session for a task group.
    /// `active_binding_id` is the binding that triggered this (for frontend display).
    pub fn start_group_session(&self, group: &TaskGroup, active_binding_id: &str) {
        let mut group_states = self.group_states.lock().unwrap();
        if let Some(existing) = group_states.get_mut(&group.id) {
            // Already exists — just unpause and update active binding
            existing.paused = false;
            existing.active_binding_id = active_binding_id.to_string();
            return;
        }

        let state = GroupPomodoroState {
            group_id: group.id.clone(),
            group_name: group.name.clone(),
            active_binding_id: active_binding_id.to_string(),
            phase: PomodoroPhase::Focus,
            phase_started_at: now_ts(),
            remaining_seconds: group.focus_minutes as i64 * 60,
            pomodoro_index: 1,
            completed_today: 0,
            focus_minutes: group.focus_minutes,
            break_minutes: group.break_minutes,
            long_break_minutes: group.long_break_minutes,
            long_break_interval: group.long_break_interval,
            paused: false,
            binding_elapsed: HashMap::new(),
        };

        group_states.insert(group.id.clone(), state);
    }

    /// Pause a group pomodoro session (when switching away from all group members)
    pub fn pause_group_session(&self, group_id: &str) {
        let mut group_states = self.group_states.lock().unwrap();
        if let Some(state) = group_states.get_mut(group_id) {
            state.paused = true;
        }
    }

    /// Resume a group pomodoro session
    pub fn resume_group_session(&self, group_id: &str, active_binding_id: &str) {
        let mut group_states = self.group_states.lock().unwrap();
        if let Some(state) = group_states.get_mut(group_id) {
            state.paused = false;
            state.active_binding_id = active_binding_id.to_string();
        }
    }

    /// Remove a group pomodoro session
    pub fn remove_group_session(&self, group_id: &str, db: Option<&Database>) {
        let mut group_states = self.group_states.lock().unwrap();
        group_states.remove(group_id);
        if let Some(db) = db {
            if let Ok(Some(json)) = db::get_setting(db, ACTIVE_POMODORO_KEY) {
                if let Ok(persisted) = serde_json::from_str::<PersistedPomodoroState>(&json) {
                    if persisted.task_group_id.as_deref() == Some(group_id) {
                        let _ = db::set_setting(db, ACTIVE_POMODORO_KEY, "");
                    }
                }
            }
        }
    }

    /// Check if a group has an active (non-idle) pomodoro session
    pub fn has_group_session(&self, group_id: &str) -> bool {
        self.group_states.lock().unwrap().contains_key(group_id)
    }

    /// Check if there is any active pomodoro session (individual or group)
    pub fn has_active_session(&self) -> bool {
        !self.states.lock().unwrap().is_empty() || !self.group_states.lock().unwrap().is_empty()
    }

    /// Toggle pause for an individual pomodoro session. Returns the new paused state.
    pub fn toggle_pause(&self, bundle_id: &str) -> bool {
        let mut states = self.states.lock().unwrap();
        if let Some(state) = states.get_mut(bundle_id) {
            state.paused = !state.paused;
            state.paused
        } else {
            false
        }
    }

    /// Toggle pause for a group pomodoro session. Returns the new paused state.
    pub fn toggle_group_pause(&self, group_id: &str) -> bool {
        let mut group_states = self.group_states.lock().unwrap();
        if let Some(state) = group_states.get_mut(group_id) {
            state.paused = !state.paused;
            state.paused
        } else {
            false
        }
    }

    /// Toggle pause for a session by binding_id.
    /// Checks both individual and group sessions.
    /// Returns Some(new_paused_state) if found, None otherwise.
    pub fn toggle_pause_by_binding(&self, binding_id: &str, db: &Database) -> Option<bool> {
        // Check if this binding belongs to a task group
        if let Ok(Some(group)) = crate::db::get_group_for_binding(db, binding_id) {
            return Some(self.toggle_group_pause(&group.id));
        }
        // Individual session: find the bundle_id for this binding_id
        let bundle_id = {
            let states = self.states.lock().unwrap();
            states.iter()
                .find(|(_, s)| s.binding_id == binding_id)
                .map(|(k, _)| k.clone())
        };
        if let Some(bundle_id) = bundle_id {
            Some(self.toggle_pause(&bundle_id))
        } else {
            None
        }
    }

    /// Discard focus sessions that are within the grace period (< 5 minutes elapsed).
    /// Returns the number of sessions discarded.
    /// Used when switching away from a bound app to a non-bound app.
    pub fn discard_grace_sessions(&self, db: Option<&Database>) -> usize {
        let mut discarded = 0;

        // Check individual sessions
        {
            let mut states = self.states.lock().unwrap();
            let to_remove: Vec<String> = states.iter()
                .filter(|(_, s)| s.phase == PomodoroPhase::Focus && !s.paused)
                .filter(|(_, s)| {
                    let planned = s.focus_minutes as i64 * 60;
                    let elapsed = planned - s.remaining_seconds;
                    elapsed < GRACE_PERIOD_SECONDS
                })
                .map(|(k, _)| k.clone())
                .collect();
            for key in &to_remove {
                states.remove(key);
                discarded += 1;
                log::info!("[Pomodoro] Grace period: discarded individual session {}", key);
            }
            // Clear persisted state if it was for a discarded session
            if discarded > 0 {
                if let Some(db) = db {
                    if let Ok(Some(json)) = db::get_setting(db, ACTIVE_POMODORO_KEY) {
                        if let Ok(persisted) = serde_json::from_str::<PersistedPomodoroState>(&json) {
                            if to_remove.contains(&persisted.bundle_id) && persisted.task_group_id.is_none() {
                                let _ = db::set_setting(db, ACTIVE_POMODORO_KEY, "");
                            }
                        }
                    }
                }
            }
        }

        // Check group sessions
        {
            let mut group_states = self.group_states.lock().unwrap();
            let to_remove: Vec<String> = group_states.iter()
                .filter(|(_, s)| s.phase == PomodoroPhase::Focus && !s.paused)
                .filter(|(_, s)| {
                    let planned = s.focus_minutes as i64 * 60;
                    let elapsed = planned - s.remaining_seconds;
                    elapsed < GRACE_PERIOD_SECONDS
                })
                .map(|(k, _)| k.clone())
                .collect();
            for key in &to_remove {
                group_states.remove(key);
                discarded += 1;
                log::info!("[Pomodoro] Grace period: discarded group session {}", key);
            }
            // Clear persisted state if it was for a discarded group session
            if discarded > 0 {
                if let Some(db) = db {
                    if let Ok(Some(json)) = db::get_setting(db, ACTIVE_POMODORO_KEY) {
                        if let Ok(persisted) = serde_json::from_str::<PersistedPomodoroState>(&json) {
                            if let Some(ref tid) = persisted.task_group_id {
                                if to_remove.contains(tid) {
                                    let _ = db::set_setting(db, ACTIVE_POMODORO_KEY, "");
                                }
                            }
                        }
                    }
                }
            }
        }

        discarded
    }

    /// Mark the active focus session for a binding as a rotten tomato.
    /// Used when the user stays away from a bound app for too long.
    /// Returns true if a session was found and marked.
    pub fn mark_active_as_rotten(&self, db: &Database) -> bool {
        let mut marked = false;

        // Try individual sessions first
        {
            let mut states = self.states.lock().unwrap();
            let to_mark: Vec<(String, PomodoroState)> = states.iter()
                .filter(|(_, s)| s.phase == PomodoroPhase::Focus && s.paused)
                .map(|(k, s)| (k.clone(), s.clone()))
                .collect();
            for (key, state) in &to_mark {
                let planned = state.focus_minutes as i64 * 60;
                let elapsed = planned - state.remaining_seconds;
                if elapsed > 0 {
                    let _ = db::create_interrupted_session(
                        db,
                        &state.binding_id,
                        "focus",
                        planned,
                        elapsed,
                        state.phase_started_at,
                        state.pomodoro_index,
                        "user_away",
                    );
                    states.remove(key);
                    marked = true;
                    log::info!("[Pomodoro] Marked as rotten (user away): {} ({}s / {}s)", state.binding_id, elapsed, planned);
                }
            }
        }

        // Try group sessions
        {
            let mut group_states = self.group_states.lock().unwrap();
            let to_mark: Vec<(String, GroupPomodoroState)> = group_states.iter()
                .filter(|(_, s)| s.phase == PomodoroPhase::Focus && s.paused)
                .map(|(k, s)| (k.clone(), s.clone()))
                .collect();
            for (key, state) in &to_mark {
                let planned = state.focus_minutes as i64 * 60;
                // Save per-binding records
                for (binding_id, elapsed) in &state.binding_elapsed {
                    if *elapsed <= 0 { continue; }
                    let _ = db::create_interrupted_session(
                        db,
                        binding_id,
                        "focus",
                        planned,
                        *elapsed,
                        state.phase_started_at,
                        state.pomodoro_index,
                        "user_away",
                    );
                    marked = true;
                }
                if state.binding_elapsed.is_empty() {
                    let elapsed = planned - state.remaining_seconds;
                    if elapsed > 0 {
                        let _ = db::create_interrupted_session(
                            db,
                            &state.active_binding_id,
                            "focus",
                            planned,
                            elapsed,
                            state.phase_started_at,
                            state.pomodoro_index,
                            "user_away",
                        );
                        marked = true;
                    }
                }
                if marked {
                    group_states.remove(key);
                    log::info!("[Pomodoro] Marked group as rotten (user away): {}", key);
                }
            }
        }

        // Clear persisted state if we marked something
        if marked {
            let _ = db::set_setting(db, ACTIVE_POMODORO_KEY, "");
        }

        marked
    }

    /// Start the tick loop (runs in background thread).
    /// Restores any persisted pomodoro state from the previous session.
    pub fn start(&self, app_handle: tauri::AppHandle, db: Arc<Database>) {
        // Restore persisted state from previous session
        self.restore_active_state(&db);

        let states = self.states.clone();
        let group_states = self.group_states.clone();
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
                    let mut updates = Vec::new();

                    // ── Tick individual pomodoro states ──
                    {
                        let mut lock = states.lock().unwrap();
                        for (_bundle_id, state) in lock.iter_mut() {
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

                                let phase_started = state.phase_started_at;
                                let _ = db::create_pomodoro_session(
                                    &db,
                                    &state.binding_id,
                                    completed_phase.as_str(),
                                    planned_duration,
                                    planned_duration,
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
                                            state.remaining_seconds = state.long_break_minutes as i64 * 60;
                                        } else {
                                            state.phase = PomodoroPhase::Break;
                                            state.remaining_seconds = state.break_minutes as i64 * 60;
                                        }
                                    }
                                    PomodoroPhase::Break | PomodoroPhase::LongBreak => {
                                        state.phase = PomodoroPhase::Focus;
                                        state.remaining_seconds = state.focus_minutes as i64 * 60;
                                    }
                                }
                                state.phase_started_at = now_ts();
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
                                is_paused: state.paused,
                                task_group_id: None,
                                binding_elapsed: None,
                            });
                        }
                    }

                    // ── Tick group pomodoro states ──
                    {
                        let mut lock = group_states.lock().unwrap();
                        for (group_id, state) in lock.iter_mut() {
                            if state.paused {
                                continue;
                            }

                            state.remaining_seconds -= 1;

                            // Track per-binding elapsed within the current focus phase
                            if state.phase == PomodoroPhase::Focus {
                                let active_id = state.active_binding_id.clone();
                                *state.binding_elapsed.entry(active_id).or_insert(0) += 1;
                            }

                            if state.remaining_seconds <= 0 {
                                let completed_phase = state.phase.clone();
                                let planned_duration = match completed_phase {
                                    PomodoroPhase::Focus => state.focus_minutes as i64 * 60,
                                    PomodoroPhase::Break => state.break_minutes as i64 * 60,
                                    PomodoroPhase::LongBreak => state.long_break_minutes as i64 * 60,
                                };

                                let phase_started = state.phase_started_at;
                                let _ = db::create_pomodoro_session(
                                    &db,
                                    &state.active_binding_id,
                                    completed_phase.as_str(),
                                    planned_duration,
                                    planned_duration,
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
                                            state.remaining_seconds = state.long_break_minutes as i64 * 60;
                                        } else {
                                            state.phase = PomodoroPhase::Break;
                                            state.remaining_seconds = state.break_minutes as i64 * 60;
                                        }
                                    }
                                    PomodoroPhase::Break | PomodoroPhase::LongBreak => {
                                        state.phase = PomodoroPhase::Focus;
                                        state.remaining_seconds = state.focus_minutes as i64 * 60;
                                        // Reset per-binding elapsed for the new focus phase
                                        state.binding_elapsed.clear();
                                    }
                                }
                                state.phase_started_at = now_ts();
                            }

                            let planned = match state.phase {
                                PomodoroPhase::Focus => state.focus_minutes as i64 * 60,
                                PomodoroPhase::Break => state.break_minutes as i64 * 60,
                                PomodoroPhase::LongBreak => state.long_break_minutes as i64 * 60,
                            };

                            updates.push(PomodoroUpdate {
                                binding_id: state.active_binding_id.clone(),
                                state: state.phase.as_str().to_string(),
                                remaining_seconds: state.remaining_seconds,
                                planned_duration_seconds: planned,
                                pomodoro_index: state.pomodoro_index,
                                session_count: state.completed_today,
                                is_paused: state.paused,
                                task_group_id: Some(group_id.clone()),
                                binding_elapsed: Some(state.binding_elapsed.clone()),
                            });
                        }
                    }

                    updates
                };

                for update in updates {
                    emit_to_all(&app_handle, "pomodoro-update", update);
                }

                // Periodic save every 30 seconds
                if tick_count % 30 == 0 {
                    let now = now_ts();
                    // Save group state first (priority)
                    let group_lock = group_states.lock().unwrap();
                    let group_persisted = group_lock.iter().next().map(|(group_id, s)| PersistedPomodoroState {
                        bundle_id: String::new(),
                        binding_id: s.active_binding_id.clone(),
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
                        task_group_id: Some(group_id.clone()),
                        group_name: Some(s.group_name.clone()),
                    });
                    drop(group_lock);

                    let individual_lock = states.lock().unwrap();
                    let individual_persisted = individual_lock.iter().next().map(|(bundle_id, s)| PersistedPomodoroState {
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
                        task_group_id: None,
                        group_name: None,
                    });
                    drop(individual_lock);

                    let persisted = group_persisted.or(individual_persisted);
                    match persisted {
                        Some(state) => {
                            if let Ok(json) = serde_json::to_string(&state) {
                                let _ = db::set_setting(&db, ACTIVE_POMODORO_KEY, &json);
                            }
                        }
                        None => {
                            let _ = db::set_setting(&db, ACTIVE_POMODORO_KEY, "");
                        }
                    }
                }

                thread::sleep(Duration::from_secs(1));
            }
        });
    }

    /// Get current pomodoro states for all sessions (for polling)
    pub fn get_states(&self) -> Vec<PomodoroUpdate> {
        let mut result = Vec::new();

        let lock = self.states.lock().unwrap();
        for s in lock.values() {
            let planned = match s.phase {
                PomodoroPhase::Focus => s.focus_minutes as i64 * 60,
                PomodoroPhase::Break => s.break_minutes as i64 * 60,
                PomodoroPhase::LongBreak => s.long_break_minutes as i64 * 60,
            };
            result.push(PomodoroUpdate {
                binding_id: s.binding_id.clone(),
                state: s.phase.as_str().to_string(),
                remaining_seconds: s.remaining_seconds,
                planned_duration_seconds: planned,
                pomodoro_index: s.pomodoro_index,
                session_count: s.completed_today,
                is_paused: s.paused,
                task_group_id: None,
                binding_elapsed: None,
            });
        }
        drop(lock);

        let lock = self.group_states.lock().unwrap();
        for (group_id, s) in lock.iter() {
            let planned = match s.phase {
                PomodoroPhase::Focus => s.focus_minutes as i64 * 60,
                PomodoroPhase::Break => s.break_minutes as i64 * 60,
                PomodoroPhase::LongBreak => s.long_break_minutes as i64 * 60,
            };
            result.push(PomodoroUpdate {
                binding_id: s.active_binding_id.clone(),
                state: s.phase.as_str().to_string(),
                remaining_seconds: s.remaining_seconds,
                planned_duration_seconds: planned,
                pomodoro_index: s.pomodoro_index,
                session_count: s.completed_today,
                is_paused: s.paused,
                task_group_id: Some(group_id.clone()),
                binding_elapsed: Some(s.binding_elapsed.clone()),
            });
        }

        result
    }

    /// Stop the tick loop
    pub fn stop(&self) {
        *self.running.lock().unwrap() = false;
    }
}
