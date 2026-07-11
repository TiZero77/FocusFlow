import { useToastStore } from "../stores/toastStore";
import { Info, CheckCircle, AlertTriangle, X } from "lucide-react";

const iconMap = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
};

const colorMap = {
  info: "var(--accent-focus)",
  success: "#22c55e",
  warning: "#f59e0b",
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10000] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type];
        const color = colorMap[toast.type];
        return (
          <div
            key={toast.id}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg pointer-events-auto animate-in slide-in-from-bottom-2"
            style={{
              background: "var(--bg-secondary)",
              border: `1px solid ${color}30`,
              backdropFilter: "blur(12px)",
              minWidth: "240px",
              maxWidth: "360px",
            }}
          >
            <Icon size={16} style={{ color, flexShrink: 0 }} />
            <span
              className="text-sm flex-1"
              style={{ color: "var(--text-primary)" }}
            >
              {toast.message}
            </span>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-0.5 rounded hover:bg-black/10 transition-colors flex-shrink-0"
            >
              <X size={14} style={{ color: "var(--text-tertiary)" }} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
