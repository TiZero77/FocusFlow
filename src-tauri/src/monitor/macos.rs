use crate::models::ForegroundApp;
use cocoa::base::{id, nil};
use objc::runtime::Class;
use objc::{msg_send, sel, sel_impl};
use std::ffi::CStr;

pub fn get_current_app() -> Option<ForegroundApp> {
    unsafe {
        let cls = Class::get("NSWorkspace").unwrap();
        let workspace: id = msg_send![cls, sharedWorkspace];
        let app: id = msg_send![workspace, frontmostApplication];
        if app == nil {
            return None;
        }
        Some(extract_app_info(app))
    }
}

pub fn get_running_apps() -> Vec<ForegroundApp> {
    unsafe {
        let cls = Class::get("NSWorkspace").unwrap();
        let workspace: id = msg_send![cls, sharedWorkspace];
        let apps: id = msg_send![workspace, runningApplications];
        let count: usize = msg_send![apps, count];
        let mut result = Vec::new();

        for i in 0..count {
            let app: id = msg_send![apps, objectAtIndex: i];
            let activation_policy: i64 = msg_send![app, activationPolicy];
            // 0 = NSApplicationActivationPolicyRegular (normal apps with dock icon)
            if activation_policy == 0 {
                result.push(extract_app_info(app));
            }
        }
        result
    }
}

pub fn search_installed_apps(query: &str) -> Vec<ForegroundApp> {
    // For now, filter running apps by name.
    // Full implementation would scan /Applications and ~/Applications.
    let query_lower = query.to_lowercase();
    get_running_apps()
        .into_iter()
        .filter(|app| app.name.to_lowercase().contains(&query_lower))
        .collect()
}

unsafe fn extract_app_info(app: id) -> ForegroundApp {
    let name: id = msg_send![app, localizedName];
    let name_str = if name != nil {
        let cstr: *const i8 = msg_send![name, UTF8String];
        CStr::from_ptr(cstr).to_string_lossy().into_owned()
    } else {
        "Unknown".to_string()
    };

    let bundle_id: id = msg_send![app, bundleIdentifier];
    let bundle_id_str = if bundle_id != nil {
        let cstr: *const i8 = msg_send![bundle_id, UTF8String];
        CStr::from_ptr(cstr).to_string_lossy().into_owned()
    } else {
        String::new()
    };

    ForegroundApp {
        name: name_str,
        bundle_id: bundle_id_str,
        icon_path: String::new(), // Icon extraction can be added later
    }
}
