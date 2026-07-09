import { useEffect, useState } from "react";
import { Coffee, Flame } from "lucide-react";
import { useTimerStore, type TimerState } from "../stores/timerStore";
import { formatTimer } from "../lib/utils";
import { getBindings } from "../lib/tauri";

type WidgetSize = "small" | "medium" | "large" | "compact";

export default function FloatingWidget() {
  const { activeTimers, setBindings } = useTimerStore();
  const [size, setSize] = useState<WidgetSize>("medium");
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    getBindings().then(setBindings).catch(console.error);
  }, [setBindings]);

  // Get the first active timer (or the first bound app)
  const timerEntries = Object.values(activeTimers).filter(Boolean);
  const activeTimer = timerEntries[0];

  const pomState = activeTimer?.pomodoroState ?? "idle";
  const pomColor = getPomodoroColor(pomState);
  const pomLabel = getPomodoroLabel(pomState);

  return (
    <div
      data-tauri-drag-region
      className="select-none"
      style={{
        opacity: hovered ? 1 : 0.85,
        transition: "opacity 0.3s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {size === "compact" ? (
        <CompactWidget
          remaining={activeTimer?.pomodoroRemaining ?? 0}
          color={pomColor}
        />
      ) : size === "small" ? (
        <SmallWidget
          appName={activeTimer?.appName ?? "就绪"}
          remaining={activeTimer?.pomodoroRemaining ?? 0}
          color={pomColor}
        />
      ) : size === "large" ? (
        <LargeWidget
          appName={activeTimer?.appName ?? "就绪"}
          remaining={activeTimer?.pomodoroRemaining ?? 0}
          elapsed={activeTimer?.elapsedSeconds ?? 0}
          color={pomColor}
          state={pomLabel}
          index={activeTimer?.pomodoroIndex ?? 0}
          timerEntries={timerEntries}
        />
      ) : (
        <MediumWidget
          appName={activeTimer?.appName ?? "就绪"}
          remaining={activeTimer?.pomodoroRemaining ?? 0}
          elapsed={activeTimer?.elapsedSeconds ?? 0}
          color={pomColor}
          state={pomLabel}
          index={activeTimer?.pomodoroIndex ?? 0}
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
                  setSize(s);
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
    </div>
  );
}

// ── Compact: just a dot + countdown ──
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
      <span
        className="text-xs font-mono tabular-nums"
        style={{ color }}
      >
        {formatTimer(remaining)}
      </span>
    </div>
  );
}

// ── Small: app name + countdown ──
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
      <span
        className="text-sm font-mono tabular-nums"
        style={{ color }}
      >
        {formatTimer(remaining)}
      </span>
    </div>
  );
}

// ── Medium (default): app + progress bar + countdown + state ──
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
      {/* Header */}
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

      {/* Progress bar */}
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

      {/* Timer row */}
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
          <span
            className="text-xs"
            style={{ color: "var(--text-tertiary)" }}
          >
            #{index}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Large: medium + today's top apps ──
function LargeWidget({
  appName,
  remaining,
  elapsed,
  color,
  state,
  index,
  timerEntries,
}: {
  appName: string;
  remaining: number;
  elapsed: number;
  color: string;
  state: string;
  index: number;
  timerEntries: (TimerState | undefined)[];
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
      {/* Main timer section */}
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

      {/* Progress bar */}
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

      {/* Timer */}
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

      {/* Divider */}
      <div
        className="h-px mb-3"
        style={{ background: "var(--text-tertiary)" }}
      />

      {/* Today's summary */}
      <div className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
        今日
      </div>
      {timerEntries.slice(0, 3).map((t) =>
        t ? (
          <div
            key={t.bindingId}
            className="flex items-center justify-between py-1"
          >
            <span
              className="text-xs truncate max-w-[120px]"
              style={{ color: "var(--text-secondary)" }}
            >
              {t.appName}
            </span>
            <span
              className="text-xs font-mono tabular-nums"
              style={{ color: "var(--text-tertiary)" }}
            >
              {formatTimer(t.elapsedSeconds)}
            </span>
          </div>
        ) : null
      )}
    </div>
  );
}

// ── Helpers ──

function getPomodoroColor(state: string): string {
  switch (state) {
    case "focus":
      return "#3b82f6";
    case "break":
    case "longBreak":
      return "#22c55e";
    default:
      return "#6b7280";
  }
}

function getPomodoroLabel(state: string): string {
  switch (state) {
    case "focus":
      return "专注中";
    case "break":
      return "短休息";
    case "longBreak":
      return "长休息";
    default:
      return "就绪";
  }
}

function getProgress(elapsed: number, remaining: number): number {
  const total = elapsed + remaining;
  if (total <= 0) return 0;
  return Math.round((elapsed / total) * 100);
}
