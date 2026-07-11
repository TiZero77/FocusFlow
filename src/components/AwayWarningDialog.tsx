import { useEffect, useState, useRef, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import { markRottenTomato } from "../lib/tauri";

const COUNTDOWN_SECONDS = 30;

interface AwayWarningDialogProps {
  open: boolean;
  onClose: () => void;
  onTimeout: () => void;
}

/**
 * Warning dialog shown when the user has been away from a bound app for too long.
 * Shows a 30-second countdown. If it reaches 0, the pomodoro is marked as rotten.
 */
export default function AwayWarningDialog({ open, onClose, onTimeout }: AwayWarningDialogProps) {
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset countdown when dialog opens
  useEffect(() => {
    if (open) {
      setCountdown(COUNTDOWN_SECONDS);
    }
  }, [open]);

  // Countdown timer
  useEffect(() => {
    if (!open) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Time's up — mark as rotten
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [open]);

  const handleTimeout = useCallback(async () => {
    try {
      await markRottenTomato();
    } catch (err) {
      console.error("Failed to mark rotten tomato:", err);
    }
    onTimeout();
  }, [onTimeout]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl"
        style={{ background: "var(--bg-secondary)", border: "1px solid rgba(245,158,11,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: "rgba(245,158,11,0.15)" }}
          >
            <AlertTriangle size={28} style={{ color: "#f59e0b" }} />
          </div>
        </div>

        {/* Main text */}
        <h2
          className="text-center text-base font-bold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          请重新专注！
        </h2>

        {/* Sub text */}
        <p
          className="text-center text-sm mb-4"
          style={{ color: "var(--text-secondary)" }}
        >
          否则将会收获一个烂番茄 🥀
        </p>

        {/* Countdown */}
        <div className="text-center mb-5">
          <span
            className="text-3xl font-mono font-bold tabular-nums"
            style={{ color: countdown <= 10 ? "#ef4444" : "#f59e0b" }}
          >
            {countdown}
          </span>
          <span
            className="text-sm ml-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            秒后自动放弃
          </span>
        </div>

        {/* Progress bar */}
        <div
          className="w-full h-1.5 rounded-full overflow-hidden mb-4"
          style={{ background: "var(--bg-tertiary)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-1000 ease-linear"
            style={{
              width: `${(countdown / COUNTDOWN_SECONDS) * 100}%`,
              background: countdown <= 10 ? "#ef4444" : "#f59e0b",
            }}
          />
        </div>

        {/* Info text */}
        <p
          className="text-center text-xs"
          style={{ color: "var(--text-tertiary)" }}
        >
          切回绑定的应用即可继续专注
        </p>
      </div>
    </div>
  );
}
