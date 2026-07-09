import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { onTimerUpdate, onAppChanged } from "./tauri";
import { useTimerStore } from "../stores/timerStore";
import {
  playFocusComplete,
  playBreakComplete,
  playLongBreakComplete,
} from "./sounds";

interface PomodoroUpdate {
  bindingId: string;
  state: string;
  remainingSeconds: number;
  pomodoroIndex: number;
  sessionCount: number;
}

/**
 * Hook that subscribes to Tauri timer/pomodoro events and syncs with Zustand store.
 * Call this once in the root App component.
 */
export function useTimerEvents() {
  const updateTimer = useTimerStore((s) => s.updateTimer);
  const updatePomodoro = useTimerStore((s) => s.updatePomodoro);

  // Track previous states to detect transitions
  const prevStates = useRef<Record<string, string>>({});

  useEffect(() => {
    // Timer updates (elapsed time)
    const unlistenTimer = onTimerUpdate((update) => {
      updateTimer(update.bindingId, {
        elapsedSeconds: update.elapsedSeconds,
        isRunning: update.isRunning,
        appName: update.appName,
      });
    });

    // App changes
    const unlistenApp = onAppChanged((info) => {
      console.log("App changed:", info);
    });

    // Pomodoro updates
    const unlistenPomodoro = listen<PomodoroUpdate>(
      "pomodoro-update",
      (event) => {
        const { bindingId, state, remainingSeconds, pomodoroIndex, sessionCount } =
          event.payload;

        const prevState = prevStates.current[bindingId];

        // Detect state transitions and play sounds
        if (prevState && prevState !== state) {
          if (state === "break" || state === "longBreak") {
            // Focus just completed
            playFocusComplete();
          } else if (state === "focus" && prevState === "break") {
            playBreakComplete();
          } else if (state === "focus" && prevState === "longBreak") {
            playLongBreakComplete();
          }
        }

        prevStates.current[bindingId] = state;

        updatePomodoro(bindingId, state, remainingSeconds, pomodoroIndex, sessionCount);
      }
    );

    return () => {
      unlistenTimer.then((fn) => fn());
      unlistenApp.then((fn) => fn());
      unlistenPomodoro.then((fn) => fn());
    };
  }, [updateTimer, updatePomodoro]);
}
