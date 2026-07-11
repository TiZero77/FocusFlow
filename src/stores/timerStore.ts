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
  taskGroupId: string | null;
  createdAt: number;
}

export interface TaskGroup {
  id: string;
  name: string;
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
  createdAt: number;
  bindings: AppBinding[];
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
  pomodoroIsPaused: boolean;
}

/** Pomodoro state for a task group (shared across multiple bindings) */
export interface GroupPomodoroState {
  taskGroupId: string;
  activeBindingId: string;
  state: "idle" | "focus" | "break" | "longBreak";
  remainingSeconds: number;
  plannedDurationSeconds: number;
  pomodoroIndex: number;
  sessionCount: number;
  isPaused: boolean;
  /** Per-binding elapsed seconds within the current focus pomodoro (resets each focus phase) */
  bindingElapsed: Record<string, number>;
}

interface TimerStore {
  bindings: AppBinding[];
  taskGroups: TaskGroup[];
  activeTimers: Record<string, TimerState>;
  /** Group pomodoro states keyed by taskGroupId */
  groupPomodoroStates: Record<string, GroupPomodoroState>;
  soundEnabled: boolean;
  /** Currently selected binding for pomodoro display (null = auto-follow foreground) */
  selectedBindingId: string | null;
  /** When true, don't auto-switch selectedBindingId on foreground change */
  isSelectionLocked: boolean;
  setBindings: (bindings: AppBinding[]) => void;
  addBinding: (binding: AppBinding) => void;
  removeBinding: (id: string) => void;
  updateBindingInStore: (binding: AppBinding) => void;
  setTaskGroups: (groups: TaskGroup[]) => void;
  updateTimer: (bindingId: string, state: Partial<TimerState>) => void;
  updatePomodoro: (
    bindingId: string,
    state: string,
    remaining: number,
    plannedDuration: number,
    index: number,
    sessionCount: number,
    isPaused: boolean
  ) => void;
  updateGroupPomodoro: (
    taskGroupId: string,
    activeBindingId: string,
    state: string,
    remaining: number,
    plannedDuration: number,
    index: number,
    sessionCount: number,
    isPaused: boolean,
    bindingElapsed: Record<string, number>
  ) => void;
  setSoundEnabled: (enabled: boolean) => void;
  /** Set the selected binding for pomodoro display */
  selectBinding: (bindingId: string | null) => void;
  /** Lock selection so it doesn't auto-follow foreground changes */
  lockSelection: () => void;
  /** Unlock selection to resume auto-following foreground */
  unlockSelection: () => void;
}

export const useTimerStore = create<TimerStore>((set) => ({
  bindings: [],
  taskGroups: [],
  activeTimers: {},
  groupPomodoroStates: {},
  soundEnabled: true,
  selectedBindingId: null,
  isSelectionLocked: false,
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
  setTaskGroups: (taskGroups) => set({ taskGroups }),
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
  updatePomodoro: (bindingId, state, remaining, plannedDuration, index, sessionCount, isPaused) =>
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
          pomodoroIsPaused: isPaused,
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
            pomodoroIsPaused: isPaused,
          },
        },
      };
    }),
  updateGroupPomodoro: (taskGroupId, activeBindingId, state, remaining, plannedDuration, index, sessionCount, isPaused, bindingElapsed) =>
    set((s) => ({
      groupPomodoroStates: {
        ...s.groupPomodoroStates,
        [taskGroupId]: {
          taskGroupId,
          activeBindingId,
          state: state as GroupPomodoroState["state"],
          remainingSeconds: remaining,
          plannedDurationSeconds: plannedDuration,
          pomodoroIndex: index,
          sessionCount,
          isPaused,
          bindingElapsed,
        },
      },
    })),
  setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
  selectBinding: (bindingId) =>
    set({ selectedBindingId: bindingId }),
  lockSelection: () => set({ isSelectionLocked: true }),
  unlockSelection: () => set({ isSelectionLocked: false }),
}));
