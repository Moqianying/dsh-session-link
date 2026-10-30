# dsh-session-link v0.1.0

把任意挑选的历史会话链接成组，让组内会话**互通跨会话记忆**。设置面板里带图标的独立页面，勾选即生效。

## 亮点

- **设置面板页面**：`设置 → 会话互联`，链环图标（与「会话回收站」同级同风格），
  搜索 / 排序 / 链接组标签 / 卡片式列表，**点卡片任意位置即勾选**（含键盘 Enter / Space）。
- **就地预览 + 双视角**：点 👁 在该会话下方展开面板，可切换
  「它收到的记忆」（作为接收方会收到什么）与「它会提供的内容」（被链接后会交出去什么）。
  **未链接的会话默认看后者**，所以不用先链上就能评估值不值得链。
- **模型可用**：`session_link`（列会话 / 建组 / 加链 / 解链 / 删组）与 `session_recall`
  （拉摘要、跨会话关键字检索，支持按标题片段找会话）。
- **只读历史**：全程 `sessionPersistence.open(id, 'read')`，不抢写所有权，运行中/已归档会话都能读。
- **有预算**：单条 700 字 / 单会话 3500 字节 / 单次 9000 字节，超出从尾部截断。
- **不自我繁殖**：只抽直接人类输入与助手正文，跳过其它插件注入的 instructions / catalog / notice / recall。

## 安装

```powershell
git clone https://github.com/Moqianying/dsh-session-link.git
cd dsh-session-link
./scripts/install.ps1          # macOS/Linux: ./scripts/install.sh
```

刷新浏览器页面（Ctrl+R）：设置里出现「会话互联」，会话里出现两个工具。
配置改动不需要重启进程（dsh 的 `patchReload: live` 会热加载）。

## 要求

- dsh `0.2.0-rc` 系（cordis 4 / `dsh-client-modules` / `dsh-session-persistence-jsonl`）。
- Node ≥ 20（安装脚本用到 Node 24 亦可；仓库测试在 Node 24 上跑）。
- 用到 Node 的 `zlib` 多帧 zstd 能力，只影响测试脚本，不影响插件本体。

## 已知限制

- 只搬运文本（图片留 `[图片]` 占位），工具输出默认不搬。
- 预算是静态的，不随剩余上下文自适应。
- 仓库是 monorepo，`pnpm add <tarball>` 只能拿到仓库根；三个子包仍需安装脚本或手动复制。
- 会话标题栏没有快捷入口：设置面板的 `openSection` 没有对外 API，跳转只能靠 DOM 点击兜底，不划算。

## 验证

```bash
node test/client-smoke.cjs    # 客户端：迷你 React 真渲染 + 7 条交互断言，无需浏览器
./scripts/verify.ps1          # 等同 CI：语法 + JSON + 客户端测试（可选宿主离线测试）
```

完整设计与踩坑记录见 `docs/ARCHITECTURE.zh.md`。
