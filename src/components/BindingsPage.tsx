import { Plus, Search } from "lucide-react";

export default function BindingsPage() {
  return (
    <div className="p-8 max-w-[960px] mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1
          className="text-2xl font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          绑定管理
        </h1>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: "var(--accent-focus)", color: "#fff" }}
        >
          <Plus size={16} />
          添加绑定
        </button>
      </div>

      {/* Search */}
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl mb-6"
        style={{ background: "var(--bg-secondary)" }}
      >
        <Search size={18} style={{ color: "var(--text-tertiary)" }} />
        <input
          type="text"
          placeholder="搜索已绑定的 app..."
          className="bg-transparent border-none outline-none text-sm flex-1"
          style={{ color: "var(--text-primary)" }}
        />
      </div>

      {/* Empty State */}
      <div
        className="flex flex-col items-center justify-center h-64 rounded-xl"
        style={{ background: "var(--bg-secondary)" }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "var(--bg-tertiary)" }}
        >
          <Plus size={24} style={{ color: "var(--text-tertiary)" }} />
        </div>
        <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>
          还没有绑定任何 app
        </p>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          点击"添加绑定"开始追踪你的时间
        </p>
      </div>
    </div>
  );
}
