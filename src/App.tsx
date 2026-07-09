import { Outlet } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { useTimerEvents } from "./lib/useTimerEvents";

function App() {
  // Subscribe to timer events from Rust backend
  useTimerEvents();

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
