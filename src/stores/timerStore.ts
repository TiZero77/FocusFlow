import { create } from "zustand";

export interface AppBinding {
  id: string;
  appName: string;
  bundleId: string;
  iconPath: string;
  trackingEnabled: boolean;
  pomodoroEnabled: boolean;
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
  createdAt: number;
}

export interface TimerState {
  bindingId: string;
  appName: string;
  elapsedSeconds: number;
  isRunning: boolean;
  pomodoroState: "idle" | "focus" | "break" | "longBreak";
  pomodoroRemaining: number;
  pomodoroPlannedDuration: number;
  pomodoroIndex: number;
  sessionCount: number;
}

interface TimerStore {
  bindings: AppBinding[];
  activeTimers: Record<string, TimerState>;
  soundEnabled: boolean;
  setBindings: (bindings: AppBinding[]) => void;
  addBinding: (binding: AppBinding) => void;
  removeBinding: (id: string) => void;
  updateBindingInStore: (binding: AppBinding) => void;
  updateTimer: (bindingId: string, state: Partial<TimerState>) => void;
  updatePomodoro: (
    bindingId: string,
    state: string,
    remaining: number,
    plannedDuration: number,
    index: number,
    sessionCount: number
  ) => void;
  setSoundEnabled: (enabled: boolean) => void;
}

export const useTimerStore = create<TimerStore>((set) => ({
  bindings: [],
  activeTimers: {},
  soundEnabled: true,
  setBindings: (bindings) => set({ bindings }),
  addBinding: (binding) =>
    set((s) => ({ bindings: [...s.bindings, binding] })),
  removeBinding: (id) =>
    set((s) => ({
      bindings: s.bindings.filter((b) => b.id !== id),
      activeTimers: Object.fromEntries(
        Object.entries(s.activeTimers).filter(([k]) => k !== id)
      ),
    })),
  updateBindingInStore: (binding) =>
    set((s) => ({
      bindings: s.bindings.map((b) => (b.id === binding.id ? binding : b)),
    })),
  updateTimer: (bindingId, state) =>
    set((s) => {
      console.log("[Store] updateTimer called:", bindingId, state);
      const prev = s.activeTimers[bindingId];
      if (prev) {
        const merged = { ...prev, ...state };
        console.log("[Store] updateTimer merged:", merged);
        return {
          activeTimers: { ...s.activeTimers, [bindingId]: merged },
        };
      }
      const defaults: TimerState = {
        bindingId,
        appName: "",
        elapsedSeconds: 0,
        isRunning: false,
        pomodoroState: "idle",
        pomodoroRemaining: 0,
        pomodoroPlannedDuration: 0,
        pomodoroIndex: 0,
        sessionCount: 0,
      };
      const created = { ...defaults, ...state };
      console.log("[Store] updateTimer created:", created);
      return {
        activeTimers: { ...s.activeTimers, [bindingId]: created },
      };
    }),
  updatePomodoro: (bindingId, state, remaining, plannedDuration, index, sessionCount) =>
    set((s) => {
      console.log("[Store] updatePomodoro called:", bindingId, state, remaining, plannedDuration);
      const prev = s.activeTimers[bindingId];
      if (prev) {
        const merged = {
          ...prev,
          pomodoroState: state as TimerState["pomodoroState"],
          pomodoroRemaining: remaining,
          pomodoroPlannedDuration: plannedDuration,
          pomodoroIndex: index,
          sessionCount,
        };
        console.log("[Store] updatePomodoro merged:", merged);
        return {
          activeTimers: { ...s.activeTimers, [bindingId]: merged },
        };
      }
      console.log("[Store] updatePomodoro created new entry");
      return {
        activeTimers: {
          ...s.activeTimers,
          [bindingId]: {
            bindingId,
            appName: "",
            elapsedSeconds: 0,
            isRunning: false,
            pomodoroState: state as TimerState["pomodoroState"],
            pomodoroRemaining: remaining,
            pomodoroPlannedDuration: plannedDuration,
            pomodoroIndex: index,
            sessionCount,
          },
        },
      };
    }),
  setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
}));
