use crate::models::ForegroundApp;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
};
use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ};
use windows::Win32::System::ProcessStatus::GetModuleFileNameExW;

pub fn get_current_app() -> Option<ForegroundApp> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0 == 0 {
            return None;
        }
        Some(extract_window_info(hwnd))
    }
}

pub fn get_running_apps() -> Vec<ForegroundApp> {
    // Simplified: return the current foreground app.
    // Full implementation would use EnumWindows.
    match get_current_app() {
        Some(app) => vec![app],
        None => vec![],
    }
}

pub fn search_installed_apps(query: &str) -> Vec<ForegroundApp> {
    // Placeholder: filter running apps
    let query_lower = query.to_lowercase();
    get_running_apps()
        .into_iter()
        .filter(|app| app.name.to_lowercase().contains(&query_lower))
        .collect()
}

unsafe fn extract_window_info(hwnd: HWND) -> ForegroundApp {
    // Get window title
    let mut title_buf = [0u16; 512];
    let len = GetWindowTextW(hwnd, &mut title_buf);
    let title = String::from_utf16_lossy(&title_buf[..len as usize]);

    // Get process ID and exe name
    let mut process_id: u32 = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut process_id));

    let mut exe_path = String::new();
    if let Ok(handle) = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, process_id) {
        let mut path_buf = [0u16; 512];
        let len = GetModuleFileNameExW(handle, None, &mut path_buf);
        if len > 0 {
            exe_path = String::from_utf16_lossy(&path_buf[..len as usize]);
        }
        let _ = windows::Win32::Foundation::CloseHandle(handle);
    }

    let name = if !title.is_empty() {
        title
    } else {
        exe_path
            .rsplit('\\')
            .next()
            .unwrap_or("Unknown")
            .to_string()
    };

    ForegroundApp {
        name,
        bundle_id: exe_path.clone(),
        icon_path: exe_path,
    }
}
