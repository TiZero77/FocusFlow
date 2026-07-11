import { create } from "zustand";

interface AwayWarningState {
  /** Whether the warning dialog is shown */
  isOpen: boolean;
  /** The binding ID that was paused when user switched away */
  pausedBindingId: string | null;
  /** Start the away warning (called after 5 min away) */
  showWarning: (bindingId: string) => void;
  /** Dismiss the warning (user switched back in time) */
  dismissWarning: () => void;
  /** Called when countdown reaches 0 */
  handleTimeout: () => void;
}

export const useAwayWarningStore = create<AwayWarningState>((set) => ({
  isOpen: false,
  pausedBindingId: null,
  showWarning: (bindingId) => set({ isOpen: true, pausedBindingId: bindingId }),
  dismissWarning: () => set({ isOpen: false, pausedBindingId: null }),
  handleTimeout: () => set({ isOpen: false, pausedBindingId: null }),
}));
