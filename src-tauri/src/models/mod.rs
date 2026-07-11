use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppBinding {
    pub id: String,
    pub app_name: String,
    pub bundle_id: String,
    pub icon_path: String,
    pub tracking_enabled: bool,
    pub pomodoro_enabled: bool,
    pub focus_minutes: i32,
    pub break_minutes: i32,
    pub long_break_minutes: i32,
    pub long_break_interval: i32,
    pub task_group_id: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskGroup {
    pub id: String,
    pub name: String,
    pub focus_minutes: i32,
    pub break_minutes: i32,
    pub long_break_minutes: i32,
    pub long_break_interval: i32,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskGroupWithBindings {
    pub id: String,
    pub name: String,
    pub focus_minutes: i32,
    pub break_minutes: i32,
    pub long_break_minutes: i32,
    pub long_break_interval: i32,
    pub created_at: i64,
    pub bindings: Vec<AppBinding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageRecord {
    pub id: String,
    pub binding_id: String,
    pub start_time: i64,
    pub end_time: Option<i64>,
    pub duration_seconds: i64,
    pub session_date: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PomodoroSession {
    pub id: String,
    pub binding_id: String,
    pub session_type: String, // "focus" | "break" | "longBreak"
    pub planned_duration_seconds: i64,
    pub actual_duration_seconds: i64,
    pub completed: bool,
    pub interrupted_by: Option<String>,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub pomodoro_index: i32,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundApp {
    pub name: String,
    pub bundle_id: String,
    pub icon_path: String,
}
