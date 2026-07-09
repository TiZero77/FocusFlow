import { useEffect, useState, useCallback } from "react";
import { Coffee, Flame } from "lucide-react";
import {
  getBindings,
  getTimerStates,
  getPomodoroStates,
  getSetting,
  setSetting,
  type PomodoroStateUpdate,
} from "../lib/tauri";
import { formatTimer, getPomodoroColor, getPomodoroLabel } from "../lib/utils";

type WidgetSize = "small" | "medium" | "large" | "compact";

interface Binding {
  id: string;
  appName: string;
  bundleId: string;
}

export default function FloatingWidget() {
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [timers, setTimers] = useState<
    Map<string, { elapsed: number; appName: string }>
  >(new Map());
  const [pomodoros, setPomodoros] = useState<
    Map<string, PomodoroStateUpdate>
  >(new Map());
  const [size, setSize] = useState<WidgetSize>("medium");
  const [hovered, setHovered] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Load bindings + size on mount
  useEffect(() => {
    getBindings()
      .then((b) => setBindings(b.map((x) => ({ id: x.id, appName: x.appName, bundleId: x.bundleId }))))
      .catch(console.error);
    getSetting("widget_size").then((v) => {
      if (v && ["compact", "small", "medium", "large"].includes(v)) {
        setSize(v as WidgetSize);
      }
    });
  }, []);

  // Poll backend every second for timer + pomodoro state
  useEffect(() => {
    const poll = async () => {
      try {
        const [timerStates, pomodoroStates] = await Promise.all([
          getTimerStates(),
          getPomodoroStates(),
        ]);

        const newTimers = new Map<string, { elapsed: number; appName: string }>();
        for (const t of timerStates) {
          newTimers.set(t.bindingId, {
            elapsed: t.elapsedSeconds,
            appName: t.appName,
          });
        }
        setTimers(newTimers);

        const newPomodoros = new Map<string, PomodoroStateUpdate>();
        for (const p of pomodoroStates) {
          newPomodoros.set(p.bindingId, p);
        }
        setPomodoros(newPomodoros);
      } catch (err) {
        console.error("Poll failed:", err);
      }
    };

    poll();
    const interval = setInterval(poll, 1000);
    return () => clearInterval(interval);
  }, []);

  // Save size when it changes
  const handleSizeChange = useCallback((s: WidgetSize) => {
    setSize(s);
    setSetting("widget_size", s).catch(console.error);
  }, []);

  // Click to open main window
  const handleClick = useCallback(async () => {
    try {
      const allWindows = await import("@tauri-apps/api/webviewWindow").then(
        (m) => m.getAllWebviewWindows()
      );
      const main = allWindows.find((w) => w.label === "main");
      if (main) {
        await main.show();
        await main.setFocus();
      }
    } catch (err) {
      console.error("Failed to open main window:", err);
    }
  }, []);

  // Right-click context menu
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    []
  );

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  // Build display data: merge bindings + timers + pomodoros
  const firstPomodoro = pomodoros.values().next().value;
  const activeBindingId = firstPomodoro?.bindingId ?? bindings[0]?.id;
  const activeBinding = bindings.find((b) => b.id === activeBindingId);
  const activePomodoro = activeBindingId
    ? pomodoros.get(activeBindingId)
    : undefined;
  const activeTimer = activeBindingId
    ? timers.get(activeBindingId)
    : undefined;

  const pomState = activePomodoro?.state ?? "idle";
  const pomColor = getPomodoroColor(pomState);
  const pomLabel = getPomodoroLabel(pomState);
  const remaining = activePomodoro?.remainingSeconds ?? 0;
  const elapsed = activeTimer?.elapsed ?? 0;
  const appName = activeBinding?.appName ?? "就绪";
  const pomIndex = activePomodoro?.pomodoroIndex ?? 0;

  return (
    <div
      data-tauri-drag-region
      className="select-none relative"
      style={{
        opacity: hovered ? 1 : 0.85,
        transition: "opacity 0.3s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {size === "compact" ? (
        <CompactWidget remaining={remaining} color={pomColor} />
      ) : size === "small" ? (
        <SmallWidget appName={appName} remaining={remaining} color={pomColor} />
      ) : size === "large" ? (
        <LargeWidget
          appName={appName}
          remaining={remaining}
          elapsed={elapsed}
          color={pomColor}
          state={pomLabel}
          index={pomIndex}
          pomodoros={pomodoros}
          bindings={bindings}
        />
      ) : (
        <MediumWidget
          appName={appName}
          remaining={remaining}
          elapsed={elapsed}
          color={pomColor}
          state={pomLabel}
          index={pomIndex}
        />
      )}

      {/* Size toggle on hover */}
      {hovered && (
        <div
          className="absolute bottom-1 right-1 flex gap-0.5"
          style={{ opacity: 0.6 }}
        >
          {(["compact", "small", "medium", "large"] as WidgetSize[]).map(
            (s) => (
              <button
                key={s}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSizeChange(s);
                }}
                className="w-4 h-4 rounded text-[8px] flex items-center justify-center"
                style={{
                  background: size === s ? pomColor : "var(--bg-tertiary)",
                  color: size === s ? "#fff" : "var(--text-tertiary)",
                }}
              >
                {s[0].toUpperCase()}
              </button>
            )
          )}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-[9999] rounded-lg py-1 min-w-[120px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            background: "var(--bg-secondary)",
            border: "1px solid rgba(72,72,74,0.3)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <ContextMenuItem label="打开主窗口" onClick={handleClick} />
          <div
            className="h-px my-1"
            style={{ background: "rgba(72,72,74,0.3)" }}
          />
          {(["compact", "small", "medium", "large"] as WidgetSize[]).map(
            (s) => (
              <ContextMenuItem
                key={s}
                label={`尺寸: ${s}`}
                active={size === s}
                onClick={() => handleSizeChange(s)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function ContextMenuItem({
  label,
  onClick,
  active,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-white/5"
      style={{
        color: active ? "var(--accent-focus)" : "var(--text-secondary)",
      }}
    >
      {label}
    </button>
  );
}

// ── Compact ──
function CompactWidget({
  remaining,
  color,
}: {
  remaining: number;
  color: string;
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-2xl"
      style={{
        background: "var(--bg-secondary)",
        border: `1px solid ${color}30`,
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        className="w-2 h-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 6px ${color}60` }}
      />
      <span className="text-xs font-mono tabular-nums" style={{ color }}>
        {formatTimer(remaining)}
      </span>
    </div>
  );
}

// ── Small ──
function SmallWidget({
  appName,
  remaining,
  color,
}: {
  appName: string;
  remaining: number;
  color: string;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 rounded-2xl"
      style={{
        background: "var(--bg-secondary)",
        border: `1px solid ${color}20`,
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        className="w-2 h-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 6px ${color}60` }}
      />
      <span
        className="text-xs font-medium truncate max-w-[80px]"
        style={{ color: "var(--text-primary)" }}
      >
        {appName}
      </span>
      <span className="text-sm font-mono tabular-nums" style={{ color }}>
        {formatTimer(remaining)}
      </span>
    </div>
  );
}

// ── Medium ──
function MediumWidget({
  appName,
  remaining,
  elapsed,
  color,
  state,
  index,
}: {
  appName: string;
  remaining: number;
  elapsed: number;
  color: string;
  state: string;
  index: number;
}) {
  return (
    <div
      className="w-[200px] rounded-2xl p-4"
      style={{
        background: "var(--bg-secondary)",
        border: `1px solid ${color}15`,
        backdropFilter: "blur(12px)",
        boxShadow: `0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px ${color}10`,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-sm font-medium truncate max-w-[120px]"
          style={{ color: "var(--text-primary)" }}
        >
          {appName}
        </span>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: `${color}15`, color }}
        >
          {state}
        </span>
      </div>

      <div
        className="w-full h-1.5 rounded-full mb-2 overflow-hidden"
        style={{ background: "var(--bg-tertiary)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{
            width: `${getProgress(elapsed, remaining)}%`,
            background: `linear-gradient(90deg, ${color}, ${color}CC)`,
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span
          className="text-2xl font-mono font-semibold tabular-nums"
          style={{ color }}
        >
          {formatTimer(remaining)}
        </span>
        <div className="flex items-center gap-1.5">
          {state === "短休息" || state === "长休息" ? (
            <Coffee size={14} style={{ color: "var(--text-tertiary)" }} />
          ) : (
            <Flame size={14} style={{ color: "var(--text-tertiary)" }} />
          )}
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            #{index}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Large ──
function LargeWidget({
  appName,
  remaining,
  elapsed,
  color,
  state,
  index,
  pomodoros,
  bindings,
}: {
  appName: string;
  remaining: number;
  elapsed: number;
  color: string;
  state: string;
  index: number;
  pomodoros: Map<string, PomodoroStateUpdate>;
  bindings: Binding[];
}) {
  return (
    <div
      className="w-[240px] rounded-2xl p-4"
      style={{
        background: "var(--bg-secondary)",
        border: `1px solid ${color}15`,
        backdropFilter: "blur(12px)",
        boxShadow: `0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px ${color}10`,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-sm font-medium truncate max-w-[140px]"
          style={{ color: "var(--text-primary)" }}
        >
          {appName}
        </span>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: `${color}15`, color }}
        >
          {state}
        </span>
      </div>

      <div
        className="w-full h-1.5 rounded-full mb-2 overflow-hidden"
        style={{ background: "var(--bg-tertiary)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{
            width: `${getProgress(elapsed, remaining)}%`,
            background: `linear-gradient(90deg, ${color}, ${color}CC)`,
          }}
        />
      </div>

      <div className="flex items-center justify-between mb-4">
        <span
          className="text-2xl font-mono font-semibold tabular-nums"
          style={{ color }}
        >
          {formatTimer(remaining)}
        </span>
        <div className="flex items-center gap-1.5">
          {state === "短休息" || state === "长休息" ? (
            <Coffee size={14} style={{ color: "var(--text-tertiary)" }} />
          ) : (
            <Flame size={14} style={{ color: "var(--text-tertiary)" }} />
          )}
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            #{index}
          </span>
        </div>
      </div>

      <div
        className="h-px mb-3"
        style={{ background: "var(--text-tertiary)" }}
      />

      <div className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
        今日
      </div>
      {Array.from(pomodoros.values())
        .slice(0, 3)
        .map((p) => {
          const binding = bindings.find((b) => b.id === p.bindingId);
          return (
            <div
              key={p.bindingId}
              className="flex items-center justify-between py-1"
            >
              <span
                className="text-xs truncate max-w-[120px]"
                style={{ color: "var(--text-secondary)" }}
              >
                {binding?.appName ?? p.bindingId}
              </span>
              <span
                className="text-xs font-mono tabular-nums"
                style={{ color: "var(--text-tertiary)" }}
              >
                {formatTimer(p.remainingSeconds)}
              </span>
            </div>
          );
        })}
    </div>
  );
}

// ── Helpers ──

function getProgress(elapsed: number, remaining: number): number {
  const total = elapsed + remaining;
  if (total <= 0) return 0;
  return Math.round((elapsed / total) * 100);
}
