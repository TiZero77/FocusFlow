import { useEffect, useState, useCallback, useRef } from "react";
import { Coffee, Flame } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import {
  getBindings,
  getTimerStates,
  getPomodoroStates,
  getSetting,
  type TimerUpdate,
} from "../lib/tauri";
import { formatTimer } from "../lib/utils";

interface Binding {
  id: string;
  appName: string;
  bundleId: string;
}

interface LocalTimerState {
  bindingId: string;
  elapsedSeconds: number;
  isRunning: boolean;
}

interface LocalPomodoroState {
  bindingId: string;
  state: string;
  remainingSeconds: number;
  plannedDurationSeconds: number;
  pomodoroIndex: number;
  sessionCount: number;
}

export default function FloatingWidget() {
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [pomodoros, setPomodoros] = useState<Map<string, LocalPomodoroState>>(new Map());
  const [timers, setTimers] = useState<Map<string, LocalTimerState>>(new Map());
  const [hovered, setHovered] = useState(false);
  const [opacity, setOpacity] = useState(90);

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
    const loadSettings = () => {
      getBindings()
        .then((b) => setBindings(b.map((x) => ({ id: x.id, appName: x.appName, bundleId: x.bundleId }))))
        .catch(console.error);
      getSetting("widget_opacity").then((v) => { if (v) setOpacity(Number(v)); });
    };
    loadSettings();
    const interval = setInterval(loadSettings, 3000);
    return () => clearInterval(interval);
  }, []);

  // Listen to real-time events (same as main window's useTimerEvents)
  useEffect(() => {
    const unlistenTimer = listen<TimerUpdate>("timer-update", (event) => {
      const { bindingId, elapsedSeconds, isRunning } = event.payload;
      setTimers((prev) => {
        const next = new Map(prev);
        next.set(bindingId, { bindingId, elapsedSeconds, isRunning });
        return next;
      });
    });

    // Use plain Record type — serde renames to camelCase but we defend both
    const unlistenPomodoro = listen<Record<string, unknown>>(
      "pomodoro-update",
      (event) => {
        const p = event.payload;
        const bindingId = String(p.bindingId ?? p.binding_id ?? "");
        const remaining = Number(p.remainingSeconds ?? p.remaining_seconds ?? 0);
        const planned = Number(p.plannedDurationSeconds ?? p.planned_duration_seconds ?? 0);
        const index = Number(p.pomodoroIndex ?? p.pomodoro_index ?? 0);
        const count = Number(p.sessionCount ?? p.session_count ?? 0);
        const state = String(p.state ?? "idle");

        if (!bindingId) return;

        setPomodoros((prev) => {
          const next = new Map(prev);
          const existing = next.get(bindingId);
          next.set(bindingId, {
            bindingId,
            state,
            remainingSeconds: remaining,
            // Preserve existing plannedDuration if event doesn't carry it
            plannedDurationSeconds: planned || existing?.plannedDurationSeconds || 0,
            pomodoroIndex: index,
            sessionCount: count,
          });
          return next;
        });
      }
    );

    return () => {
      unlistenTimer.then((fn) => fn());
      unlistenPomodoro.then((fn) => fn());
    };
  }, []);

  // Fallback: poll every 3 seconds to catch up if events are missed
  // NOTE: poll only syncs timer-level fields; plannedDurationSeconds is
  // exclusively owned by the pomodoro-update event listener to avoid
  // the poll overwriting it with 0 from a stale/different backend response.
  useEffect(() => {
    const poll = async () => {
      try {
        const [timerStates, pomodoroStates] = await Promise.all([
          getTimerStates(),
          getPomodoroStates(),
        ]);

        // Sync timer states
        setTimers((prev) => {
          const next = new Map(prev);
          for (const t of timerStates) {
            next.set(t.bindingId, {
              bindingId: t.bindingId,
              elapsedSeconds: t.elapsedSeconds,
              isRunning: t.isRunning,
            });
          }
          return next;
        });

        // Sync pomodoro states — preserve plannedDurationSeconds from events
        setPomodoros((prev) => {
          const next = new Map(prev);
          for (const p of pomodoroStates) {
            const existing = next.get(p.bindingId);
            next.set(p.bindingId, {
              bindingId: p.bindingId,
              state: p.state,
              remainingSeconds: p.remainingSeconds,
              // Always keep the event-set value; poll data may lack this field
              plannedDurationSeconds: existing?.plannedDurationSeconds ?? 0,
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

  // Select the active binding using the same logic as main window:
  // prefer the running timer, fall back to the first one
  const runningTimer = Array.from(timers.values()).find((t) => t.isRunning);
  const activeBindingId = runningTimer?.bindingId ?? timers.values().next().value?.bindingId ?? bindings[0]?.id;
  const activeBinding = bindings.find((b) => b.id === activeBindingId);
  const activePomodoro = activeBindingId ? pomodoros.get(activeBindingId) : undefined;

  const pomState = activePomodoro?.state ?? "idle";
  const pomColor = getPomodoroColor(pomState);
  const remaining = activePomodoro?.remainingSeconds ?? 0;
  const appName = activeBinding?.appName ?? "就绪";
  const pomIndex = activePomodoro?.pomodoroIndex ?? 0;

  const phaseTotal = activePomodoro?.plannedDurationSeconds ?? 0;
  const phaseProgress = phaseTotal > 0 ? Math.round(((phaseTotal - remaining) / phaseTotal) * 100) : 0;

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
          borderRadius: "16px",
          backdropFilter: "blur(16px)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        }}
      >
        {/* Top bar */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{
            background: `${pomColor}15`,
            borderBottom: `1px solid ${pomColor}15`,
            padding: "6px 14px 6px 16px",
            borderTopLeftRadius: "16px",
            borderTopRightRadius: "16px",
          }}
        >
          <span
            className="text-[11px] font-medium truncate"
            style={{ color: "var(--text-primary)", maxWidth: "80px" }}
          >
            {appName}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <div className="w-2 h-2 rounded-full" style={{ background: pomColor, boxShadow: `0 0 6px ${pomColor}50` }} />
            <span className="text-[10px] font-medium" style={{ color: pomColor }}>
              {getPomodoroLabel(pomState)}
            </span>
          </div>
        </div>

        {/* Main content */}
        <div
          className="flex-1 flex flex-col justify-center"
          style={{
            padding: "4px 14px 4px 16px",
            borderBottomLeftRadius: "16px",
            borderBottomRightRadius: "16px",
            background: "var(--bg-secondary)",
          }}
          onClick={handleClick}
        >
          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full mb-1.5 overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
            <div
              className="h-full rounded-full transition-all duration-1000"
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
        </div>
      </div>
    </div>
  );
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
