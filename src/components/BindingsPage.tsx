import { useState, useEffect } from "react";
import { Plus, Search, Trash2, Loader2, Link2, Pencil, Users, FolderOpen } from "lucide-react";
import { useTimerStore } from "../stores/timerStore";
import { getBindings, deleteBinding, getTaskGroups, deleteTaskGroup } from "../lib/tauri";
import type { AppBinding, TaskGroup } from "../stores/timerStore";
import AddBindingModal from "./AddBindingModal";
import EditBindingModal from "./EditBindingModal";
import TaskGroupModal from "./TaskGroupModal";

export default function BindingsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editBinding, setEditBinding] = useState<AppBinding | null>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<TaskGroup | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null);
  const { bindings, setBindings, removeBinding, taskGroups, setTaskGroups } = useTimerStore();

  useEffect(() => {
    getBindings().then(setBindings).catch(console.error);
    getTaskGroups().then(setTaskGroups).catch(console.error);
  }, [setBindings, setTaskGroups]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await deleteBinding(id);
      removeBinding(id);
      // Refresh task groups (binding may have been in a group)
      getTaskGroups().then(setTaskGroups).catch(console.error);
    } catch (err) {
      console.error("Failed to delete binding:", err);
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    setDeletingGroup(id);
    try {
      await deleteTaskGroup(id);
      // Refresh bindings (task_group_id cleared) and groups
      const [freshBindings, freshGroups] = await Promise.all([
        getBindings(),
        getTaskGroups(),
      ]);
      setBindings(freshBindings);
      setTaskGroups(freshGroups);
    } catch (err) {
      console.error("Failed to delete task group:", err);
    } finally {
      setDeletingGroup(null);
    }
  };

  const filtered = bindings.filter((b) =>
    b.appName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group bindings by task group
  const groupedBindings = new Map<string, AppBinding[]>();
  const ungroupedBindings: AppBinding[] = [];
  for (const b of filtered) {
    if (b.taskGroupId) {
      const existing = groupedBindings.get(b.taskGroupId) ?? [];
      existing.push(b);
      groupedBindings.set(b.taskGroupId, existing);
    } else {
      ungroupedBindings.push(b);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-10 max-w-[1080px] mx-auto animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-semibold" style={{ color: "var(--text-primary)" }}>
              绑定管理
            </h1>
            <p className="text-sm mt-2" style={{ color: "var(--text-tertiary)" }}>
              管理你追踪的应用和任务组
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setEditGroup(null); setGroupModalOpen(true); }}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-colors hover:bg-white/5"
              style={{ border: "1px solid var(--bg-hover)", color: "var(--text-primary)" }}
            >
              <Users size={16} />
              创建任务组
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium"
              style={{ background: "var(--gradient-focus)", color: "#fff" }}
            >
              <Plus size={16} />
              添加绑定
            </button>
          </div>
        </div>

        {/* Task Groups Section */}
        {taskGroups.length > 0 && (
          <div className="mb-8">
            <div
              className="text-[10px] font-medium uppercase tracking-wider mb-4 flex items-center gap-2"
              style={{ color: "var(--text-tertiary)" }}
            >
              <Users size={12} />
              任务组
            </div>
            <div className="flex flex-col gap-3">
              {taskGroups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center gap-5 px-6 py-5 rounded-2xl card-hover"
                  style={{ background: "var(--bg-secondary)" }}
                >
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: "var(--accent-focus)20",
                      color: "var(--accent-focus)",
                    }}
                  >
                    <FolderOpen size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-medium" style={{ color: "var(--text-primary)" }}>
                      {group.name}
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                      {group.bindings.length} 个应用 · {group.focusMinutes}分钟专注 / {group.breakMinutes}分钟休息
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {group.bindings.map((b) => (
                        <span
                          key={b.id}
                          className="px-2 py-0.5 rounded text-[10px] font-medium"
                          style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                        >
                          {b.appName}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge label="跨应用" active={true} color="var(--accent-focus)" />
                  </div>
                  <button
                    onClick={() => { setEditGroup(group); setGroupModalOpen(true); }}
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors hover:bg-white/10"
                    title="编辑任务组"
                  >
                    <Pencil size={18} style={{ color: "var(--text-tertiary)" }} />
                  </button>
                  <button
                    onClick={() => handleDeleteGroup(group.id)}
                    disabled={deletingGroup === group.id}
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors hover:bg-red-500/10 disabled:opacity-50"
                    title="删除任务组"
                  >
                    {deletingGroup === group.id ? (
                      <Loader2 size={18} className="animate-spin" style={{ color: "var(--accent-danger)" }} />
                    ) : (
                      <Trash2 size={18} style={{ color: "var(--accent-danger)" }} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div
          className="flex items-center gap-3 px-5 py-4 rounded-xl mb-8"
          style={{ background: "var(--bg-secondary)" }}
        >
          <Search size={18} style={{ color: "var(--text-tertiary)" }} />
          <input
            type="text"
            placeholder="搜索已绑定的 app..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-sm flex-1"
            style={{ color: "var(--text-primary)" }}
          />
        </div>

        {/* Bindings list */}
        {filtered.length === 0 && taskGroups.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-72 rounded-2xl"
            style={{ background: "var(--bg-secondary)" }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: "var(--bg-tertiary)" }}
            >
              <Link2 size={24} style={{ color: "var(--text-tertiary)" }} />
            </div>
            <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>
              {searchQuery ? "没有匹配的绑定" : "还没有绑定任何 app"}
            </p>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {searchQuery ? "尝试其他关键词" : "点击「添加绑定」开始追踪你的时间"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Individual bindings (not in any group) */}
            {ungroupedBindings.length > 0 && (
              <>
                <div
                  className="text-[10px] font-medium uppercase tracking-wider mb-1 flex items-center gap-2"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  <Link2 size={12} />
                  单独绑定
                </div>
                {ungroupedBindings.map((binding) => {
                  const groupName = binding.taskGroupId
                    ? taskGroups.find((g) => g.id === binding.taskGroupId)?.name
                    : undefined;
                  return (
                    <BindingCard
                      key={binding.id}
                      id={binding.id}
                      name={binding.appName}
                      bundleId={binding.bundleId}
                      trackingEnabled={binding.trackingEnabled}
                      pomodoroEnabled={binding.pomodoroEnabled}
                      groupName={groupName}
                      isDeleting={deleting === binding.id}
                      onDelete={() => handleDelete(binding.id)}
                      onEdit={() => setEditBinding(binding)}
                    />
                  );
                })}
              </>
            )}

            {/* Bindings in groups (shown when searching) */}
            {searchQuery && [...groupedBindings.entries()].map(([groupId, groupBindings]) => {
              const group = taskGroups.find((g) => g.id === groupId);
              return groupBindings.map((binding) => (
                <BindingCard
                  key={binding.id}
                  id={binding.id}
                  name={binding.appName}
                  bundleId={binding.bundleId}
                  trackingEnabled={binding.trackingEnabled}
                  pomodoroEnabled={binding.pomodoroEnabled}
                  groupName={group?.name}
                  isDeleting={deleting === binding.id}
                  onDelete={() => handleDelete(binding.id)}
                  onEdit={() => setEditBinding(binding)}
                />
              ));
            })}
          </div>
        )}

        <AddBindingModal open={modalOpen} onClose={() => setModalOpen(false)} />
        <EditBindingModal open={!!editBinding} binding={editBinding} onClose={() => setEditBinding(null)} />
        <TaskGroupModal
          open={groupModalOpen}
          group={editGroup}
          onClose={() => { setGroupModalOpen(false); setEditGroup(null); }}
        />
      </div>
    </div>
  );
}

function BindingCard({
  name,
  bundleId,
  trackingEnabled,
  pomodoroEnabled,
  groupName,
  isDeleting,
  onDelete,
  onEdit,
}: {
  id: string;
  name: string;
  bundleId: string;
  trackingEnabled: boolean;
  pomodoroEnabled: boolean;
  groupName?: string;
  isDeleting: boolean;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      className="flex items-center gap-5 px-6 py-5 rounded-2xl card-hover"
      style={{ background: "var(--bg-secondary)" }}
    >
      {/* Icon */}
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-semibold shrink-0"
        style={{
          background: "var(--gradient-focus)",
          color: "#fff",
        }}
      >
        {name.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-base font-medium" style={{ color: "var(--text-primary)" }}>
          {name}
        </div>
        <div className="text-xs mt-1 truncate" style={{ color: "var(--text-tertiary)" }}>
          {bundleId.split("\\").pop() || bundleId}
        </div>
      </div>

      {/* Status badges */}
      <div className="flex items-center gap-3">
        <StatusBadge
          label="追踪"
          active={trackingEnabled}
          color="var(--accent-focus)"
        />
        {groupName ? (
          <StatusBadge
            label={groupName}
            active={true}
            color="var(--accent-warning)"
          />
        ) : (
          <StatusBadge
            label="番茄钟"
            active={pomodoroEnabled}
            color="var(--accent-break)"
          />
        )}
      </div>

      {/* Edit */}
      <button
        onClick={onEdit}
        className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors hover:bg-white/10"
        title="编辑绑定"
      >
        <Pencil size={18} style={{ color: "var(--text-tertiary)" }} />
      </button>

      {/* Delete */}
      <button
        onClick={onDelete}
        disabled={isDeleting}
        className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors hover:bg-red-500/10 disabled:opacity-50"
        title="删除绑定"
      >
        {isDeleting ? (
          <Loader2 size={18} className="animate-spin" style={{ color: "var(--accent-danger)" }} />
        ) : (
          <Trash2 size={18} style={{ color: "var(--accent-danger)" }} />
        )}
      </button>
    </div>
  );
}

function StatusBadge({
  label,
  active,
  color,
}: {
  label: string;
  active: boolean;
  color: string;
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
      style={{
        background: active ? `${color}20` : "var(--bg-tertiary)",
        color: active ? color : "var(--text-tertiary)",
      }}
    >
      <div
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: active ? color : "var(--text-tertiary)" }}
      />
      {label}
    </div>
  );
}
