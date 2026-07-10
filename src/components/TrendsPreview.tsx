import { useEffect, useState } from "react";
import { ArrowRight, BarChart3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getUsageRecords, type UsageRecord } from "../lib/tauri";
import { formatDuration } from "../lib/utils";
import { useTimerStore } from "../stores/timerStore";

export default function TrendsPreview() {
  const navigate = useNavigate();
  const { activeTimers } = useTimerStore();
  const [todayTotal, setTodayTotal] = useState(0);

  useEffect(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    getUsageRecords(today)
      .then((records: UsageRecord[]) => {
        setTodayTotal(records.reduce((sum, r) => sum + r.durationSeconds, 0));
      })
      .catch(console.error);
  }, []);

  // Add real-time elapsed from active timers
  const liveExtra = Object.values(activeTimers)
    .filter(Boolean)
    .reduce((sum, t) => sum + (t?.elapsedSeconds ?? 0), 0);

  return (
    <div
      className="rounded-3xl px-8 py-6 animate-slide-up card-hover cursor-pointer"
      style={{ background: "var(--bg-secondary)", animationDelay: "200ms" }}
      onClick={() => navigate("/trends")}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "#F9731620", color: "var(--accent-focus)" }}
          >
            <BarChart3 size={20} />
          </div>
          <div>
            <div className="text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }}>
              今日使用
            </div>
            <div
              className="text-2xl font-mono font-bold tabular-nums"
              style={{ color: "var(--text-primary)" }}
            >
              {formatDuration(todayTotal + liveExtra)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
          查看趋势
          <ArrowRight size={12} />
        </div>
      </div>
    </div>
  );
}
