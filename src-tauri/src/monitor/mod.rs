use crate::models::ForegroundApp;

#[cfg(target_os = "macos")]
#[allow(deprecated)]
mod macos;

#[cfg(target_os = "windows")]
mod windows;

/// Get the currently focused application.
pub fn get_current_app() -> Option<ForegroundApp> {
    #[cfg(target_os = "macos")]
    {
        macos::get_current_app()
    }

    #[cfg(target_os = "windows")]
    {
        windows::get_current_app()
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        None
    }
}

/// Get all running applications.
pub fn get_running_apps() -> Vec<ForegroundApp> {
    #[cfg(target_os = "macos")]
    {
        macos::get_running_apps()
    }

    #[cfg(target_os = "windows")]
    {
        windows::get_running_apps()
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        vec![]
    }
}

/// Search installed applications by name.
pub fn search_installed_apps(query: &str) -> Vec<ForegroundApp> {
    #[cfg(target_os = "macos")]
    {
        macos::search_installed_apps(query)
    }

    #[cfg(target_os = "windows")]
    {
        windows::search_installed_apps(query)
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = query;
        vec![]
    }
}
