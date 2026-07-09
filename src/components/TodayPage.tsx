import { useEffect, useState } from "react";
import { Timer, Flame, Zap } from "lucide-react";
import { useTimerStore } from "../stores/timerStore";
import { getBindings, getUsageRecords, getSetting, type UsageRecord } from "../lib/tauri";
import { formatDuration, formatTimer } from "../lib/utils";

export default function TodayPage() {
  const { bindings, activeTimers, setBindings } = useTimerStore();
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([]);
  const [pomodoroSettings, setPomodoroSettings] = useState({
    focusMinutes: 25,
    breakMinutes: 5,
    longBreakMinutes: 15,
    longBreakInterval: 4,
  });

  useEffect(() => {
    getBindings().then(setBindings).catch(console.error);
  }, [setBindings]);

  // Load pomodoro settings
  useEffect(() => {
    Promise.all([
      getSetting("focus_minutes"),
      getSetting("break_minutes"),
      getSetting("long_break_minutes"),
      getSetting("long_break_interval"),
    ]).then(([focus, brk, longBreak, interval]) => {
      setPomodoroSettings({
        focusMinutes: focus ? Number(focus) : 25,
        breakMinutes: brk ? Number(brk) : 5,
        longBreakMinutes: longBreak ? Number(longBreak) : 15,
        longBreakInterval: interval ? Number(interval) : 4,
      });
    });
  }, []);

  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const today = `${year}-${month}-${day}`;

    getUsageRecords(today).then(setUsageRecords).catch(console.error);

    const interval = setInterval(() => {
      getUsageRecords(today).then(setUsageRecords).catch(console.error);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const today = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  // Calculate stats
  const timerEntries = Object.values(activeTimers).filter(Boolean);
  const totalElapsed =
    usageRecords.reduce((sum, r) => sum + r.durationSeconds, 0) +
    timerEntries.reduce((sum, t) => sum + (t?.elapsedSeconds ?? 0), 0);
  const activeCount = timerEntries.filter((t) => t?.isRunning).length;
  const totalPomodoros = timerEntries.reduce(
    (sum, t) => sum + (t?.sessionCount ?? 0),
    0
  );

  // Get active timer for big display
  const activeTimer = timerEntries.find((t) => t?.isRunning) ?? timerEntries[0];
  const activeBinding = activeTimer
    ? bindings.find((b) => b.id === activeTimer.bindingId)
    : null;

  // Pomodoro state
  const pomState = activeTimer?.pomodoroState ?? "idle";
  const pomColor = getPomodoroColor(pomState);
  const remaining = activeTimer?.pomodoroRemaining ?? 0;
  const phaseTotal = getPhaseTotal(pomState, pomodoroSettings);
  const progress = phaseTotal > 0 ? ((phaseTotal - remaining) / phaseTotal) * 100 : 0;

  return (
    <div className="h-full flex items-center justify-center">
      <div className="w-full max-w-[600px] px-10 py-16 animate-fade-in">
        {/* Date */}
        <div className="text-center mb-12">
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            {today}
          </p>
        </div>

        {/* Big Timer Circle */}
        <div className="flex justify-center mb-16">
          <div className="relative w-[320px] h-[320px]">
            {/* Background circle */}
            <svg className="w-full h-full -rotate-90" viewBox="0 0 320 320">
              <circle
                cx="160"
                cy="160"
                r="140"
                fill="none"
                stroke="var(--bg-tertiary)"
                strokeWidth="12"
              />
              {/* Progress circle */}
              <circle
                cx="160"
                cy="160"
                r="140"
                fill="none"
                stroke={pomColor}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 140}`}
                strokeDashoffset={`${2 * Math.PI * 140 * (1 - progress / 100)}`}
                style={{
                  transition: "stroke-dashoffset 1s ease-out, stroke 0.3s ease",
                  filter: `drop-shadow(0 0 16px ${pomColor}40)`,
                }}
              />
            </svg>

            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="text-8xl font-mono font-bold tabular-nums"
                style={{ color: pomColor }}
              >
                {formatTimer(remaining)}
              </span>
              <span
                className="text-sm mt-4 px-5 py-2 rounded-full font-medium"
                style={{
                  background: `${pomColor}15`,
                  color: pomColor,
                }}
              >
                {getPomodoroLabel(pomState)}
              </span>
              {activeBinding && (
                <span
                  className="text-xs mt-3"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {activeBinding.appName} · #{activeTimer?.pomodoroIndex ?? 0}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-3 gap-5">
          <StatCard
            icon={<Timer size={20} />}
            label="总专注"
            value={formatDuration(totalElapsed)}
            color="var(--accent-focus)"
          />
          <StatCard
            icon={<Flame size={20} />}
            label="番茄"
            value={`${totalPomodoros}`}
            color="var(--accent-break)"
          />
          <StatCard
            icon={<Zap size={20} />}
            label="活跃"
            value={`${activeCount}`}
            color="var(--accent-warning)"
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      className="rounded-2xl p-5 text-center"
      style={{ background: "var(--bg-secondary)" }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3"
        style={{ background: `${color}20`, color }}
      >
        {icon}
      </div>
      <div
        className="text-2xl font-semibold mb-1"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </div>
      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </div>
    </div>
  );
}

function getPomodoroColor(state: string): string {
  switch (state) {
    case "focus": return "var(--accent-focus)";
    case "break": return "var(--accent-break)";
    case "longBreak": return "var(--accent-long-break)";
    default: return "var(--accent-pause)";
  }
}

function getPomodoroLabel(state: string): string {
  switch (state) {
    case "focus": return "专注中";
    case "break": return "短休息";
    case "longBreak": return "长休息";
    default: return "就绪";
  }
}

function getPhaseTotal(state: string, settings: { focusMinutes: number; breakMinutes: number; longBreakMinutes: number }): number {
  switch (state) {
    case "focus": return settings.focusMinutes * 60;
    case "break": return settings.breakMinutes * 60;
    case "longBreak": return settings.longBreakMinutes * 60;
    default: return 0;
  }
}
