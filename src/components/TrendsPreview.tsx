import { useEffect, useState, useCallback } from "react";
import { ChevronDown, ChevronUp, BarChart3 } from "lucide-react";
import { getUsageRange, type UsageRecord } from "../lib/tauri";
import { formatDuration, getRecentDates, getMonthDates, getRecentMonths } from "../lib/utils";
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

export default function TrendsPreview() {
  const [expanded, setExpanded] = useState(false);
  const [period, setPeriod] = useState<Period>("week");
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [summary, setSummary] = useState({ total: 0, dailyAvg: 0, days: 0 });
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      let data: ChartData[] = [];
      let totalSeconds = 0;
      let daysWithData = 0;

      if (p === "week") {
        const dates = getRecentDates(7);
        const records = await getUsageRange(dates[0], dates[dates.length - 1]);
        const byDate = groupByDate(records);
        data = dates.map((d) => {
          const seconds = byDate.get(d) ?? 0;
          totalSeconds += seconds;
          if (seconds > 0) daysWithData++;
          return {
            label: new Date(d + "T00:00:00").toLocaleDateString("zh-CN", {
              weekday: "short",
            }),
            seconds,
          };
        });
      } else if (p === "month") {
        const dates = getMonthDates();
        const records = await getUsageRange(dates[0], dates[dates.length - 1]);
        const byDate = groupByDate(records);
        data = dates.map((d) => {
          const seconds = byDate.get(d) ?? 0;
          totalSeconds += seconds;
          if (seconds > 0) daysWithData++;
          return {
            label: Number(d.split("-")[2]).toString(),
            seconds,
          };
        });
      } else {
        // year
        const months = getRecentMonths();
        const startDate = months[0] + "-01";
        const lastMonth = months[months.length - 1];
        const [ly, lm] = lastMonth.split("-").map(Number);
        const endDay = new Date(ly, lm, 0).getDate();
        const endDate = `${lastMonth}-${String(endDay).padStart(2, "0")}`;
        const records = await getUsageRange(startDate, endDate);
        const byMonth = new Map<string, number>();
        for (const r of records) {
          const month = r.sessionDate.substring(0, 7);
          byMonth.set(month, (byMonth.get(month) ?? 0) + r.durationSeconds);
        }
        data = months.map((m) => {
          const seconds = byMonth.get(m) ?? 0;
          totalSeconds += seconds;
          if (seconds > 0) daysWithData++;
          return {
            label: Number(m.split("-")[1]) + "月",
            seconds,
          };
        });
        daysWithData = daysWithData || 1; // 避免除零
      }

      setChartData(data);
      setSummary({
        total: totalSeconds,
        dailyAvg: daysWithData > 0 ? Math.round(totalSeconds / daysWithData) : 0,
        days: daysWithData,
      });
    } catch (err) {
      console.error("Failed to fetch trend data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (expanded) {
      fetchData(period);
    }
  }, [expanded, period, fetchData]);

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
  };

  const periodLabels: Record<Period, string> = {
    week: "本周",
    month: "本月",
    year: "今年",
  };

  return (
    <div
      className="rounded-3xl overflow-hidden animate-slide-up card-hover"
      style={{
        background: "var(--bg-secondary)",
        animationDelay: "200ms",
      }}
    >
      {/* 标题栏 — 始终可见 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-8 py-5"
        style={{ background: "transparent" }}
      >
        <div className="flex items-center gap-2">
          <BarChart3 size={16} style={{ color: "var(--text-tertiary)" }} />
          <span
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: "var(--text-tertiary)" }}
          >
            趋势预览
          </span>
        </div>
        <div className="flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
          <span className="text-xs">{expanded ? "收起" : "展开"}</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div className="px-8 pb-8 animate-fade-in">
          {/* Tab 切换 */}
          <div className="flex gap-1.5 mb-6 p-1.5 rounded-xl" style={{ background: "var(--bg-tertiary)" }}>
            {(["week", "month", "year"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => handlePeriodChange(p)}
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

          {/* 图表 */}
          {loading && chartData.length === 0 ? (
            <div
              className="flex items-center justify-center h-32 rounded-xl"
              style={{ background: "var(--bg-tertiary)" }}
            >
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                加载中...
              </span>
            </div>
          ) : chartData.some((d) => d.seconds > 0) ? (
            <>
              <div
                className="rounded-xl p-5 mb-5"
                style={{ background: "var(--bg-tertiary)" }}
              >
                <ResponsiveContainer width="100%" height={120}>
                  {period === "month" ? (
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent-focus)" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="var(--accent-focus)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#78716C", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        interval={6}
                      />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{
                          background: "var(--bg-primary)",
                          border: "1px solid var(--bg-hover)",
                          borderRadius: 8,
                          color: "var(--text-primary)",
                          fontSize: 12,
                        }}
                        formatter={(value: number) => [formatDuration(value), "使用时长"]}
                        labelFormatter={(label: string) => `${label}日`}
                      />
                      <Area
                        type="monotone"
                        dataKey="seconds"
                        stroke="var(--accent-focus)"
                        strokeWidth={2}
                        fill="url(#areaGradient)"
                      />
                    </AreaChart>
                  ) : (
                    <BarChart data={chartData}>
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#78716C", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{
                          background: "var(--bg-primary)",
                          border: "1px solid var(--bg-hover)",
                          borderRadius: 8,
                          color: "var(--text-primary)",
                          fontSize: 12,
                        }}
                        formatter={(value: number) => [formatDuration(value), "使用时长"]}
                      />
                      <Bar
                        dataKey="seconds"
                        fill="var(--accent-focus)"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={period === "year" ? 20 : 24}
                      />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>

              {/* 汇总数据 */}
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: "var(--text-tertiary)" }}>
                  {periodLabels[period]}合计{" "}
                  <span style={{ color: "var(--text-secondary)" }}>
                    {formatDuration(summary.total)}
                  </span>
                </span>
                <span style={{ color: "var(--text-tertiary)" }}>
                  日均{" "}
                  <span style={{ color: "var(--text-secondary)" }}>
                    {formatDuration(summary.dailyAvg)}
                  </span>
                </span>
              </div>
            </>
          ) : (
            <div
              className="flex flex-col items-center justify-center h-32 rounded-xl gap-2"
              style={{ background: "var(--bg-tertiary)" }}
            >
              <BarChart3 size={24} style={{ color: "var(--text-tertiary)" }} />
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                数据积累后显示趋势
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function groupByDate(records: UsageRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of records) {
    map.set(r.sessionDate, (map.get(r.sessionDate) ?? 0) + r.durationSeconds);
  }
  return map;
}
