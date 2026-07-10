import { useState, useEffect } from "react";
import { X, Timer, Coffee, Moon, RotateCcw } from "lucide-react";
import { updateBinding } from "../lib/tauri";
import { useTimerStore } from "../stores/timerStore";
import type { AppBinding } from "../stores/timerStore";

interface Props {
  open: boolean;
  binding: AppBinding | null;
  onClose: () => void;
}

export default function EditBindingModal({ open, binding, onClose }: Props) {
  const { updateBindingInStore } = useTimerStore();
  const [appName, setAppName] = useState("");
  const [pomodoroEnabled, setPomodoroEnabled] = useState(true);
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [longBreakMinutes, setLongBreakMinutes] = useState(15);
  const [longBreakInterval, setLongBreakInterval] = useState(4);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (binding) {
      setAppName(binding.appName);
      setPomodoroEnabled(binding.pomodoroEnabled);
      setFocusMinutes(binding.focusMinutes);
      setBreakMinutes(binding.breakMinutes);
      setLongBreakMinutes(binding.longBreakMinutes);
      setLongBreakInterval(binding.longBreakInterval);
    }
  }, [binding]);

  if (!open || !binding) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateBinding({
        id: binding.id,
        appName,
        pomodoroEnabled,
        focusMinutes,
        breakMinutes,
        longBreakMinutes,
        longBreakInterval,
      });
      updateBindingInStore(updated);
      onClose();
    } catch (err) {
      console.error("Failed to update binding:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative w-[420px] rounded-2xl overflow-hidden animate-fade-in"
        style={{ background: "var(--bg-secondary)", boxShadow: "var(--shadow-lg)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--bg-hover)" }}>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>编辑绑定</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors hover:bg-white/10"
          >
            <X size={18} style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 flex flex-col gap-5">
          {/* App Name */}
          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: "var(--text-tertiary)" }}>
              显示名称
            </label>
            <input
              type="text"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl text-sm bg-transparent border outline-none transition-colors"
              style={{
                borderColor: "var(--bg-hover)",
                color: "var(--text-primary)",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent-focus)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--bg-hover)")}
            />
          </div>

          {/* Pomodoro Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer size={16} style={{ color: "var(--accent-focus)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                番茄钟
              </span>
            </div>
            <button
              onClick={() => setPomodoroEnabled(!pomodoroEnabled)}
              className="w-11 h-6 rounded-full transition-colors relative"
              style={{
                background: pomodoroEnabled ? "var(--accent-focus)" : "var(--bg-tertiary)",
              }}
            >
              <div
                className="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all"
                style={{ left: pomodoroEnabled ? "22px" : "2px" }}
              />
            </button>
          </div>

          {/* Pomodoro Settings */}
          {pomodoroEnabled && (
            <div className="flex flex-col gap-4 pl-6 border-l-2" style={{ borderColor: "var(--bg-tertiary)" }}>
              <SettingRow
                icon={<Timer size={14} />}
                label="专注时长"
                value={focusMinutes}
                unit="分钟"
                onChange={setFocusMinutes}
                min={1}
                max={120}
              />
              <SettingRow
                icon={<Coffee size={14} />}
                label="短休息"
                value={breakMinutes}
                unit="分钟"
                onChange={setBreakMinutes}
                min={1}
                max={30}
              />
              <SettingRow
                icon={<Moon size={14} />}
                label="长休息"
                value={longBreakMinutes}
                unit="分钟"
                onChange={setLongBreakMinutes}
                min={1}
                max={60}
              />
              <SettingRow
                icon={<RotateCcw size={14} />}
                label="长休息间隔"
                value={longBreakInterval}
                unit="个番茄"
                onChange={setLongBreakInterval}
                min={1}
                max={10}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: "var(--bg-hover)" }}>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-white/5"
            style={{ color: "var(--text-secondary)" }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--gradient-focus)", color: "#fff" }}
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingRow({
  icon,
  label,
  value,
  unit,
  onChange,
  min,
  max,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  unit: string;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span style={{ color: "var(--text-tertiary)" }}>{icon}</span>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors hover:bg-white/10"
          style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)" }}
        >
          −
        </button>
        <span
          className="text-sm font-mono w-8 text-center tabular-nums"
          style={{ color: "var(--text-primary)" }}
        >
          {value}
        </span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors hover:bg-white/10"
          style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)" }}
        >
          +
        </button>
        <span className="text-xs w-12" style={{ color: "var(--text-tertiary)" }}>
          {unit}
        </span>
      </div>
    </div>
  );
}
