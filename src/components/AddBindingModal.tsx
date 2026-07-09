import { useState, useEffect, useCallback } from "react";
import { X, Search, Plus, Check, Loader2, Monitor } from "lucide-react";
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
  const [bindingIds, setBindingIds] = useState<Set<string>>(new Set());
  const { bindings, addBinding } = useTimerStore();

  // Track already-bound bundle IDs
  useEffect(() => {
    setBindingIds(new Set(bindings.map((b) => b.bundleId)));
  }, [bindings]);

  // Load running apps when modal opens
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

  // Search installed apps with debounce
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      searchInstalledApps(query).then(setSearchResults).catch(console.error);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleBind = useCallback(
    async (app: ForegroundApp) => {
      try {
        const binding = await createBinding({
          appName: app.name,
          bundleId: app.bundleId,
          iconPath: app.iconPath,
        });
        addBinding(binding);
      } catch (err) {
        console.error("Failed to bind:", err);
      }
    },
    [addBinding]
  );

  if (!open) return null;

  const showSearch = query.trim().length > 0;
  const displayList = showSearch ? searchResults : runningApps;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-[480px] max-h-[80vh] rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "var(--bg-secondary)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "rgba(72,72,74,0.3)" }}>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            添加绑定
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
          >
            <X size={18} style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-4">
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: "var(--bg-tertiary)" }}
          >
            <Search size={18} style={{ color: "var(--text-tertiary)" }} />
            <input
              type="text"
              placeholder="搜索已安装的 app..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-sm flex-1"
              style={{ color: "var(--text-primary)" }}
              autoFocus
            />
          </div>
        </div>

        {/* Section label */}
        <div className="px-6 pb-2">
          <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            {showSearch ? "搜索结果" : "当前运行"}
          </span>
        </div>

        {/* App list */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
            </div>
          ) : displayList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Monitor size={32} style={{ color: "var(--text-tertiary)" }} />
              <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                {showSearch ? "未找到匹配的 app" : "没有检测到运行中的 app"}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {displayList.map((app) => {
                const isBound = bindingIds.has(app.bundleId);
                return (
                  <div
                    key={app.bundleId}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl transition-colors hover:bg-white/5"
                  >
                    {/* App icon placeholder */}
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0"
                      style={{ background: "var(--bg-tertiary)" }}
                    >
                      {app.name.charAt(0).toUpperCase()}
                    </div>

                    {/* App info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {app.name}
                      </div>
                      {app.bundleId && (
                        <div className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
                          {app.bundleId}
                        </div>
                      )}
                    </div>

                    {/* Bind button */}
                    <button
                      onClick={() => !isBound && handleBind(app)}
                      disabled={isBound}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: isBound ? "var(--bg-tertiary)" : "var(--accent-focus)",
                        color: isBound ? "var(--text-tertiary)" : "#fff",
                        opacity: isBound ? 0.6 : 1,
                        cursor: isBound ? "default" : "pointer",
                      }}
                    >
                      {isBound ? (
                        <>
                          <Check size={14} />
                          已绑定
                        </>
                      ) : (
                        <>
                          <Plus size={14} />
                          绑定
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
