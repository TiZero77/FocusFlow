import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Modal dialog shown when the user tries to close the app with an active pomodoro.
 * Confirms whether to abandon the pomodoro (creating a "rotten tomato" record).
 */
export default function CloseConfirmDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const unlisten = listen("show-close-dialog", () => {
      setOpen(true);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  /** Save rotten tomato and exit the app */
  const handleAbandon = async () => {
    setOpen(false);
    try {
      await invoke("confirm_close");
    } catch (err) {
      console.error("confirm_close failed:", err);
    }
  };

  /** Hide window to tray, pomodoro continues */
  const handleMinimize = async () => {
    setOpen(false);
    try {
      await getCurrentWindow().hide();
    } catch (err) {
      console.error("hide window failed:", err);
    }
  };

  /** Close dialog, keep window open */
  const handleContinue = () => {
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl"
        style={{ background: "var(--bg-secondary)", border: "1px solid rgba(120,113,108,0.2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Emoji */}
        <div className="text-center text-4xl mb-4">🍅</div>

        {/* Main text */}
        <h2
          className="text-center text-base font-bold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          关闭应用会直接放弃当前番茄钟！
        </h2>

        {/* Sub text */}
        <p
          className="text-center text-sm mb-6"
          style={{ color: "var(--text-secondary)" }}
        >
          你会收获一个烂番茄 🍅
        </p>

        {/* Buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleContinue}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer"
            style={{
              background: "var(--accent-focus)",
              color: "#fff",
            }}
          >
            继续专注
          </button>
          <div className="flex gap-3">
            <button
              onClick={handleMinimize}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
              }}
            >
              最小化到托盘
            </button>
            <button
              onClick={handleAbandon}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer"
              style={{
                background: "#ef4444",
                color: "#fff",
              }}
            >
              放弃番茄
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
