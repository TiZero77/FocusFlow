# FocusFlow

> 绑定 app 自动计时的番茄钟 + 时间追踪桌面应用。

## 功能

- **自动计时** — 绑定常用 app，打开即计时，切走即停
- **番茄钟** — 按 app 配置专注/休息节奏，到时间有提示音
- **浮窗面板** — 桌面常驻浮窗，实时显示当前状态，4 种尺寸
- **数据看板** — 今日总览、App 排行、时间线、趋势图表
- **菜单栏常驻** — macOS 菜单栏 / Windows 托盘显示状态
- **深色主题** — 暗色沉浸风格，长时间使用不疲劳

## 技术栈

| 层级 | 技术 |
|---|---|
| 桌面框架 | Tauri 2.x (Rust) |
| 前端 | React 18 + TypeScript |
| 样式 | Tailwind CSS |
| 状态管理 | Zustand |
| 数据库 | SQLite (rusqlite) |
| 图表 | Recharts |

## 开发

### 环境要求

- Node.js 18+
- Rust 1.77+
- macOS 或 Windows

### 安装

```bash
npm install
```

### 开发模式

```bash
npx tauri dev
```

### 构建

```bash
npx tauri build
```

## 项目结构

```
FocusFlow/
├── src/                          # React 前端
│   ├── components/               # UI 组件
│   │   ├── Sidebar.tsx           # 侧边栏导航
│   │   ├── TodayPage.tsx         # 今日总览
│   │   ├── TrendsPage.tsx        # 趋势图表
│   │   ├── BindingsPage.tsx      # 绑定管理
│   │   ├── SettingsPage.tsx      # 设置
│   │   ├── FloatingWidget.tsx    # 浮窗面板
│   │   ├── AddBindingModal.tsx   # 添加绑定弹窗
│   │   └── Onboarding.tsx        # 引导流程
│   ├── stores/timerStore.ts      # Zustand 状态管理
│   ├── lib/                      # 工具函数和 Tauri 封装
│   └── index.css                 # Tailwind + 设计系统
├── src-tauri/                    # Rust 后端
│   └── src/
│       ├── lib.rs                # Tauri 入口
│       ├── commands/             # Tauri 命令
│       ├── db/                   # SQLite 数据库
│       ├── models/               # 数据模型
│       ├── monitor/              # 系统级 app 检测
│       ├── timer/                # 时间追踪引擎
│       └── pomodoro/             # 番茄钟引擎
├── FocusFlow-PRD.md              # 产品需求文档
└── FocusFlow-DevPlan.md          # 开发计划
```

## License

MIT
