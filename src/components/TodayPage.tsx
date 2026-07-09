import { useEffect, useState } from "react";
import { Timer, Flame, Zap } from "lucide-react";
import { useTimerStore } from "../stores/timerStore";
import { getBindings, getUsageRecords, type UsageRecord } from "../lib/tauri";
import { formatDuration, formatTimer, getPomodoroColor, getPomodoroLabel } from "../lib/utils";

export default function TodayPage() {
  const { bindings, activeTimers, setBindings } = useTimerStore();
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([]);

  useEffect(() => {
    getBindings().then(setBindings).catch(console.error);
  }, [setBindings]);

  // Fetch today's usage records
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    getUsageRecords(today).then(setUsageRecords).catch(console.error);

    // Refresh every 30 seconds
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

  // Calculate stats from usage records + active timers
  const timerEntries = Object.values(activeTimers).filter(Boolean);
  const totalElapsed =
    usageRecords.reduce((sum, r) => sum + r.durationSeconds, 0) +
    timerEntries.reduce((sum, t) => sum + (t?.elapsedSeconds ?? 0), 0);
  const activeCount = timerEntries.filter((t) => t?.isRunning).length;
  const totalPomodoros = timerEntries.reduce(
    (sum, t) => sum + (t?.sessionCount ?? 0),
    0
  );

  // Aggregate usage by binding
  const usageByBinding = new Map<string, number>();
  for (const record of usageRecords) {
    usageByBinding.set(
      record.bindingId,
      (usageByBinding.get(record.bindingId) ?? 0) + record.durationSeconds
    );
  }
  // Add active timer elapsed
  for (const timer of timerEntries) {
    if (timer) {
      usageByBinding.set(
        timer.bindingId,
        (usageByBinding.get(timer.bindingId) ?? 0) + timer.elapsedSeconds
      );
    }
  }

  // Build app ranking
  const ranking = bindings
    .map((b) => ({
      name: b.appName,
      seconds: usageByBinding.get(b.id) ?? 0,
    }))
    .filter((r) => r.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  const maxRankingSeconds = ranking[0]?.seconds ?? 1;

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
              return (
                <div
                  key={timer.bindingId}
                  className="flex items-center gap-4 px-4 py-3 rounded-xl"
                  style={{ background: "var(--bg-tertiary)" }}
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{
                      background: timer.isRunning
                        ? pomColor
                        : "var(--accent-pause)",
                      boxShadow: timer.isRunning
                        ? `0 0 8px ${pomColor}60`
                        : "none",
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-medium truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {timer.appName}
                    </div>
                    <div className="text-xs" style={{ color: pomColor }}>
                      {getPomodoroLabel(timer.pomodoroState)} · #
                      {timer.pomodoroIndex}
                    </div>
                  </div>
                  <span
                    className="text-lg font-mono font-semibold tabular-nums"
                    style={{ color: pomColor }}
                  >
                    {formatTimer(timer.elapsedSeconds)}
                  </span>
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
        {usageRecords.length > 0 ? (
          <TimelineView records={usageRecords} bindings={bindings} />
        ) : (
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
        )}
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
        {ranking.length > 0 ? (
          <div className="flex flex-col gap-3">
            {ranking.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span
                  className="text-xs w-4 text-center"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {i + 1}
                </span>
                <span
                  className="text-sm flex-1"
                  style={{ color: "var(--text-primary)" }}
                >
                  {item.name}
                </span>
                <div
                  className="w-32 h-2 rounded-full overflow-hidden"
                  style={{ background: "var(--bg-tertiary)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(item.seconds / maxRankingSeconds) * 100}%`,
                      background: "var(--accent-focus)",
                    }}
                  />
                </div>
                <span
                  className="text-xs font-mono tabular-nums w-14 text-right"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {formatDuration(item.seconds)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="flex items-center justify-center h-32 rounded-lg"
            style={{ background: "var(--bg-tertiary)" }}
          >
            <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              暂无数据
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Timeline View ──
function TimelineView({
  records,
  bindings,
}: {
  records: UsageRecord[];
  bindings: { id: string; appName: string }[];
}) {
  const bindingMap = new Map(bindings.map((b) => [b.id, b.appName]));

  // Group by hour
  const hours = new Map<number, { name: string; seconds: number }[]>();
  for (const record of records) {
    const startDate = new Date(record.startTime * 1000);
    const hour = startDate.getHours();
    if (!hours.has(hour)) hours.set(hour, []);
    const existing = hours.get(hour)!.find((e) => e.name === bindingMap.get(record.bindingId));
    if (existing) {
      existing.seconds += record.durationSeconds;
    } else {
      hours.get(hour)!.push({
        name: bindingMap.get(record.bindingId) ?? "Unknown",
        seconds: record.durationSeconds,
      });
    }
  }

  const maxSeconds = Math.max(
    ...Array.from(hours.values())
      .flat()
      .map((e) => e.seconds),
    1
  );

  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 24 }, (_, h) => h)
        .filter((h) => hours.has(h))
        .map((hour) => (
          <div key={hour} className="flex items-center gap-3">
            <span
              className="text-xs font-mono w-8 text-right"
              style={{ color: "var(--text-tertiary)" }}
            >
              {hour.toString().padStart(2, "0")}:00
            </span>
            <div className="flex-1 flex gap-1 h-5">
              {hours.get(hour)?.map((entry, i) => (
                <div
                  key={i}
                  className="h-full rounded-sm"
                  style={{
                    width: `${(entry.seconds / maxSeconds) * 100}%`,
                    background: "var(--accent-focus)",
                    minWidth: "2px",
                  }}
                  title={`${entry.name}: ${formatDuration(entry.seconds)}`}
                />
              ))}
            </div>
          </div>
        ))}
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
