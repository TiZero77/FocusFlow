import { useEffect, useState, useCallback } from "react";
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
import type { AppBinding } from "../stores/timerStore";
import { formatTimer } from "../lib/utils";

interface LocalTimerState {
  bindingId: string;
  elapsedSeconds: number;
  isRunning: boolean;
}

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
    const load = () => {
      getBindings().then(setBindings).catch(console.error);
      getSetting("widget_opacity").then((v) => { if (v) setOpacity(Number(v)); });
    };
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  // Listen to real-time events
  useEffect(() => {
    const unlistenTimer = listen<TimerUpdate>("timer-update", (event) => {
      const { bindingId, elapsedSeconds, isRunning } = event.payload;
      setTimers((prev) => {
        const next = new Map(prev);
        next.set(bindingId, { bindingId, elapsedSeconds, isRunning });
        return next;
      });
    });

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
      unlistenTimer.then((fn) => fn());
      unlistenPomodoro.then((fn) => fn());
    };
  }, []);

  // Poll fallback every 3 seconds
  useEffect(() => {
    const poll = async () => {
      try {
        const [timerStates, pomodoroStates] = await Promise.all([
          getTimerStates(),
          getPomodoroStates(),
        ]);

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

  // Select the active binding: prefer running timer, fall back to first
  const runningTimer = Array.from(timers.values()).find((t) => t.isRunning);
  const activeBindingId = runningTimer?.bindingId ?? timers.values().next().value?.bindingId ?? bindings[0]?.id;
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
