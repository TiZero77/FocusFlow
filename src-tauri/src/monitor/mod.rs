use crate::models::ForegroundApp;

mod windows;

/// Get the currently focused application.
pub fn get_current_app() -> Option<ForegroundApp> {
    windows::get_current_app()
}

/// Get all running applications.
pub fn get_running_apps() -> Vec<ForegroundApp> {
    windows::get_running_apps()
}

/// Search installed applications by name.
pub fn search_installed_apps(query: &str) -> Vec<ForegroundApp> {
    windows::search_installed_apps(query)
}
