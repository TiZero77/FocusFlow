import { useEffect } from "react";
import { onTimerUpdate, onAppChanged } from "./tauri";
import { useTimerStore } from "../stores/timerStore";

/**
 * Hook that subscribes to Tauri timer events and syncs with Zustand store.
 * Call this once in the root App component.
 */
export function useTimerEvents() {
  const updateTimer = useTimerStore((s) => s.updateTimer);

  useEffect(() => {
    const unlistenTimer = onTimerUpdate((update) => {
      updateTimer(update.binding_id, {
        elapsedSeconds: update.elapsed_seconds,
        isRunning: update.is_running,
        appName: update.app_name,
      });
    });

    const unlistenApp = onAppChanged((info) => {
      console.log("App changed:", info);
    });

    return () => {
      unlistenTimer.then((fn) => fn());
      unlistenApp.then((fn) => fn());
    };
  }, [updateTimer]);
}
