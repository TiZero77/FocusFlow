import { useEffect, useState, useCallback } from "react";
import { BarChart3, Clock, Target, Zap, Calendar } from "lucide-react";
import { getUsageRange, type UsageRecord } from "../lib/tauri";
import { formatDuration, getRecentDates, getMonthDates, getRecentMonths, getHeatmapColor, getHeatmapLegendColors } from "../lib/utils";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Period = "week" | "month" | "year";

interface ChartData {
  label: string;
  seconds: number;
}

interface Stats {
  total: number;
  dailyAvg: number;
  activeDays: number;
  streak: number;
}

export default function TrendsPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [barData, setBarData] = useState<ChartData[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, dailyAvg: 0, activeDays: 0, streak: 0 });
  const [heatmapData, setHeatmapData] = useState<Map<string, number>>(new Map());
  const [heatmapMax, setHeatmapMax] = useState(0);
  const [loading, setLoading] = useState(true);

  // Fetch heatmap data (current year)
  useEffect(() => {
    const fetchHeatmap = async () => {
      const now = new Date();
      const year = now.getFullYear();
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      const records = await getUsageRange(startDate, endDate).catch(() => []);
      const byDate = new Map<string, number>();
      for (const r of records) {
        byDate.set(r.sessionDate, (byDate.get(r.sessionDate) ?? 0) + r.durationSeconds);
      }
      setHeatmapData(byDate);

      const vals = Array.from(byDate.values());
      setHeatmapMax(vals.length > 0 ? Math.max(...vals) : 0);

      // Compute stats
      const total = vals.reduce((a, b) => a + b, 0);
      const activeDays = vals.filter((v) => v > 0).length;
      const dailyAvg = activeDays > 0 ? Math.round(total / activeDays) : 0;

      // Streak: consecutive days ending today
      let streak = 0;
      for (let i = 0; i < 365; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if ((byDate.get(key) ?? 0) > 0) {
          streak++;
        } else {
          break;
        }
      }

      setStats({ total, dailyAvg, activeDays, streak });
    };
    fetchHeatmap();
  }, []);

  // Fetch bar chart data
  const fetchBarData = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      let data: ChartData[] = [];
      if (p === "week") {
        const dates = getRecentDates(7);
        const records = await getUsageRange(dates[0], dates[dates.length - 1]).catch(() => []);
        const byDate = groupByDate(records);
        data = dates.map((d) => ({
          label: new Date(d + "T00:00:00").toLocaleDateString("zh-CN", { weekday: "short" }),
          seconds: byDate.get(d) ?? 0,
        }));
      } else if (p === "month") {
        const dates = getMonthDates();
        const records = await getUsageRange(dates[0], dates[dates.length - 1]).catch(() => []);
        const byDate = groupByDate(records);
        data = dates.map((d) => ({
          label: Number(d.split("-")[2]).toString(),
          seconds: byDate.get(d) ?? 0,
        }));
      } else {
        const months = getRecentMonths();
        const startDate = months[0] + "-01";
        const lastMonth = months[months.length - 1];
        const [ly, lm] = lastMonth.split("-").map(Number);
        const endDay = new Date(ly, lm, 0).getDate();
        const endDate = `${lastMonth}-${String(endDay).padStart(2, "0")}`;
        const records = await getUsageRange(startDate, endDate).catch(() => []);
        const byMonth = new Map<string, number>();
        for (const r of records) {
          const m = r.sessionDate.substring(0, 7);
          byMonth.set(m, (byMonth.get(m) ?? 0) + r.durationSeconds);
        }
        data = months.map((m) => ({
          label: Number(m.split("-")[1]) + "月",
          seconds: byMonth.get(m) ?? 0,
        }));
      }
      setBarData(data);
    } catch (err) {
      console.error("Failed to fetch bar data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBarData(period);
  }, [period, fetchBarData]);

  const periodLabels: Record<Period, string> = { week: "本周", month: "本月", year: "今年" };

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full max-w-[720px] mx-auto px-12 py-12 animate-fade-in">
        <h1 className="text-2xl font-semibold mb-8" style={{ color: "var(--text-primary)" }}>
          趋势
        </h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatsCard icon={<Clock size={18} />} label="总时长" value={formatDuration(stats.total)} color="var(--accent-focus)" />
          <StatsCard icon={<Target size={18} />} label="日均" value={formatDuration(stats.dailyAvg)} color="var(--accent-break)" />
          <StatsCard icon={<Calendar size={18} />} label="活跃天数" value={`${stats.activeDays}天`} color="var(--accent-warning)" />
          <StatsCard icon={<Zap size={18} />} label="连续" value={`${stats.streak}天`} color="var(--accent-long-break)" />
        </div>

        {/* Heatmap */}
        <div
          className="rounded-3xl p-8 mb-8 animate-slide-up"
          style={{ background: "var(--bg-secondary)", animationDelay: "100ms" }}
        >
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              活跃热力图
            </span>
            <HeatmapLegend />
          </div>
          <ActivityHeatmap data={heatmapData} maxSeconds={heatmapMax} />
        </div>

        {/* Bar Chart */}
        <div
          className="rounded-3xl p-8 animate-slide-up"
          style={{ background: "var(--bg-secondary)", animationDelay: "200ms" }}
        >
          {/* Period Tabs */}
          <div className="flex gap-1.5 mb-6 p-1.5 rounded-xl" style={{ background: "var(--bg-tertiary)" }}>
            {(["week", "month", "year"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: period === p ? "var(--bg-secondary)" : "transparent",
                  color: period === p ? "var(--text-primary)" : "var(--text-tertiary)",
                  boxShadow: period === p ? "var(--shadow-sm)" : "none",
                }}
              >
                {periodLabels[p]}
              </button>
            ))}
          </div>

          {loading && barData.length === 0 ? (
            <div
              className="flex items-center justify-center h-40 rounded-xl"
              style={{ background: "var(--bg-tertiary)" }}
            >
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>加载中...</span>
            </div>
          ) : barData.some((d) => d.seconds > 0) ? (
            <>
              <div className="rounded-xl p-5 mb-5" style={{ background: "var(--bg-tertiary)" }}>
                <ResponsiveContainer width="100%" height={160}>
                  {period === "month" ? (
                    <AreaChart data={barData}>
                      <defs>
                        <linearGradient id="trendAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent-focus)" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="var(--accent-focus)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" tick={{ fill: "#78716C", fontSize: 10 }} axisLine={false} tickLine={false} interval={6} />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{ background: "var(--bg-primary)", border: "1px solid var(--bg-hover)", borderRadius: 8, color: "var(--text-primary)", fontSize: 12 }}
                        formatter={(value) => [formatDuration(Number(value)), "使用时长"]}
                        labelFormatter={(label) => `${label}日`}
                      />
                      <Area type="monotone" dataKey="seconds" stroke="var(--accent-focus)" strokeWidth={2} fill="url(#trendAreaGrad)" />
                    </AreaChart>
                  ) : (
                    <BarChart data={barData}>
                      <XAxis dataKey="label" tick={{ fill: "#78716C", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{ background: "var(--bg-primary)", border: "1px solid var(--bg-hover)", borderRadius: 8, color: "var(--text-primary)", fontSize: 12 }}
                        formatter={(value) => [formatDuration(Number(value)), "使用时长"]}
                      />
                      <Bar dataKey="seconds" fill="var(--accent-focus)" radius={[3, 3, 0, 0]} maxBarSize={period === "year" ? 20 : 24} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>

              {/* Summary */}
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: "var(--text-tertiary)" }}>
                  {periodLabels[period]}合计{" "}
                  <span style={{ color: "var(--text-secondary)" }}>
                    {formatDuration(barData.reduce((s, d) => s + d.seconds, 0))}
                  </span>
                </span>
                <span style={{ color: "var(--text-tertiary)" }}>
                  日均{" "}
                  <span style={{ color: "var(--text-secondary)" }}>
                    {formatDuration(
                      (() => {
                        const active = barData.filter((d) => d.seconds > 0).length;
                        return active > 0 ? Math.round(barData.reduce((s, d) => s + d.seconds, 0) / active) : 0;
                      })()
                    )}
                  </span>
                </span>
              </div>
            </>
          ) : (
            <div
              className="flex flex-col items-center justify-center h-40 rounded-xl gap-3"
              style={{ background: "var(--bg-tertiary)" }}
            >
              <BarChart3 size={28} style={{ color: "var(--text-tertiary)" }} />
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                数据积累后显示趋势
              </span>
            </div>
          )}
        </div>

        <div className="h-10" />
      </div>
    </div>
  );
}

// ── Sub Components ──

function StatsCard({
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
      <div className="text-lg font-semibold mb-0.5" style={{ color: "var(--text-primary)" }}>
        {value}
      </div>
      <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </div>
    </div>
  );
}

function HeatmapLegend() {
  const levels = ["无", "低", "中", "高", "极高"];
  const colors = getHeatmapLegendColors();
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] mr-1" style={{ color: "var(--text-tertiary)" }}>少</span>
      {colors.map((c, i) => (
        <div key={i} className="w-3 h-3 rounded-sm" style={{ background: c }} title={levels[i]} />
      ))}
      <span className="text-[10px] ml-1" style={{ color: "var(--text-tertiary)" }}>多</span>
    </div>
  );
}

function ActivityHeatmap({
  data,
  maxSeconds,
}: {
  data: Map<string, number>;
  maxSeconds: number;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Grid: from Jan 1 Sunday to current week's Saturday
  const year = today.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const jan1Day = jan1.getDay(); // 0=Sun
  const gridStart = new Date(jan1);
  gridStart.setDate(gridStart.getDate() - jan1Day); // back to Sunday

  // End at current week's Saturday
  const dayOfWeek = today.getDay();
  const gridEnd = new Date(today);
  gridEnd.setDate(gridEnd.getDate() + (6 - dayOfWeek));

  // Build week arrays
  const weeks: { date: Date; dateStr: string; seconds: number }[][] = [];
  const cur = new Date(gridStart);
  while (cur <= gridEnd) {
    const week: { date: Date; dateStr: string; seconds: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      week.push({
        date: new Date(cur),
        dateStr,
        seconds: data.get(dateStr) ?? 0,
      });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }
  const weekCount = weeks.length;

  // Month labels: at the column where the 1st of each month first appears
  const monthLabels: { weekIdx: number; label: string }[] = [];
  const shownMonths = new Set<string>();
  weeks.forEach((week, wi) => {
    for (const cell of week) {
      if (cell.date.getDate() === 1) {
        const key = `${cell.date.getFullYear()}-${cell.date.getMonth()}`;
        if (!shownMonths.has(key)) {
          shownMonths.add(key);
          monthLabels.push({
            weekIdx: wi,
            label: cell.date.toLocaleDateString("zh-CN", { month: "short" }),
          });
        }
      }
    }
  });

  const dayLabels = ["日", "一", "二", "三", "四", "五", "六"];
  const showDayLabel = [0, 2, 4]; // Sun, Tue, Thu

  return (
    <div className="overflow-x-auto">
      <div className="inline-block">
        {/* Month labels */}
        <div className="flex mb-1" style={{ paddingLeft: "24px" }}>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${weekCount}, 14px)`, gap: "3px" }}>
            {Array.from({ length: weekCount }, (_, wi) => {
              const ml = monthLabels.find((m) => m.weekIdx === wi);
              return (
                <div key={wi} className="text-[9px] h-4 leading-4" style={{ color: "var(--text-tertiary)" }}>
                  {ml?.label ?? ""}
                </div>
              );
            })}
          </div>
        </div>

        {/* Grid rows */}
        {Array.from({ length: 7 }, (_, di) => (
          <div key={di} className="flex items-center" style={{ marginBottom: "3px" }}>
            <span
              className="text-[9px] w-6 text-right pr-1 shrink-0"
              style={{ color: "var(--text-tertiary)" }}
            >
              {showDayLabel.includes(di) ? dayLabels[di] : ""}
            </span>
            <div className="grid" style={{ gridTemplateColumns: `repeat(${weekCount}, 14px)`, gap: "3px" }}>
              {weeks.map((week, wi) => {
                const cell = week[di];
                const isFuture = cell.date > today;
                const isThisYear = cell.date.getFullYear() === year;
                return (
                  <div
                    key={wi}
                    className="w-[14px] h-[14px] rounded-[3px]"
                    style={{
                      background: isFuture || !isThisYear
                        ? "transparent"
                        : getHeatmapColor(cell.seconds, maxSeconds),
                    }}
                    title={isFuture || !isThisYear ? "" : `${cell.dateStr} — ${cell.seconds > 0 ? formatDuration(cell.seconds) : "无数据"}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Helpers ──

function groupByDate(records: UsageRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of records) {
    map.set(r.sessionDate, (map.get(r.sessionDate) ?? 0) + r.durationSeconds);
  }
  return map;
}
