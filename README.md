# dsh-session-link · DSH 会话互联插件

[![ci](https://github.com/Moqianying/dsh-session-link/actions/workflows/diagnose.yml/badge.svg)](https://github.com/Moqianying/dsh-session-link/actions/workflows/diagnose.yml)

> 把任意挑几个历史会话「链接」成组，让组内会话**互通跨会话记忆**。设置面板里带图标的独立页面，勾选即生效。
> DeepSeek Harness（dsh）Web GUI 插件。中文文档 ← 本文件；English: [README.en.md](README.en.md)

```
会话 A ─┐
会话 B ─┼─ 链接组「研究线」 ─→ 每次对话自动带上同组其它会话的最近摘要
会话 C ─┘                        + session_link / session_recall 两个工具
```

## 特性

- **零重启挂载**：dsh 的 `patchReload: live` 让插件行热加载，不打断当前会话。
- **设置面板页面**：`设置 → 会话互联`，带 chain 图标（和「会话回收站」同级同风格），
  搜索 / 排序 / 链接组标签 / 卡片式会话列表 / 就地展开的预览面板。
- **整行可点**：点卡片任意位置即勾选，键盘 Enter / 空格同样生效。
- **双视角预览**：
  - 「它收到的记忆」——该会话作为接收方会拿到什么；
  - 「它会提供的内容」——它被链接后会被抽成什么交出去（**未链接也能看**）。
- **模型可用**：`session_link`（列/建组/加链/解链/删组）、`session_recall`（拉摘要、跨会话关键字检索）。
- **只读历史**：全程 `sessionPersistence.open(id, 'read')`，不抢写所有权，运行中/已归档会话都能读。
- **有预算**：单条 700 字 / 单会话 3500 字节 / 单次 9000 字节，超出从尾部截断。
- **不自我繁殖**：只抽 `source.kind === 'user'` 的直接人类输入与 assistant 正文，跳过其它插件注入的
  `instructions / catalog / notice / recall`。

## 组成

| 包 | 角色 | 关键文件 |
| --- | --- | --- |
| `dsh-session-link` | 宿主半侧：记忆注入、工具、HTTP 接口、独立选择页 | `index.js`、`ui.html` |
| `dsh-session-link-client` | 浏览器半侧：设置面板页面 + 导航图标 | `client.js`（手写 `__ModuleLoader__` 包壳，无需构建） |
| `dsh-session-link-preview` | 预览接口：`receive` / `contribute` 双视角 | `index.js`（内容哈希 shim）+ `lib/impl.js` |
| `dsh-session-link-diag` | 可选：只读诊断路由 `/api/session-link/diag` | `index.js` |

> 为什么拆成三个包：宿主模块在 dsh 进程里按 ESM URL 缓存，**改文件不会热更新**；
> 新增接口只能放进新包，客户端 bundle 则由 client-modules 在页面刷新时重新取。
> 详见 [docs/ARCHITECTURE.zh.md](docs/ARCHITECTURE.zh.md)（实现与踩坑）与
> [docs/PUBLISH.md](docs/PUBLISH.md)（发布到 GitHub 的完整步骤）。

## 安装

### 方式一：脚本安装（推荐，适合本地使用）

```powershell
# Windows PowerShell
git clone https://github.com/Moqianying/dsh-session-link.git
cd dsh-session-link
./scripts/install.ps1            # 默认装到 ~/.dsh/profiles/web
# 可选：-DshHome D:\dsh  -Profile web  -WithDiag
```

```bash
# macOS / Linux
git clone https://github.com/Moqianying/dsh-session-link.git
cd dsh-session-link
./scripts/install.sh
```

脚本做两件事：
1. 把 `packages/*` 复制进 `<DSH_HOME>/profiles/web/node_modules/`；
2. 在 `<DSH_HOME>/profiles/web/cordis.patch.yml` 里维护一段**标记块**（幂等，重复执行只替换自己那段）。

装完**刷新浏览器页面**（Ctrl+R）即可：设置面板出现「会话互联」，会话里出现两个工具。
配置改动不需要重启进程，因为 dsh 会热重载 patch 文件。

### 方式二：作为 bundle 依赖

```bash
cd <DSH_HOME>/profiles/web
pnpm add https://github.com/Moqianying/dsh-session-link/tarball/main
```

然后在 `package.json` 的 `dsh.profile.bundles` 里追加 `dsh-session-link`、`dsh-session-link-client`、
`dsh-session-link-preview`（各自的 `dsh.bundle.patch` 会自动贡献挂载行），重启 `dsh web`。

### 方式三：手动

把三个包目录复制进 `profiles/web/node_modules/`，再把下面这段贴进 `profiles/web/cordis.patch.yml`：

```yaml
- insert:
    - id: session-link
      name: dsh-session-link
      config:
        enabled: true
        autoInject: true
    - id: session-link-client
      name: dsh-session-link-client
    - id: session-link-preview
      name: dsh-session-link-preview
```

## 使用

1. **设置 → 会话互联** → 「新建链接组」→ 勾选要互通的会话（点卡片任意处，或点右侧 ＋）。
2. 回到对话继续聊：模型每一步都会看到同组其它会话的最近摘要（内容变化才重新注入，不会重复）。
3. 想知道某会话到底收到了什么：点它右侧 👁，**就地展开**预览，两个页签随时切换。
4. 也可以直接问我：「把学习通那个会话和这个串起来」——`session_link` 支持标题片段匹配。

链接关系存在 `<DSH_HOME>/session-links.json`，热读取，手改也行：

```json
{
  "version": 1,
  "groups": [
    { "id": "research", "name": "研究线", "note": "", "sessions": ["session-aaa", "session-bbb"] }
  ]
}
```

## 配置（`cordis.patch.yml` 的 `session-link` 行）

| 键 | 默认 | 含义 |
| --- | --- | --- |
| `enabled` | `true` | 总开关 |
| `autoInject` | `true` | 每步自动注入跨会话记忆 |
| `storePath` | `$DSH_HOME/session-links.json` | 链接文件路径 |
| `maxMessagesPerSession` | `24` | 每个来源会话取最近多少条 |
| `maxBytesPerSession` | `3500` | 每会话字节预算 |
| `maxTotalBytes` | `9000` | 单次注入总预算 |
| `maxCharsPerMessage` | `700` | 单条截断长度 |
| `includeAssistant` | `true` | 是否含助手回复 |
| `includeToolCalls` | `false` | 是否含「调用了 X」 |
| `maxSearchHits` | `30` | 检索上限 |
| `webUi` | `true` | 是否注册独立页与 HTTP 路由 |

## HTTP 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/session-link/state` | 全部会话 + 全部链接组 |
| POST | `/api/session-link/state` | 整体替换链接组 `{ "groups": [...] }` |
| GET | `/api/session-link/preview?sessionId=…&mode=receive\|contribute` | 双视角预览 |
| GET | `/api/session-link/memory?sessionId=…` | 旧接口，等价 `preview?mode=receive` |
| GET | `/api/session-link/ui` | 独立勾选页（不依赖设置面板） |
| GET | `/api/session-link/diag` | 诊断（需装 diag 包） |

## 排错

- **设置里没有「会话互联」**：先整页刷新。设置页是浏览器端注册的，刷新才会加载新 bundle；
  再不行看 `/api/session-link/diag` 的 `hasClient`。
- **图标还是齿轮**：导航图标按 section id 硬映射，自注册 id 只能靠 DOM 替换，刷新一次通常就好。
- **勾了但模型没反应**：`session_link action=status` 看当前会话属于哪些组；组里必须**有两个以上**会话。
- **想关掉**：`enabled: false`，或删掉 patch 块。

## 界面

截图放在 [docs/preview/](docs/preview/)，采集清单与嵌入片段见 [docs/preview/README.md](docs/preview/README.md)
（运行 `./scripts/capture.ps1` 会打开需要的页面并打印采集步骤）。

## 测试与本地验证

CI 是**一个文件、七个 job**（`.github/workflows/diagnose.yml`，全部零第三方 action）：

`probe` · `clone` · `syntax` · `package-json` · `client-smoke` · `host-offline` · `install-dry-run`

拆成多 job 是有意的：一个 job 一件事，失败时 GitHub 的 check 列表直接指出是哪件，
不用翻日志（`actions/checkout` / `setup-node` 在部分 runner 上会在 set up 阶段失败，
所以 CI 用 `git clone` 代替，Node 用镜像自带的）。

```bash
node test/offline-test.cjs    # 宿主逻辑：list/link/digest/search/pre-step 注入/去重/落盘
node test/client-smoke.cjs    # 浏览器半侧：包壳/注册/样式/真渲染/交互断言
```

`offline-test` 需要一个真实会话目录，默认读 `$DSH_HOME/sessions/<project>`，
可用 `DSH_SESSIONS_DIR` 指定；目录不存在时脚本会跳过并给出提示。
`client-smoke` 自带迷你 React（4 个 hook + 依赖比较 + 渲染循环）与迷你 DOM，**不需要浏览器**。

一条命令跑「等同 CI」的检查（GitHub 的 Actions 队列卡住时用它兜底）：

```powershell
./scripts/verify.ps1                                        # 语法 + JSON + 客户端测试
./scripts/verify.ps1 -SessionsDir "$env:DSH_HOME\sessions\<project>"   # 额外跑宿主离线测试
```

## 维护脚本

| 脚本 | 用途 |
| --- | --- |
| `scripts/install.ps1` / `install.sh` | 装进 profile，幂等维护 patch 标记块 |
| `scripts/verify.ps1` | 本地跑等同 CI 的检查（可当提交前钩子） |
| `scripts/set-owner.ps1` | 把 `<YOU>` / `<YOUR NAME>` 占位符换成你的信息 |
| `scripts/set-repo-meta.ps1` | 填仓库 description / topics（**免 PAT**：走 `gh` 的浏览器登录，加 `-Login` 可就地登录） |
| `scripts/release.ps1` | 先 verify → 打注释 tag → push tag → （`-CreateRelease`）用 `gh` 建 Release |
| `scripts/capture.ps1` | 打印截图清单并打开需要采集的页面 |
| `scripts/lib-gh.ps1` | 上面两个脚本共用的 gh 定位与登录检查 |

github 侧只需要一次性准备（不需要手搓 PAT）：

```powershell
winget install --id GitHub.cli -e
gh auth login --hostname github.com --git-protocol https --web
```

除 `install.*` 外都支持 `-DryRun`，先看它要做什么再执行。

## 兼容性

- 在 dsh `0.2.0-rc` 系（`dsh-session-persistence-jsonl` / `dsh-client-modules` / cordis 4）上实测通过。
- 依赖的宿主能力：`agent/pre-step` 瀑布、`sessionPersistence.open(id,'read')`、`tools.register`、
  `webServer.register`、`slots.register('settings.section')`、`dsh.client` bundle 发现。
  任一不存在时插件会降级（不注入 / 不注册 UI），不会让宿主启动失败。

## License

MIT，见 [LICENSE](LICENSE)。
