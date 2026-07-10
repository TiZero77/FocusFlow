import { useEffect, useState, useCallback } from "react";
import { Coffee, Flame, Pin, PinOff, BarChart3 } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import {
  getBindings,
  getPomodoroStates,
  getTimerStates,
  getSetting,
  getUsageRecords,
  type UsageRecord,
} from "../lib/tauri";
import type { AppBinding } from "../stores/timerStore";
import { formatTimer } from "../lib/utils";

interface LocalPomodoroState {
  bindingId: string;
  state: string;
  remainingSeconds: number;
  pomodoroIndex: number;
  sessionCount: number;
}

export default function FloatingWidget() {
  const [bindings, setBindings] = useState<AppBinding[]>([]);
  const [pomodoros, setPomodoros] = useState<Map<string, LocalPomodoroState>>(new Map());
  const [hovered, setHovered] = useState(false);
  const [opacity, setOpacity] = useState(90);
  const [isPinned, setIsPinned] = useState(true);
  const [widgetMode, setWidgetMode] = useState<"pomodoro" | "usage">("pomodoro");
  const [todayUsage, setTodayUsage] = useState<UsageRecord[]>([]);
  // Per-binding unpersisted elapsed seconds (monotonically increasing, never reset)
  const [unpersistedElapsed, setUnpersistedElapsed] = useState<Map<string, number>>(new Map());

  // Make body/html/root transparent to eliminate black edges at rounded corners
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const root = document.getElementById("root");
    if (root) {
      root.style.background = "transparent";
      root.style.margin = "0";
      root.style.padding = "0";
    }
  }, []);

  // Load settings and bindings
  useEffect(() => {
    const load = () => {
      getBindings().then(setBindings).catch(console.error);
      getSetting("widget_opacity").then((v) => { if (v) setOpacity(Number(v)); });
      getSetting("widget_mode").then((v) => {
        if (v === "usage" || v === "pomodoro") setWidgetMode(v);
      });
    };
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  // Load today's usage records
  useEffect(() => {
    if (widgetMode !== "usage") return;
    const today = new Date().toISOString().split("T")[0];
    getUsageRecords(today).then(setTodayUsage).catch(console.error);
    const interval = setInterval(() => {
      getUsageRecords(today).then(setTodayUsage).catch(console.error);
    }, 5000);
    return () => clearInterval(interval);
  }, [widgetMode]);

  // Listen to real-time pomodoro events
  useEffect(() => {
    const unlistenPomodoro = listen<Record<string, unknown>>(
      "pomodoro-update",
      (event) => {
        const p = event.payload;
        const bindingId = String(p.bindingId ?? p.binding_id ?? "");
        if (!bindingId) return;

        setPomodoros((prev) => {
          const next = new Map(prev);
          next.set(bindingId, {
            bindingId,
            state: String(p.state ?? "idle"),
            remainingSeconds: Number(p.remainingSeconds ?? p.remaining_seconds ?? 0),
            pomodoroIndex: Number(p.pomodoroIndex ?? p.pomodoro_index ?? 0),
            sessionCount: Number(p.sessionCount ?? p.session_count ?? 0),
          });
          return next;
        });
      }
    );

    return () => {
      unlistenPomodoro.then((fn) => fn());
    };
  }, []);

  // Poll fallback every 3 seconds
  useEffect(() => {
    const poll = async () => {
      try {
        const pomodoroStates = await getPomodoroStates();

        setPomodoros((prev) => {
          const next = new Map(prev);
          for (const p of pomodoroStates) {
            next.set(p.bindingId, {
              bindingId: p.bindingId,
              state: p.state,
              remainingSeconds: p.remainingSeconds,
              pomodoroIndex: p.pomodoroIndex,
              sessionCount: p.sessionCount,
            });
          }
          return next;
        });
      } catch (err) {
        console.error("Poll failed:", err);
      }
    };
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleMouseDown = useCallback(async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON" || target.closest("button")) return;
    try {
      await getCurrentWindow().startDragging();
    } catch (err) {
      console.error("Failed to start dragging:", err);
    }
  }, []);

  const togglePin = useCallback(async () => {
    try {
      const window = getCurrentWindow();
      const newPinned = !isPinned;
      await window.setAlwaysOnTop(newPinned);
      setIsPinned(newPinned);
    } catch (err) {
      console.error("Failed to toggle pin:", err);
    }
  }, [isPinned]);

  const handleClick = useCallback(async () => {
    try {
      const { getAllWebviewWindows } = await import("@tauri-apps/api/webviewWindow");
      const allWindows = await getAllWebviewWindows();
      const main = allWindows.find((w) => w.label === "main");
      if (main) {
        await main.show();
        await main.setFocus();
      }
    } catch (err) {
      console.error("Failed to open main window:", err);
    }
  }, []);

  // Select the active binding: prefer active pomodoro (focus state), fall back to first
  const activePomodoroEntry = Array.from(pomodoros.values()).find((p) => p.state === "focus");
  const activeBindingId = activePomodoroEntry?.bindingId ?? pomodoros.values().next().value?.bindingId ?? bindings[0]?.id;
  const activeBinding = bindings.find((b) => b.id === activeBindingId);
  const activePomodoro = activeBindingId ? pomodoros.get(activeBindingId) : undefined;

  const pomState = activePomodoro?.state ?? "idle";
  const pomColor = getPomodoroColor(pomState);
  const remaining = activePomodoro?.remainingSeconds ?? 0;
  const appName = activeBinding?.appName ?? "就绪";
  const pomIndex = activePomodoro?.pomodoroIndex ?? 0;

  // Calculate planned duration from binding settings — single source of truth,
  // no dependency on event/poll carrying the value.
  const phaseTotal = getPhaseTotal(pomState, activeBinding);
  const phaseProgress = phaseTotal > 0 ? Math.round(((phaseTotal - remaining) / phaseTotal) * 100) : 0;

  // Seed per-binding unpersisted elapsed from backend on mount
  useEffect(() => {
    getTimerStates().then((states) => {
      setUnpersistedElapsed((prev) => {
        const next = new Map(prev);
        for (const s of states) {
          next.set(s.bindingId, s.elapsedSeconds);
        }
        return next;
      });
    }).catch(console.error);
  }, []);

  // Listen to timer-update events — elapsed_seconds is monotonically increasing
  useEffect(() => {
    const unlistenTimer = listen<{
      bindingId: string;
      elapsedSeconds: number;
      isRunning: boolean;
    }>("timer-update", (event) => {
      const { bindingId, elapsedSeconds } = event.payload;
      setUnpersistedElapsed((prev) => {
        const next = new Map(prev);
        next.set(bindingId, elapsedSeconds);
        return next;
      });
    });
    return () => { unlistenTimer.then((fn) => fn()); };
  }, []);

  // Calculate today's total usage:
  // dbTotal = all previously saved records
  // + sum of per-binding unpersisted elapsed_seconds (monotonically increasing, never reset)
  const dbTotal = todayUsage.reduce((sum, r) => sum + r.durationSeconds, 0);
  const totalUnpersisted = Array.from(unpersistedElapsed.values()).reduce((sum, v) => sum + v, 0);
  const displaySeconds = dbTotal + totalUnpersisted;

  return (
    <div
      className="w-full h-full flex items-center justify-center select-none"
      style={{ opacity: hovered ? 1 : opacity / 100, transition: "opacity 0.2s ease", cursor: "grab" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={handleMouseDown}
    >
      <div
        className="w-full h-full overflow-hidden flex flex-col"
        style={{
          background: "var(--bg-secondary)",
          backdropFilter: "blur(16px)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        }}
      >
        {/* Top bar */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{
            background: widgetMode === "pomodoro" ? `${pomColor}15` : "var(--accent-focus)15",
            borderBottom: `1px solid ${widgetMode === "pomodoro" ? pomColor : "var(--accent-focus)"}15`,
            padding: "6px 14px 6px 16px",
          }}
        >
          <span
            className="text-[11px] font-medium truncate"
            style={{ color: "var(--text-primary)", maxWidth: "80px" }}
          >
            {widgetMode === "pomodoro" ? appName : "今日使用"}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {widgetMode === "pomodoro" && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ background: pomColor, boxShadow: `0 0 6px ${pomColor}50` }} />
                <span className="text-[10px] font-medium" style={{ color: pomColor }}>
                  {getPomodoroLabel(pomState)}
                </span>
              </div>
            )}
            {widgetMode === "usage" && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ background: pomState === "focus" ? "#22C55E" : "var(--text-tertiary)", boxShadow: pomState === "focus" ? "0 0 6px #22C55E50" : "none" }} />
                <span className="text-[10px] font-medium" style={{ color: pomState === "focus" ? "#22C55E" : "var(--text-tertiary)" }}>
                  {pomState === "focus" ? "专注中" : "空闲"}
                </span>
              </div>
            )}
            <button
              onClick={togglePin}
              className="p-0.5 rounded hover:bg-black/10 transition-colors"
              title={isPinned ? "取消置顶" : "置顶窗口"}
            >
              {isPinned ? (
                <Pin size={12} style={{ color: "var(--text-secondary)" }} />
              ) : (
                <PinOff size={12} style={{ color: "var(--text-tertiary)" }} />
              )}
            </button>
          </div>
        </div>

        {/* Main content */}
        <div
          className="flex-1 flex flex-col justify-center"
          style={{
            padding: "4px 14px 4px 16px",
            background: "var(--bg-secondary)",
          }}
          onClick={handleClick}
        >
          {widgetMode === "pomodoro" ? (
            <>
              {/* Progress bar */}
              <div className="w-full h-1.5 rounded-full mb-1.5 overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${phaseProgress}%`, background: `linear-gradient(90deg, ${pomColor}, ${pomColor}BB)` }}
                />
              </div>

              {/* Timer */}
              <div className="flex items-center justify-between">
                <span className="text-2xl font-mono font-bold tabular-nums" style={{ color: pomColor }}>
                  {formatTimer(remaining)}
                </span>
                <div className="flex items-center gap-1.5">
                  {pomState === "break" || pomState === "longBreak" ? (
                    <Coffee size={14} style={{ color: "var(--text-tertiary)" }} />
                  ) : (
                    <Flame size={14} style={{ color: "var(--text-tertiary)" }} />
                  )}
                  <span className="text-[10px] font-medium" style={{ color: "var(--text-tertiary)" }}>
                    #{pomIndex}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Usage progress bar */}
              <div className="w-full h-1.5 rounded-full mb-1.5 overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(100, (displaySeconds / 28800) * 100)}%`, background: "linear-gradient(90deg, var(--accent-focus), var(--accent-focus)BB)" }}
                />
              </div>

              {/* Usage time */}
              <div className="flex items-center justify-between">
                <span className="text-2xl font-mono font-bold tabular-nums" style={{ color: "var(--accent-focus)" }}>
                  {formatUsageTime(displaySeconds)}
                </span>
                <div className="flex items-center gap-1.5">
                  <BarChart3 size={14} style={{ color: "var(--text-tertiary)" }} />
                  <span className="text-[10px] font-medium" style={{ color: "var(--text-tertiary)" }}>
                    / 8h
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Calculate phase total from the binding's per-binding pomodoro settings.
 * This is the single source of truth — no event/poll dependency.
 */
function getPhaseTotal(state: string, binding: AppBinding | undefined): number {
  if (!binding) return 0;
  switch (state) {
    case "focus": return binding.focusMinutes * 60;
    case "break": return binding.breakMinutes * 60;
    case "longBreak": return binding.longBreakMinutes * 60;
    default: return 0;
  }
}

function getPomodoroColor(state: string): string {
  switch (state) {
    case "focus": return "#F97316";
    case "break": return "#22C55E";
    case "longBreak": return "#A78BFA";
    default: return "#78716C";
  }
}

function getPomodoroLabel(state: string): string {
  switch (state) {
    case "focus": return "专注";
    case "break": return "休息";
    case "longBreak": return "长休";
    default: return "就绪";
  }
}

function formatUsageTime(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}
