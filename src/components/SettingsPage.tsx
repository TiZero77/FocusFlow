import { useState, useEffect, useCallback } from "react";
import {
  Power,
  Clock,
  Volume2,
  Monitor,
  Maximize2,
  Trash2,
} from "lucide-react";
import { getSetting, setSetting, clearAllData } from "../lib/tauri";

interface SettingRowProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  children: React.ReactNode;
}

function SettingRow({ icon, label, description, children }: SettingRowProps) {
  return (
    <div
      className="flex items-center gap-4 px-5 py-4 rounded-xl"
      style={{ background: "var(--bg-secondary)" }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {label}
        </div>
        <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {description}
        </div>
      </div>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-10 h-6 rounded-full transition-colors relative"
      style={{
        background: checked ? "var(--accent-focus)" : "var(--bg-tertiary)",
      }}
    >
      <div
        className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all"
        style={{ left: checked ? "22px" : "4px" }}
      />
    </button>
  );
}

export default function SettingsPage() {
  const [autoStart, setAutoStart] = useState(true);
  const [idleMinutes, setIdleMinutes] = useState(5);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);

  // Load settings from backend on mount
  useEffect(() => {
    getSetting("auto_start").then((v) => {
      if (v !== null) setAutoStart(v === "true");
    });
    getSetting("idle_minutes").then((v) => {
      if (v !== null) setIdleMinutes(Number(v));
    });
    getSetting("sound_enabled").then((v) => {
      if (v !== null) setSoundEnabled(v === "true");
    });
  }, []);

  // Save setting to backend
  const save = useCallback((key: string, value: string) => {
    setSetting(key, value).catch(console.error);
  }, []);

  const handleAutoStart = (v: boolean) => {
    setAutoStart(v);
    save("auto_start", String(v));
  };

  const handleIdleMinutes = (v: number) => {
    setIdleMinutes(v);
    save("idle_minutes", String(v));
  };

  const handleSoundEnabled = (v: boolean) => {
    setSoundEnabled(v);
    save("sound_enabled", String(v));
  };

  const handleClearData = async () => {
    if (!clearConfirm) {
      setClearConfirm(true);
      setTimeout(() => setClearConfirm(false), 3000);
      return;
    }
    setClearing(true);
    try {
      await clearAllData();
    } catch (err) {
      console.error("Failed to clear data:", err);
    } finally {
      setClearing(false);
      setClearConfirm(false);
    }
  };

  return (
    <div className="p-8 max-w-[640px] mx-auto">
      <h1
        className="text-2xl font-semibold mb-8"
        style={{ color: "var(--text-primary)" }}
      >
        设置
      </h1>

      <div className="flex flex-col gap-3">
        {/* General */}
        <h2
          className="text-xs font-medium uppercase tracking-wider mt-4 mb-1"
          style={{ color: "var(--text-tertiary)" }}
        >
          通用
        </h2>

        <SettingRow
          icon={<Power size={18} />}
          label="开机自启"
          description="登录时自动启动 FocusFlow"
        >
          <Toggle checked={autoStart} onChange={handleAutoStart} />
        </SettingRow>

        <SettingRow
          icon={<Clock size={18} />}
          label="闲置检测"
          description={`无操作 ${idleMinutes} 分钟后暂停计时`}
        >
          <select
            value={idleMinutes}
            onChange={(e) => handleIdleMinutes(Number(e.target.value))}
            className="bg-transparent border rounded-lg px-3 py-1.5 text-sm outline-none"
            style={{
              borderColor: "var(--text-tertiary)",
              color: "var(--text-primary)",
            }}
          >
            <option value={1}>1 分钟</option>
            <option value={3}>3 分钟</option>
            <option value={5}>5 分钟</option>
            <option value={10}>10 分钟</option>
            <option value={15}>15 分钟</option>
          </select>
        </SettingRow>

        {/* Sound */}
        <h2
          className="text-xs font-medium uppercase tracking-wider mt-4 mb-1"
          style={{ color: "var(--text-tertiary)" }}
        >
          提醒
        </h2>

        <SettingRow
          icon={<Volume2 size={18} />}
          label="提示音"
          description="番茄钟到时间时播放提示音"
        >
          <Toggle checked={soundEnabled} onChange={handleSoundEnabled} />
        </SettingRow>

        {/* Widget */}
        <h2
          className="text-xs font-medium uppercase tracking-wider mt-4 mb-1"
          style={{ color: "var(--text-tertiary)" }}
        >
          浮窗
        </h2>

        <SettingRow
          icon={<Monitor size={18} />}
          label="浮窗透明度"
          description="调整浮窗的不透明度"
        >
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            85%
          </span>
        </SettingRow>

        <SettingRow
          icon={<Maximize2 size={18} />}
          label="浮窗尺寸"
          description="切换浮窗的显示尺寸"
        >
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            中
          </span>
        </SettingRow>

        {/* Danger zone */}
        <h2
          className="text-xs font-medium uppercase tracking-wider mt-4 mb-1"
          style={{ color: "var(--accent-danger)" }}
        >
          数据
        </h2>

        <SettingRow
          icon={<Trash2 size={18} />}
          label="清除所有数据"
          description="删除所有使用记录和番茄钟数据"
        >
          <button
            onClick={handleClearData}
            disabled={clearing}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
            style={{
              background: clearConfirm
                ? "rgba(239,68,68,0.3)"
                : "rgba(239,68,68,0.15)",
              color: "var(--accent-danger)",
            }}
          >
            {clearing ? "清除中..." : clearConfirm ? "确认清除？" : "清除"}
          </button>
        </SettingRow>
      </div>
    </div>
  );
}
