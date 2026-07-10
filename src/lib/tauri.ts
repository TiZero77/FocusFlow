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

export async function updateBinding(params: {
  id: string;
  appName?: string;
  trackingEnabled?: boolean;
  pomodoroEnabled?: boolean;
  focusMinutes?: number;
  breakMinutes?: number;
  longBreakMinutes?: number;
  longBreakInterval?: number;
}): Promise<AppBinding> {
  return invoke("update_binding", {
    id: params.id,
    appName: params.appName ?? null,
    trackingEnabled: params.trackingEnabled ?? null,
    pomodoroEnabled: params.pomodoroEnabled ?? null,
    focusMinutes: params.focusMinutes ?? null,
    breakMinutes: params.breakMinutes ?? null,
    longBreakMinutes: params.longBreakMinutes ?? null,
    longBreakInterval: params.longBreakInterval ?? null,
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
  bindingId: string;
  appName: string;
  elapsedSeconds: number;
  isRunning: boolean;
}

export async function getTimerStates(): Promise<TimerUpdate[]> {
  return invoke("get_timer_states");
}

export interface PomodoroStateUpdate {
  bindingId: string;
  state: string;
  remainingSeconds: number;
  plannedDurationSeconds: number;
  pomodoroIndex: number;
  sessionCount: number;
}

export async function getPomodoroStates(): Promise<PomodoroStateUpdate[]> {
  return invoke("get_pomodoro_states");
}

// ── Events ──

export function onTimerUpdate(callback: (update: TimerUpdate) => void) {
  return listen<TimerUpdate>("timer-update", (event) => {
    callback(event.payload);
  });
}

export function onAppChanged(
  callback: (info: {
    appName: string;
    bundleId: string;
    matchedBindingId: string | null;
  }) => void
) {
  return listen<{
    appName: string;
    bundleId: string;
    matchedBindingId: string | null;
  }>("app-changed", (event) => {
    callback(event.payload);
  });
}

// ── Usage records ──

export interface UsageRecord {
  id: string;
  bindingId: string;
  startTime: number;
  endTime: number | null;
  durationSeconds: number;
  sessionDate: string;
  createdAt: number;
}

export async function getUsageRecords(date: string): Promise<UsageRecord[]> {
  return invoke("get_usage_records", { date });
}

export async function getUsageRange(startDate: string, endDate: string): Promise<UsageRecord[]> {
  return invoke("get_usage_range", { startDate, endDate });
}

// ── Settings ──

export async function getSetting(key: string): Promise<string | null> {
  return invoke("get_setting", { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  return invoke("set_setting", { key, value });
}

export async function clearAllData(): Promise<void> {
  return invoke("clear_all_data");
}
