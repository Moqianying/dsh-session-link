# 贡献指南

## 本地跑一遍再提交

```powershell
# 语法 + JSON + 客户端渲染测试（不需要浏览器、不需要 dsh）
./scripts/verify.ps1

# 额外跑宿主逻辑测试（需要真实会话文件）
./scripts/verify.ps1 -SessionsDir "$env:DSH_HOME\sessions\<project-dir>"
```

CI（`.github/workflows/diagnose.yml`，一个文件、七个 job）与 `verify.ps1` 跑的是同一批脚本，
所以本地绿了 CI 基本就绿。

## 改客户端 UI 时

`packages/dsh-session-link-client/client.js` 是**手写的 `__ModuleLoader__` 包壳**，不需要构建：

- 样式写在 `CSS` 模板字符串里，由 `injectStylesheet()` 注入 `<style data-plugin-css=…>`
- 颜色只用主题 token：对比色按钮 `--dsw-alias-label-primary` + `-foreground`，
  强调色 `--dsw-alias-state-business-primary`。**不要用 `--dsw-alias-brand-primary` 当强调色**
  （它是墨色，暗色主题下会得到白底白字）
- 改完跑 `node test/client-smoke.cjs`：它会用迷你 React + 迷你 DOM 真渲染一次，
  并断言交互（点行勾选、点 👁 展开预览、视角切换等）

## 改宿主逻辑时

- 注入点在 `agent/pre-step` 瀑布，异常必须吞掉（抛错会毁掉整轮对话）
- 读历史只用 `ctx.sessionPersistence.open(id, 'read')`，不要抢写所有权
- 摘要只抽 `source.kind === 'user'` 的输入与 assistant 正文，避免记忆自我繁殖

## 为什么拆成三个包

宿主代码在 dsh 进程里按 ESM URL 缓存，改文件**不会**热更新，所以新增接口要放新包
（`dsh-session-link-preview` 里用内容哈希 shim 做到热更新）。细节见
[docs/ARCHITECTURE.zh.md](docs/ARCHITECTURE.zh.md)。

## 提交信息

用 `feat:` / `fix:` / `docs:` / `chore:` / `ci:` 前缀即可，不强制 Conventional Commits 全套。
