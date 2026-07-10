import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event"; // used for pomodoro-update, idle-changed
import { onTimerUpdate, onAppChanged, getSetting } from "./tauri";
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
  plannedDurationSeconds: number;
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
  const setSoundEnabled = useTimerStore((s) => s.setSoundEnabled);

  // Track previous states to detect transitions
  const prevStates = useRef<Record<string, string>>({});

  useEffect(() => {
    // Load sound setting
    getSetting("sound_enabled").then((v) => {
      if (v !== null) setSoundEnabled(v !== "false");
    });

    // Timer updates (elapsed time)
    const unlistenTimer = onTimerUpdate((update) => {
      console.log("[Events] timer-update:", JSON.stringify(update));
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
        const { bindingId, state, remainingSeconds, plannedDurationSeconds, pomodoroIndex, sessionCount } =
          event.payload;

        const prevState = prevStates.current[bindingId];

        // Detect state transitions and play sounds
        if (prevState && prevState !== state) {
          const soundEnabled = useTimerStore.getState().soundEnabled;
          if (state === "break" || state === "longBreak") {
            if (soundEnabled) playFocusComplete();
          } else if (state === "focus" && prevState === "break") {
            if (soundEnabled) playBreakComplete();
          } else if (state === "focus" && prevState === "longBreak") {
            if (soundEnabled) playLongBreakComplete();
          }
        }

        prevStates.current[bindingId] = state;

        updatePomodoro(bindingId, state, remainingSeconds, plannedDurationSeconds, pomodoroIndex, sessionCount);
      }
    );

    // Idle state changes
    const unlistenIdle = listen<boolean>("idle-changed", (event) => {
      console.log("Idle changed:", event.payload);
    });

    return () => {
      unlistenTimer.then((fn) => fn());
      unlistenApp.then((fn) => fn());
      unlistenPomodoro.then((fn) => fn());
      unlistenIdle.then((fn) => fn());
    };
  }, [updateTimer, updatePomodoro, setSoundEnabled]);
}
