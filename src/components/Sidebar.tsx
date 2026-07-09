import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  TrendingUp,
  Link2,
  Settings,
  Timer,
} from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "今日" },
  { to: "/trends", icon: TrendingUp, label: "趋势" },
  { to: "/bindings", icon: Link2, label: "绑定" },
];

export default function Sidebar() {
  return (
    <aside
      className="flex flex-col w-[220px] shrink-0 border-r"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--text-tertiary)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "var(--accent-focus)" }}
        >
          <Timer size={18} color="#fff" />
        </div>
        <span
          className="text-lg font-semibold tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          FocusFlow
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2">
        <ul className="flex flex-col gap-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive ? "text-white" : "hover:text-white/80"
                  }`
                }
                style={({ isActive }) => ({
                  background: isActive ? "var(--bg-tertiary)" : "transparent",
                  color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                })}
              >
                <Icon size={18} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Settings */}
      <div className="px-3 py-4 border-t" style={{ borderColor: "var(--text-tertiary)" }}>
        <button
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm w-full transition-colors duration-200 hover:text-white/80"
          style={{ color: "var(--text-secondary)" }}
        >
          <Settings size={18} />
          设置
        </button>
      </div>
    </aside>
  );
}
