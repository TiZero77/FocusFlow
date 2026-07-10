use rusqlite::{Connection, Result};
use std::sync::Mutex;

use crate::models::{AppBinding, PomodoroSession, UsageRecord};

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(conn: Connection) -> Self {
        Self {
            conn: Mutex::new(conn),
        }
    }

    pub fn init(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS app_bindings (
                id TEXT PRIMARY KEY,
                app_name TEXT NOT NULL,
                bundle_id TEXT NOT NULL UNIQUE,
                icon_path TEXT,
                tracking_enabled INTEGER DEFAULT 1,
                pomodoro_enabled INTEGER DEFAULT 1,
                focus_minutes INTEGER DEFAULT 25,
                break_minutes INTEGER DEFAULT 5,
                long_break_minutes INTEGER DEFAULT 15,
                long_break_interval INTEGER DEFAULT 4,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS usage_records (
                id TEXT PRIMARY KEY,
                binding_id TEXT NOT NULL REFERENCES app_bindings(id),
                start_time INTEGER NOT NULL,
                end_time INTEGER,
                duration_seconds INTEGER NOT NULL,
                session_date TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS pomodoro_sessions (
                id TEXT PRIMARY KEY,
                binding_id TEXT NOT NULL REFERENCES app_bindings(id),
                type TEXT NOT NULL,
                planned_duration_seconds INTEGER NOT NULL,
                actual_duration_seconds INTEGER NOT NULL,
                completed INTEGER NOT NULL,
                interrupted_by TEXT,
                started_at INTEGER NOT NULL,
                ended_at INTEGER,
                pomodoro_index INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_records(session_date);
            CREATE INDEX IF NOT EXISTS idx_usage_binding ON usage_records(binding_id);
            CREATE INDEX IF NOT EXISTS idx_pomodoro_date ON pomodoro_sessions(created_at);
            ",
        )?;
        Ok(())
    }
}

// ── Binding CRUD ──

pub fn get_bindings(db: &Database) -> Result<Vec<AppBinding>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, app_name, bundle_id, icon_path, tracking_enabled, pomodoro_enabled,
         focus_minutes, break_minutes, long_break_minutes, long_break_interval, created_at
         FROM app_bindings ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(AppBinding {
            id: row.get(0)?,
            app_name: row.get(1)?,
            bundle_id: row.get(2)?,
            icon_path: row.get(3)?,
            tracking_enabled: row.get::<_, i32>(4)? != 0,
            pomodoro_enabled: row.get::<_, i32>(5)? != 0,
            focus_minutes: row.get(6)?,
            break_minutes: row.get(7)?,
            long_break_minutes: row.get(8)?,
            long_break_interval: row.get(9)?,
            created_at: row.get(10)?,
        })
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn create_binding(db: &Database, app_name: &str, bundle_id: &str, icon_path: &str) -> Result<AppBinding> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono_now();

    // Read global pomodoro settings as defaults
    let focus_minutes = get_setting(db, "focus_minutes")
        .ok()
        .flatten()
        .and_then(|v| v.parse::<i32>().ok())
        .unwrap_or(25);
    let break_minutes = get_setting(db, "break_minutes")
        .ok()
        .flatten()
        .and_then(|v| v.parse::<i32>().ok())
        .unwrap_or(5);
    let long_break_minutes = get_setting(db, "long_break_minutes")
        .ok()
        .flatten()
        .and_then(|v| v.parse::<i32>().ok())
        .unwrap_or(15);
    let long_break_interval = get_setting(db, "long_break_interval")
        .ok()
        .flatten()
        .and_then(|v| v.parse::<i32>().ok())
        .unwrap_or(4);

    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO app_bindings (id, app_name, bundle_id, icon_path, focus_minutes, break_minutes, long_break_minutes, long_break_interval, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        (&id, app_name, bundle_id, icon_path, focus_minutes, break_minutes, long_break_minutes, long_break_interval, now),
    )?;
    Ok(AppBinding {
        id,
        app_name: app_name.to_string(),
        bundle_id: bundle_id.to_string(),
        icon_path: icon_path.to_string(),
        tracking_enabled: true,
        pomodoro_enabled: true,
        focus_minutes,
        break_minutes,
        long_break_minutes,
        long_break_interval,
        created_at: now,
    })
}

pub fn update_binding(
    db: &Database,
    id: &str,
    app_name: Option<&str>,
    tracking_enabled: Option<bool>,
    pomodoro_enabled: Option<bool>,
    focus_minutes: Option<i32>,
    break_minutes: Option<i32>,
    long_break_minutes: Option<i32>,
    long_break_interval: Option<i32>,
) -> Result<AppBinding> {
    let conn = db.conn.lock().unwrap();

    // Build dynamic UPDATE
    let mut sets = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(v) = app_name {
        sets.push("app_name = ?");
        values.push(Box::new(v.to_string()));
    }
    if let Some(v) = tracking_enabled {
        sets.push("tracking_enabled = ?");
        values.push(Box::new(v as i32));
    }
    if let Some(v) = pomodoro_enabled {
        sets.push("pomodoro_enabled = ?");
        values.push(Box::new(v as i32));
    }
    if let Some(v) = focus_minutes {
        sets.push("focus_minutes = ?");
        values.push(Box::new(v));
    }
    if let Some(v) = break_minutes {
        sets.push("break_minutes = ?");
        values.push(Box::new(v));
    }
    if let Some(v) = long_break_minutes {
        sets.push("long_break_minutes = ?");
        values.push(Box::new(v));
    }
    if let Some(v) = long_break_interval {
        sets.push("long_break_interval = ?");
        values.push(Box::new(v));
    }

    if sets.is_empty() {
        // Nothing to update, just fetch
        let bindings = get_bindings(db)?;
        return bindings.into_iter().find(|b| b.id == id)
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows);
    }

    values.push(Box::new(id.to_string()));
    let sql = format!("UPDATE app_bindings SET {} WHERE id = ?", sets.join(", "));
    let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
    conn.execute(&sql, params.as_slice())?;

    drop(conn);
    let bindings = get_bindings(db)?;
    bindings.into_iter().find(|b| b.id == id)
        .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)
}

pub fn delete_binding(db: &Database, id: &str) -> Result<()> {
    let conn = db.conn.lock().unwrap();
    // Delete related records first (cascade)
    conn.execute("DELETE FROM usage_records WHERE binding_id = ?1", (id,))?;
    conn.execute("DELETE FROM pomodoro_sessions WHERE binding_id = ?1", (id,))?;
    conn.execute("DELETE FROM app_bindings WHERE id = ?1", (id,))?;
    Ok(())
}

// ── Usage Records ──

pub fn create_usage_record(db: &Database, binding_id: &str, start_time: i64, end_time: i64, elapsed_seconds: i64) -> Result<UsageRecord> {
    let id = uuid::Uuid::new_v4().to_string();
    let session_date = timestamp_to_date(start_time);
    let now = chrono_now();
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO usage_records (id, binding_id, start_time, end_time, duration_seconds, session_date, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (&id, binding_id, start_time, end_time, elapsed_seconds, &session_date, now),
    )?;
    Ok(UsageRecord {
        id,
        binding_id: binding_id.to_string(),
        start_time,
        end_time: Some(end_time),
        duration_seconds: elapsed_seconds,
        session_date,
        created_at: now,
    })
}

pub fn get_usage_records(db: &Database, date: &str) -> Result<Vec<UsageRecord>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, binding_id, start_time, end_time, duration_seconds, session_date, created_at
         FROM usage_records WHERE session_date = ?1 ORDER BY start_time",
    )?;
    let rows = stmt.query_map((date,), |row| {
        Ok(UsageRecord {
            id: row.get(0)?,
            binding_id: row.get(1)?,
            start_time: row.get(2)?,
            end_time: row.get(3)?,
            duration_seconds: row.get(4)?,
            session_date: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn get_usage_range(db: &Database, start_date: &str, end_date: &str) -> Result<Vec<UsageRecord>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, binding_id, start_time, end_time, duration_seconds, session_date, created_at
         FROM usage_records WHERE session_date >= ?1 AND session_date <= ?2 ORDER BY session_date, start_time",
    )?;
    let rows = stmt.query_map((start_date, end_date), |row| {
        Ok(UsageRecord {
            id: row.get(0)?,
            binding_id: row.get(1)?,
            start_time: row.get(2)?,
            end_time: row.get(3)?,
            duration_seconds: row.get(4)?,
            session_date: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

// ── Pomodoro Sessions ──

pub fn create_pomodoro_session(
    db: &Database,
    binding_id: &str,
    session_type: &str,
    planned_duration: i64,
    actual_duration: i64,
    completed: bool,
    started_at: i64,
    pomodoro_index: i32,
) -> Result<PomodoroSession> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono_now();
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO pomodoro_sessions (id, binding_id, type, planned_duration_seconds, actual_duration_seconds, completed, started_at, ended_at, pomodoro_index, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        (&id, binding_id, session_type, planned_duration, actual_duration, completed as i32, started_at, now, pomodoro_index, now),
    )?;
    Ok(PomodoroSession {
        id,
        binding_id: binding_id.to_string(),
        session_type: session_type.to_string(),
        planned_duration_seconds: planned_duration,
        actual_duration_seconds: actual_duration,
        completed,
        interrupted_by: None,
        started_at,
        ended_at: Some(now),
        pomodoro_index,
        created_at: now,
    })
}

pub fn get_pomodoro_range(db: &Database, start_ts: i64, end_ts: i64) -> Result<Vec<PomodoroSession>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, binding_id, type, planned_duration_seconds, actual_duration_seconds,
         completed, interrupted_by, started_at, ended_at, pomodoro_index, created_at
         FROM pomodoro_sessions WHERE created_at >= ?1 AND created_at <= ?2 ORDER BY created_at",
    )?;
    let rows = stmt.query_map((start_ts, end_ts), |row| {
        Ok(PomodoroSession {
            id: row.get(0)?,
            binding_id: row.get(1)?,
            session_type: row.get(2)?,
            planned_duration_seconds: row.get(3)?,
            actual_duration_seconds: row.get(4)?,
            completed: row.get::<_, i32>(5)? != 0,
            interrupted_by: row.get(6)?,
            started_at: row.get(7)?,
            ended_at: row.get(8)?,
            pomodoro_index: row.get(9)?,
            created_at: row.get(10)?,
        })
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

// ── Settings ──

pub fn get_setting(db: &Database, key: &str) -> Result<Option<String>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let mut rows = stmt.query_map((key,), |row| row.get::<_, String>(0))?;
    match rows.next() {
        Some(Ok(val)) => Ok(Some(val)),
        _ => Ok(None),
    }
}

pub fn set_setting(db: &Database, key: &str, value: &str) -> Result<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        (key, value),
    )?;
    Ok(())
}

pub fn clear_all_data(db: &Database) -> Result<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute_batch(
        "DELETE FROM usage_records; DELETE FROM pomodoro_sessions; DELETE FROM app_bindings; DELETE FROM settings;",
    )?;
    Ok(())
}

// ── Helpers ──

fn chrono_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

fn timestamp_to_date(ts: i64) -> String {
    // Use local time for date calculation
    // Approximate local time offset (UTC+8 for China)
    // This is a simplification - ideally use chrono crate for proper timezone handling
    let local_offset = 8 * 3600; // UTC+8
    let local_ts = ts + local_offset;
    let days = local_ts / 86400;
    let (y, m, d) = days_to_ymd(days + 719468);
    format!("{:04}-{:02}-{:02}", y, m, d)
}

fn days_to_ymd(g: i64) -> (i64, i64, i64) {
    let y = (10000 * g + 14780) / 3652425;
    let mut doy = g - (365 * y + y / 4 - y / 100 + y / 400);
    if doy < 0 {
        let y2 = y - 1;
        doy = g - (365 * y2 + y2 / 4 - y2 / 100 + y2 / 400);
    }
    let mi = (100 * doy + 52) / 3060;
    let month = (mi + 2) % 12 + 1;
    let year = y + (mi + 2) / 12;
    let day = doy - (mi * 306 + 5) / 10 + 1;
    (year, month, day)
}
