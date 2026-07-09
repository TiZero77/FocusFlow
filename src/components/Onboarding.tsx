import { useState } from "react";
import { Timer, Shield, Plus, ArrowRight, Check } from "lucide-react";
import { getRunningApps, createBinding } from "../lib/tauri";
import { useTimerStore } from "../stores/timerStore";
import type { ForegroundApp } from "../lib/tauri";

interface Props {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [runningApps, setRunningApps] = useState<ForegroundApp[]>([]);
  const { addBinding } = useTimerStore();

  const loadRunningApps = async () => {
    const apps = await getRunningApps().catch(() => []);
    setRunningApps(apps);
  };

  const handleBind = async (app: ForegroundApp) => {
    const binding = await createBinding({
      appName: app.name,
      bundleId: app.bundleId,
      iconPath: app.iconPath,
    }).catch(() => null);
    if (binding) addBinding(binding);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "var(--bg-primary)" }}
    >
      <div className="w-[420px] text-center">
        {step === 0 && (
          <div className="flex flex-col items-center gap-6">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{
                background: "var(--accent-focus)",
                boxShadow: "0 0 40px rgba(59,130,246,0.3)",
              }}
            >
              <Timer size={36} color="#fff" />
            </div>
            <h1
              className="text-3xl font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              你的时间，值得被看见
            </h1>
            <p
              className="text-sm leading-relaxed max-w-[300px]"
              style={{ color: "var(--text-secondary)" }}
            >
              绑定你常用的 app，自动追踪使用时间，用番茄钟节奏保持专注。
            </p>
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: "var(--accent-focus)", color: "#fff" }}
            >
              开始
              <ArrowRight size={16} />
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col items-center gap-6">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{
                background: "var(--accent-warning)",
                boxShadow: "0 0 40px rgba(245,158,11,0.3)",
              }}
            >
              <Shield size={36} color="#fff" />
            </div>
            <h1
              className="text-2xl font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              需要一个小权限
            </h1>
            <p
              className="text-sm leading-relaxed max-w-[320px]"
              style={{ color: "var(--text-secondary)" }}
            >
              为了检测你在用哪个 app，需要在系统设置中授予辅助功能权限。
              这不会收集任何数据，仅用于本地检测。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="px-6 py-3 rounded-xl text-sm font-medium transition-all hover:opacity-90"
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-secondary)",
                }}
              >
                稍后设置
              </button>
              <button
                onClick={() => {
                  // Open System Preferences on macOS
                  window.open(
                    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
                  );
                  setStep(2);
                }}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: "var(--accent-focus)", color: "#fff" }}
              >
                授权
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col items-center gap-6">
            <h1
              className="text-2xl font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              绑定你的第一个 app
            </h1>
            <p
              className="text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              打开你想追踪的 app，然后在这里绑定它。
            </p>

            <div className="w-full">
              <button
                onClick={loadRunningApps}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm mb-4 transition-all hover:opacity-90"
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-secondary)",
                }}
              >
                <Plus size={16} />
                检测当前运行的 app
              </button>

              {runningApps.length > 0 && (
                <div
                  className="rounded-xl overflow-hidden max-h-[240px] overflow-y-auto"
                  style={{ background: "var(--bg-secondary)" }}
                >
                  {runningApps.slice(0, 8).map((app) => (
                    <button
                      key={app.bundleId}
                      onClick={() => handleBind(app)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5 border-b"
                      style={{ borderColor: "var(--bg-tertiary)" }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                        style={{
                          background: "var(--bg-tertiary)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {app.name.charAt(0)}
                      </div>
                      <span
                        className="text-sm flex-1 truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {app.name}
                      </span>
                      <Plus
                        size={16}
                        style={{ color: "var(--accent-focus)" }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={onComplete}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: "var(--accent-focus)", color: "#fff" }}
            >
              <Check size={16} />
              完成
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
