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
  pomodoroIndex: number;
}

interface TimerStore {
  bindings: AppBinding[];
  activeTimers: Record<string, TimerState>;
  setBindings: (bindings: AppBinding[]) => void;
  addBinding: (binding: AppBinding) => void;
  removeBinding: (id: string) => void;
  updateTimer: (bindingId: string, state: Partial<TimerState>) => void;
}

export const useTimerStore = create<TimerStore>((set) => ({
  bindings: [],
  activeTimers: {},
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
  updateTimer: (bindingId, state) =>
    set((s) => ({
      activeTimers: {
        ...s.activeTimers,
        [bindingId]: { ...s.activeTimers[bindingId], ...state } as TimerState,
      },
    })),
}));
