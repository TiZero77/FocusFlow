use crate::models::ForegroundApp;
use std::collections::HashSet;
use std::path::PathBuf;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    QueryFullProcessImageNameW,
};
use windows::Win32::System::Registry::{
    RegCloseKey, RegEnumKeyExW, RegOpenKeyExW, RegQueryValueExW, HKEY, KEY_READ, REG_SZ,
    REG_VALUE_TYPE, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumChildWindows, EnumWindows, GetForegroundWindow, GetWindowLongW, GetWindowTextW,
    GetWindowThreadProcessId, IsWindowVisible, GWL_EXSTYLE, WS_EX_LAYERED,
};

/// Check if a window is effectively visible to the user.
/// Extends `IsWindowVisible()` to also include layered windows (WS_EX_LAYERED)
/// that have a title, which covers CEF-based apps like the LoL client.
unsafe fn is_window_effectively_visible(hwnd: HWND) -> bool {
    if IsWindowVisible(hwnd).as_bool() {
        return true;
    }
    // Layered windows with WS_EX_LAYERED are rendered on screen but IsWindowVisible
    // may return false for them. If the window also has a title, it's a real app window.
    let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
    if (ex_style as u32 & WS_EX_LAYERED.0) != 0 {
        let mut title_buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut title_buf);
        if len > 0 {
            return true;
        }
    }
    false
}

/// Common app aliases for better search
fn get_app_aliases() -> Vec<(&'static str, Vec<&'static str>)> {
    vec![
        ("code", vec!["vscode", "visual studio code", "vs code"]),
        ("chrome", vec!["google chrome"]),
        ("firefox", vec!["mozilla firefox"]),
        ("edge", vec!["microsoft edge"]),
        ("notepad++", vec!["notepad plus plus", "npp"]),
        ("photoshop", vec!["adobe photoshop"]),
        ("illustrator", vec!["adobe illustrator"]),
        ("premiere", vec!["adobe premiere", "premiere pro"]),
        ("word", vec!["microsoft word", "ms word"]),
        ("excel", vec!["microsoft excel", "ms excel"]),
        ("powerpoint", vec!["microsoft powerpoint", "ms powerpoint", "ppt"]),
        ("outlook", vec!["microsoft outlook"]),
        ("teams", vec!["microsoft teams"]),
        ("slack", vec!["slack messenger"]),
        ("discord", vec!["discord chat"]),
        ("spotify", vec!["spotify music"]),
        ("steam", vec!["steam gaming"]),
        ("obs", vec!["obs studio", "open broadcaster"]),
        ("figma", vec!["figma design"]),
        ("notion", vec!["notion app"]),
        ("terminal", vec!["windows terminal"]),
        ("powershell", vec!["pwsh"]),
        ("cmd", vec!["command prompt", "cmd.exe"]),
        ("explorer", vec!["file explorer", "windows explorer"]),
    ]
}

pub fn get_current_app() -> Option<ForegroundApp> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        Some(extract_window_info(hwnd))
    }
}

/// Get all running apps with visible windows
pub fn get_running_apps() -> Vec<ForegroundApp> {
    let mut apps = Vec::new();
    let mut seen = HashSet::new();

    // First try to get the current foreground app
    if let Some(current) = get_current_app() {
        if !current.bundle_id.is_empty() {
            seen.insert(current.bundle_id.clone());
            apps.push(current);
        }
    }

    // Then enumerate all visible windows
    unsafe {
        let mut enum_data = EnumWindowsData {
            apps: &mut apps,
            seen: &mut seen,
        };
        let _ = EnumWindows(
            Some(enum_windows_callback),
            LPARAM(&mut enum_data as *mut _ as isize),
        );
    }

    apps
}

struct EnumWindowsData<'a> {
    apps: &'a mut Vec<ForegroundApp>,
    seen: &'a mut HashSet<String>,
}

unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let data = &mut *(lparam.0 as *mut EnumWindowsData);

    // Only visible windows (includes WS_EX_LAYERED windows with titles)
    if !is_window_effectively_visible(hwnd) {
        return BOOL(1); // continue
    }

    let info = extract_window_info(hwnd);

    // Skip windows without a valid exe path or already seen
    if info.bundle_id.is_empty() || data.seen.contains(&info.bundle_id) {
        return BOOL(1);
    }

    // Skip system processes and FocusFlow itself
    let exe_lower = info.bundle_id.to_lowercase();
    if exe_lower.contains("focusflow.exe")
        || exe_lower.contains("svchost")
        || exe_lower.contains("dwm.exe")
        || exe_lower.contains("sihost")
        || exe_lower.contains("searchhost")
        || exe_lower.contains("startmenuexperiencehost")
        || exe_lower.contains("systemsettings")
        || exe_lower.contains("textinputhost")
        || exe_lower.contains("runtimebroker")
    {
        return BOOL(1);
    }

    // For UWP apps hosted under ApplicationFrameHost, try to extract the real app
    if exe_lower.contains("applicationframehost") {
        if let Some(uwp_app) = extract_uwp_child_app(hwnd, &mut data.seen) {
            data.apps.push(uwp_app);
        }
        return BOOL(1);
    }

    data.seen.insert(info.bundle_id.clone());
    data.apps.push(info);

    BOOL(1) // continue
}

pub fn search_installed_apps(query: &str) -> Vec<ForegroundApp> {
    let query_lower = query.to_lowercase().trim().to_string();
    if query_lower.is_empty() {
        return get_running_apps();
    }

    let mut seen = HashSet::new();
    let mut results = Vec::new();

    // Get aliases for matching
    let aliases = get_app_aliases();

    // 1. Search in running apps first (most relevant)
    for app in get_running_apps() {
        if seen.contains(&app.bundle_id) {
            continue;
        }
        if matches_search(&app, &query_lower, &aliases) {
            seen.insert(app.bundle_id.clone());
            results.push(app);
        }
    }

    // 2. Search in Start Menu shortcuts
    for app in scan_start_menu_apps() {
        if seen.contains(&app.bundle_id) {
            continue;
        }
        if matches_search(&app, &query_lower, &aliases) {
            seen.insert(app.bundle_id.clone());
            results.push(app);
        }
    }

    // 3. Search in registry
    for app in scan_registry_apps() {
        if seen.contains(&app.bundle_id) {
            continue;
        }
        if matches_search(&app, &query_lower, &aliases) {
            seen.insert(app.bundle_id.clone());
            results.push(app);
        }
    }

    results
}

/// Check if an app matches the search query with fuzzy matching and aliases
fn matches_search(app: &ForegroundApp, query: &str, aliases: &[(&str, Vec<&str>)]) -> bool {
    let name_lower = app.name.to_lowercase();
    let exe_lower = app.bundle_id.to_lowercase();

    // Direct match
    if name_lower.contains(query) || exe_lower.contains(query) {
        return true;
    }

    // Match against exe filename
    if let Some(exe_name) = exe_lower.rsplit('\\').next() {
        if exe_name.contains(query) {
            return true;
        }
    }

    // Match against aliases
    for (exe_keyword, alias_list) in aliases {
        // Check if the exe contains the keyword
        if exe_lower.contains(exe_keyword) {
            // Check if query matches any alias
            for alias in alias_list {
                if alias.contains(query) || query.contains(alias) {
                    return true;
                }
            }
        }
    }

    // Fuzzy match: check if all query characters appear in order
    if fuzzy_match(&name_lower, query) {
        return true;
    }

    false
}

/// Simple fuzzy match - checks if all chars in pattern appear in text in order
fn fuzzy_match(text: &str, pattern: &str) -> bool {
    let mut pattern_chars = pattern.chars();
    let mut current = pattern_chars.next();

    for c in text.chars() {
        if let Some(pc) = current {
            if c == pc {
                current = pattern_chars.next();
            }
        }
    }

    current.is_none()
}

/// Scan Start Menu folders for application shortcuts
fn scan_start_menu_apps() -> Vec<ForegroundApp> {
    let mut apps = Vec::new();
    let mut seen = HashSet::new();

    let mut start_menu_paths = Vec::new();

    if let Some(appdata) = std::env::var_os("APPDATA") {
        start_menu_paths.push(
            PathBuf::from(appdata)
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs"),
        );
    }

    start_menu_paths.push(
        PathBuf::from("C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs"),
    );

    for base_path in &start_menu_paths {
        if base_path.exists() {
            scan_directory_for_shortcuts(base_path, &mut apps, &mut seen, 0);
        }
    }

    apps
}

fn scan_directory_for_shortcuts(
    dir: &PathBuf,
    apps: &mut Vec<ForegroundApp>,
    seen: &mut HashSet<String>,
    depth: u32,
) {
    if depth > 3 {
        return;
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            scan_directory_for_shortcuts(&path, apps, seen, depth + 1);
        } else if let Some(ext) = path.extension() {
            if ext == "lnk" {
                if let Some(name) = path.file_stem().and_then(|n| n.to_str()) {
                    let name_lower = name.to_lowercase();
                    if name_lower.contains("uninstall")
                        || name_lower.contains("uninst")
                        || name_lower.contains("help")
                        || name_lower.contains("readme")
                        || name_lower.contains("website")
                        || name_lower.contains("visit")
                        || name_lower.contains("update")
                    {
                        continue;
                    }

                    if let Some(target) = resolve_shortcut_target(&path) {
                        if target.to_lowercase().ends_with(".exe") && !seen.contains(&target) {
                            seen.insert(target.clone());
                            apps.push(ForegroundApp {
                                name: name.to_string(),
                                bundle_id: target.clone(),
                                icon_path: target,
                            });
                        }
                    }
                }
            }
        }
    }
}

fn resolve_shortcut_target(lnk_path: &PathBuf) -> Option<String> {
    let data = std::fs::read(lnk_path).ok()?;

    let data_str: String = data
        .windows(2)
        .filter_map(|w| {
            let c = u16::from_le_bytes([w[0], w[1]]);
            if c >= 32 && c < 127 {
                Some(c as u8 as char)
            } else {
                None
            }
        })
        .collect();

    let lower = data_str.to_lowercase();
    if let Some(exe_pos) = lower.rfind(".exe") {
        let before_exe = &data_str[..exe_pos + 4];
        if let Some(drive_pos) = before_exe.rfind(":\\") {
            let start = drive_pos.saturating_sub(1);
            let path_str = &before_exe[start..];
            let path = path_str.trim();
            if path.len() > 3 && path.chars().nth(1) == Some(':') {
                return Some(path.replace("\\\\", "\\"));
            }
        }
    }

    None
}

fn scan_registry_apps() -> Vec<ForegroundApp> {
    let mut apps = Vec::new();
    let mut seen = HashSet::new();

    let uninstall_keys = vec![
        "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    ];

    // Scan both HKLM (machine-wide) and HKCU (current user) for installed apps
    for root_key in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        for key_path in &uninstall_keys {
            scan_uninstall_key(root_key, key_path, &mut apps, &mut seen);
        }
    }

    apps
}

fn scan_uninstall_key(
    root_key: HKEY,
    key_path: &str,
    apps: &mut Vec<ForegroundApp>,
    seen: &mut HashSet<String>,
) {
    use windows::core::PCWSTR;

    let key_path_w: Vec<u16> = key_path.encode_utf16().chain(std::iter::once(0)).collect();

    unsafe {
        let mut hkey = HKEY::default();
        let result =
            RegOpenKeyExW(root_key, PCWSTR(key_path_w.as_ptr()), 0, KEY_READ, &mut hkey);

        if result.is_err() {
            return;
        }

        let mut index: u32 = 0;
        loop {
            let mut name_buf = [0u16; 256];
            let mut name_len = 256;

            let result = RegEnumKeyExW(
                hkey,
                index,
                windows::core::PWSTR(name_buf.as_mut_ptr()),
                &mut name_len,
                None,
                windows::core::PWSTR::null(),
                None,
                None,
            );

            if result.is_err() {
                break;
            }

            let subkey_name = String::from_utf16_lossy(&name_buf[..name_len as usize]);

            if let Some(app) = read_app_from_registry(hkey, &subkey_name) {
                if !seen.contains(&app.bundle_id) && !app.name.is_empty() {
                    seen.insert(app.bundle_id.clone());
                    apps.push(app);
                }
            }

            index += 1;
        }

        let _ = RegCloseKey(hkey);
    }
}

fn read_app_from_registry(parent_key: HKEY, subkey_name: &str) -> Option<ForegroundApp> {
    use windows::core::PCWSTR;

    let subkey_w: Vec<u16> = subkey_name.encode_utf16().chain(std::iter::once(0)).collect();

    unsafe {
        let mut hkey = HKEY::default();
        let result = RegOpenKeyExW(
            parent_key,
            PCWSTR(subkey_w.as_ptr()),
            0,
            KEY_READ,
            &mut hkey,
        );

        if result.is_err() {
            return None;
        }

        let display_name = read_reg_string(hkey, "DisplayName");
        let install_location = read_reg_string(hkey, "InstallLocation");
        let display_icon = read_reg_string(hkey, "DisplayIcon");

        let _ = RegCloseKey(hkey);

        let name = display_name?;
        if name.is_empty() {
            return None;
        }

        let exe_path = find_exe_in_location(&install_location, &display_icon);

        Some(ForegroundApp {
            name,
            bundle_id: exe_path.clone().unwrap_or_default(),
            icon_path: exe_path.unwrap_or_default(),
        })
    }
}

fn read_reg_string(hkey: HKEY, value_name: &str) -> Option<String> {
    use windows::core::PCWSTR;

    let name_w: Vec<u16> = value_name.encode_utf16().chain(std::iter::once(0)).collect();

    unsafe {
        let mut data_type = REG_VALUE_TYPE(0);
        let mut data_size: u32 = 0;

        let result = RegQueryValueExW(
            hkey,
            PCWSTR(name_w.as_ptr()),
            None,
            Some(&mut data_type),
            None,
            Some(&mut data_size),
        );

        if result.is_err() || data_type != REG_SZ || data_size == 0 {
            return None;
        }

        let mut buf = vec![0u16; (data_size / 2) as usize];
        let result = RegQueryValueExW(
            hkey,
            PCWSTR(name_w.as_ptr()),
            None,
            Some(&mut data_type),
            Some(buf.as_mut_ptr() as *mut u8),
            Some(&mut data_size),
        );

        if result.is_err() {
            return None;
        }

        while buf.last() == Some(&0) {
            buf.pop();
        }

        Some(String::from_utf16_lossy(&buf))
    }
}

fn find_exe_in_location(
    install_location: &Option<String>,
    display_icon: &Option<String>,
) -> Option<String> {
    if let Some(loc) = install_location {
        if !loc.is_empty() {
            let path = PathBuf::from(loc);
            if path.exists() {
                if let Ok(entries) = std::fs::read_dir(&path) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.extension().map(|e| e == "exe").unwrap_or(false) {
                            return Some(p.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    if let Some(icon) = display_icon {
        if !icon.is_empty() {
            let path_str = icon.split(',').next().unwrap_or(icon);
            let path = PathBuf::from(path_str.trim());
            if path.exists() && path.extension().map(|e| e == "exe").unwrap_or(false) {
                return Some(path.to_string_lossy().to_string());
            }
        }
    }

    None
}

/// For UWP apps hosted under ApplicationFrameHost, enumerate child windows
/// to find the actual app process.
unsafe fn extract_uwp_child_app(parent_hwnd: HWND, seen: &mut HashSet<String>) -> Option<ForegroundApp> {
    struct UwpEnumData {
        found: Option<ForegroundApp>,
        seen: *mut HashSet<String>,
    }

    unsafe extern "system" fn uwp_child_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let data = &mut *(lparam.0 as *mut UwpEnumData);

        let mut child_pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut child_pid));

        if child_pid == 0 {
            return BOOL(1);
        }

        // Check if this child belongs to a different process
        let mut parent_pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut parent_pid));

        // Try to get the exe path of the child's process
        if let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, child_pid) {
            let mut buf = [0u16; 512];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(
                h,
                PROCESS_NAME_WIN32,
                windows::core::PWSTR(buf.as_mut_ptr()),
                &mut len,
            )
            .is_ok()
                && len > 0;
            let _ = windows::Win32::Foundation::CloseHandle(h);

            if ok {
                let path = String::from_utf16_lossy(&buf[..len as usize]);
                let lower = path.to_lowercase();
                // Skip if it's still ApplicationFrameHost itself
                if !lower.contains("applicationframehost") && !(*data.seen).contains(&path) {
                    let title_buf = &mut [0u16; 512];
                    let tlen = GetWindowTextW(hwnd, title_buf);
                    let title = String::from_utf16_lossy(&title_buf[..tlen as usize]);

                    let name = if !title.is_empty() {
                        title
                    } else {
                        path.rsplit('\\')
                            .next()
                            .unwrap_or("")
                            .replace(".exe", "")
                    };

                    (*data.seen).insert(path.clone());
                    data.found = Some(ForegroundApp {
                        name,
                        bundle_id: path.clone(),
                        icon_path: path,
                    });
                    return BOOL(0); // stop enumeration
                }
            }
        }

        BOOL(1) // continue
    }

    let mut enum_data = UwpEnumData {
        found: None,
        seen: seen as *mut _,
    };
    let _ = EnumChildWindows(
        parent_hwnd,
        Some(uwp_child_callback),
        LPARAM(&mut enum_data as *mut _ as isize),
    );

    enum_data.found
}

unsafe fn extract_window_info(hwnd: HWND) -> ForegroundApp {
    let mut title_buf = [0u16; 512];
    let len = GetWindowTextW(hwnd, &mut title_buf);
    let title = String::from_utf16_lossy(&title_buf[..len as usize]);

    let mut process_id: u32 = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut process_id));

    let mut exe_path = String::new();
    if let Ok(handle) = OpenProcess(
        PROCESS_QUERY_LIMITED_INFORMATION,
        false,
        process_id,
    ) {
        let mut path_buf = [0u16; 512];
        let mut path_len = path_buf.len() as u32;
        if QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(path_buf.as_mut_ptr()),
            &mut path_len,
        )
        .is_ok()
            && path_len > 0
        {
            exe_path = String::from_utf16_lossy(&path_buf[..path_len as usize]);
        }
        let _ = windows::Win32::Foundation::CloseHandle(handle);
    }

    // Extract a clean name from exe path
    let exe_name = exe_path
        .rsplit('\\')
        .next()
        .unwrap_or("")
        .to_string();

    // Use window title if meaningful, otherwise use exe name
    let name = if !title.is_empty() && title != "Default IME" && title != "MSCTFIME UI" {
        // Clean up title - remove app name suffix like " - Google Chrome"
        if let Some(pos) = title.rfind(" - ") {
            let suffix = &title[pos + 3..];
            // If suffix looks like an app name, use it as the display name
            if suffix.len() > 2 && suffix.len() < 50 {
                suffix.to_string()
            } else {
                title.clone()
            }
        } else {
            title.clone()
        }
    } else {
        // Remove .exe extension for cleaner display
        exe_name.replace(".exe", "").replace(".EXE", "")
    };

    ForegroundApp {
        name,
        bundle_id: exe_path.clone(),
        icon_path: exe_path,
    }
}
