import { useEffect, useState, useMemo } from "react";
import { getPomodoroRange, getBindings, type PomodoroSession, type AppBinding } from "../lib/tauri";
import { formatDuration, formatDate, getPomodoroColor } from "../lib/utils";

// ── Types ──

interface DailyStats {
  date: string;
  completed: number;
  rotten: number;
}

// ── Helpers ──

function isRotten(s: PomodoroSession): boolean {
  return !s.completed && s.interruptedBy === "user_close";
}

function isCompleted(s: PomodoroSession): boolean {
  return s.completed && s.sessionType === "focus";
}

function getTomatoMood(completed: number, rotten: number): { emoji: string; label: string; color: string } {
  if (completed === 0 && rotten === 0) return { emoji: "😴", label: "还没开始呢", color: "var(--text-tertiary)" };
  const total = completed + rotten;
  const rate = completed / total;
  if (rate >= 0.8) return { emoji: "🍅", label: "状态绝佳！", color: getPomodoroColor("focus") };
  if (rate >= 0.5) return { emoji: "🍅", label: "还不错", color: getPomodoroColor("break") };
  if (rotten > 0) return { emoji: "🥀", label: "有点可惜", color: getPomodoroColor("longBreak") };
  return { emoji: "🍅", label: "继续加油", color: "var(--text-secondary)" };
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function getWeekday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
}

function getRecentDates(days: number): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(formatDate(d));
  }
  return dates;
}

// ── Sub Components ──

function StatsCard({
  icon,
  label,
  value,
  color,
  delay,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  delay: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 card-hover animate-slide-up"
      style={{ background: "var(--bg-secondary)", animationDelay: delay }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">{icon}</span>
        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      </div>
      <div className="text-lg font-semibold" style={{ color }}>{value}</div>
    </div>
  );
}

function SectionCard({
  title,
  delay,
  children,
}: {
  title: string;
  delay: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-3xl p-8 mb-8 animate-slide-up"
      style={{ background: "var(--bg-secondary)", animationDelay: delay }}
    >
      <div className="flex items-center justify-between mb-6">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

// ── Main Component ──

export default function PomodoroPage() {
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);
  const [bindings, setBindings] = useState<AppBinding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const now = new Date();
        const start = new Date(now);
        start.setDate(start.getDate() - 30);

        const [sess, binds] = await Promise.all([
          getPomodoroRange(
            Math.floor(start.getTime() / 1000),
            Math.floor(now.getTime() / 1000)
          ),
          getBindings(),
        ]);
        setSessions(sess);
        setBindings(binds);
      } catch (err) {
        console.error("Failed to load pomodoro data:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const bindingMap = useMemo(() => {
    const m = new Map<string, AppBinding>();
    for (const b of bindings) m.set(b.id, b);
    return m;
  }, [bindings]);

  // ── Derived Data ──

  const todayStr = formatDate(new Date());

  const todaySessions = useMemo(
    () => sessions.filter((s) => {
      const d = new Date(s.createdAt * 1000);
      return formatDate(d) === todayStr && s.sessionType === "focus";
    }),
    [sessions, todayStr]
  );

  const todayCompleted = todaySessions.filter(isCompleted).length;
  const todayRotten = todaySessions.filter(isRotten).length;
  const mood = getTomatoMood(todayCompleted, todayRotten);
  const todayRate = todayCompleted + todayRotten > 0
    ? Math.round((todayCompleted / (todayCompleted + todayRotten)) * 100)
    : 0;

  // Weekly stats
  const weekDates = getRecentDates(7);
  const weeklyData: DailyStats[] = useMemo(() => {
    return weekDates.map((date) => {
      const daySessions = sessions.filter((s) => {
        const d = new Date(s.createdAt * 1000);
        return formatDate(d) === date && s.sessionType === "focus";
      });
      return {
        date,
        completed: daySessions.filter(isCompleted).length,
        rotten: daySessions.filter(isRotten).length,
      };
    });
  }, [sessions, weekDates]);

  // Total stats
  const allFocusSessions = sessions.filter((s) => s.sessionType === "focus");
  const totalCompleted = allFocusSessions.filter(isCompleted).length;
  const totalRotten = allFocusSessions.filter(isRotten).length;
  const totalFocusSeconds = allFocusSessions
    .filter(isCompleted)
    .reduce((sum, s) => sum + s.actualDurationSeconds, 0);
  const avgFocusMinutes = totalCompleted > 0
    ? Math.round(totalFocusSeconds / totalCompleted / 60)
    : 0;

  // Streak
  const streak = useMemo(() => {
    const dateSet = new Set<string>();
    for (const s of allFocusSessions) {
      if (isCompleted(s)) dateSet.add(formatDate(new Date(s.createdAt * 1000)));
    }
    let current = 0;
    const now = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      if (dateSet.has(formatDate(d))) current++;
      else break;
    }
    return current;
  }, [allFocusSessions]);

  // Timeline
  const timelineSessions = useMemo(() => {
    return todaySessions
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((s) => {
        const app = bindingMap.get(s.bindingId);
        return {
          ...s,
          appName: app?.appName ?? "未知",
          rotten: isRotten(s),
          completed: isCompleted(s),
        };
      });
  }, [todaySessions, bindingMap]);

  // Recent sessions
  const recentSessions = useMemo(() => {
    return sessions
      .filter((s) => s.sessionType === "focus")
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20)
      .map((s) => {
        const app = bindingMap.get(s.bindingId);
        return { ...s, appName: app?.appName ?? "未知" };
      });
  }, [sessions, bindingMap]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: "var(--text-tertiary)" }}>
        加载中...
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* ── Header ── */}
      <h1 className="text-2xl font-semibold mb-8" style={{ color: "var(--text-primary)" }}>
        🍅 番茄日志
      </h1>

      {/* ── Today's Hero Card ── */}
      <div
        className="rounded-3xl p-8 mb-8 card-hover animate-slide-up"
        style={{ background: "var(--bg-secondary)", animationDelay: "50ms" }}
      >
        <div className="flex items-center gap-6">
          {/* Big Tomato */}
          <div className="text-center">
            <div
              className="text-7xl leading-none select-none cursor-default transition-transform duration-300 hover:scale-110 hover:rotate-12"
              title={mood.label}
            >
              {mood.emoji}
            </div>
            <div className="text-xs mt-2 font-medium" style={{ color: mood.color }}>
              {mood.label}
            </div>
          </div>

          {/* Today Stats */}
          <div className="flex-1 space-y-3">
            <div className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              今日番茄
            </div>
            <div className="flex items-end gap-4">
              <div>
                <span className="text-4xl font-bold tabular-nums" style={{ color: getPomodoroColor("focus") }}>
                  {todayCompleted}
                </span>
                <span className="text-sm ml-1" style={{ color: "var(--text-tertiary)" }}>完成</span>
              </div>
              {todayRotten > 0 && (
                <div>
                  <span className="text-4xl font-bold tabular-nums" style={{ color: "var(--accent-danger)" }}>
                    {todayRotten}
                  </span>
                  <span className="text-sm ml-1" style={{ color: "var(--text-tertiary)" }}>烂了</span>
                </div>
              )}
            </div>

            {/* Rate bar */}
            {(todayCompleted + todayRotten) > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${todayRate}%`,
                      background: `linear-gradient(90deg, ${getPomodoroColor("focus")}, ${getPomodoroColor("break")})`,
                    }}
                  />
                </div>
                <span className="text-xs font-mono tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                  {todayRate}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats Cards Row ── */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatsCard icon="🍅" label="总番茄" value={`${totalCompleted}个`} color={getPomodoroColor("focus")} delay="100ms" />
        <StatsCard icon="🥀" label="总烂番茄" value={`${totalRotten}个`} color="var(--accent-danger)" delay="150ms" />
        <StatsCard icon="🔥" label="连续天数" value={`${streak}天`} color={getPomodoroColor("break")} delay="200ms" />
        <StatsCard icon="⏱️" label="平均专注" value={`${avgFocusMinutes}分钟`} color={getPomodoroColor("longBreak")} delay="250ms" />
      </div>

      {/* ── Weekly Tomato Shelf ── */}
      <SectionCard title="本周番茄架" delay="300ms">
        <div className="flex items-end justify-between gap-3 h-40">
          {weeklyData.map((day) => {
            const total = day.completed + day.rotten;
            const isToday = day.date === todayStr;
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5">
                {/* Tomato stack */}
                <div className="flex flex-col-reverse items-center gap-0.5 min-h-[100px] justify-end">
                  {Array.from({ length: day.completed }).map((_, j) => (
                    <span
                      key={`c-${j}`}
                      className="text-xl leading-none select-none transition-transform duration-200 hover:scale-130 cursor-default"
                      title={`完成 #${j + 1}`}
                    >
                      🍅
                    </span>
                  ))}
                  {Array.from({ length: day.rotten }).map((_, j) => (
                    <span
                      key={`r-${j}`}
                      className="text-xl leading-none select-none transition-transform duration-200 hover:scale-130 cursor-default"
                      title={`烂番茄 #${j + 1}`}
                    >
                      🥀
                    </span>
                  ))}
                  {total === 0 && (
                    <span className="text-xl leading-none select-none opacity-15">·</span>
                  )}
                </div>
                {/* Day label */}
                <span
                  className="text-xs font-medium"
                  style={{
                    color: isToday ? getPomodoroColor("focus") : "var(--text-tertiary)",
                    fontWeight: isToday ? 700 : 400,
                  }}
                >
                  {getWeekday(day.date)}
                </span>
                {total > 0 && (
                  <span className="text-[10px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                    {total}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-4 pt-4" style={{ borderTop: "1px solid var(--bg-tertiary)" }}>
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            <span>🍅</span> 完成
          </span>
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            <span>🥀</span> 烂番茄
          </span>
        </div>
      </SectionCard>

      {/* ── Today's Timeline ── */}
      {timelineSessions.length > 0 && (
        <SectionCard title="今日时间线" delay="400ms">
          <div className="rounded-xl p-5" style={{ background: "var(--bg-tertiary)" }}>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {timelineSessions.map((s) => {
                const dur = s.actualDurationSeconds;
                const width = Math.max(56, Math.min(220, dur / 8));
                const color = s.rotten
                  ? "var(--accent-danger)"
                  : s.completed
                    ? getPomodoroColor("focus")
                    : "var(--accent-pause)";
                return (
                  <div
                    key={s.id}
                    className="flex-shrink-0 rounded-xl px-3 py-3 flex flex-col items-center gap-1 cursor-default transition-all duration-200 hover:scale-105 hover:shadow-md"
                    style={{
                      width: `${width}px`,
                      background: `${color}12`,
                      border: `1px solid ${color}25`,
                    }}
                    title={`${s.appName} · ${formatDuration(dur)} · ${s.rotten ? "烂番茄" : s.completed ? "完成" : "进行中"}`}
                  >
                    <span className="text-sm">{s.rotten ? "🥀" : "🍅"}</span>
                    <span className="text-[10px] font-mono tabular-nums" style={{ color }}>
                      {formatDuration(dur)}
                    </span>
                    <span className="text-[9px] truncate w-full text-center" style={{ color: "var(--text-tertiary)" }}>
                      {s.appName}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Recent Sessions ── */}
      <SectionCard title="最近番茄记录" delay="500ms">
        {recentSessions.length === 0 ? (
          <div className="text-center py-12" style={{ color: "var(--text-tertiary)" }}>
            <div className="text-4xl mb-3">🌱</div>
            <div className="text-sm">还没有番茄记录，开始你的第一个番茄吧！</div>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
            <div className="max-h-[400px] overflow-y-auto divide-y" style={{ borderColor: "var(--bg-hover)" }}>
              {recentSessions.map((s) => {
                const dur = s.actualDurationSeconds;
                const rotten = isRotten(s);
                const color = rotten ? "var(--accent-danger)" : getPomodoroColor("focus");
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-4 px-5 py-3.5 transition-colors duration-150"
                    style={{ borderColor: "var(--bg-hover)" }}
                  >
                    {/* Status icon */}
                    <span className="text-lg leading-none select-none">
                      {rotten ? "🥀" : "🍅"}
                    </span>

                    {/* Time */}
                    <span className="text-xs font-mono tabular-nums w-14" style={{ color: "var(--text-tertiary)" }}>
                      {formatTime(s.createdAt)}
                    </span>

                    {/* App name */}
                    <span
                      className="text-sm flex-1 truncate"
                      style={{
                        color: "var(--text-primary)",
                        textDecoration: rotten ? "line-through" : "none",
                        opacity: rotten ? 0.6 : 1,
                      }}
                    >
                      {s.appName}
                    </span>

                    {/* Duration */}
                    <span className="text-sm font-mono tabular-nums" style={{ color }}>
                      {formatDuration(dur)}
                    </span>

                    {/* Planned */}
                    <span className="text-[11px] font-mono tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                      / {formatDuration(s.plannedDurationSeconds)}
                    </span>

                    {/* Status badge */}
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{
                        background: rotten ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                        color: rotten ? "var(--accent-danger)" : getPomodoroColor("break"),
                      }}
                    >
                      {rotten ? "烂了" : "完成"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Fun Footer ── */}
      <div className="text-center py-6">
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          {totalCompleted > 0
            ? `你已经累计完成了 ${totalCompleted} 个番茄，共 ${formatDuration(totalFocusSeconds)} 的专注时光 ✨`
            : "每个伟大的成就，都始于第一个番茄 🌱"}
        </p>
      </div>
    </div>
  );
}
