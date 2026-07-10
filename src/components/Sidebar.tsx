import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  TrendingUp,
  Link2,
  Settings,
  Flame,
} from "lucide-react";
import { useTimerStore } from "../stores/timerStore";
import { getUsageRecords, type UsageRecord } from "../lib/tauri";
import { useEffect, useState } from "react";
import { formatDuration, getPomodoroColor } from "../lib/utils";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "今日" },
  { to: "/trends", icon: TrendingUp, label: "趋势" },
  { to: "/bindings", icon: Link2, label: "绑定" },
];

export default function Sidebar() {
  const { bindings, activeTimers, selectedBindingId, isSelectionLocked, selectBinding, lockSelection, unlockSelection } = useTimerStore();
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([]);
  const timerEntries = Object.values(activeTimers).filter(Boolean);
  // Show all timers that have a binding
  const activeTimerList = timerEntries.filter((t) => {
    if (!t) return false;
    const binding = bindings.find((b) => b.id === t.bindingId);
    return !!binding;
  });

  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const today = `${year}-${month}-${day}`;
    getUsageRecords(today).then(setUsageRecords).catch(console.error);
  }, []);

  // Calculate app ranking
  const usageByBinding = new Map<string, number>();
  for (const record of usageRecords) {
    usageByBinding.set(record.bindingId, (usageByBinding.get(record.bindingId) ?? 0) + record.durationSeconds);
  }
  for (const timer of timerEntries) {
    if (timer) {
      usageByBinding.set(timer.bindingId, (usageByBinding.get(timer.bindingId) ?? 0) + timer.elapsedSeconds);
    }
  }
  const ranking = bindings
    .map((b) => ({ id: b.id, name: b.appName, seconds: usageByBinding.get(b.id) ?? 0 }))
    .filter((r) => r.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 5);

  return (
    <aside
      className="flex flex-col w-[280px] shrink-0 border-r"
      style={{
        background: "var(--bg-primary)",
        borderColor: "rgba(120,113,108,0.15)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-4 px-6 h-20">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: "var(--gradient-focus)",
            boxShadow: "var(--shadow-glow-focus)",
          }}
        >
          <Flame size={22} color="#fff" />
        </div>
        <div>
          <span
            className="text-lg font-semibold tracking-tight block"
            style={{ color: "var(--text-primary)" }}
          >
            FocusFlow
          </span>
          <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            专注 · 高效
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="px-4 py-4">
        <ul className="flex flex-col gap-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 relative ${
                    isActive ? "text-white" : "hover:text-white/80"
                  }`
                }
                style={({ isActive }) => ({
                  background: isActive ? "var(--bg-secondary)" : "transparent",
                  color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                })}
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
                        style={{ background: "var(--accent-focus)" }}
                      />
                    )}
                    <Icon size={18} />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Active Timers */}
        {activeTimerList.length > 0 && (
          <div className="mb-6">
            <div
              className="text-[10px] font-medium uppercase tracking-wider px-4 mb-3"
              style={{ color: "var(--text-tertiary)" }}
            >
              实时计时
            </div>
            <div className="flex flex-col gap-2">
              {activeTimerList.map((timer) => {
                if (!timer) return null;
                const binding = bindings.find((b) => b.id === timer.bindingId);
                if (!binding) return null;
                const color = getPomodoroColor(timer.pomodoroState);
                const isRunning = timer.isRunning;
                const isSelected = selectedBindingId === timer.bindingId;
                const handleCardClick = () => {
                  if (isSelected && isSelectionLocked) {
                    unlockSelection();
                  } else {
                    selectBinding(timer.bindingId);
                    lockSelection();
                  }
                };
                return (
                  <div
                    key={timer.bindingId}
                    className="px-4 py-3 rounded-xl cursor-pointer transition-all duration-200"
                    style={{
                      background: isSelected ? "var(--bg-hover)" : "var(--bg-secondary)",
                      outline: isSelected ? `2px solid ${color}80` : "none",
                      outlineOffset: "-1px",
                    }}
                    onClick={handleCardClick}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'animate-pulse' : ''}`}
                        style={{
                          background: isRunning ? color : "var(--accent-pause)",
                          boxShadow: isRunning ? `0 0 8px ${color}60` : "none",
                        }}
                      />
                      <span className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {binding.appName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px]" style={{ color: isRunning ? color : "var(--text-tertiary)" }}>
                        {isRunning ? getPomodoroLabel(timer.pomodoroState) : "已暂停"}
                      </span>
                      <span
                        className="text-sm font-mono font-semibold tabular-nums"
                        style={{ color: isRunning ? color : "var(--text-tertiary)" }}
                      >
                        {formatDuration(timer.elapsedSeconds)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* App Ranking */}
        {ranking.length > 0 && (
          <div>
            <div
              className="text-[10px] font-medium uppercase tracking-wider px-4 mb-3"
              style={{ color: "var(--text-tertiary)" }}
            >
              App 排行
            </div>
            <div className="flex flex-col gap-2">
              {ranking.map((item, i) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                  style={{ background: "var(--bg-secondary)" }}
                >
                  <span
                    className="text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-medium"
                    style={{
                      background: i === 0 ? "var(--accent-focus)" : "var(--bg-tertiary)",
                      color: i === 0 ? "#fff" : "var(--text-tertiary)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-xs flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                    {item.name}
                  </span>
                  <span className="text-[10px] font-mono tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                    {formatDuration(item.seconds)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Settings */}
      <div
        className="px-4 py-5 border-t"
        style={{ borderColor: "rgba(120,113,108,0.15)" }}
      >
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors duration-200 hover:text-white/80 ${
              isActive ? "text-white" : ""
            }`
          }
          style={({ isActive }) => ({
            color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
            background: isActive ? "var(--bg-secondary)" : "transparent",
          })}
        >
          <Settings size={18} />
          设置
        </NavLink>
      </div>
    </aside>
  );
}

function getPomodoroLabel(state: string): string {
  switch (state) {
    case "focus": return "专注中";
    case "break": return "短休息";
    case "longBreak": return "长休息";
    default: return "就绪";
  }
}
