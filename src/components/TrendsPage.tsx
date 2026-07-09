import { BarChart3 } from "lucide-react";

export default function TrendsPage() {
  return (
    <div className="p-8 max-w-[960px] mx-auto">
      <h1
        className="text-2xl font-semibold mb-8"
        style={{ color: "var(--text-primary)" }}
      >
        趋势
      </h1>

      {/* Placeholder for charts */}
      <div className="grid gap-6">
        <div
          className="rounded-xl p-6"
          style={{ background: "var(--bg-secondary)" }}
        >
          <h2
            className="text-sm font-medium mb-4"
            style={{ color: "var(--text-secondary)" }}
          >
            每日专注时长
          </h2>
          <div
            className="flex flex-col items-center justify-center h-48 rounded-lg gap-3"
            style={{ background: "var(--bg-tertiary)" }}
          >
            <BarChart3 size={32} style={{ color: "var(--text-tertiary)" }} />
            <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              数据积累后显示趋势图
            </span>
          </div>
        </div>

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
          <div
            className="flex flex-col items-center justify-center h-48 rounded-lg gap-3"
            style={{ background: "var(--bg-tertiary)" }}
          >
            <BarChart3 size={32} style={{ color: "var(--text-tertiary)" }} />
            <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              一周专注密度热力图
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
