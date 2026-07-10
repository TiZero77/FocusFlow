import { useEffect, useState, useMemo } from "react";
import {
  Flame,
  Clock,
  Target,
  Zap,
  TrendingUp,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
} from "lucide-react";
import {
  getBindings,
  getUsageRange,
  getPomodoroRange,
  type AppBinding,
  type UsageRecord,
  type PomodoroSession,
} from "../lib/tauri";
import { formatDuration, formatDate } from "../lib/utils";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type Granularity = "day" | "week" | "month" | "year" | "all";

interface ChartData {
  label: string;
  seconds: number;
}

interface CompareData {
  label: string;
  thisWeek: number;
  lastWeek: number;
}

interface HourData {
  hour: string;
  minutes: number;
}

export default function InsightsPage() {
  const [bindings, setBindings] = useState<AppBinding[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([]);
  const [pomodoroSessions, setPomodoroSessions] = useState<PomodoroSession[]>([]);
  const [loading, setLoading] = useState(true);

  // Load bindings
  useEffect(() => {
    getBindings().then((b) => {
      setBindings(b);
      if (b.length > 0 && !selectedId) setSelectedId(b[0].id);
    }).catch(console.error);
  }, []);

  const selectedBinding = bindings.find((b) => b.id === selectedId);

  // Compute date range based on granularity
  const { startDate, endDate, startTs, endTs } = useMemo(() => {
    const now = new Date();
    const today = formatDate(now);
    let start = today;
    let end = today;

    switch (granularity) {
      case "day": {
        const d = new Date(now);
        d.setDate(d.getDate() - 6);
        start = formatDate(d);
        break;
      }
      case "week": {
        const d = new Date(now);
        d.setDate(d.getDate() - 27);
        start = formatDate(d);
        break;
      }
      case "month": {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 11);
        d.setDate(1);
        start = formatDate(d);
        break;
      }
      case "year": {
        const d = new Date(now);
        d.setFullYear(d.getFullYear() - 4);
        d.setMonth(0);
        d.setDate(1);
        start = formatDate(d);
        break;
      }
      case "all":
        start = "2020-01-01";
        break;
    }

    // Convert dates to timestamps for pomodoro query
    const startTimestamp = new Date(start + "T00:00:00").getTime() / 1000;
    const endTimestamp = new Date(end + "T23:59:59").getTime() / 1000;

    return { startDate: start, endDate: end, startTs: startTimestamp, endTs: endTimestamp };
  }, [granularity]);

  // Fetch data when selection or range changes
  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    Promise.all([
      getUsageRange(startDate, endDate),
      getPomodoroRange(startTs, endTs),
    ])
      .then(([usage, pomodoro]) => {
        // Filter to selected binding
        setUsageRecords(usage.filter((r) => r.bindingId === selectedId));
        setPomodoroSessions(pomodoro.filter((s) => s.bindingId === selectedId));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedId, startDate, endDate, startTs, endTs]);

  // ── Computed Stats ──

  const totalUsage = useMemo(
    () => usageRecords.reduce((sum, r) => sum + r.durationSeconds, 0),
    [usageRecords]
  );

  const completedPomodoros = useMemo(
    () => pomodoroSessions.filter((s) => s.sessionType === "focus" && s.completed).length,
    [pomodoroSessions]
  );

  const totalFocusPomodoros = useMemo(
    () => pomodoroSessions.filter((s) => s.sessionType === "focus").length,
    [pomodoroSessions]
  );

  const pomodoroCompletionRate = useMemo(
    () => (totalFocusPomodoros > 0 ? Math.round((completedPomodoros / totalFocusPomodoros) * 100) : 0),
    [completedPomodoros, totalFocusPomodoros]
  );

  const avgPomodoroMinutes = useMemo(() => {
    const focusSessions = pomodoroSessions.filter((s) => s.sessionType === "focus" && s.completed);
    if (focusSessions.length === 0) return 0;
    const totalSec = focusSessions.reduce((sum, s) => sum + s.actualDurationSeconds, 0);
    return Math.round(totalSec / focusSessions.length / 60);
  }, [pomodoroSessions]);

  // Streak: consecutive days with usage ending today
  const streak = useMemo(() => {
    const dateSet = new Set(usageRecords.map((r) => r.sessionDate));
    let count = 0;
    const d = new Date();
    while (true) {
      const ds = formatDate(d);
      if (dateSet.has(ds)) {
        count++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return count;
  }, [usageRecords]);

  // ── Chart Data: Usage Trend ──

  const trendData = useMemo((): ChartData[] => {
    const byDate = new Map<string, number>();
    for (const r of usageRecords) {
      byDate.set(r.sessionDate, (byDate.get(r.sessionDate) ?? 0) + r.durationSeconds);
    }

    if (granularity === "month") {
      // Group by month
      const byMonth = new Map<string, number>();
      for (const [date, secs] of byDate) {
        const month = date.slice(0, 7);
        byMonth.set(month, (byMonth.get(month) ?? 0) + secs);
      }
      const months: string[] = [];
      const d = new Date();
      for (let i = 11; i >= 0; i--) {
        const md = new Date(d);
        md.setMonth(md.getMonth() - i);
        months.push(`${md.getFullYear()}-${String(md.getMonth() + 1).padStart(2, "0")}`);
      }
      return months.map((m) => ({
        label: `${Number(m.slice(5))}月`,
        seconds: byMonth.get(m) ?? 0,
      }));
    }

    if (granularity === "year") {
      // Group by year
      const byYear = new Map<string, number>();
      for (const [date, secs] of byDate) {
        const year = date.slice(0, 4);
        byYear.set(year, (byYear.get(year) ?? 0) + secs);
      }
      const years: string[] = [];
      const currentYear = new Date().getFullYear();
      for (let i = 4; i >= 0; i--) {
        years.push(String(currentYear - i));
      }
      return years.map((y) => ({ label: y, seconds: byYear.get(y) ?? 0 }));
    }

    // day/week/all: show daily
    let dates: string[];
    if (granularity === "day") {
      dates = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(formatDate(d));
      }
    } else if (granularity === "week") {
      dates = [];
      for (let i = 27; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(formatDate(d));
      }
    } else {
      // all — show all dates that have data
      dates = Array.from(byDate.keys()).sort();
    }

    return dates.map((d) => ({
      label: granularity === "week" ? `${Number(d.slice(5, 7))}/${Number(d.slice(8))}` : `${Number(d.slice(8))}日`,
      seconds: byDate.get(d) ?? 0,
    }));
  }, [usageRecords, granularity]);

  // ── Chart Data: Week Comparison ──

  const compareData = useMemo((): CompareData[] => {
    const byDate = new Map<string, number>();
    for (const r of usageRecords) {
      byDate.set(r.sessionDate, (byDate.get(r.sessionDate) ?? 0) + r.durationSeconds);
    }

    const dayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

    // Get this week's Monday
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() + mondayOffset);

    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);

    return dayLabels.map((label, i) => {
      const thisDate = new Date(thisMonday);
      thisDate.setDate(thisMonday.getDate() + i);
      const lastDate = new Date(lastMonday);
      lastDate.setDate(lastMonday.getDate() + i);

      return {
        label,
        thisWeek: byDate.get(formatDate(thisDate)) ?? 0,
        lastWeek: byDate.get(formatDate(lastDate)) ?? 0,
      };
    });
  }, [usageRecords]);

  // ── Chart Data: Best Focus Hours ──

  const hourData = useMemo((): HourData[] => {
    const hourMap = new Map<number, number>();
    for (let h = 0; h < 24; h++) hourMap.set(h, 0);

    // Use pomodoro focus sessions for best time analysis
    for (const s of pomodoroSessions) {
      if (s.sessionType !== "focus") continue;
      const startDate = new Date(s.startedAt * 1000);
      const hour = startDate.getHours();
      hourMap.set(hour, (hourMap.get(hour) ?? 0) + s.actualDurationSeconds / 60);
    }

    // Also add usage records for more data points
    for (const r of usageRecords) {
      const startDate = new Date(r.startTime * 1000);
      const hour = startDate.getHours();
      hourMap.set(hour, (hourMap.get(hour) ?? 0) + r.durationSeconds / 60);
    }

    return Array.from(hourMap.entries()).map(([h, m]) => ({
      hour: `${h}:00`,
      minutes: Math.round(m),
    }));
  }, [pomodoroSessions, usageRecords]);

  const bestHour = useMemo(() => {
    const max = Math.max(...hourData.map((h) => h.minutes));
    if (max === 0) return null;
    return hourData.find((h) => h.minutes === max)?.hour ?? null;
  }, [hourData]);

  // ── Navigation for prev/next app ──
  const currentIdx = bindings.findIndex((b) => b.id === selectedId);
  const goPrev = () => {
    if (currentIdx > 0) setSelectedId(bindings[currentIdx - 1].id);
  };
  const goNext = () => {
    if (currentIdx < bindings.length - 1) setSelectedId(bindings[currentIdx + 1].id);
  };

  const granLabels: Record<Granularity, string> = {
    day: "日",
    week: "周",
    month: "月",
    year: "年",
    all: "总计",
  };

  if (bindings.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Lightbulb size={48} style={{ color: "var(--text-tertiary)" }} className="mx-auto mb-4" />
          <p style={{ color: "var(--text-tertiary)" }}>请先绑定应用以查看洞察数据</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full max-w-[720px] mx-auto px-12 py-12 animate-fade-in">
        <h1 className="text-2xl font-semibold mb-8" style={{ color: "var(--text-primary)" }}>
          洞察
        </h1>

        {/* App Selector */}
        <div className="flex items-center gap-3 mb-8 animate-slide-up">
          <button
            onClick={goPrev}
            disabled={currentIdx <= 0}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronLeft size={18} style={{ color: "var(--text-secondary)" }} />
          </button>
          <div className="flex-1 overflow-x-auto py-1">
            <div className="flex gap-2">
              {bindings.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelectedId(b.id)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all shrink-0"
                  style={{
                    background: selectedId === b.id ? "var(--bg-hover)" : "var(--bg-secondary)",
                    color: selectedId === b.id ? "var(--text-primary)" : "var(--text-secondary)",
                    boxShadow: selectedId === b.id ? "inset 0 0 0 2px var(--accent-focus)" : "none",
                  }}
                >
                  <span
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}
                  >
                    {b.appName.charAt(0).toUpperCase()}
                  </span>
                  {b.appName}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={goNext}
            disabled={currentIdx >= bindings.length - 1}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronRight size={18} style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>

        {/* Granularity Toggle */}
        <div className="flex gap-1.5 mb-8 p-1.5 rounded-xl w-fit" style={{ background: "var(--bg-secondary)" }}>
          {(["day", "week", "month", "year", "all"] as Granularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className="px-4 py-2 rounded-lg text-xs font-medium transition-all"
              style={{
                background: granularity === g ? "var(--bg-tertiary)" : "transparent",
                color: granularity === g ? "var(--text-primary)" : "var(--text-tertiary)",
                boxShadow: granularity === g ? "var(--shadow-sm)" : "none",
              }}
            >
              {granLabels[g]}
            </button>
          ))}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8 animate-slide-up" style={{ animationDelay: "50ms" }}>
          <StatsCard
            icon={<Flame size={18} />}
            label="完成番茄"
            value={`${completedPomodoros}个`}
            sub={`${pomodoroCompletionRate}% 完成率`}
            color="var(--accent-focus)"
          />
          <StatsCard
            icon={<Clock size={18} />}
            label="总时长"
            value={formatDuration(totalUsage)}
            sub={granularity !== "all" ? `近${granLabels[granularity]}` : undefined}
            color="var(--accent-break)"
          />
          <StatsCard
            icon={<Target size={18} />}
            label="平均番茄"
            value={`${avgPomodoroMinutes}分钟`}
            sub="每次专注"
            color="var(--accent-warning)"
          />
          <StatsCard
            icon={<Zap size={18} />}
            label="连续天数"
            value={`${streak}天`}
            sub="持续专注"
            color="var(--accent-long-break)"
          />
        </div>

        {/* Usage Trend Chart */}
        <ChartCard title="使用时长趋势" delay="100ms">
          {loading ? (
            <EmptyState text="加载中..." />
          ) : trendData.some((d) => d.seconds > 0) ? (
            <ResponsiveContainer width="100%" height={180}>
              {granularity === "month" || granularity === "year" ? (
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="insightAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent-focus)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--accent-focus)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fill: "#78716C", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: "var(--bg-primary)", border: "1px solid var(--bg-hover)", borderRadius: 8, color: "var(--text-primary)", fontSize: 12 }}
                    formatter={(value) => [formatDuration(Number(value)), "使用时长"]}
                  />
                  <Area type="monotone" dataKey="seconds" stroke="var(--accent-focus)" strokeWidth={2} fill="url(#insightAreaGrad)" />
                </AreaChart>
              ) : (
                <BarChart data={trendData}>
                  <XAxis dataKey="label" tick={{ fill: "#78716C", fontSize: 10 }} axisLine={false} tickLine={false} interval={granularity === "week" ? 6 : 0} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: "var(--bg-primary)", border: "1px solid var(--bg-hover)", borderRadius: 8, color: "var(--text-primary)", fontSize: 12 }}
                    formatter={(value) => [formatDuration(Number(value)), "使用时长"]}
                  />
                  <Bar dataKey="seconds" fill="var(--accent-focus)" radius={[3, 3, 0, 0]} maxBarSize={24} />
                </BarChart>
              )}
            </ResponsiveContainer>
          ) : (
            <EmptyState text="暂无数据" />
          )}
        </ChartCard>

        {/* Week Comparison */}
        <ChartCard title="周对比趋势" delay="200ms">
          {loading ? (
            <EmptyState text="加载中..." />
          ) : compareData.some((d) => d.thisWeek > 0 || d.lastWeek > 0) ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={compareData}>
                <defs>
                  <linearGradient id="thisWeekGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-focus)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--accent-focus)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="lastWeekGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--text-tertiary)" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="var(--text-tertiary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fill: "#78716C", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ background: "var(--bg-primary)", border: "1px solid var(--bg-hover)", borderRadius: 8, color: "var(--text-primary)", fontSize: 12 }}
                  formatter={(value, name) => [formatDuration(Number(value)), name === "thisWeek" ? "本周" : "上周"]}
                />
                <Legend
                  formatter={(value) => (value === "thisWeek" ? "本周" : "上周")}
                  wrapperStyle={{ fontSize: 11, color: "var(--text-tertiary)" }}
                />
                <Area type="monotone" dataKey="lastWeek" stroke="var(--text-tertiary)" strokeWidth={1.5} strokeDasharray="4 4" fill="url(#lastWeekGrad)" />
                <Area type="monotone" dataKey="thisWeek" stroke="var(--accent-focus)" strokeWidth={2} fill="url(#thisWeekGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="暂无数据" />
          )}
        </ChartCard>

        {/* Best Focus Time */}
        <ChartCard title="最佳专注时段" delay="300ms">
          {loading ? (
            <EmptyState text="加载中..." />
          ) : hourData.some((h) => h.minutes > 0) ? (
            <>
              {bestHour && (
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb size={14} style={{ color: "var(--accent-warning)" }} />
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    你最常在 <strong style={{ color: "var(--accent-focus)" }}>{bestHour}</strong> 左右专注
                  </span>
                </div>
              )}
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={hourData}>
                  <XAxis
                    dataKey="hour"
                    tick={{ fill: "#78716C", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                    interval={2}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: "var(--bg-primary)", border: "1px solid var(--bg-hover)", borderRadius: 8, color: "var(--text-primary)", fontSize: 12 }}
                    formatter={(value) => [`${value}分钟`, "专注时长"]}
                    labelFormatter={(label) => `${label}`}
                  />
                  <Bar dataKey="minutes" fill="var(--accent-focus)" radius={[2, 2, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : (
            <EmptyState text="暂无数据" />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

// ── Sub Components ──

function StatsCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 animate-slide-up"
      style={{ background: "var(--bg-secondary)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div style={{ color }}>{icon}</div>
        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      </div>
      <div className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function ChartCard({
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
      <div className="rounded-xl p-5" style={{ background: "var(--bg-tertiary)" }}>
        {children}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-40">
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{text}</span>
    </div>
  );
}
