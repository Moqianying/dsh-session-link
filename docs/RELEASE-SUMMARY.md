# dsh-session-link v0.1.1

> 修复 **冷启动后「设置 → 会话互联」整页 404** 的问题。如果你在用 `v0.1.0` 并且**重启过 dsh web**，
> 就会遇到：设置页打开显示「加载失败: HTTP 404」「共 0 个会话」。升级到本版本即修复。

## 本次修复

- **宿主的 HTTP 路由在冷启动时静默丢失**：主插件的 `inject` 只有 `tools` / `sessionPersistence`，
  cordis 可能在 `webServer` 就绪之前就调用 `apply()`。旧代码 `ctx.get('webServer')` 拿到
  `undefined` 后直接 `return`，于是 `/api/session-link/state`、`/ui`、`/memory` 一条都没挂，
  而启动日志只有一行「已启用」——现象是 UI 整页 404，且极难排查。
  现在改为 `ctx.inject(['webServer'], …)` 等服务就绪后再挂载，服务不可用时还会打印警告。
- 现象上还有一个误导点值得记：同目录的 `dsh-session-link-diag` / `dsh-session-link-preview`
  因为 `inject` 里写了 `webServer`，反而**工作正常**，容易让人误判成"插件整体没加载"。
- 新增回归用例：`test/offline-test.cjs` 模拟「webServer 晚于插件就绪」，断言注入回调触发后
  `/state`、`/memory`、`/ui` 三条路由都被挂上。

## 安装 / 升级

```powershell
git clone --branch v0.1.1 https://github.com/Moqianying/dsh-session-link.git
cd dsh-session-link
./scripts/install.ps1          # macOS/Linux: ./scripts/install.sh
```

装完**重启一次 dsh web**（宿主代码不热更新），启动日志应出现：

```
[session-link] webServer 就绪，开始挂载 UI 路由
```

然后刷新页面：设置 → 会话互联 正常，`/api/session-link/state` 返回 JSON。

## 核心功能（与 0.1.0 相同）

- **设置面板页面**：`设置 → 会话互联`，链环图标（与「会话回收站」同级），搜索 / 排序 / 链接组标签 /
  卡片式列表，**点卡片任意位置即勾选**（含键盘 Enter / Space）。
- **就地预览 + 双视角**：点 👁 在该会话下方展开，可切换「它收到的记忆」（接收方视角）与
  「它会提供的内容」（来源视角）。**未链接会话默认看后者**，不用先链上就能评估。
- **模型可用**：`session_link`（列会话 / 建组 / 加链 / 解链 / 删组）与 `session_recall`
  （拉摘要、跨会话关键字检索，支持标题片段匹配）。
- **只读历史**：全程 `sessionPersistence.open(id, 'read')`，不抢写所有权。
- **有预算**：单条 700 字 / 单会话 3500 字节 / 单次 9000 字节，超出从尾部截断。
- **不自我繁殖**：只抽直接人类输入与助手正文，跳过其它插件注入的 instructions / catalog / notice / recall。

## 要求与已知限制

- dsh `0.2.0-rc` 系（cordis 4 / `dsh-client-modules` / `dsh-session-persistence-jsonl`）。
- 只搬运文本（图片留 `[图片]` 占位），工具输出默认不搬；预算静态，不随上下文自适应。
- 仓库是 monorepo，`pnpm add <tarball>` 只能拿到仓库根，三个子包仍需安装脚本或手动复制。

## 验证

```
全部 package.json 合法
客户端冒烟测试全部通过 ✅
[webServer 延迟就绪] 路由仍被正确挂载： /api/session-link/memory, /api/session-link/state, /api/session-link/ui
全部断言通过 ✅
```
