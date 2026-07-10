import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Onboarding from "./components/Onboarding";
import { useTimerEvents } from "./lib/useTimerEvents";
import { useThemeStore } from "./stores/themeStore";

const ONBOARDING_KEY = "focusflow_onboarding_done";

function App() {
  // Subscribe to timer events from Rust backend
  useTimerEvents();

  // Initialize theme from persisted setting
  const initTheme = useThemeStore((s) => s.initTheme);
  useEffect(() => {
    initTheme();
  }, [initTheme]);

  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(ONBOARDING_KEY);
    if (!done) {
      setShowOnboarding(true);
    }
  }, []);

  const handleOnboardingComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setShowOnboarding(false);
  };

  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main
        className="flex-1 overflow-y-auto"
        style={{ background: "var(--bg-primary)" }}
      >
        <Outlet />
      </main>
    </div>
  );
}

export default App;
