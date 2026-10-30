# 安全说明

## 这个插件能碰到什么

- **读**其它会话的历史：通过 dsh 提供的 `sessionPersistence.open(id, 'read')` 只读句柄，
  不取得写所有权，也不复制日志文件。
- **写**自己的数据文件：`$DSH_HOME/session-links.json`（链接组）与 profile 里的一次性 patch 改动。
- **注册**HTTP 路由：`/api/session-link/*`，只绑定在 dsh web 的监听地址上（默认 `127.0.0.1`）。
  这些路由**没有额外鉴权**，与 dsh web 本身一致——如果 dsh web 暴露到公网，这些路由也会跟着暴露。
- **不改** dsh 核心：不 patch 宿主服务方法，只注册插槽、工具与路由。

## 记忆里会带出什么

跨会话记忆只包含 **`source.kind === 'user'` 的直接人类输入**与 **assistant 正文**，
按每个来源会话最近 N 条 + 字节预算裁剪。图片只留 `[图片]` 占位，工具输出默认不搬
（可用 `includeToolCalls` 打开一行"调用了 X"）。

这意味着：**被链接的会话内容会出现在其它会话的模型请求里**。敏感会话（含口令、密钥、私有地址）
在链接前请自行确认，或先用 `session_recall` 只做检索、不长期链接。

## 数据存放位置

| 数据 | 路径 |
| --- | --- |
| 链接组 | `<DSH_HOME>/session-links.json` |
| 插件本体 | `<DSH_HOME>/profiles/<profile>/node_modules/dsh-session-link*` |
| 挂载行 | `<DSH_HOME>/profiles/<profile>/cordis.patch.yml`（标记块，删除即卸载） |

卸载后 `<DSH_HOME>/session-links.json` 会保留，重装可继续使用；不需要时手动删除即可。

## 报告问题

请不要在 issue 里贴**真实会话内容、口令、token 或内网地址**。诊断信息只需要：
dsh 版本、插件版本、`/api/session-link/diag` 的输出（不含会话正文）、以及报错堆栈。
安全相关的问题请走 GitHub 的私有安全通告（Security → Advisories），不要开公开 issue。
