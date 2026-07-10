import { create } from "zustand";
import { getSetting, setSetting } from "../lib/tauri";

export type ThemeId = "warm" | "crimson" | "celadon";

interface ThemeStore {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  initTheme: () => Promise<void>;
}

function applyTheme(theme: ThemeId) {
  if (theme === "warm") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: "warm",
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
    setSetting("theme", theme).catch(console.error);
  },
  initTheme: async () => {
    try {
      const saved = await getSetting("theme");
      const theme = (saved as ThemeId) || "warm";
      applyTheme(theme);
      set({ theme });
    } catch {
      // 默认 warm，无需处理
    }
  },
}));
