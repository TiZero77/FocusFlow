import { useEffect, useRef } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { onTimerUpdate, onAppChanged, getSetting, getTaskGroups, getBindings } from "./tauri";
import { useTimerStore } from "../stores/timerStore";
import { useAwayWarningStore } from "../stores/awayWarningStore";
import {
  playFocusComplete,
  playBreakComplete,
  playLongBreakComplete,
} from "./sounds";

const AWAY_WARNING_DELAY_MS = 5 * 60 * 1000; // 5 minutes

interface PomodoroUpdate {
  bindingId: string;
  state: string;
  remainingSeconds: number;
  plannedDurationSeconds: number;
  pomodoroIndex: number;
  sessionCount: number;
  isPaused: boolean;
  taskGroupId?: string;
  bindingElapsed?: Record<string, number>;
}

/**
 * Hook that subscribes to Tauri timer/pomodoro events and syncs with Zustand store.
 * Call this once in the root App component.
 */
export function useTimerEvents() {
  const updateTimer = useTimerStore((s) => s.updateTimer);
  const updatePomodoro = useTimerStore((s) => s.updatePomodoro);
  const updateGroupPomodoro = useTimerStore((s) => s.updateGroupPomodoro);
  const setSoundEnabled = useTimerStore((s) => s.setSoundEnabled);
  const setTaskGroups = useTimerStore((s) => s.setTaskGroups);
  const setBindings = useTimerStore((s) => s.setBindings);

  // Track previous states to detect transitions
  const prevStates = useRef<Record<string, string>>({});
  // Track the away timer
  const awayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awayBindingRef = useRef<string | null>(null);

  useEffect(() => {
    // Load sound setting
    getSetting("sound_enabled").then((v) => {
      if (v !== null) setSoundEnabled(v !== "false");
    });

    // Load task groups
    getTaskGroups().then(setTaskGroups).catch(console.error);
    getBindings().then(setBindings).catch(console.error);

    // Refresh task groups periodically
    const groupRefreshInterval = setInterval(() => {
      getTaskGroups().then(setTaskGroups).catch(console.error);
    }, 10000);

    // Timer updates (elapsed time)
    const unlistenTimer = onTimerUpdate((update) => {
      console.log("[Events] timer-update:", JSON.stringify(update));
      updateTimer(update.bindingId, {
        elapsedSeconds: update.elapsedSeconds,
        isRunning: update.isRunning,
        appName: update.appName,
      });
    });

    // App changes — handle away warning logic
    const unlistenApp = onAppChanged((info) => {
      console.log("App changed:", info);
      const state = useTimerStore.getState();

      if (info.matchedBindingId) {
        // User switched TO a bound app — cancel any away timer
        if (awayTimerRef.current) {
          clearTimeout(awayTimerRef.current);
          awayTimerRef.current = null;
          awayBindingRef.current = null;
        }
        // Also dismiss the warning dialog if it was showing
        const awayState = useAwayWarningStore.getState();
        if (awayState.isOpen) {
          awayState.dismissWarning();
        }

        if (!state.isSelectionLocked) {
          state.selectBinding(info.matchedBindingId);
        }
      } else {
        // User switched to a NON-bound app
        // Check if there's a focused pomodoro that will be paused
        const selectedId = state.selectedBindingId;
        if (selectedId) {
          const timer = state.activeTimers[selectedId];
          if (timer?.pomodoroState === "focus" && !timer.pomodoroIsPaused) {
            // A focus pomodoro will be paused by the backend — start the away timer
            awayBindingRef.current = selectedId;
            awayTimerRef.current = setTimeout(() => {
              // 5 minutes elapsed — show warning dialog
              const bindingId = awayBindingRef.current;
              if (bindingId) {
                const currentState = useTimerStore.getState();
                const currentTimer = currentState.activeTimers[bindingId];
                // Verify the pomodoro is still paused (user hasn't returned)
                if (currentTimer?.pomodoroIsPaused) {
                  useAwayWarningStore.getState().showWarning(bindingId);
                }
              }
              awayTimerRef.current = null;
            }, AWAY_WARNING_DELAY_MS);
          }
        }
      }
    });

    // Pomodoro updates
    const unlistenPomodoro = listen<PomodoroUpdate>(
      "pomodoro-update",
      (event) => {
        const { bindingId, state, remainingSeconds, plannedDurationSeconds, pomodoroIndex, sessionCount, isPaused, taskGroupId, bindingElapsed } =
          event.payload;

        // Use taskGroupId as the state key for group pomodoros
        const stateKey = taskGroupId || bindingId;
        const prevState = prevStates.current[stateKey];

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

        prevStates.current[stateKey] = state;

        // If a pomodoro resumed from pause (user returned to bound app), cancel away timer
        if (!isPaused && prevState === state && state === "focus") {
          if (awayTimerRef.current) {
            clearTimeout(awayTimerRef.current);
            awayTimerRef.current = null;
            awayBindingRef.current = null;
          }
          // Dismiss warning if showing
          const awayState = useAwayWarningStore.getState();
          if (awayState.isOpen) {
            awayState.dismissWarning();
          }
        }

        if (taskGroupId) {
          updateGroupPomodoro(taskGroupId, bindingId, state, remainingSeconds, plannedDurationSeconds, pomodoroIndex, sessionCount, isPaused, bindingElapsed ?? {});
        } else {
          updatePomodoro(bindingId, state, remainingSeconds, plannedDurationSeconds, pomodoroIndex, sessionCount, isPaused);
        }
      }
    );

    // Idle state changes
    const unlistenIdle = listen<boolean>("idle-changed", (event) => {
      console.log("Idle changed:", event.payload);
    });

    return () => {
      clearInterval(groupRefreshInterval);
      if (awayTimerRef.current) clearTimeout(awayTimerRef.current);
      unlistenTimer.then((fn) => fn());
      unlistenApp.then((fn) => fn());
      unlistenPomodoro.then((fn) => fn());
      unlistenIdle.then((fn) => fn());
    };
  }, [updateTimer, updatePomodoro, updateGroupPomodoro, setSoundEnabled, setTaskGroups, setBindings]);

  // Sync selection state to the widget window
  const selectedBindingId = useTimerStore((s) => s.selectedBindingId);
  const isSelectionLocked = useTimerStore((s) => s.isSelectionLocked);
  useEffect(() => {
    emit("selection-changed", { selectedBindingId, isSelectionLocked }).catch(() => {});
  }, [selectedBindingId, isSelectionLocked]);
}
