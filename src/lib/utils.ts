import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, "0")}m`;
  }
  return `${m}m`;
}

export function formatTimer(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function getPomodoroColor(state: string): string {
  switch (state) {
    case "focus":
      return "#3b82f6";
    case "break":
    case "longBreak":
      return "#22c55e";
    default:
      return "#6b7280";
  }
}

export function getPomodoroLabel(state: string): string {
  switch (state) {
    case "focus":
      return "专注中";
    case "break":
      return "短休息";
    case "longBreak":
      return "长休息";
    default:
      return "就绪";
  }
}
