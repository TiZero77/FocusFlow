import { useState, useEffect, useCallback } from "react";
import { X, Search, Plus, Check, Loader2, Monitor, Zap } from "lucide-react";
import { getRunningApps, searchInstalledApps, createBinding } from "../lib/tauri";
import { useTimerStore } from "../stores/timerStore";
import type { ForegroundApp } from "../lib/tauri";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AddBindingModal({ open, onClose }: Props) {
  const [runningApps, setRunningApps] = useState<ForegroundApp[]>([]);
  const [searchResults, setSearchResults] = useState<ForegroundApp[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [bindingIds, setBindingIds] = useState<Set<string>>(new Set());
  const { bindings, addBinding } = useTimerStore();

  useEffect(() => {
    setBindingIds(new Set(bindings.map((b) => b.bundleId)));
  }, [bindings]);

  useEffect(() => {
    if (open) {
      setLoading(true);
      getRunningApps()
        .then(setRunningApps)
        .catch(console.error)
        .finally(() => setLoading(false));
      setQuery("");
      setSearchResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      searchInstalledApps(query).then(setSearchResults).catch(console.error).finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleBind = useCallback(async (app: ForegroundApp) => {
    try {
      const binding = await createBinding({ appName: app.name, bundleId: app.bundleId, iconPath: app.iconPath });
      addBinding(binding);
    } catch (err) {
      console.error("Failed to bind:", err);
    }
  }, [addBinding]);

  if (!open) return null;

  const showSearch = query.trim().length > 0;
  const unboundRunningApps = runningApps.filter((app) => app.bundleId && !bindingIds.has(app.bundleId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative w-[520px] max-h-[80vh] rounded-2xl overflow-hidden flex flex-col animate-fade-in"
        style={{ background: "var(--bg-secondary)", boxShadow: "var(--shadow-lg)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--bg-hover)" }}>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>添加绑定</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors hover:bg-white/10"
          >
            <X size={18} style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "var(--bg-tertiary)" }}>
            <Search size={18} style={{ color: "var(--text-tertiary)" }} />
            <input
              type="text"
              placeholder="搜索应用... (支持 VSCode、Chrome 等)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-sm flex-1"
              style={{ color: "var(--text-primary)" }}
              autoFocus
            />
            {searching && <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
            </div>
          ) : showSearch ? (
            <div>
              <div className="mb-3">
                <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>搜索结果</span>
              </div>
              {searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Monitor size={32} style={{ color: "var(--text-tertiary)" }} />
                  <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>未找到匹配的应用</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {searchResults.map((app) => (
                    <AppListItem
                      key={app.bundleId}
                      app={app}
                      isBound={bindingIds.has(app.bundleId)}
                      isRunning={runningApps.some((r) => r.bundleId === app.bundleId)}
                      onBind={handleBind}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Zap size={14} style={{ color: "var(--accent-warning)" }} />
                <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  快速绑定 - 当前运行的应用
                </span>
              </div>
              {unboundRunningApps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Monitor size={32} style={{ color: "var(--text-tertiary)" }} />
                  <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                    {runningApps.length > 0 ? "所有运行中的应用都已绑定" : "没有检测到运行中的应用"}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {unboundRunningApps.map((app) => (
                    <AppListItem key={app.bundleId} app={app} isBound={false} isRunning={true} onBind={handleBind} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AppListItem({
  app, isBound, isRunning, onBind,
}: {
  app: ForegroundApp; isBound: boolean; isRunning: boolean; onBind: (app: ForegroundApp) => void;
}) {
  const displayName = app.name || app.bundleId.split("\\").pop()?.replace(".exe", "") || "Unknown";
  const exeName = app.bundleId.split("\\").pop() || "";

  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-xl transition-colors hover:bg-white/5">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 relative"
        style={{ background: "var(--bg-tertiary)" }}
      >
        {displayName.charAt(0).toUpperCase()}
        {isRunning && (
          <div
            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
            style={{ background: "var(--accent-focus)", borderColor: "var(--bg-secondary)" }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{displayName}</div>
        <div className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
          {exeName}
          {isRunning && <span style={{ color: "var(--accent-focus)", marginLeft: 8 }}>运行中</span>}
        </div>
      </div>
      <button
        onClick={() => !isBound && onBind(app)}
        disabled={isBound}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
        style={{
          background: isBound ? "var(--bg-tertiary)" : "var(--gradient-focus)",
          color: isBound ? "var(--text-tertiary)" : "#fff",
          opacity: isBound ? 0.6 : 1,
          cursor: isBound ? "default" : "pointer",
        }}
      >
        {isBound ? <><Check size={14} /> 已绑定</> : <><Plus size={14} /> 绑定</>}
      </button>
    </div>
  );
}
