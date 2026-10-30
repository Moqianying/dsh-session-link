# dsh-session-link（宿主半侧）

这是 [dsh-session-link](../../README.md) 的宿主半侧包：把选中的历史会话链接成组、按预算注入跨会话
记忆、提供 `session_link` / `session_recall` 两个模型工具与 HTTP 接口。

- 完整说明（安装 / 用法 / 配置 / API / 排错）见仓库根目录的 [README.md](../../README.md)。
- 实现原理与踩坑笔记见 [docs/ARCHITECTURE.zh.md](../../docs/ARCHITECTURE.zh.md)。

## 挂载行

```yaml
- insert:
    - id: session-link
      name: dsh-session-link
      config:
        enabled: true
        autoInject: true
```

## 数据文件

`<DSH_HOME>/session-links.json`（热读取，可手改）：

```json
{
  "version": 1,
  "groups": [
    { "id": "research", "name": "研究线", "note": "", "sessions": ["session-<id>", "session-<id>"] }
  ]
}
```

一个会话可同时属于多个组；同组内除自己之外都是记忆来源。
