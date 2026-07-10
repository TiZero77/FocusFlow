import { useEffect, useState } from "react";
import { Timer, Flame, Zap, BarChart3, Clock } from "lucide-react";
import { useTimerStore } from "../stores/timerStore";
import { getBindings, getUsageRecords, type UsageRecord } from "../lib/tauri";
import { formatDuration, formatTimer, getPomodoroColor } from "../lib/utils";
import DailyUsageCard from "./DailyUsageCard";
import TrendsPreview from "./TrendsPreview";

export default function TodayPage() {
  const { bindings, activeTimers, setBindings, selectedBindingId } = useTimerStore();
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([]);
  const [activeTab, setActiveTab] = useState<"timer" | "usage">("timer");

  useEffect(() => {
    getBindings().then(setBindings).catch(console.error);
  }, [setBindings]);

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
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
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

  // Get active timer for big display — prefer selected binding, then first running, then first entry
  const activeTimer =
    (selectedBindingId ? timerEntries.find((t) => t?.bindingId === selectedBindingId) : null) ??
    timerEntries.find((t) => t?.isRunning) ??
    timerEntries[0];
  const activeBinding = activeTimer
    ? bindings.find((b) => b.id === activeTimer.bindingId)
    : null;

  // Pomodoro state
  const pomState = activeTimer?.pomodoroState ?? "idle";
  const pomColor = getPomodoroColor(pomState);
  const remaining = activeTimer?.pomodoroRemaining ?? 0;
  const phaseTotal = activeTimer?.pomodoroPlannedDuration ?? 0;
  const progress = phaseTotal > 0 ? ((phaseTotal - remaining) / phaseTotal) * 100 : 0;

  // Whether the active binding uses pomodoro mode
  const isPomodoroMode = activeBinding?.pomodoroEnabled !== false;
  const activeElapsed = activeTimer?.elapsedSeconds ?? 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full max-w-[720px] mx-auto px-12 py-12 animate-fade-in">
        {/* Tab Card */}
        <div className="rounded-3xl overflow-hidden animate-slide-up mb-8 card-hover" style={{ background: "var(--bg-secondary)" }}>
          {/* Tab Bar */}
          <div className="flex items-center justify-between px-7 pt-5 pb-0">
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab("timer")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200"
                style={{
                  background: activeTab === "timer" ? "var(--bg-tertiary)" : "transparent",
                  color: activeTab === "timer" ? "var(--text-primary)" : "var(--text-tertiary)",
                }}
              >
                {isPomodoroMode ? <Timer size={16} /> : <BarChart3 size={16} />}
                {isPomodoroMode ? "番茄钟" : "使用时长"}
              </button>
              <button
                onClick={() => setActiveTab("usage")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200"
                style={{
                  background: activeTab === "usage" ? "var(--bg-tertiary)" : "transparent",
                  color: activeTab === "usage" ? "var(--text-primary)" : "var(--text-tertiary)",
                }}
              >
                <BarChart3 size={16} />
                今日使用
              </button>
            </div>
            {/* Date */}
            <span
              className="font-mono text-xs tracking-wide"
              style={{ color: "var(--text-tertiary)" }}
            >
              {today}
            </span>
          </div>

          {/* Tab Content */}
          <div className="p-7 pt-5">
            {activeTab === "timer" ? (
              isPomodoroMode ? (
                /* Pomodoro Timer */
                <div className="flex justify-center">
                  <div className="relative w-[300px] h-[300px]">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 300 300">
                      <circle cx="150" cy="150" r="128" fill="none" stroke="var(--bg-tertiary)" strokeWidth="12" />
                      <circle
                        cx="150" cy="150" r="128"
                        fill="none" stroke={pomColor} strokeWidth="12" strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 128}`}
                        strokeDashoffset={`${2 * Math.PI * 128 * (1 - progress / 100)}`}
                        style={{ transition: "stroke-dashoffset 1s ease-out, stroke 0.3s ease", filter: `drop-shadow(0 0 16px ${pomColor}40)` }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pt-8">
                      <span className="text-7xl font-mono font-bold tabular-nums" style={{ color: pomColor }}>
                        {formatTimer(remaining)}
                      </span>
                      <span
                        className="text-sm mt-3 px-5 py-2 rounded-full font-medium"
                        style={{ background: `${pomColor}15`, color: pomColor }}
                      >
                        {getPomodoroLabel(pomState)}
                      </span>
                      {activeBinding && (
                        <span className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
                          {activeBinding.appName} · #{activeTimer?.pomodoroIndex ?? 0}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Usage Time Display (pomodoro disabled) */
                <div className="flex justify-center">
                  <div className="relative w-[300px] h-[300px]">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 300 300">
                      <circle cx="150" cy="150" r="128" fill="none" stroke="var(--bg-tertiary)" strokeWidth="12" />
                      <circle
                        cx="150" cy="150" r="128"
                        fill="none" stroke="var(--accent-focus)" strokeWidth="12" strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 128}`}
                        strokeDashoffset={`${2 * Math.PI * 128 * (1 - Math.min(100, (activeElapsed / 28800) * 100) / 100)}`}
                        style={{ transition: "stroke-dashoffset 1s ease-out", filter: "drop-shadow(0 0 16px var(--accent-focus)40)" }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pt-8">
                      <span className="text-6xl font-mono font-bold tabular-nums" style={{ color: "var(--accent-focus)" }}>
                        {formatDuration(activeElapsed)}
                      </span>
                      <span
                        className="text-sm mt-3 px-5 py-2 rounded-full font-medium"
                        style={{ background: "var(--accent-focus)15", color: "var(--accent-focus)" }}
                      >
                        {activeTimer?.isRunning ? "使用中" : "已暂停"}
                      </span>
                      {activeBinding && (
                        <span className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
                          {activeBinding.appName} · 纯计时模式
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            ) : (
              /* Daily Usage */
              <DailyUsageCard embedded />
            )}
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {isPomodoroMode ? (
            <>
              <StatCard
                icon={<Timer size={18} />}
                label="总专注"
                value={formatDuration(totalElapsed)}
                color="var(--accent-focus)"
              />
              <StatCard
                icon={<Flame size={18} />}
                label="番茄"
                value={`${totalPomodoros}`}
                color="var(--accent-break)"
              />
              <StatCard
                icon={<Zap size={18} />}
                label="活跃"
                value={`${activeCount}`}
                color="var(--accent-warning)"
              />
            </>
          ) : (
            <>
              <StatCard
                icon={<BarChart3 size={18} />}
                label="总时长"
                value={formatDuration(totalElapsed)}
                color="var(--accent-focus)"
              />
              <StatCard
                icon={<Clock size={18} />}
                label="今日"
                value={formatDuration(totalElapsed)}
                color="var(--accent-break)"
              />
              <StatCard
                icon={<Zap size={18} />}
                label="活跃"
                value={`${activeCount}`}
                color="var(--accent-warning)"
              />
            </>
          )}
        </div>

        {/* Trends Preview */}
        <TrendsPreview />

        {/* 底部留白 */}
        <div className="h-10" />
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
      className="rounded-2xl p-4 text-center card-hover"
      style={{ background: "var(--bg-secondary)" }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center mx-auto mb-2"
        style={{ background: `${color}20`, color }}
      >
        {icon}
      </div>
      <div
        className="text-xl font-semibold mb-0.5"
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

function getPomodoroLabel(state: string): string {
  switch (state) {
    case "focus": return "专注中";
    case "break": return "短休息";
    case "longBreak": return "长休息";
    default: return "就绪";
  }
}

