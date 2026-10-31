# Changelog

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.1.1] - 2026-10-31

### Fixed

- **冷启动后「设置 → 会话互联」整页 404**（`/api/session-link/state`、`/ui` 缺失）。
  原因：宿主插件 `inject` 只有 `tools` / `sessionPersistence`，cordis 可能在 `webServer`
  就绪之前就调用 `apply`；旧代码 `ctx.get('webServer')` 拿到 `undefined` 后**静默 return**，
  于是路由一条都没挂，而启动日志只有一行「已启用」，极难排查。
  现在改为 `ctx.inject(['webServer'], …)` 等待服务就绪后再挂载，并在服务不可用时打印警告。
  现象上还有个误导点：同目录的 `dsh-session-link-diag` / `dsh-session-link-preview` 因为
  `inject` 里写了 `webServer` 反而正常，容易让人误判成"插件整体没加载"。

### Added

- `test/offline-test.cjs` 新增「webServer 延迟就绪」回归用例：模拟 webserver 晚于插件出现，
  断言注入回调触发后 `/state`、`/memory`、`/ui` 三条路由都被挂上。

## [0.1.0] - 2026-10-31

首个公开版本。

### Added

- **跨会话记忆注入**：`agent/pre-step` 瀑布里按预算插入 `form: 'recall'` 的上下文消息，
  内容来自同组其它会话的最近对话摘要；内容变化才重新注入（按文本去重，不写私有元数据）。
- **模型工具**：`session_link`（`list` / `status` / `link` / `unlink` / `delete_group`）与
  `session_recall`（`digest` / `search`）。
- **设置面板页面**：注册 `settings.section`（`id: session-link`、`order: 26`，紧跟「会话回收站」），
  带 chain 图标（DOM 替换导航图标，沿用宿主 class）、搜索、排序、链接组标签、卡片列表。
- **整行可点**：会话卡片任意位置即勾选/取消勾选，支持 `Enter` / `Space`，`aria-pressed` 语义完整。
- **就地预览 + 双视角**：点 👁 在该会话下方展开，两个页签切换
  「它收到的记忆」（`mode=receive`）与「它会提供的内容」（`mode=contribute`）；
  未链接会话默认打开 `contribute`，因此无需先链接即可评估。
- **HTTP 接口**：`/api/session-link/state`（GET/POST）、`/preview`、`/memory`（兼容旧版）、`/ui`。
- **独立选择页**：`/api/session-link/ui`，不依赖设置面板。
- **可选诊断包**：`/api/session-link/diag` 报告浏览器启动图是否收录本插件、bundle 字节数。
- **一键安装脚本**：`scripts/install.ps1`（UTF-8 BOM，避免 PowerShell 5.1 按 GBK 解析）与
  `scripts/install.sh`，幂等维护 patch 中的标记块；已有手工挂载行时会跳过而不是重复插 id。
- **测试**：`test/offline-test.cjs`（假 cordis ctx + 真实会话文件，自备多帧 zstd 解码）、
  `test/client-smoke.cjs`（迷你 React + 迷你 DOM，无需浏览器即可断言交互）。
- **文档**：`docs/ARCHITECTURE.zh.md`（注入点、只读历史、插槽与图标、主题 token 陷阱、
  进程内 ESM 缓存、测试策略、已知限制）、`docs/PUBLISH.md`（发布到 GitHub 的完整步骤）。

### Changed

- 预览从"底部固定面板"改为"就地展开"，并自动 `scrollIntoView`——原先面板在可滚动容器之外，
  点击后看起来像没反应。
- 主按钮配色改用 `--dsw-alias-label-primary` / `-foreground`（对比色），
  强调色改用 `--dsw-alias-state-business-primary`；`--dsw-alias-brand-primary` 实为墨色，
  此前误用导致暗色主题下出现白底白字。

### Removed

- 会话标题栏快捷入口（`conversation.session.header.actions`）——设置面板的 `openSection`
  没有对外 API，跳转只能靠 DOM 点击兜底，稳定性不足以随版本发布，故移除。

### Known limitations

- 只搬运文本（图片留 `[图片]` 占位），工具输出默认不搬。
- 预算是静态的，不随剩余上下文自适应；更早的内容需 `session_recall search` 检索。
- 仓库是 monorepo，`pnpm add <tarball>` 只能拿到整个仓库根，三个子包仍需安装脚本或手动复制；
  要"一条命令安装"需分别发布到 npm 或拆成多个仓库。
- 仅在 dsh `0.2.0-rc` 系（cordis 4 / `dsh-client-modules` / `dsh-session-persistence-jsonl`）实测。
