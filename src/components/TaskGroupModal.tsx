import { useState, useEffect } from "react";
import { X, Timer, Coffee, Moon, RotateCcw, Users, Check, Plus, Minus } from "lucide-react";
import {
  createTaskGroup,
  updateTaskGroup,
  addBindingToGroup,
  removeBindingFromGroup,
  getTaskGroups,
} from "../lib/tauri";
import { useTimerStore } from "../stores/timerStore";
import type { AppBinding, TaskGroup } from "../stores/timerStore";

interface Props {
  open: boolean;
  group: TaskGroup | null; // null = create mode, non-null = edit mode
  onClose: () => void;
}

export default function TaskGroupModal({ open, group, onClose }: Props) {
  const { bindings, setTaskGroups, setBindings } = useTimerStore();
  const [name, setName] = useState("");
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [longBreakMinutes, setLongBreakMinutes] = useState(15);
  const [longBreakInterval, setLongBreakInterval] = useState(4);
  const [selectedBindingIds, setSelectedBindingIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const isEditMode = !!group;

  useEffect(() => {
    if (group) {
      setName(group.name);
      setFocusMinutes(group.focusMinutes);
      setBreakMinutes(group.breakMinutes);
      setLongBreakMinutes(group.longBreakMinutes);
      setLongBreakInterval(group.longBreakInterval);
      setSelectedBindingIds(new Set(group.bindings.map((b) => b.id)));
    } else {
      setName("");
      setFocusMinutes(25);
      setBreakMinutes(5);
      setLongBreakMinutes(15);
      setLongBreakInterval(4);
      setSelectedBindingIds(new Set());
    }
  }, [group]);

  if (!open) return null;

  // Available bindings: not in any group, or in this group (edit mode)
  const availableBindings = bindings.filter(
    (b) => b.taskGroupId === null || (isEditMode && b.taskGroupId === group.id)
  );

  const toggleBinding = (id: string) => {
    setSelectedBindingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isEditMode) {
        // Update group settings
        await updateTaskGroup({
          id: group.id,
          name: name.trim(),
          focusMinutes,
          breakMinutes,
          longBreakMinutes,
          longBreakInterval,
        });

        // Handle binding changes
        const currentIds = new Set(group.bindings.map((b) => b.id));
        const toAdd = [...selectedBindingIds].filter((id) => !currentIds.has(id));
        const toRemove = [...currentIds].filter((id) => !selectedBindingIds.has(id));

        for (const bindingId of toAdd) {
          await addBindingToGroup(group.id, bindingId);
        }
        for (const bindingId of toRemove) {
          await removeBindingFromGroup(bindingId);
        }
      } else {
        // Create new group
        const newGroup = await createTaskGroup({
          name: name.trim(),
          focusMinutes,
          breakMinutes,
          longBreakMinutes,
          longBreakInterval,
        });

        // Add selected bindings
        for (const bindingId of selectedBindingIds) {
          await addBindingToGroup(newGroup.id, bindingId);
        }
      }

      // Refresh data
      const [groups, freshBindings] = await Promise.all([
        getTaskGroups(),
        import("../lib/tauri").then((m) => m.getBindings()),
      ]);
      setTaskGroups(groups);
      setBindings(freshBindings);

      onClose();
    } catch (err) {
      console.error("Failed to save task group:", err);
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
        className="relative w-[480px] max-h-[80vh] rounded-2xl overflow-hidden flex flex-col animate-fade-in"
        style={{ background: "var(--bg-secondary)", boxShadow: "var(--shadow-lg)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--bg-hover)" }}>
          <div className="flex items-center gap-2">
            <Users size={18} style={{ color: "var(--accent-focus)" }} />
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              {isEditMode ? "编辑任务组" : "创建任务组"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors hover:bg-white/10"
          >
            <X size={18} style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {/* Group Name */}
          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: "var(--text-tertiary)" }}>
              任务组名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：前端开发、客户沟通..."
              className="w-full px-4 py-2.5 rounded-xl text-sm bg-transparent border outline-none transition-colors"
              style={{
                borderColor: "var(--bg-hover)",
                color: "var(--text-primary)",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent-focus)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--bg-hover)")}
            />
          </div>

          {/* Pomodoro Settings */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-1">
              <Timer size={14} style={{ color: "var(--accent-focus)" }} />
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                番茄钟设置
              </span>
            </div>
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

          {/* Binding Selection */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users size={14} style={{ color: "var(--accent-focus)" }} />
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                选择应用 ({selectedBindingIds.size} 已选)
              </span>
            </div>
            <div
              className="flex flex-col gap-1 max-h-[200px] overflow-y-auto rounded-xl p-2"
              style={{ background: "var(--bg-tertiary)" }}
            >
              {availableBindings.length === 0 ? (
                <div className="text-center py-6">
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    没有可用的应用，请先添加绑定
                  </span>
                </div>
              ) : (
                availableBindings.map((binding) => {
                  const isSelected = selectedBindingIds.has(binding.id);
                  return (
                    <div
                      key={binding.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
                      style={{
                        background: isSelected ? "var(--accent-focus)15" : "transparent",
                      }}
                      onClick={() => toggleBinding(binding.id)}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                        style={{
                          background: isSelected ? "var(--accent-focus)" : "var(--bg-hover)",
                          color: isSelected ? "#fff" : "var(--text-tertiary)",
                        }}
                      >
                        {binding.appName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                          {binding.appName}
                        </div>
                        <div className="text-[10px] truncate" style={{ color: "var(--text-tertiary)" }}>
                          {binding.bundleId.split("\\").pop()}
                        </div>
                      </div>
                      <div
                        className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                        style={{
                          background: isSelected ? "var(--accent-focus)" : "var(--bg-hover)",
                          color: isSelected ? "#fff" : "transparent",
                        }}
                      >
                        {isSelected ? <Check size={14} /> : <Plus size={14} style={{ color: "var(--text-tertiary)" }} />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
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
            disabled={saving || !name.trim()}
            className="px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--gradient-focus)", color: "#fff" }}
          >
            {saving ? "保存中..." : isEditMode ? "保存" : "创建"}
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
