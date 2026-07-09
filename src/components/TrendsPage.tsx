import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { getUsageRecords, getBindings, type UsageRecord } from "../lib/tauri";
import { formatDuration } from "../lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DayData {
  date: string;
  label: string;
  seconds: number;
}

export default function TrendsPage() {
  const [weekData, setWeekData] = useState<DayData[]>([]);
  useEffect(() => {
    getBindings().catch(console.error);
  }, []);

  // Fetch last 7 days of data
  useEffect(() => {
    const fetchWeek = async () => {
      const days: DayData[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        const records = await getUsageRecords(dateStr).catch(() => []);
        const totalSeconds = records.reduce(
          (sum: number, r: UsageRecord) => sum + r.durationSeconds,
          0
        );
        days.push({
          date: dateStr,
          label: d.toLocaleDateString("zh-CN", { weekday: "short" }),
          seconds: totalSeconds,
        });
      }
      setWeekData(days);
    };
    fetchWeek();
  }, []);

  return (
    <div className="p-8 max-w-[960px] mx-auto">
      <h1
        className="text-2xl font-semibold mb-8"
        style={{ color: "var(--text-primary)" }}
      >
        趋势
      </h1>

      <div className="grid gap-6">
        {/* Weekly Bar Chart */}
        <div
          className="rounded-xl p-6"
          style={{ background: "var(--bg-secondary)" }}
        >
          <h2
            className="text-sm font-medium mb-4"
            style={{ color: "var(--text-secondary)" }}
          >
            每日专注时长（近 7 天）
          </h2>
          {weekData.some((d) => d.seconds > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weekData}>
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#8e8e93", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#8e8e93", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${Math.round(v / 3600)}h`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1c1c1f",
                    border: "1px solid #48484a",
                    borderRadius: 8,
                    color: "#f5f5f7",
                  }}
                  formatter={(value) => [
                    formatDuration(Number(value)),
                    "专注时长",
                  ]}
                />
                <Bar
                  dataKey="seconds"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div
              className="flex flex-col items-center justify-center h-48 rounded-lg gap-3"
              style={{ background: "var(--bg-tertiary)" }}
            >
              <BarChart3 size={32} style={{ color: "var(--text-tertiary)" }} />
              <span
                className="text-sm"
                style={{ color: "var(--text-tertiary)" }}
              >
                数据积累后显示趋势图
              </span>
            </div>
          )}
        </div>

        {/* Heatmap placeholder */}
        <div
          className="rounded-xl p-6"
          style={{ background: "var(--bg-secondary)" }}
        >
          <h2
            className="text-sm font-medium mb-4"
            style={{ color: "var(--text-secondary)" }}
          >
            专注热力图
          </h2>
          <HeatmapView />
        </div>
      </div>
    </div>
  );
}

function HeatmapView() {
  // Generate a 7x24 heatmap grid (Mon-Sun, 0-23h)
  // For now, static placeholder
  const days = ["一", "二", "三", "四", "五", "六", "日"];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-1">
        {/* Hour labels */}
        <div className="flex gap-1 ml-6">
          {hours.map((h) => (
            <div
              key={h}
              className="w-4 text-center text-[8px]"
              style={{ color: "var(--text-tertiary)" }}
            >
              {h % 6 === 0 ? h : ""}
            </div>
          ))}
        </div>

        {/* Day rows */}
        {days.map((day, di) => (
          <div key={di} className="flex items-center gap-1">
            <span
              className="w-5 text-right text-[10px] mr-1"
              style={{ color: "var(--text-tertiary)" }}
            >
              {day}
            </span>
            {hours.map((h) => (
              <div
                key={h}
                className="w-4 h-4 rounded-sm"
                style={{
                  background: "var(--bg-tertiary)",
                }}
                title={`${day} ${h}:00 — 暂无数据`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
