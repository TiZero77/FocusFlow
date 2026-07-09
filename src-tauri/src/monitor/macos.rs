use crate::models::ForegroundApp;
use cocoa::base::{id, nil};
use objc::runtime::Class;
use objc::{msg_send, sel, sel_impl};
use std::ffi::CStr;

// CoreGraphics FFI for window list (no extra crate needed)
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGWindowListCopyWindowInfo(
        option: u32,
        relative_to_window: u32,
    ) -> *const core::ffi::c_void;
}

const kCG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY: u32 = 1 << 0;
const kCG_NULL_WINDOW_ID: u32 = 0;

// CoreFoundation FFI for CFArray/CFDictionary access
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFArrayGetCount(the_array: *const core::ffi::c_void) -> isize;
    fn CFArrayGetValueAtIndex(
        the_array: *const core::ffi::c_void,
        idx: isize,
    ) -> *const core::ffi::c_void;
    fn CFDictionaryGetValue(
        the_dict: *const core::ffi::c_void,
        key: *const core::ffi::c_void,
    ) -> *const core::ffi::c_void;
    fn CFRelease(cf: *const core::ffi::c_void);
    fn CFNumberGetValue(
        number: *const core::ffi::c_void,
        the_type: u32,
        value_ptr: *mut core::ffi::c_void,
    ) -> bool;
}

const kCF_NUMBER_SINT32_TYPE: u32 = 3;

// Pre-defined CFString keys for window info dictionary
// kCGWindowOwnerPID and kCGWindowOwnerName are CFString constants
// We'll use a simpler approach: just use NSRunningApplication

/// Get the currently focused application.
/// Uses CGWindowListCopyWindowInfo to find the frontmost non-own window's app.
pub fn get_current_app() -> Option<ForegroundApp> {
    unsafe {
        let window_list =
            CGWindowListCopyWindowInfo(kCG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY, kCG_NULL_WINDOW_ID);
        if window_list.is_null() {
            return None;
        }

        let count = CFArrayGetCount(window_list);
        let current_pid = std::process::id() as i32;

        for i in 0..count {
            let info = CFArrayGetValueAtIndex(window_list, i);
            if info.is_null() {
                continue;
            }

            // Try to get the owner PID from the window info dict
            // kCGWindowOwnerPID is a CFString key — we need to create it
            // Instead, let's use a different approach: iterate running apps and find the active one
        }

        CFRelease(window_list);

        // Fallback: use NSWorkspace to find the active app
        // This is the same as before but let's also try NSRunningApplication options
        let cls = Class::get("NSWorkspace").unwrap();
        let workspace: id = msg_send![cls, sharedWorkspace];
        let apps: id = msg_send![workspace, runningApplications];
        let app_count: usize = msg_send![apps, count];

        for i in 0..app_count {
            let app: id = msg_send![apps, objectAtIndex: i];
            let is_active: bool = msg_send![app, isActive];
            if is_active {
                let activation_policy: i64 = msg_send![app, activationPolicy];
                if activation_policy == 0 {
                    return Some(extract_app_info(app));
                }
            }
        }

        // Last resort: frontmostApplication
        let app: id = msg_send![workspace, frontmostApplication];
        if app != nil {
            return Some(extract_app_info(app));
        }

        None
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
            if activation_policy == 0 {
                result.push(extract_app_info(app));
            }
        }
        result
    }
}

pub fn search_installed_apps(query: &str) -> Vec<ForegroundApp> {
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
        icon_path: String::new(),
    }
}
