# FocusFlow — 开发计划

> 基于 PRD v1.0 | 日期：2026-07-09
> 预估总周期：8~11 周（单人开发）

---

## 总览

```
M0 骨架 ──→ M1 监控 ──→ M2 番茄钟 ──→ M3 浮窗 ──→ M4 数据 ──→ M5 打磨 ──→ M6 发布
 (1周)      (1-2周)      (1周)       (1-2周)     (1-2周)     (1-2周)      (1周)
```

每个里程碑结束时有一个**可运行的 demo**，不是"写了一半的代码"。

---

## M0 — 项目骨架（第 1 周）

> 目标：Tauri + React 前后端跑通，SQLite 可读写，暗色 UI 框架搭好。

### T0.1 — Tauri 项目初始化

- [ ] `npm create tauri-app` 创建项目（React + TypeScript 模板）
- [ ] 配置 `tauri.conf.json`：app 名称、窗口配置、权限声明
- [ ] 验证 macOS 和 Windows 都能 `cargo tauri dev` 跑起来
- [ ] 配置 Rust 端目录结构：`src-tauri/src/` 下分 `commands/`、`monitor/`、`db/`、`models/`

**产出：** 空白 Tauri app 能启动，前后端通信（invoke）可用。

### T0.2 — 前端框架搭建

- [ ] 安装 Tailwind CSS + 配置暗色主题
- [ ] 安装 shadcn/ui + 初始化组件配置
- [ ] 安装 Zustand（状态管理）+ React Router（路由）
- [ ] 搭建基础布局：侧边栏导航 + 内容区（对应三个 tab）
- [ ] 实现基础暗色色彩系统（CSS 变量，参考 PRD §6.2）

**产出：** 前端有暗色骨架页面，侧边栏可切换三个 tab（空壳）。

### T0.3 — SQLite 集成

- [ ] Rust 端：引入 `rusqlite` crate
- [ ] 实现数据库初始化函数（建表，参考 PRD §5.2）
- [ ] 实现基础 CRUD 命令（Tauri commands）：
  - `create_binding` / `get_bindings` / `delete_binding`
  - `create_usage_record` / `get_usage_records`
  - `create_pomodoro_session` / `get_pomodoro_sessions`
  - `get_setting` / `set_setting`
- [ ] 前端：封装 Tauri invoke 调用为 TypeScript 函数
- [ ] 验证：前端能调 Rust 命令读写数据库

**产出：** 前后端数据通路打通，SQLite 可读写。

### T0.4 — 开发环境配置

- [ ] 配置 ESLint + Prettier
- [ ] 配置 Rust `clippy` + `rustfmt`
- [ ] 写一个 `README.md`：环境要求、安装步骤、开发命令
- [ ] 配置 `.gitignore`（Node + Rust + OS 文件）

**产出：** 项目可 clone 后一键跑起来。

---

## M1 — 系统监控与绑定（第 2~3 周）

> 目标：能检测前台 app，能绑定 app，绑定后自动计时。

### T1.1 — 系统级前台 App 检测

- [ ] **macOS：** 实现 `NSWorkspace.shared.frontmostApplication` 监听
  - Rust 端使用 `cocoa` / `objc` crate 调用 AppKit API
  - 监听 `NSWorkspaceDidActivateApplicationNotification`
  - 提取 app 名称、bundle ID、图标路径
- [ ] **Windows：** 实现 `GetForegroundWindow` 轮询
  - Rust 端使用 `windows` crate 调用 Win32 API
  - 提取窗口标题、进程名、exe 路径
  - 从 exe 提取图标
- [ ] 统一数据模型：`ForegroundApp { name, bundle_id, icon_path, platform }`
- [ ] Tauri command：`get_current_app` → 返回当前前台 app 信息
- [ ] Tauri event：`app-changed` → 前台 app 变化时推送到前端

**产出：** 后台能实时检测前台 app 变化，通过事件推送到前端。

### T1.2 — App 绑定：运行中列表

- [ ] Rust 端：实现 `get_running_apps` → 返回所有正在运行的 app 列表
  - macOS：`NSWorkspace.shared.runningApplications`
  - Windows：`EnumWindows` 遍历窗口
- [ ] 前端：绑定页面 UI，显示运行中 app 列表（图标 + 名称 + "+" 按钮）
- [ ] 点击 "+" → 调用 `create_binding` 写入数据库
- [ ] 已绑定的 app 显示"已绑定"标记，不可重复绑定

**产出：** 能从运行中列表绑定 app。

### T1.3 — App 绑定：搜索已安装

- [ ] Rust 端：实现 `search_installed_apps(query)`
  - macOS：遍历 `/Applications` + `~/Applications`，读取 `.app` 的 `Info.plist`
  - Windows：遍历开始菜单快捷方式 + 注册表安装列表
- [ ] 前端：搜索框 + 结果列表，输入防抖（300ms）
- [ ] 搜索结果点击绑定，逻辑同 T1.2

**产出：** 能搜索本机已安装 app 并绑定。

### T1.4 — 时间追踪核心逻辑

- [ ] 实现 `TimerEngine`（Rust 端）：
  - 监听 `app-changed` 事件
  - 匹配当前前台 app 与绑定列表
  - 匹配成功 → 开始计时（记录 `start_time`）
  - 切走 → 停止计时（计算 `duration_seconds`，写入 `usage_records`）
  - 切回来 → 新建一条记录开始计时
- [ ] Tauri event：`timer-update` → 每秒推送当前计时状态到前端
  - `{ binding_id, elapsed_seconds, is_running }`
- [ ] 前端：封装 timer store（Zustand），接收事件更新状态

**产出：** 绑定 app 后，打开即自动计时，切走即停，数据写入 SQLite。

### T1.5 — 绑定管理页面

- [ ] Tab 3 绑定管理 UI：
  - 已绑定 app 卡片列表（图标 + 名称 + 模式标签）
  - 每个卡片：编辑按钮、删除按钮
  - 编辑弹窗：追踪开/关、番茄钟开/关、自定义时长
  - 删除确认弹窗
- [ ] 添加绑定入口（跳转到 T1.2/T1.3 的绑定流程）

**产出：** 完整的绑定管理界面。

---

## M2 — 番茄钟逻辑（第 4 周）

> 目标：番茄钟计时跑通，提醒系统工作。

### T2.1 — 番茄钟状态机

- [ ] 实现 `PomodoroEngine`（Rust 端）：
  - 状态：`Idle` → `Focus` → `Break` → `Focus` → ... → `LongBreak`
  - 每个状态有倒计时器
  - 与 `TimerEngine` 联动：前台 app 匹配时启动/继续，离开时暂停
  - 番茄完成 → 写入 `pomodoro_sessions` 表
  - 支持按 app 独立配置（focus/break/longBreak 时长）
- [ ] Tauri event：`pomodoro-update` → 每秒推送
  - `{ binding_id, state, remaining_seconds, pomodoro_index, session_count_today }`
- [ ] 前端：封装 pomodoro store（Zustand）

**产出：** 番茄钟计时逻辑完整，状态正确流转。

### T2.2 — 提醒：浮窗变色

- [ ] 浮窗根据 pomodoro 状态切换颜色：
  - `Focus` → 蓝色调
  - `Break` / `LongBreak` → 绿色调
  - `Idle` / `Paused` → 灰色调
- [ ] 状态切换时的渐变动效（400ms，参考 PRD §6.5）
- [ ] 浮窗文案随状态变化

**产出：** 番茄钟到时间时，浮窗视觉上明确变化。

### T2.3 — 提醒：音效

- [ ] 选择/设计三个音效文件：
  - 专注结束（柔和、有辨识度，类似轻敲木头）
  - 休息结束（清脆、温和，类似小钟声）
  - 长休息结束（稍有仪式感）
- [ ] 前端用 Web Audio API 播放
- [ ] 音效开关（设置中可关闭）
- [ ] 音量控制（跟随系统或独立）

**产出：** 番茄钟到时间时有声音提醒。

### T2.4 — 菜单栏

- [ ] macOS：实现菜单栏图标 + 文字显示
  - 使用 Tauri 的 system tray API
  - 显示当前状态文字（参考 PRD §F4）
- [ ] Windows：系统托盘 + tooltip 显示状态
- [ ] 点击弹出 Popover 面板：
  - 当前 session 详情
  - 快捷操作：暂停 / 跳过 / 打开主窗口
- [ ] 菜单栏文字每秒更新（跟 `pomodoro-update` 事件联动）

**产出：** 菜单栏实时显示状态，可快捷操作。

---

## M3 — 浮窗面板（第 5~6 周）

> 目标：浮窗完整可用，交互流畅，视觉精美。

### T3.1 — 浮窗基础

- [ ] Tauri 创建独立窗口（transparent, always-on-top, decorations-off）
- [ ] 前端实现浮窗组件（暗色半透明面板）
- [ ] 显示内容：app 名称 + 进度条 + 倒计时 + 状态（参考 PRD §F5）
- [ ] 响应 `timer-update` 和 `pomodoro-update` 事件

**产出：** 浮窗能显示当前状态。

### T3.2 — 浮窗交互

- [ ] 拖拽移动（Tauri 窗口拖拽，前端 `data-tauri-drag-region`）
- [ ] 位置记忆：关闭后保存位置到设置，下次启动恢复
- [ ] 贴边吸附：离边缘 < 20px 时自动"粘"过去
- [ ] 透明度控制：默认 80%，悬停 100%
- [ ] 单击打开主窗口
- [ ] 右键弹出快捷菜单

**产出：** 浮窗可拖拽、记住位置、交互完整。

### T3.3 — 浮窗三种尺寸

- [ ] 小尺寸：app 名 + 倒计时
- [ ] 中尺寸（默认）：app 名 + 进度条 + 倒计时 + 状态
- [ ] 大尺寸：中尺寸 + 今日 top app 排行
- [ ] 紧凑模式：小圆点 + 数字
- [ ] 尺寸切换动画（平滑缩放）
- [ ] 尺寸选择持久化到设置

**产出：** 四种尺寸可切换，各有对应 UI。

### T3.4 — 浮窗视觉打磨

- [ ] 暗色背景 + 微渐变光晕
- [ ] 进度条动画（平滑填充，无跳变）
- [ ] 状态切换渐变色（蓝↔绿↔灰，400ms）
- [ ] 休息状态的"休息一下 ☕"文案 + 今日累计显示
- [ ] 悬停展开今日 top app 排行（大尺寸模式）
- [ ] "欢迎回来"动画（闲置恢复时进度条闪烁）

**产出：** 浮窗视觉达到"高级感"标准。

---

## M4 — 数据看板（第 7~8 周）

> 目标：主窗口三个 tab 完整，数据可视化可用。

### T4.1 — 今日 Tab

- [ ] 顶部指标卡片：总专注时长、完成番茄数、最长连续
- [ ] 对比指标：与昨日对比（▲/▼ 百分比）
- [ ] 时间线组件：
  - 水平条形图，每个小时一行
  - 不同 app 用不同颜色区分
  - 悬停显示详情（app 名称 + 时长）
- [ ] App 排行列表：图标 + 名称 + 时长 + 进度条

**产出：** 今日数据一目了然。

### T4.2 — 趋势 Tab

- [ ] 日趋势折线图（Recharts）：过去 7 天 / 30 天每日专注时长
- [ ] App 对比柱状图：各 app 周/月使用量堆叠
- [ ] 热力图组件：
  - 7 行（周一~周日）× 24 列（0~23 时）
  - 颜色深浅表示专注密度
  - 悬停显示具体时长
- [ ] 时间范围选择器：本周 / 本月 / 自定义

**产出：** 趋势数据可视化完整。

### T4.3 — 绑定管理 Tab（完善）

- [ ] 补充统计信息：每个绑定 app 的累计使用时长、番茄数
- [ ] 拖拽排序绑定列表
- [ ] 批量操作（暂停所有追踪 / 批量删除）

**产出：** 绑定管理功能完善。

### T4.4 — 数据聚合优化

- [ ] Rust 端实现高效聚合查询：
  - 按天/周/月汇总
  - 按 app 分组汇总
  - 对比计算（本周 vs 上周）
- [ ] 前端数据缓存（Zustand store + SWR 模式）
- [ ] 大数据量性能测试（模拟 1 年数据）

**产出：** 查询性能达标，1 年数据量下响应 < 100ms。

---

## M5 — 打磨（第 9~10 周）

> 目标：引导流程、闲置检测、开机自启、整体动效、测试。

### T5.1 — 引导流程

- [ ] 三步引导页 UI（参考 PRD §F7）
- [ ] 第一步：价值说明 + "开始"按钮
- [ ] 第二步：权限申请
  - macOS：检测辅助功能权限状态，未授权则引导跳转系统设置
  - Windows：跳过此步（无需特殊权限）
- [ ] 第三步：绑定第一个 app（复用 T1.2 的运行中列表）
- [ ] 引导完成后标记 `onboarding_completed`，不再显示

**产出：** 首次使用体验完整。

### T5.2 — 闲置检测

- [ ] Rust 端：实现系统空闲时间检测
  - macOS：`CGEventSourceSecondsSinceLastEvent`
  - Windows：`GetLastInputInfo`
- [ ] 闲置超过阈值 → 暂停所有计时
- [ ] 恢复 → 自动继续 + "欢迎回来"动画
- [ ] 设置中可配置阈值（默认 5 分钟）或关闭
- [ ] 闲置期间不写入任何使用记录

**产出：** 闲置检测完整，数据干净。

### T5.3 — 开机自启

- [ ] macOS：注册 Login Item（Tauri plugin 或 `SMLoginItemSetEnabled`）
- [ ] Windows：写入启动文件夹快捷方式
- [ ] 设置中开关控制
- [ ] 首次安装后询问"是否开机自启？"

**产出：** 开机自启可用。

### T5.4 — 设置页面

- [ ] 通用设置：开机自启、闲置阈值、语言（预留）
- [ ] 浮窗设置：尺寸、透明度、位置重置
- [ ] 番茄钟全局默认：focus/break/longBreak 时长
- [ ] 提醒设置：音效开/关、音量、全屏遮罩开/关
- [ ] 数据：清除所有数据（确认弹窗）

**产出：** 设置页面完整。

### T5.5 — 动效与过渡

- [ ] 页面切换过渡动画（淡入淡出）
- [ ] 数据卡片加载骨架屏
- [ ] 按钮 hover/active 微交互
- [ ] 列表项添加/删除动画
- [ ] 图表加载动画（Recharts 自带动效配置）

**产出：** 整体交互有"高级感"。

### T5.6 — 测试

- [ ] Rust 端单元测试：
  - TimerEngine 逻辑
  - PomodoroEngine 状态机
  - 数据库 CRUD
  - 数据聚合查询
- [ ] 前端组件测试（React Testing Library）
- [ ] E2E 手动测试清单：
  - 绑定流程
  - 计时准确性（对比系统时钟）
  - 番茄钟状态流转
  - 浮窗所有交互
  - 数据看板数据一致性
  - 闲置检测
  - 开机自启
  - 崩溃恢复
- [ ] macOS + Windows 双平台测试

**产出：** 核心功能无 bug，双平台验证通过。

---

## M6 — 发布（第 11 周）

> 目标：打包、安装器、文档、发布。

### T6.1 — 打包与签名

- [ ] macOS：
  - `cargo tauri build` 生成 `.dmg`
  - Apple Developer 签名 + 公证（Notarization）
  - 测试安装流程
- [ ] Windows：
  - `cargo tauri build` 生成 `.msi` 或 `.exe` 安装器
  - 代码签名（可选，MVP 阶段可跳过）
  - 测试安装流程

**产出：** 两个平台的安装包可正常安装运行。

### T6.2 — 自动更新

- [ ] 配置 Tauri Updater plugin
- [ ] 搭建简单的更新服务器（GitHub Releases 即可）
- [ ] 测试更新流程：检测新版本 → 下载 → 安装 → 重启

**产出：** 应用可自动检测和安装更新。

### T6.3 — 文档与落地页

- [ ] README.md：产品介绍、截图、下载链接
- [ ] CHANGELOG.md：v1.0.0 更新内容
- [ ] 简单落地页（可选，单页 HTML）：
  - 产品截图/GIF
  - 功能亮点
  - 下载按钮
- [ ] GitHub repo 创建 + 推送代码

**产出：** 项目可公开访问。

### T6.4 — 发布

- [ ] 创建 GitHub Release（v1.0.0）
- [ ] 上传 macOS .dmg + Windows .msi
- [ ] 写 Release Notes
- [ ] 发布到社区（可选：V2EX、少数派、Product Hunt）

**产出：** v1.0.0 正式发布。

---

## 依赖关系图

```
T0.1 ──┬──→ T1.1 ──→ T1.4 ──→ T2.1 ──→ T2.2
T0.2 ──┤                    ├──→ T2.3
T0.3 ──┴──→ T1.2 ──→ T1.5  ├──→ T2.4
        └──→ T1.3 ──→ T1.5  │
                             ↓
                      T3.1 ──→ T3.2 ──→ T3.3 ──→ T3.4
                             ↓
                      T4.1 ──→ T4.2 ──→ T4.3 ──→ T4.4
                             ↓
                      T5.1 ──→ T5.2 ──→ T5.3 ──→ T5.4 ──→ T5.5 ──→ T5.6
                             ↓
                      T6.1 ──→ T6.2 ──→ T6.3 ──→ T6.4
```

---

## 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| macOS 辅助功能权限申请体验差 | 用户卡在引导流程 | 提供详细截图指引 + "稍后设置"选项 |
| Tauri 多窗口（浮窗）性能问题 | 浮窗卡顿 | 提前 POC 验证，必要时用原生窗口替代 |
| Windows 图标提取困难 | 绑定列表显示空白图标 | 使用默认图标兜底，后续迭代优化 |
| 跨平台系统 API 差异 | 计时行为不一致 | 抽象平台层接口，分别实现，统一测试 |
| 音效设计 | 提示音不好听反而烦人 | 使用开源音效库，提供音量控制和关闭选项 |

---

## 技术 Spike（提前验证）

在 M0 阶段并行做两个 spike，验证关键技术可行性：

### Spike 1 — macOS 前台 App 检测（2 天）

- 验证 Tauri Rust 端能否调用 `NSWorkspace` API
- 验证事件推送延迟是否 < 500ms
- 验证辅助功能权限申请流程

### Spike 2 — Tauri 多窗口 + 浮窗（2 天）

- 验证 Tauri 创建透明、无边框、置顶窗口
- 验证浮窗拖拽 + 位置记忆
- 验证浮窗不抢焦点的行为

**如果 spike 失败，需要调整技术方案（备选：Electron）。**

---

*开发计划结束。建议从 M0 + 两个 Spike 开始，第一周结束时验证核心技术可行性。*
