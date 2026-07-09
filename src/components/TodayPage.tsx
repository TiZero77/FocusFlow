import { Timer, Flame, Zap } from "lucide-react";

export default function TodayPage() {
  const today = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

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
          value="0h 00m"
          trend=""
          color="var(--accent-focus)"
        />
        <StatCard
          icon={<Flame size={20} />}
          label="完成番茄"
          value="0 个"
          trend=""
          color="var(--accent-break)"
        />
        <StatCard
          icon={<Zap size={20} />}
          label="最长连续"
          value="0 分钟"
          trend=""
          color="var(--accent-warning)"
        />
      </div>

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
            绑定 app 后开始记录
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
  trend,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend: string;
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
      <div className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
        {value}
      </div>
      {trend && (
        <div className="text-xs mt-1" style={{ color: "var(--accent-break)" }}>
          {trend}
        </div>
      )}
    </div>
  );
}
