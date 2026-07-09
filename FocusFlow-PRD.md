# FocusFlow — 产品需求文档 (PRD)

> 版本：v1.0 | 日期：2026-07-09 | 状态：设计完成，待开发

---

## 1. 产品概述

### 1.1 一句话描述

一个 macOS + Windows 桌面应用，通过系统级 app 监控自动追踪使用时间，支持按 app 配置番茄钟节奏，用菜单栏 + 可拖拽浮窗提供零打扰的实时反馈，数据看板回顾使用习惯。

### 1.2 目标用户

- 每天在电脑前工作 6 小时以上的知识工作者
- 想了解自己时间花在哪里、但不想手动记录的人
- 需要番茄钟节奏强制休息、但嫌传统番茄钟太死板的人

### 1.3 核心价值

| 传统番茄钟 | FocusFlow |
|---|---|
| 手动开始/停止 | 绑定 app，打开即计时 |
| 固定 25/5 节奏 | 每个 app 独立配置 |
| 只管一个任务 | 同时追踪所有绑定 app |
| 关掉就没了 | 菜单栏 + 浮窗，始终在视线边缘 |

---

## 2. 平台与技术栈

### 2.1 目标平台

| 平台 | 支持 | 备注 |
|---|---|---|
| macOS | ✅ 主要平台 | 需要辅助功能权限（Accessibility API） |
| Windows | ✅ 主要平台 | 需要 WinEvents API |
| iOS | ❌ 不支持 | 系统沙盒限制，无法监控其他 app |

### 2.2 技术栈

| 层级 | 技术 | 理由 |
|---|---|---|
| 桌面框架 | **Tauri 2.x** | 体积极小（~5MB），Rust 后端性能好，系统 API 调用干净 |
| 前端 UI | **React 18 + TypeScript** | 生态最大，组件丰富 |
| 样式 | **Tailwind CSS** | 原子化 CSS，快速实现精细设计 |
| 组件库 | **shadcn/ui** | 大厂级组件质量，可复制可定制 |
| 数据库 | **SQLite（嵌入式）** | 零配置，rusqlite 成熟稳定，纯本地存储 |
| 状态管理 | **Zustand** | 轻量，适合 Tauri 的前后端通信模式 |
| 图表 | **Recharts** | React 生态最成熟的图表库，支持暗色主题 |
| 音效 | **Web Audio API** | 浏览器原生，Tauri 前端可直接使用 |

### 2.3 不使用的技术（及理由）

| 技术 | 不用的理由 |
|---|---|
| Electron | 包体 ~150MB，内存占用高 |
| Flutter Desktop | 桌面端生态小，第三方组件少 |
| 云数据库 / 后端服务 | MVP 阶段纯本地，砍掉服务器成本和复杂度 |

---

## 3. 功能需求

### 3.1 核心功能架构

```
┌─────────────────────────────────────────────┐
│                  FocusFlow                   │
├─────────────┬──────────────┬────────────────┤
│  系统监控层  │   计时逻辑层  │    展示层      │
│             │              │                │
│ • 检测前台app│ • 时间追踪    │ • 菜单栏       │
│ • 进程匹配  │ • 番茄钟计时  │ • 浮窗面板     │
│ • 闲置检测  │ • 数据聚合    │ • 主窗口       │
└─────────────┴──────────────┴────────────────┘
```

### 3.2 功能清单

#### F1 — App 监控与绑定

**功能描述：** 检测当前前台应用，与用户绑定的 app 列表匹配，自动启停计时。

**绑定方式：**

| 方式 | 描述 | 优先级 |
|---|---|---|
| 运行中列表 | 显示当前正在运行的 app，点击 "+" 绑定 | P0（MVP） |
| 搜索已安装 | 搜索框输入 app 名称，从本机已安装列表匹配 | P0（MVP） |

**绑定数据模型：**

```typescript
interface AppBinding {
  id: string;
  appName: string;           // 显示名称，如 "Visual Studio Code"
  bundleId: string;          // macOS: bundle ID, Windows: 进程名
  iconPath: string;          // app 图标路径
  trackingEnabled: boolean;  // 时间追踪开关（默认 true）
  pomodoroEnabled: boolean;  // 番茄钟开关（默认 true）
  pomodoroConfig: PomodoroConfig;
  createdAt: number;
}

interface PomodoroConfig {
  focusMinutes: number;      // 默认 25
  breakMinutes: number;      // 默认 5
  longBreakMinutes: number;  // 默认 15
  longBreakInterval: number; // 每几个番茄后长休息，默认 4
}
```

**平台实现：**

| 平台 | 检测方式 | 权限要求 |
|---|---|---|
| macOS | `NSWorkspace.shared.frontmostApplication` | 辅助功能权限（Accessibility） |
| Windows | `GetForegroundWindow` + `GetWindowText` | 无特殊权限（常规 API） |

#### F2 — 时间追踪（被动，始终运行）

**功能描述：** 对所有绑定的 app，只要在前台运行就自动计时。无开始/结束概念，纯粹记录使用时长。

**计时规则：**

| 场景 | 行为 |
|---|---|
| 绑定 app 切到前台 | 开始计时 |
| 切到其他 app | 暂停计时 |
| 关闭绑定 app | 停止计时，保存记录 |
| 闲置超过 5 分钟 | 暂停所有计时 |
| 闲置回来，绑定 app 在前台 | 自动恢复计时 |

**数据模型：**

```typescript
interface UsageRecord {
  id: string;
  bindingId: string;         // 关联的 AppBinding
  startTime: number;         // Unix timestamp
  endTime: number;           // Unix timestamp
  durationSeconds: number;   // 实际使用时长（扣除暂停）
  sessionDate: string;       // YYYY-MM-DD，用于按天聚合
}
```

#### F3 — 番茄钟（主动，默认开启）

**功能描述：** 在时间追踪的基础上，对绑定 app 叠加番茄钟节奏。默认开启，用户可按 app 关闭或自定义参数。

**番茄钟状态机：**

```
[空闲] → 绑定app到前台 → [专注中]
[专注中] → 25分钟到 → [短休息] → 5分钟到 → [专注中]
[专注中] → 第4个番茄完成 → [长休息] → 15分钟到 → [专注中]
[专注中] → 绑定app离开前台 → [暂停]
[暂停] → 绑定app回到前台 → [专注中]（继续倒计时）
```

**番茄钟数据模型：**

```typescript
interface PomodoroSession {
  id: string;
  bindingId: string;
  type: 'focus' | 'break' | 'longBreak';
  plannedDurationSeconds: number;
  actualDurationSeconds: number;
  completed: boolean;        // 是否正常完成（vs 被跳过/中断）
  interruptedBy: string;     // 如果被中断，记录原因
  startedAt: number;
  endedAt: number;
  pomodoroIndex: number;     // 当天第几个番茄
}
```

**提醒机制：**

| 层级 | 方式 | 默认状态 |
|---|---|---|
| 视觉 | 浮窗变色 + 动画（蓝→绿） | ✅ 默认开启 |
| 听觉 | 精心设计的提示音（短、柔和、有辨识度） | ✅ 默认开启 |
| 强制 | 半透明全屏遮罩，3 秒后消失 | ❌ 默认关闭，可选开启 |

#### F4 — 菜单栏

**功能描述：** macOS 菜单栏 / Windows 系统托盘常驻，显示当前状态。

**显示内容：**

| 状态 | 显示 |
|---|---|
| 正在专注 | `VS Code · 18:42 🍅` |
| 正在休息 | `休息 · 03:21 ☕` |
| 未绑定 app 在前台 | `就绪 ⏱️` |
| 暂停 | `已暂停 ⏸` |

**点击行为：** 弹出小面板（Popover），显示当前 session 详情 + 快捷操作（暂停/跳过/打开主窗口）。

#### F5 — 浮窗面板

**功能描述：** 桌面上的常驻浮窗，实时显示当前状态。

**三种尺寸：**

| 尺寸 | 内容 | 适用场景 |
|---|---|---|
| 小 | app 名称 + 倒计时 | 极简用户，屏幕空间紧张 |
| 中（默认） | app 名称 + 进度条 + 倒计时 + 状态 | 平衡信息量和空间 |
| 大 | 中尺寸 + 今日 top app 排行 | 想随时看到全局数据 |
| 紧凑 | 小圆点 + 倒计时数字 | 极致极简 |

**交互行为：**

| 交互 | 行为 |
|---|---|
| 拖拽 | 移动位置，记住位置，下次启动恢复 |
| 贴边 | 离屏幕边缘 < 20px 时自动吸附 |
| 单击 | 打开主窗口 |
| 右键 | 快捷菜单（暂停/跳过/切换app/退出） |
| 悬停 | 透明度从 80% 变为 100% |

**视觉细节：**

- 默认 80% 不透明度
- 暗色背景 + 微渐变光晕
- 专注状态：蓝色调
- 休息状态：绿色调
- 暂停状态：灰色调

#### F6 — 主窗口（数据看板）

**功能描述：** 完整的数据查看和设置管理界面。

**Tab 1 — 今日：**

```
┌──────────────────────────────────────────┐
│  今日总览                2026-07-09      │
│                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ 总专注时长 │ │ 完成番茄  │ │ 最长连续  │ │
│  │  4h 23m   │ │   8 个    │ │  52 分钟  │ │
│  │  ▲18%     │ │ 🍅🍅🍅🍅  │ │          │ │
│  └──────────┘ └──────────┘ └──────────┘ │
│                                          │
│  ── 时间线 ────────────────────────────── │
│  9:00  ██████████ VS Code               │
│  10:00 ██░░░░░░░░ 休息                   │
│  10:15 ████████░░ Figma                 │
│  11:00 ██████████████████ VS Code       │
│  12:30 ░░░░░░░░░░ 午休                   │
│  ...                                     │
│                                          │
│  ── App 排行 ──────────────────────────── │
│  VS Code    2h 14m  ████████            │
│  Figma      1h 05m  ████                │
│  Chrome       32m   ██                  │
└──────────────────────────────────────────┘
```

**Tab 2 — 趋势：**

- **日趋势折线图：** 过去 7 天 / 30 天每日专注时长
- **App 对比柱状图：** 各 app 周/月使用量对比
- **热力图：** 一周中每小时的专注密度（类似 GitHub contribution graph）
- **对比指标：** 本周 vs 上周，今日 vs 昨日

**Tab 3 — 绑定管理：**

- 已绑定 app 列表（卡片式）
- 每个 app 的设置：追踪开/关、番茄钟开/关、自定义时长
- 添加新绑定（跳转到绑定流程）
- 删除绑定（确认弹窗）

#### F7 — 引导流程（首次使用）

**三步引导，不超过 30 秒：**

| 步骤 | 内容 | 交互 |
|---|---|---|
| 1 | 价值说明："你的时间，值得被看见" | 点击"开始" |
| 2 | 权限申请：辅助功能权限 + 截图示意 | 点击"授权"跳转系统设置 |
| 3 | 绑定第一个 app：显示当前运行列表 | 点击 "+" 绑定 |

完成后直接进入主界面，浮窗出现在桌面角落。

---

## 4. 系统行为

### 4.1 开机自启

- **默认开启**
- macOS：通过 Login Item 注册
- Windows：通过启动文件夹注册
- 用户可在设置中关闭

### 4.2 闲置检测

- 默认阈值：5 分钟无操作
- 闲置时：暂停所有计时，浮窗显示"已暂停"
- 恢复时：自动恢复计时，浮窗"欢迎回来"动画（进度条闪一下）
- 闲置期间不计入任何 app 使用时间
- 用户可自定义阈值或关闭检测

### 4.3 后台运行

- 主窗口关闭后，app 继续在后台运行（菜单栏 + 浮窗）
- 退出方式：菜单栏右键 → 退出，或 Cmd+Q / Alt+F4
- 退出前确认："计时正在进行中，确定退出？"

---

## 5. 数据存储

### 5.1 存储方案

- **数据库：** SQLite，嵌入式，纯本地
- **Tauri 集成：** 通过 Rust 的 rusqlite crate 操作数据库
- **数据目录：**
  - macOS：`~/Library/Application Support/com.focusflow.app/`
  - Windows：`%APPDATA%/FocusFlow/`

### 5.2 数据库表结构

```sql
-- 绑定的 app
CREATE TABLE app_bindings (
  id TEXT PRIMARY KEY,
  app_name TEXT NOT NULL,
  bundle_id TEXT NOT NULL UNIQUE,
  icon_path TEXT,
  tracking_enabled INTEGER DEFAULT 1,
  pomodoro_enabled INTEGER DEFAULT 1,
  focus_minutes INTEGER DEFAULT 25,
  break_minutes INTEGER DEFAULT 5,
  long_break_minutes INTEGER DEFAULT 15,
  long_break_interval INTEGER DEFAULT 4,
  created_at INTEGER NOT NULL
);

-- 使用记录（时间追踪）
CREATE TABLE usage_records (
  id TEXT PRIMARY KEY,
  binding_id TEXT NOT NULL REFERENCES app_bindings(id),
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  duration_seconds INTEGER NOT NULL,
  session_date TEXT NOT NULL,  -- YYYY-MM-DD
  created_at INTEGER NOT NULL
);

-- 番茄钟记录
CREATE TABLE pomodoro_sessions (
  id TEXT PRIMARY KEY,
  binding_id TEXT NOT NULL REFERENCES app_bindings(id),
  type TEXT NOT NULL,  -- 'focus' | 'break' | 'longBreak'
  planned_duration_seconds INTEGER NOT NULL,
  actual_duration_seconds INTEGER NOT NULL,
  completed INTEGER NOT NULL,
  interrupted_by TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  pomodoro_index INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- 用户设置
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 索引
CREATE INDEX idx_usage_date ON usage_records(session_date);
CREATE INDEX idx_usage_binding ON usage_records(binding_id);
CREATE INDEX idx_pomodoro_date ON pomodoro_sessions(created_at);
```

### 5.3 数据量预估

| 数据 | 预估量 | 存储 |
|---|---|---|
| 绑定 app | 5~20 个 | ~10 KB |
| 使用记录 | ~100 条/天 | ~50 KB/天，~15 MB/年 |
| 番茄记录 | ~16 条/天 | ~10 KB/天，~3 MB/年 |

SQLite 轻松应对，无需优化。

---

## 6. 视觉设计规范

### 6.1 设计语言

- **锚点：** Linear.app 的设计风格
- **关键词：** 暗色沉浸、极简克制、信息密度适中、微动效

### 6.2 色彩系统

```css
/* 背景 */
--bg-primary: #0A0A0B;       /* 最深背景 */
--bg-secondary: #141416;     /* 卡片/面板背景 */
--bg-tertiary: #1C1C1F;      /* 悬停/选中状态 */

/* 文字 */
--text-primary: #F5F5F7;     /* 主文字 */
--text-secondary: #8E8E93;   /* 次要文字 */
--text-tertiary: #48484A;    /* 禁用/提示文字 */

/* 强调色 */
--accent-focus: #3B82F6;     /* 专注状态（蓝） */
--accent-break: #22C55E;     /* 休息状态（绿） */
--accent-pause: #6B7280;     /* 暂停状态（灰） */
--accent-warning: #F59E0B;   /* 警告 */
--accent-danger: #EF4444;    /* 危险/删除 */

/* 渐变 */
--gradient-glow: radial-gradient(ellipse at center, rgba(59,130,246,0.15), transparent);
```

### 6.3 字体

- **英文/数字：** SF Pro（macOS）/ Segoe UI（Windows），回退 Inter
- **中文：** 系统默认中文字体
- **等宽（计时器数字）：** SF Mono / Cascadia Code

### 6.4 圆角与阴影

```css
--radius-sm: 6px;    /* 小元素 */
--radius-md: 10px;   /* 卡片 */
--radius-lg: 16px;   /* 面板 */
--radius-full: 9999px; /* 药丸形状 */

--shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
--shadow-md: 0 4px 12px rgba(0,0,0,0.4);
--shadow-lg: 0 8px 24px rgba(0,0,0,0.5);
```

### 6.5 动效

- 状态切换：300ms ease-out
- 浮窗出现：scale(0.9) → scale(1)，200ms
- 进度条：平滑动画，无跳变
- 颜色变化：400ms 渐变过渡
- "欢迎回来"：进度条闪烁，150ms × 3

---

## 7. 用户旅程

### 7.1 首次使用

```
下载安装 → 打开 app → 引导页（价值说明）
→ 授权辅助功能权限 → 绑定第一个 app（如 VS Code）
→ 浮窗出现在桌面右上角 → 开始使用
```

### 7.2 日常使用

```
开机 → FocusFlow 自动启动（菜单栏 + 浮窗就绪）
→ 打开 VS Code → 自动开始计时 + 番茄钟倒计时
→ 浮窗显示"VS Code · 23:42 🍅 #1"
→ 25 分钟到 → 浮窗变绿 + 提示音
→ 休息 5 分钟 → 浮窗显示"休息 · 04:58 ☕"
→ 休息结束 → 浮窗恢复蓝色
→ 切到 Chrome → VS Code 计时暂停，Chrome 开始计时
→ 结束一天 → 菜单栏点击查看今日汇总
```

### 7.3 数据回顾

```
想看本周数据 → 点击浮窗/菜单栏 → 打开主窗口
→ Tab 2 趋势 → 本周专注 28h，比上周多 3h
→ 热力图发现周三下午效率最低
→ 调整周三下午安排
```

---

## 8. 权限需求

### 8.1 macOS

| 权限 | 用途 | 必需 |
|---|---|---|
| 辅助功能（Accessibility） | 检测前台 app | ✅ 是 |
| 通知 | 番茄钟提醒 | 可选 |
| 登录项 | 开机自启 | 可选 |

### 8.2 Windows

| 权限 | 用途 | 必需 |
|---|---|---|
| 常规 API 权限 | GetForegroundWindow | ✅ 自动（无需用户授权） |
| 通知 | 番茄钟提醒 | 可选 |
| 启动文件夹 | 开机自启 | 可选 |

---

## 9. 非功能需求

### 9.1 性能

| 指标 | 目标 |
|---|---|
| 安装包大小 | < 15 MB |
| 内存占用（空闲） | < 50 MB |
| 内存占用（活跃） | < 80 MB |
| CPU 占用（监控中） | < 1% |
| 启动时间 | < 2 秒 |
| 前台 app 切换检测延迟 | < 500ms |

### 9.2 可靠性

- app 崩溃后重启，自动恢复之前的计时状态
- SQLite 使用 WAL 模式，防止数据损坏
- 每次写入使用事务，保证数据一致性

### 9.3 可扩展性（未来考虑，不纳入 MVP）

- 云同步（可选）
- iOS companion app（Screen Time API）
- 桌宠模式浮窗
- 团队协作/排行榜
- Web 端数据查看
- 更多数据维度（心情标签、专注度评分）

---

## 10. MVP 范围界定

### 10.1 MVP 包含

- [x] Tauri 桌面应用框架搭建
- [x] 系统级前台 app 检测（macOS + Windows）
- [x] App 绑定（运行中列表 + 搜索）
- [x] 时间追踪（自动计时）
- [x] 番茄钟计时（可配置）
- [x] 菜单栏常驻
- [x] 浮窗面板（3 种尺寸 + 紧凑模式）
- [x] 主窗口（今日 / 趋势 / 绑定管理）
- [x] 提醒系统（浮窗变化 + 音效）
- [x] 闲置检测
- [x] 开机自启
- [x] 引导流程
- [x] 本地 SQLite 存储

### 10.2 MVP 不包含（后续迭代）

- [ ] 云同步
- [ ] iOS app
- [ ] 桌宠模式
- [ ] 全屏遮罩提醒（可选功能，优先级低）
- [ ] 自定义音效上传
- [ ] 数据导出（CSV/JSON）
- [ ] 多语言支持
- [ ] 深色/浅色主题切换

---

## 11. 开发里程碑（建议）

| 阶段 | 内容 | 预估周期 |
|---|---|---|
| **M0 — 骨架** | Tauri 项目搭建 + React 前端跑通 + SQLite 集成 | 1 周 |
| **M1 — 监控** | 系统级 app 检测 + 绑定机制 + 基础计时 | 1~2 周 |
| **M2 — 番茄钟** | 番茄钟逻辑 + 提醒系统 + 菜单栏 | 1 周 |
| **M3 — 浮窗** | 浮窗面板 + 拖拽 + 尺寸切换 + 视觉打磨 | 1~2 周 |
| **M4 — 数据** | 主窗口三 tab + 数据聚合 + 图表 | 1~2 周 |
| **M5 — 打磨** | 引导流程 + 闲置检测 + 开机自启 + 动效 + 测试 | 1~2 周 |
| **M6 — 发布** | macOS + Windows 打包 + 安装器 + 文档 | 1 周 |

**总计预估：8~11 周**（单人开发，视经验调整）

---

*文档结束。本文档由产品设计对话生成，所有决策已通过用户确认。*
