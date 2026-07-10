import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h}h${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/** 精简格式，如 "4h32m"（不带空格） */
export function formatDurationCompact(seconds: number): string {
  return formatDuration(seconds);
}

/** 热力图 5 级颜色 — 按主题适配 */
const HEATMAP_PALETTES: Record<string, { empty: string; levels: [string, string, string, string] }> = {
  warm:   { empty: "#3a3532", levels: ["#5c3d20", "#8a5a28", "#c07a2e", "#F97316"] },
  crimson:{ empty: "#1a1515", levels: ["#5c1a1a", "#8a2525", "#c03030", "#E53935"] },
  celadon:{ empty: "#d5d0cb", levels: ["#a7d5d0", "#5fb8ad", "#2d9e92", "#0D9488"] },
};

function getThemePalette() {
  const theme = document.documentElement.getAttribute("data-theme") ?? "warm";
  return HEATMAP_PALETTES[theme] ?? HEATMAP_PALETTES.warm;
}

export function getHeatmapColor(seconds: number, maxSeconds: number): string {
  const pal = getThemePalette();
  if (seconds <= 0 || maxSeconds <= 0) return pal.empty;
  const ratio = seconds / maxSeconds;
  if (ratio <= 0.25) return pal.levels[0];
  if (ratio <= 0.50) return pal.levels[1];
  if (ratio <= 0.75) return pal.levels[2];
  return pal.levels[3];
}

/** 获取当前主题的热力图图例颜色 */
export function getHeatmapLegendColors(): string[] {
  const pal = getThemePalette();
  return [pal.empty, ...pal.levels];
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

/** 番茄钟颜色 — 主题感知 hex 值（支持字符串拼接 alpha） */
const POM_COLORS: Record<string, { warm: string; crimson: string; celadon: string }> = {
  focus:     { warm: "#F97316", crimson: "#C62828", celadon: "#0D9488" },
  break:     { warm: "#22C55E", crimson: "#EF5350", celadon: "#14B8A6" },
  longBreak: { warm: "#A78BFA", crimson: "#AD1457", celadon: "#2563EB" },
  idle:      { warm: "#78716C", crimson: "#616161", celadon: "#9CA3AF" },
};

export function getPomodoroColor(state: string): string {
  const theme = document.documentElement.getAttribute("data-theme");
  const key = (theme === "crimson" || theme === "celadon") ? theme : "warm";
  return POM_COLORS[state]?.[key] ?? POM_COLORS.idle[key];
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
