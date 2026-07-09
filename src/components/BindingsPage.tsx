import { useState, useEffect } from "react";
import { Plus, Search, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { useTimerStore } from "../stores/timerStore";
import { getBindings, deleteBinding } from "../lib/tauri";
import AddBindingModal from "./AddBindingModal";

export default function BindingsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { bindings, setBindings, removeBinding } = useTimerStore();

  // Load bindings on mount
  useEffect(() => {
    getBindings().then(setBindings).catch(console.error);
  }, [setBindings]);

  const handleDelete = async (id: string) => {
    try {
      await deleteBinding(id);
      removeBinding(id);
    } catch (err) {
      console.error("Failed to delete binding:", err);
    }
  };

  const filtered = bindings.filter((b) =>
    b.appName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8 max-w-[960px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1
          className="text-2xl font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          绑定管理
        </h1>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 active:scale-[0.98]"
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
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent border-none outline-none text-sm flex-1"
          style={{ color: "var(--text-primary)" }}
        />
      </div>

      {/* Bindings list */}
      {filtered.length === 0 ? (
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
            {searchQuery ? "没有匹配的绑定" : "还没有绑定任何 app"}
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {searchQuery ? "尝试其他关键词" : "点击「添加绑定」开始追踪你的时间"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((binding) => (
            <BindingCard
              key={binding.id}
              name={binding.appName}
              bundleId={binding.bundleId}
              trackingEnabled={binding.trackingEnabled}
              pomodoroEnabled={binding.pomodoroEnabled}
              onDelete={() => handleDelete(binding.id)}
            />
          ))}
        </div>
      )}

      <AddBindingModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

function BindingCard({
  name,
  bundleId,
  trackingEnabled,
  pomodoroEnabled,
  onDelete,
}: {
  name: string;
  bundleId: string;
  trackingEnabled: boolean;
  pomodoroEnabled: boolean;
  onDelete: () => void;
}) {
  return (
    <div
      className="flex items-center gap-4 px-5 py-4 rounded-xl transition-colors hover:bg-white/[0.02]"
      style={{ background: "var(--bg-secondary)" }}
    >
      {/* Icon */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-semibold shrink-0"
        style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
      >
        {name.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {name}
        </div>
        <div className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
          {bundleId}
        </div>
      </div>

      {/* Status badges */}
      <div className="flex items-center gap-2">
        <StatusBadge
          label="追踪"
          active={trackingEnabled}
          color="var(--accent-focus)"
        />
        <StatusBadge
          label="番茄钟"
          active={pomodoroEnabled}
          color="var(--accent-break)"
        />
      </div>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/10"
        title="删除绑定"
      >
        <Trash2 size={16} style={{ color: "var(--accent-danger)" }} />
      </button>
    </div>
  );
}

function StatusBadge({
  label,
  active,
  color,
}: {
  label: string;
  active: boolean;
  color: string;
}) {
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
      style={{
        background: active ? `${color}15` : "var(--bg-tertiary)",
        color: active ? color : "var(--text-tertiary)",
      }}
    >
      {active ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
      {label}
    </div>
  );
}
