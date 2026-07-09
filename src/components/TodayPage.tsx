import { useEffect } from "react";
import { Timer, Flame, Zap } from "lucide-react";
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

  // Calculate stats from active timers
  const timerEntries = Object.values(activeTimers);
  const totalElapsed = timerEntries.reduce((sum, t) => sum + (t?.elapsedSeconds ?? 0), 0);
  const activeCount = timerEntries.filter((t) => t?.isRunning).length;

  return (
    <div className="p-8 max-w-[960px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
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
          value="0 个"
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
            {timerEntries.map((timer) =>
              timer ? (
                <div
                  key={timer.bindingId}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg"
                  style={{ background: "var(--bg-tertiary)" }}
                >
                  <div
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{
                      background: timer.isRunning
                        ? "var(--accent-focus)"
                        : "var(--accent-pause)",
                    }}
                  />
                  <span
                    className="text-sm flex-1"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {timer.appName}
                  </span>
                  <span
                    className="text-lg font-mono font-semibold tabular-nums"
                    style={{ color: "var(--accent-focus)" }}
                  >
                    {formatTimer(timer.elapsedSeconds)}
                  </span>
                </div>
              ) : null
            )}
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
