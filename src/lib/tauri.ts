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

// ── Task Group commands ──

export interface TaskGroup {
  id: string;
  name: string;
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
  createdAt: number;
  bindings: AppBinding[];
}

export async function getTaskGroups(): Promise<TaskGroup[]> {
  return invoke("get_task_groups");
}

export async function createTaskGroup(params: {
  name: string;
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
}): Promise<TaskGroup> {
  return invoke("create_task_group", {
    name: params.name,
    focusMinutes: params.focusMinutes,
    breakMinutes: params.breakMinutes,
    longBreakMinutes: params.longBreakMinutes,
    longBreakInterval: params.longBreakInterval,
  });
}

export async function updateTaskGroup(params: {
  id: string;
  name?: string;
  focusMinutes?: number;
  breakMinutes?: number;
  longBreakMinutes?: number;
  longBreakInterval?: number;
}): Promise<TaskGroup> {
  return invoke("update_task_group", {
    id: params.id,
    name: params.name ?? null,
    focusMinutes: params.focusMinutes ?? null,
    breakMinutes: params.breakMinutes ?? null,
    longBreakMinutes: params.longBreakMinutes ?? null,
    longBreakInterval: params.longBreakInterval ?? null,
  });
}

export async function deleteTaskGroup(id: string): Promise<void> {
  return invoke("delete_task_group", { id });
}

export async function addBindingToGroup(groupId: string, bindingId: string): Promise<void> {
  return invoke("add_binding_to_group", { groupId, bindingId });
}

export async function removeBindingFromGroup(bindingId: string): Promise<void> {
  return invoke("remove_binding_from_group", { bindingId });
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
  isPaused: boolean;
  taskGroupId?: string;
  bindingElapsed?: Record<string, number>;
}

export async function getPomodoroStates(): Promise<PomodoroStateUpdate[]> {
  return invoke("get_pomodoro_states");
}

export async function togglePomodoroPause(bindingId: string): Promise<boolean> {
  return invoke("toggle_pomodoro_pause", { bindingId });
}

export async function markRottenTomato(): Promise<boolean> {
  return invoke("mark_rotten_tomato");
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

// ── Pomodoro Sessions ──

export interface PomodoroSession {
  id: string;
  bindingId: string;
  sessionType: string;
  plannedDurationSeconds: number;
  actualDurationSeconds: number;
  completed: boolean;
  interruptedBy: string | null;
  startedAt: number;
  endedAt: number | null;
  pomodoroIndex: number;
  createdAt: number;
}

export async function getPomodoroRange(startTs: number, endTs: number): Promise<PomodoroSession[]> {
  return invoke("get_pomodoro_range", { startTs, endTs });
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
