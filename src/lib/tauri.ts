import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
  bundleId: string;
  iconPath: string;
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

// ── Timer commands ──

export interface TimerUpdate {
  binding_id: string;
  app_name: string;
  elapsed_seconds: number;
  is_running: boolean;
}

export async function getTimerStates(): Promise<TimerUpdate[]> {
  return invoke("get_timer_states");
}

// ── Events ──

export function onTimerUpdate(callback: (update: TimerUpdate) => void) {
  return listen<TimerUpdate>("timer-update", (event) => {
    callback(event.payload);
  });
}

export function onAppChanged(
  callback: (info: {
    app_name: string;
    bundle_id: string;
    matched_binding_id: string | null;
  }) => void
) {
  return listen<{
    app_name: string;
    bundle_id: string;
    matched_binding_id: string | null;
  }>("app-changed", (event) => {
    callback(event.payload);
  });
}

// ── Usage records ──

export interface UsageRecord {
  id: string;
  binding_id: string;
  start_time: number;
  end_time: number | null;
  duration_seconds: number;
  session_date: string;
  created_at: number;
}

export async function getUsageRecords(date: string): Promise<UsageRecord[]> {
  return invoke("get_usage_records", { date });
}
