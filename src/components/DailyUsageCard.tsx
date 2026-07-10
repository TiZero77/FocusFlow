import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTimerStore } from "../stores/timerStore";
import { getUsageRecords, getSetting, type UsageRecord } from "../lib/tauri";
import { formatDuration } from "../lib/utils";

interface AppUsage {
  id: string;
  name: string;
  seconds: number;
}

export default function DailyUsageCard({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const { bindings, activeTimers } = useTimerStore();
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([]);
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState<number>(480); // 默认 8h
  const [animatedPercent, setAnimatedPercent] = useState(0);

  // 加载今日使用记录
  useEffect(() => {
    const today = getTodayStr();
    getUsageRecords(today).then(setUsageRecords).catch(console.error);

    const interval = setInterval(() => {
      getUsageRecords(today).then(setUsageRecords).catch(console.error);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // 加载每日目标
  useEffect(() => {
    getSetting("daily_goal_minutes").then((v) => {
      if (v !== null) setDailyGoalMinutes(Number(v));
    });
  }, []);

  // 计算统计数据
  const timerEntries = Object.values(activeTimers).filter(Boolean);

  // 按 bindingId 聚合使用时长（含活跃计时器）
  const usageByBinding = new Map<string, number>();
  for (const record of usageRecords) {
    usageByBinding.set(
      record.bindingId,
      (usageByBinding.get(record.bindingId) ?? 0) + record.durationSeconds
    );
  }
  for (const timer of timerEntries) {
    if (timer) {
      usageByBinding.set(
        timer.bindingId,
        (usageByBinding.get(timer.bindingId) ?? 0) + timer.elapsedSeconds
      );
    }
  }

  const totalSeconds = Array.from(usageByBinding.values()).reduce(
    (sum, s) => sum + s,
    0
  );

  // Top 3 APP
  const topApps: AppUsage[] = bindings
    .map((b) => ({
      id: b.id,
      name: b.appName,
      seconds: usageByBinding.get(b.id) ?? 0,
    }))
    .filter((a) => a.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 3);

  const maxAppSeconds = topApps[0]?.seconds ?? 1;

  // 百分比计算
  const hasGoal = dailyGoalMinutes > 0;
  const goalSeconds = dailyGoalMinutes * 60;
  const rawPercent = hasGoal
    ? Math.min(100, Math.round((totalSeconds / goalSeconds) * 100))
    : 0;

  // 入场动画：百分比数字滚动
  useEffect(() => {
    if (totalSeconds === 0) return;
    const target = rawPercent;
    const duration = 600;
    const startTime = Date.now();
    const startVal = animatedPercent;

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedPercent(Math.round(startVal + (target - startVal) * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [rawPercent]);

  return (
    <div
      className={embedded ? "" : "rounded-3xl p-8 animate-slide-up"}
      style={embedded ? {} : { background: "var(--bg-secondary)", animationDelay: "100ms" }}
    >
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-6">
        <span
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--text-tertiary)" }}
        >
          今日使用
        </span>
        {hasGoal && (
          <span
            className="text-sm font-mono font-semibold tabular-nums"
            style={{ color: "var(--accent-focus)" }}
          >
            {animatedPercent}%
          </span>
        )}
      </div>

      {/* 大号时长 */}
      <div className="mb-6">
        <span
          className="text-4xl font-mono font-bold tabular-nums"
          style={{ color: "var(--text-primary)" }}
        >
          {formatDuration(totalSeconds)}
        </span>
        {hasGoal && (
          <span
            className="text-sm ml-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            / {formatDuration(goalSeconds)}
          </span>
        )}
      </div>

      {/* 主进度条 */}
      {hasGoal && (
        <div
          className="h-1 rounded-full mb-6 overflow-hidden"
          style={{ background: "var(--bg-tertiary)" }}
        >
          <div
            className="h-full rounded-full animate-progress-fill"
            style={{
              background: "var(--gradient-focus)",
              width: `${rawPercent}%`,
              transition: "width 800ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </div>
      )}

      {/* APP 列表 */}
      {topApps.length > 0 && (
        <div className="flex flex-col gap-4 mb-5">
          {topApps.map((app, i) => {
            const percent = Math.round((app.seconds / maxAppSeconds) * 100);
            return (
              <div key={app.id} className="flex items-center gap-3">
                {/* 排名指示点 */}
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    background:
                      i === 0
                        ? "var(--accent-focus)"
                        : i === 1
                        ? "var(--accent-focus)"
                        : "var(--text-tertiary)",
                    opacity: i === 0 ? 1 : i === 1 ? 0.6 : 0.35,
                  }}
                />
                {/* APP 名称 */}
                <span
                  className="text-xs w-20 truncate shrink-0"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {app.name}
                </span>
                {/* 进度条 */}
                <div
                  className="flex-1 h-1 rounded-full overflow-hidden"
                  style={{ background: "var(--bg-tertiary)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      background: "var(--accent-focus)",
                      width: `${percent}%`,
                      opacity: i === 0 ? 0.9 : i === 1 ? 0.5 : 0.3,
                      transition:
                        "width 800ms cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                  />
                </div>
                {/* 时长 */}
                <span
                  className="text-xs font-mono tabular-nums w-12 text-right shrink-0"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {formatDuration(app.seconds)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* 空状态 */}
      {topApps.length === 0 && (
        <div
          className="text-center py-3 text-xs"
          style={{ color: "var(--text-tertiary)" }}
        >
          尚无使用记录
        </div>
      )}

      {/* 查看趋势链接 */}
      <button
        onClick={() => navigate("/trends")}
        className="flex items-center gap-1.5 text-xs font-medium group mt-2"
        style={{ color: "var(--text-tertiary)" }}
      >
        查看趋势
        <ArrowRight
          size={12}
          className="transition-transform group-hover:translate-x-0.5"
        />
      </button>
    </div>
  );
}

function getTodayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
