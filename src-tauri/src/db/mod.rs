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
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO app_bindings (id, app_name, bundle_id, icon_path, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        (&id, app_name, bundle_id, icon_path, now),
    )?;
    Ok(AppBinding {
        id,
        app_name: app_name.to_string(),
        bundle_id: bundle_id.to_string(),
        icon_path: icon_path.to_string(),
        tracking_enabled: true,
        pomodoro_enabled: true,
        focus_minutes: 25,
        break_minutes: 5,
        long_break_minutes: 15,
        long_break_interval: 4,
        created_at: now,
    })
}

pub fn delete_binding(db: &Database, id: &str) -> Result<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute("DELETE FROM app_bindings WHERE id = ?1", (id,))?;
    Ok(())
}

// ── Usage Records ──

pub fn create_usage_record(db: &Database, binding_id: &str, start_time: i64, end_time: i64) -> Result<UsageRecord> {
    let id = uuid::Uuid::new_v4().to_string();
    let duration = end_time - start_time;
    let session_date = timestamp_to_date(start_time);
    let now = chrono_now();
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO usage_records (id, binding_id, start_time, end_time, duration_seconds, session_date, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (&id, binding_id, start_time, end_time, duration, &session_date, now),
    )?;
    Ok(UsageRecord {
        id,
        binding_id: binding_id.to_string(),
        start_time,
        end_time: Some(end_time),
        duration_seconds: duration,
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

// ── Pomodoro Sessions ──

pub fn create_pomodoro_session(
    db: &Database,
    binding_id: &str,
    session_type: &str,
    planned_duration: i64,
    actual_duration: i64,
    completed: bool,
    pomodoro_index: i32,
) -> Result<PomodoroSession> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono_now();
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO pomodoro_sessions (id, binding_id, type, planned_duration_seconds, actual_duration_seconds, completed, started_at, ended_at, pomodoro_index, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        (&id, binding_id, session_type, planned_duration, actual_duration, completed as i32, now, now, pomodoro_index, now),
    )?;
    Ok(PomodoroSession {
        id,
        binding_id: binding_id.to_string(),
        session_type: session_type.to_string(),
        planned_duration_seconds: planned_duration,
        actual_duration_seconds: actual_duration,
        completed,
        interrupted_by: None,
        started_at: now,
        ended_at: Some(now),
        pomodoro_index,
        created_at: now,
    })
}

// ── Helpers ──

fn chrono_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

fn timestamp_to_date(ts: i64) -> String {
    // Simple date calculation (UTC)
    let days = ts / 86400;
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
