import { invoke } from "@tauri-apps/api/core";
import type { AppBinding } from "../stores/timerStore";

// ── Binding commands ──

export async function getBindings(): Promise<AppBinding[]> {
  return invoke("get_bindings");
}

export async function createBinding(params: {
  appName: string;
  bundleId: string;
  iconPath?: string;
}): Promise<AppBinding> {
  return invoke("create_binding", {
    appName: params.appName,
    bundleId: params.bundleId,
    iconPath: params.iconPath ?? "",
  });
}

export async function deleteBinding(id: string): Promise<void> {
  return invoke("delete_binding", { id });
}

// ── Monitor commands ──

export interface ForegroundApp {
  name: string;
  bundle_id: string;
  icon_path: string;
}

export async function getCurrentApp(): Promise<ForegroundApp | null> {
  return invoke("get_current_app");
}

export async function getRunningApps(): Promise<ForegroundApp[]> {
  return invoke("get_running_apps");
}

export async function searchInstalledApps(
  query: string
): Promise<ForegroundApp[]> {
  return invoke("search_installed_apps", { query });
}
