# 架构与实现笔记

这份文档记录插件**为什么这样写**，尤其是几个只有踩过才知道的坑。读者对象：想改这个插件、
或想在 dsh 上写别的插件的人。

- [1. 整体数据流](#1-整体数据流)
- [2. 宿主半侧](#2-宿主半侧)
- [3. 浏览器半侧](#3-浏览器半侧)
- [4. 进程内模块缓存与热更新](#4-进程内模块缓存与热更新)
- [5. 测试策略](#5-测试策略)
- [6. 已知限制](#6-已知限制)

## 1. 整体数据流

```
                    ┌──────────────────────── 浏览器 ────────────────────────┐
                    │ /api/session-link/ui  (独立勾选页)                      │
                    │ 设置面板 settings.section「会话互联」(client.js)         │
                    └───────────────┬────────────────────────────────────────┘
                                    │ GET/POST /api/session-link/{state,preview}
┌───────────────────────────────────▼────────────────────────────────────────┐
│ dsh 宿主进程                                                                │
│  dsh-session-link        写 session-links.json、注入记忆、两个模型工具        │
│  dsh-session-link-preview receive / contribute 预览（同一份读会话逻辑）       │
│                                                                            │
│  agent/pre-step ──► 组装 <session-link-memory> ──► 插入 decision.messages    │
│        ▲                                                                   │
│        └─ sessionPersistence.open(id,'read').read() ──► 其它会话的事件流     │
└────────────────────────────────────────────────────────────────────────────┘
```

一句话：**链接关系是数据，记忆是每步现算出来的**。没有任何"同步/复制"动作，
所以被链会话继续增长时，摘要在下一步自然更新。

## 2. 宿主半侧

### 2.1 插件契约

```js
export const name = 'session-link'
export const inject = ['tools', 'sessionPersistence']
export function apply(ctx, config) { … }
export const Config = z.object({ … })   // schemastery，可选
```

- `inject` 里的服务没就绪，cordis 不会调用 `apply`；所以不要在模块顶层碰 `ctx.tools` 之类。
- 可选服务（`webServer`）不要写进 `inject`，用 `ctx.get('webServer')` 判空后降级。
- 清理一律 `ctx.effect(() => disposer)`：热重载/卸载时自动反向执行。

### 2.2 注入点：`agent/pre-step` 瀑布

```js
ctx.on('agent/pre-step', async ({ agent, messages, step, signal }, next) => {
  const decision = await next()          // 先让别的插件（AGENTS.md 加载器等）决定
  const memory = await composeMemory(…)   // 现算
  return { ...decision, messages: decision.messages.toSpliced(idx, 0, message) }
})
```

- 消息用 `createUserMessage({ content, source })`，`source` 必须带一个**语义明确的 form**。
  这里用 `{ kind: 'plugin', plugin: 'session-link', form: 'recall' }`：
  dsh 的 `ContextForm` 里 `'recall'` 的官方定义就是 *"Material lifted out of another session's log,
  possibly reduced on the way in"* —— 正好是这件事。
- 注入位置：插在「本次已认领消息」之后、其它上下文之后，保证模型最后读到的是记忆而不是把它当历史。
- **一定要有异常兜底**：`pre-step` 里抛错会毁掉整轮对话，所以整段 `try/catch`，失败就返回原 decision。

### 2.3 只读历史

```js
const handle = await ctx.sessionPersistence.open(id, 'read')   // access 必须显式传 'read'
const { events } = await handle.read()
await handle.close()
```

- 不加 `'read'` 会走**写**路径：抢写所有权 + 跨进程租约，读一个正在运行的会话会直接抛
  `SessionAlreadyOwnedError`。
- `read` 句柄在别的进程持有写锁时也能读，已归档会话也能读。

### 2.4 抽条规则（为什么只留两类）

```js
if (event.type === 'user/message' && event.data.source?.kind === 'user') → 用户
if (event.type === 'assistant/message')                                  → 助手
```

`source.kind !== 'user'` 的 user 消息是**合成上下文**：AGENTS.md 基线、技能目录、cron 通知、
其它插件注入的 recall/notice。全跳过，否则会出现「记忆里套记忆」的自我繁殖，几轮就把预算吃满。

### 2.5 去重

注入前扫模型可见表面的末尾 400 个节点，如果已经有 `plugin: 'session-link'` 且文本完全相同的消息，
就跳过。历史会话有新对话 → 摘要变化 → 文本不同 → 自动补一次。**按内容去重，不用 hash 存字段**，
所以不需要往会话里塞私有元数据。

### 2.6 预算

单条 700 字（`truncateChars`）→ 每会话 3500 字节 → 单次 9000 字节（`truncateBytes`）。
`truncateBytes` 会回退到 UTF-8 字符边界，避免把中文切成半个字节序列（`Buffer.subarray` 会）。

### 2.7 工具注册的两个硬限制

```js
ctx.tools.register(defineTool({
  name: 'session_link',
  description: '…',
  parameters: { action: { type: 'string', required: true, enum: [...] } },  // DSL：字段级 required
  output: { schema: { type: 'object', additionalProperties: false, properties: {…} },
            render: (_args, value) => [{ type: 'text', text: value.message }] },
  async execute(args, exec) { … return 无损 JSON … }
}))
```

踩过的坑（`UNSUPPORTED_SCHEMA: schema.required is not supported`）：

- 这个参数 DSL 里 **`required` 是"字段级标记"**，不是 JSON Schema 的数组；
  `{ type: 'object', required: true, properties: {…} }` 只在它自己是**某个对象的属性**时合法。
- 顶层 `output.schema` 和**数组的 `items`** 都是"值规格"，**不能带 `required: true`**。
- `execute` 的返回值必须与 `output.schema` 一致，否则注册期/执行期报错。

### 2.8 HTTP 路由

```js
const dispose = ctx.get('webServer').register({ kind: 'exact', path: '/api/session-link/state', handler })
ctx.effect(() => dispose)
```

- `kind: 'exact'` 精确匹配，`'prefix'` 前缀；**重复注册同一 (kind, path) 会抛错**，所以拆包时
  千万不要让两个包注册同一个路径。
- handler 自己拥有响应生命周期（可以挂 SSE）。读 JSON 体要自己限长（这里 1 MB）。

## 3. 浏览器半侧

### 3.1 为什么不用构建

dsh 的客户端插件是**手写 CJS 包壳**，由 client-modules 静态伺服、浏览器按需加载：

```js
window.__ModuleLoader__.load({
  id: 'dsh-session-link-client',
  factory: (require) => {
    const React = require('react')        // 平台种子模块
    const module = { exports: {} }
    … // 样式注入、组件、apply
    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  }
})
```

- 声明 `package.json` 的 `dsh.client = { platform: 'web', inject: [...] }` + `exports['./client']`，
  宿主就会把 bundle 收进启动图（`/plugins/??…` combo URL），**页面加载时才物化**。
- CSS 没有独立文件通道，`document.head.appendChild(<style data-plugin-css=…>)` 在 factory 里做。
- `inject` 里列的是**必须在它之前就绪的包**（例如设置域 `@deepseek-ai/dsh-client-ui-settings`）。
- **不要写 `export default`**：loader 的 `unwrapExports` 会折叠成 `exports.default ?? exports`，
  默认导出会顺带丢掉具名 `inject`，插件就在服务未就绪时提前 apply、静默失效。

### 3.2 设置页插槽

```js
ctx.slots.inject('settings.section', () =>
  ctx.slots.register(
    { name: 'settings.section', id: 'session-link', order: 26, label: () => t('nav') },
    (props) => h(SessionLinkSection, { ...props, ctx })
  )
)
```

- 注册选项只有 `id / order / label`（`label` 可以是 thunk，切语言时重新注册即可）。
- `order` 决定导航顺序：会话回收站是 25，本插件取 26。
- 面板高度有限（导航列约 808px），`order` 太大可能被挤到看不见的位置。

### 3.3 导航图标只能靠 DOM

设置的导航图标由 shell **按 section id 硬映射**（`models` / `agent-presets` / `plugins`，其余一律齿轮），
注册选项里没有 icon 字段。所以：

```js
new MutationObserver(schedule)  // 找到文字为「会话互联」的导航格 → 替换里面的 <svg>
```

- 替换时**沿用原 svg 的 class**，尺寸/颜色才和邻居一致。
- 打 `dataset` 标记做幂等，避免反复替换。
- 这是全插件唯一"脏"的地方，属于宿主管不到的边界。

### 3.4 主题 token 的语义陷阱（真踩过）

| 想做的事 | 该用 | 别用 |
| --- | --- | --- |
| 强调/选中/链接态 | `--dsw-alias-state-business-primary`（deepseek 蓝） | `--dsw-alias-brand-primary` |
| 对比色按钮底 | `--dsw-alias-label-primary` | 同上 |
| 对比色按钮字 | `--dsw-alias-label-primary-foreground` | 写死 `#fff` |
| 面板底 | `--dsw-alias-bg-layer-1/2/3` | `--dsw-alias-bg-overlay`（暗色下偏亮） |

`--dsw-alias-brand-primary` 名字像"品牌主色"，实际含义是**对比色墨色**：
亮主题 `#0f1115`、暗主题 `#f9fafb`。把它当按钮底色再写死白字，就是**白底白字**。
`color-mix()` 记得给一条 `rgba()` 前置声明兜旧内核。

### 3.5 交互细节

- 整行 `<li>` 承担勾选：`role="button"` + `tabIndex=0` + `aria-pressed` + `Enter`/`Space`。
- 勾选框和右侧操作区各自 `stopPropagation`，否则一次点击翻两次状态。
- 预览**就地展开**在被点的那行下面，并 `scrollIntoView({block:'nearest'})`：
  面板在可滚动的设置容器里，滚不到就等于"点了没反应"。
- 两个视角页签：`receive`（收到什么）/ `contribute`（会提供什么）。未链接默认 `contribute`。

## 4. 进程内模块缓存与热更新

这是拆成三个包的根本原因。

| 部位 | 改动后如何生效 |
| --- | --- |
| `cordis.patch.yml` | `patchReload: live` 监听文件 → 立即重组 loader 行 |
| 宿主插件 **代码** | **不生效**：Node ESM 按 URL 缓存，同一 specifier 永远返回第一次的模块对象 |
| 客户端 bundle | dsh-client-hmr 侦测到文件变化会重新哈希 → **刷新页面**拿到新 rev |
| `dsh.client` 声明 | 包元数据按 (specifier, base URL) 缓存到进程重启；新增声明要么重启，要么换个包名挂载 |

所以：

1. 新增一个**接口**时，放新包（`dsh-session-link-preview`），旧包不动。
2. 新包里用**内容哈希 shim**：`import(`${url}?v=${sha256(file)}`)`，实现文件改动即热更新，
   shim 自身永不改（它变了才需要重启）。见 `packages/dsh-session-link-preview/index.js`。

## 5. 测试策略

没有浏览器、也没有第二台机器时怎么验证：

1. **宿主逻辑离线测**（`test/offline-test.cjs`）：假 cordis ctx + 真实会话文件。
   自备多帧 zstd 解码（DSH 的会话文件是**追加多帧**，Node 的 `zstdDecompressSync` 只解第一帧）。
2. **客户端真渲染**（`test/client-smoke.cjs`）：迷你 React（`useState/useMemo/useCallback/useRef/useEffect`
   带依赖比较 + 渲染循环）+ 迷你 DOM + 假 `fetch`。断言不止"渲染不报错"，而是**调用事件处理器**
   看有没有发出正确的 POST、有没有误发 POST。
3. **活体诊断**（可选包 `dsh-session-link-diag`）：`/api/session-link/diag` 直接读
   `ctx.get('clientModules').graph()`，回答"我的 bundle 进启动图了吗、能不能被服务端吐出来"。

## 6. 已知限制

- **设置面板没有"打开到某页"的公开 API**：`openSection` 是 shell 内部 state。
  想要"从别处跳到会话互联页"只能点 DOM（不稳）或开独立页 `/api/session-link/ui`。
  这也是没做"会话标题栏快捷入口"的原因——试过，跳转只能靠 DOM 点击兜底，不划算。
- **只搬文本**：图片只留 `[图片]` 占位，工具输出不搬（可用 `includeToolCalls` 加一行调用名）。
- **预算是静态的**：不按剩余上下文自适应，需要更早的内容请用 `session_recall search` 检索。
- **settings.section 的 label 是纯文本**，无法控制样式；更深的自定义需要自己做 `sidebar` 面板。
