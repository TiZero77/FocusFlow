import { useEffect } from "react";
import { Timer, Flame, Zap, Coffee } from "lucide-react";
import { useTimerStore } from "../stores/timerStore";
import { getBindings } from "../lib/tauri";
import { formatDuration, formatTimer } from "../lib/utils";

export default function TodayPage() {
  const { bindings, activeTimers, setBindings } = useTimerStore();

  useEffect(() => {
    getBindings().then(setBindings).catch(console.error);
  }, [setBindings]);

  const today = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  // Calculate stats
  const timerEntries = Object.values(activeTimers).filter(Boolean);
  const totalElapsed = timerEntries.reduce(
    (sum, t) => sum + (t?.elapsedSeconds ?? 0),
    0
  );
  const activeCount = timerEntries.filter((t) => t?.isRunning).length;
  const totalPomodoros = timerEntries.reduce(
    (sum, t) => sum + (t?.sessionCount ?? 0),
    0
  );

  return (
    <div className="p-8 max-w-[960px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1
          className="text-2xl font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          今日总览
        </h1>
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {today}
        </span>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard
          icon={<Timer size={20} />}
          label="总专注时长"
          value={formatDuration(totalElapsed)}
          color="var(--accent-focus)"
        />
        <StatCard
          icon={<Flame size={20} />}
          label="完成番茄"
          value={`${totalPomodoros} 个`}
          color="var(--accent-break)"
        />
        <StatCard
          icon={<Zap size={20} />}
          label="活跃 App"
          value={`${activeCount} 个`}
          color="var(--accent-warning)"
        />
      </div>

      {/* Active Timers */}
      {timerEntries.length > 0 && (
        <div
          className="rounded-xl p-6 mb-6"
          style={{ background: "var(--bg-secondary)" }}
        >
          <h2
            className="text-sm font-medium mb-4"
            style={{ color: "var(--text-secondary)" }}
          >
            实时计时
          </h2>
          <div className="flex flex-col gap-2">
            {timerEntries.map((timer) => {
              if (!timer) return null;

              const pomColor = getPomodoroColor(timer.pomodoroState);
              const pomLabel = getPomodoroLabel(timer.pomodoroState);

              return (
                <div
                  key={timer.bindingId}
                  className="flex items-center gap-4 px-4 py-3 rounded-xl transition-colors"
                  style={{ background: "var(--bg-tertiary)" }}
                >
                  {/* Status dot */}
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{
                      background: timer.isRunning ? pomColor : "var(--accent-pause)",
                      boxShadow: timer.isRunning
                        ? `0 0 8px ${pomColor}60`
                        : "none",
                    }}
                  />

                  {/* App name + pomodoro state */}
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-medium truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {timer.appName}
                    </div>
                    <div
                      className="text-xs flex items-center gap-1.5"
                      style={{ color: pomColor }}
                    >
                      {timer.pomodoroState === "break" ||
                      timer.pomodoroState === "longBreak" ? (
                        <Coffee size={12} />
                      ) : (
                        <Flame size={12} />
                      )}
                      {pomLabel} · #{timer.pomodoroIndex}
                    </div>
                  </div>

                  {/* Pomodoro progress bar */}
                  {timer.pomodoroState !== "idle" && (
                    <div className="w-24 h-1.5 rounded-full overflow-hidden"
                      style={{ background: "var(--bg-primary)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{
                          width: `${getPomodoroProgress(timer)}%`,
                          background: pomColor,
                        }}
                      />
                    </div>
                  )}

                  {/* Timer */}
                  <span
                    className="text-lg font-mono font-semibold tabular-nums w-16 text-right"
                    style={{ color: pomColor }}
                  >
                    {formatTimer(timer.elapsedSeconds)}
                  </span>

                  {/* Pomodoro remaining */}
                  {timer.pomodoroState !== "idle" && (
                    <span
                      className="text-xs font-mono tabular-nums w-12 text-right"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {formatTimer(timer.pomodoroRemaining)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div
        className="rounded-xl p-6 mb-6"
        style={{ background: "var(--bg-secondary)" }}
      >
        <h2
          className="text-sm font-medium mb-4"
          style={{ color: "var(--text-secondary)" }}
        >
          时间线
        </h2>
        <div
          className="flex items-center justify-center h-32 rounded-lg"
          style={{ background: "var(--bg-tertiary)" }}
        >
          <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            {bindings.length > 0
              ? "数据积累后显示时间线"
              : "绑定 app 后开始记录"}
          </span>
        </div>
      </div>

      {/* App Ranking */}
      <div
        className="rounded-xl p-6"
        style={{ background: "var(--bg-secondary)" }}
      >
        <h2
          className="text-sm font-medium mb-4"
          style={{ color: "var(--text-secondary)" }}
        >
          App 排行
        </h2>
        <div
          className="flex items-center justify-center h-32 rounded-lg"
          style={{ background: "var(--bg-tertiary)" }}
        >
          <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            暂无数据
          </span>
        </div>
      </div>
    </div>
  );
}

function getPomodoroColor(state: string): string {
  switch (state) {
    case "focus":
      return "var(--accent-focus)";
    case "break":
    case "longBreak":
      return "var(--accent-break)";
    default:
      return "var(--accent-pause)";
  }
}

function getPomodoroLabel(state: string): string {
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

function getPomodoroProgress(timer: {
  pomodoroState: string;
  pomodoroRemaining: number;
  bindingId: string;
}): number {
  // We need the total duration to calculate progress.
  // For now, estimate from remaining — this could be improved with total duration tracking.
  if (timer.pomodoroRemaining <= 0) return 100;
  // Show remaining as a countdown (inverted progress)
  return 0;
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
      className="rounded-xl p-5"
      style={{ background: "var(--bg-secondary)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}20`, color }}
        >
          {icon}
        </div>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {label}
        </span>
      </div>
      <div
        className="text-2xl font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </div>
    </div>
  );
}
