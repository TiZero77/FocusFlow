import { useState, useEffect, useCallback } from "react";
import {
  Power,
  Clock,
  Volume2,
  Monitor,
  Maximize2,
  Trash2,
  Timer,
  Coffee,
  Target,
  BarChart3,
  Activity,
} from "lucide-react";
import { getSetting, setSetting, clearAllData } from "../lib/tauri";
import { useTimerStore } from "../stores/timerStore";

interface SettingRowProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  children: React.ReactNode;
}

function SettingRow({ icon, label, description, children }: SettingRowProps) {
  return (
    <div
      className="flex items-center gap-5 px-6 py-5 rounded-2xl"
      style={{ background: "var(--bg-secondary)" }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {label}
        </div>
        <div className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
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
      className="w-12 h-7 rounded-full transition-all relative"
      style={{
        background: checked ? "var(--accent-focus)" : "var(--bg-tertiary)",
        boxShadow: checked ? "var(--shadow-glow-focus)" : "none",
      }}
    >
      <div
        className="w-5 h-5 rounded-full bg-white absolute top-1 transition-all"
        style={{ left: checked ? "24px" : "4px" }}
      />
    </button>
  );
}

function NumberSelect({
  value,
  onChange,
  options,
  suffix = "分钟",
}: {
  value: number;
  onChange: (v: number) => void;
  options: number[];
  suffix?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {options.map((n) => (
        <option key={n} value={n}>
          {n} {suffix}
        </option>
      ))}
    </select>
  );
}

export default function SettingsPage() {
  const [autoStart, setAutoStart] = useState(true);
  const [idleMinutes, setIdleMinutes] = useState(5);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [widgetOpacity, setWidgetOpacity] = useState(85);
  const [widgetMode, setWidgetMode] = useState<"pomodoro" | "usage">("pomodoro");
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [longBreakMinutes, setLongBreakMinutes] = useState(15);
  const [longBreakInterval, setLongBreakInterval] = useState(4);
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(480);
  const [clearing, setClearing] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const { setBindings } = useTimerStore();

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
    getSetting("widget_opacity").then((v) => {
      if (v !== null) setWidgetOpacity(Number(v));
    });
    getSetting("widget_mode").then((v) => {
      if (v === "usage" || v === "pomodoro") setWidgetMode(v);
    });
    getSetting("focus_minutes").then((v) => {
      if (v !== null) setFocusMinutes(Number(v));
    });
    getSetting("break_minutes").then((v) => {
      if (v !== null) setBreakMinutes(Number(v));
    });
    getSetting("long_break_minutes").then((v) => {
      if (v !== null) setLongBreakMinutes(Number(v));
    });
    getSetting("long_break_interval").then((v) => {
      if (v !== null) setLongBreakInterval(Number(v));
    });
    getSetting("daily_goal_minutes").then((v) => {
      if (v !== null) setDailyGoalMinutes(Number(v));
    });
  }, []);

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

  const handleWidgetOpacity = (v: number) => {
    setWidgetOpacity(v);
    save("widget_opacity", String(v));
  };

  const handleWidgetMode = (mode: "pomodoro" | "usage") => {
    setWidgetMode(mode);
    save("widget_mode", mode);
  };

  const handleFocusMinutes = (v: number) => {
    setFocusMinutes(v);
    save("focus_minutes", String(v));
  };

  const handleBreakMinutes = (v: number) => {
    setBreakMinutes(v);
    save("break_minutes", String(v));
  };

  const handleLongBreakMinutes = (v: number) => {
    setLongBreakMinutes(v);
    save("long_break_minutes", String(v));
  };

  const handleLongBreakInterval = (v: number) => {
    setLongBreakInterval(v);
    save("long_break_interval", String(v));
  };

  const handleDailyGoal = (v: number) => {
    setDailyGoalMinutes(v);
    save("daily_goal_minutes", String(v));
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
      setBindings([]);
      useTimerStore.setState({ activeTimers: {} });
    } catch (err) {
      console.error("Failed to clear data:", err);
    } finally {
      setClearing(false);
      setClearConfirm(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-10 max-w-[720px] mx-auto animate-fade-in">
        <div className="mb-10">
          <h1 className="text-3xl font-semibold" style={{ color: "var(--text-primary)" }}>
            设置
          </h1>
          <p className="text-sm mt-2" style={{ color: "var(--text-tertiary)" }}>
            自定义你的 FocusFlow
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {/* Pomodoro Settings */}
          <h2
            className="text-xs font-medium uppercase tracking-wider mt-6 mb-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            番茄钟
          </h2>

          <SettingRow
            icon={<Timer size={20} />}
            label="专注时长"
            description="每个番茄钟的专注时间"
          >
            <NumberSelect
              value={focusMinutes}
              onChange={handleFocusMinutes}
              options={[15, 20, 25, 30, 45, 50, 60, 90]}
            />
          </SettingRow>

          <SettingRow
            icon={<Coffee size={20} />}
            label="短休息时长"
            description="每个番茄钟后的休息时间"
          >
            <NumberSelect
              value={breakMinutes}
              onChange={handleBreakMinutes}
              options={[3, 5, 10, 15]}
            />
          </SettingRow>

          <SettingRow
            icon={<Coffee size={20} />}
            label="长休息时长"
            description="完成一组番茄钟后的长休息"
          >
            <NumberSelect
              value={longBreakMinutes}
              onChange={handleLongBreakMinutes}
              options={[10, 15, 20, 25, 30]}
            />
          </SettingRow>

          <SettingRow
            icon={<Clock size={20} />}
            label="长休息间隔"
            description="每完成几个番茄钟后进入长休息"
          >
            <NumberSelect
              value={longBreakInterval}
              onChange={handleLongBreakInterval}
              options={[2, 3, 4, 5, 6]}
              suffix="个"
            />
          </SettingRow>

          {/* General */}
          <h2
            className="text-xs font-medium uppercase tracking-wider mt-6 mb-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            通用
          </h2>

          <SettingRow
            icon={<Power size={20} />}
            label="开机自启"
            description="登录时自动启动 FocusFlow"
          >
            <Toggle checked={autoStart} onChange={handleAutoStart} />
          </SettingRow>

          <SettingRow
            icon={<Clock size={20} />}
            label="闲置检测"
            description={`无操作 ${idleMinutes} 分钟后暂停计时`}
          >
            <NumberSelect
              value={idleMinutes}
              onChange={handleIdleMinutes}
              options={[1, 3, 5, 10, 15, 30]}
            />
          </SettingRow>

          <SettingRow
            icon={<Target size={20} />}
            label="每日使用目标"
            description="主页进度条的参考目标时长"
          >
            <select
              value={dailyGoalMinutes}
              onChange={(e) => handleDailyGoal(Number(e.target.value))}
            >
              <option value={0}>不设目标</option>
              <option value={240}>4 小时</option>
              <option value={360}>6 小时</option>
              <option value={480}>8 小时</option>
              <option value={600}>10 小时</option>
            </select>
          </SettingRow>

          {/* Sound */}
          <h2
            className="text-xs font-medium uppercase tracking-wider mt-6 mb-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            提醒
          </h2>

          <SettingRow
            icon={<Volume2 size={20} />}
            label="提示音"
            description="番茄钟到时间时播放提示音"
          >
            <Toggle checked={soundEnabled} onChange={handleSoundEnabled} />
          </SettingRow>

          {/* Widget */}
          <h2
            className="text-xs font-medium uppercase tracking-wider mt-6 mb-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            浮窗
          </h2>

          <SettingRow
            icon={widgetMode === "pomodoro" ? <Timer size={20} /> : <BarChart3 size={20} />}
            label="浮窗模式"
            description={widgetMode === "pomodoro" ? "显示番茄钟计时器" : "显示今日使用时长统计"}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleWidgetMode("pomodoro")}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: widgetMode === "pomodoro" ? "var(--accent-focus)" : "var(--bg-tertiary)",
                  color: widgetMode === "pomodoro" ? "#fff" : "var(--text-secondary)",
                }}
              >
                番茄钟
              </button>
              <button
                onClick={() => handleWidgetMode("usage")}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: widgetMode === "usage" ? "var(--accent-focus)" : "var(--bg-tertiary)",
                  color: widgetMode === "usage" ? "#fff" : "var(--text-secondary)",
                }}
              >
                使用时长
              </button>
            </div>
          </SettingRow>

          <SettingRow
            icon={<Monitor size={20} />}
            label="浮窗透明度"
            description="调整浮窗的不透明度"
          >
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={30}
                max={100}
                value={widgetOpacity}
                onChange={(e) => handleWidgetOpacity(Number(e.target.value))}
                className="w-28"
              />
              <span
                className="text-sm font-mono w-12 text-right"
                style={{ color: "var(--text-secondary)" }}
              >
                {widgetOpacity}%
              </span>
            </div>
          </SettingRow>

          <SettingRow
            icon={<Maximize2 size={20} />}
            label="浮窗尺寸"
            description="右键点击浮窗可切换尺寸"
          >
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              右键菜单切换
            </span>
          </SettingRow>

          {/* Danger zone */}
          <h2
            className="text-xs font-medium uppercase tracking-wider mt-6 mb-2"
            style={{ color: "var(--accent-danger)" }}
          >
            数据
          </h2>

          <SettingRow
            icon={<Trash2 size={20} />}
            label="清除所有数据"
            description="删除所有使用记录、绑定和番茄钟数据"
          >
            <button
              onClick={handleClearData}
              disabled={clearing}
              className="px-5 py-2.5 rounded-xl text-xs font-medium"
              style={{
                background: clearConfirm ? "var(--accent-danger)" : "rgba(239,68,68,0.15)",
                color: clearConfirm ? "#fff" : "var(--accent-danger)",
              }}
            >
              {clearing ? "清除中..." : clearConfirm ? "确认清除？" : "清除"}
            </button>
          </SettingRow>
        </div>
      </div>
    </div>
  );
}
