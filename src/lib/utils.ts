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

/** 精简格式，如 "4h32m"（不带空格） */
export function formatDurationCompact(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return `${h}h${m.toString().padStart(2, "0")}m`;
  }
  return `${m}m`;
}

/** 获取最近 N 天的日期字符串数组（含今天），从旧到新排列 */
export function getRecentDates(days: number): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(formatDate(d));
  }
  return dates;
}

/** 获取当月所有日期字符串 */
export function getMonthDates(): string[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dates: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    dates.push(formatDate(d));
  }
  return dates;
}

/** 获取最近 12 个月的 "YYYY-MM" 字符串 */
export function getRecentMonths(): string[] {
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

/** 格式化日期为 "YYYY-MM-DD" */
export function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
