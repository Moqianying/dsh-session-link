/**
 * 临时诊断包（可随时删除）。
 *
 * 用 `ctx.get('clientModules')` 读组合后的浏览器启动图，回答两个问题：
 *   1. dsh-session-link-client 是否进入启动图（entry 存在、bundle 路径存在）
 *   2. 它的 bundle 能不能被服务端真正吐出来（fetchBundle 的状态与字节数）
 *
 * 只注册一个只读路由：GET /api/session-link/diag
 *
 * @module dsh-session-link-diag
 */

export const name = 'session-link-diag'

export const inject = ['webServer']

const ROUTE = '/api/session-link/diag'

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body)
  })
  res.end(body)
}

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined || typeof webServer.register !== 'function') return

  const dispose = webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: async (req, res) => {
      const registry = ctx.get('clientModules')
      if (registry === undefined) {
        sendJson(res, 200, { ok: false, error: 'clientModules 服务不存在（非 web 组合？）' })
        return
      }
      let entries = []
      try {
        entries = registry.graph().entries.map((entry) => ({
          id: entry.id,
          url: entry.url,
          inject: entry.inject ?? [],
          external: entry.external ?? []
        }))
      } catch (error) {
        sendJson(res, 200, { ok: false, error: `graph() 失败：${error.message}` })
        return
      }
      const target = entries.find((entry) => entry.id === 'dsh-session-link-client')
      let bundle
      if (target !== undefined) {
        try {
          const response = await registry.fetchBundle({ method: 'GET', url: target.url })
          const body = await response.arrayBuffer()
          bundle = { status: response.status, bytes: body.byteLength }
        } catch (error) {
          bundle = { error: error.message }
        }
      }
      sendJson(res, 200, {
        ok: true,
        total: entries.length,
        hasClient: target !== undefined,
        clientPath: registry.clientPath?.('dsh-session-link-client') ?? null,
        entry: target ?? null,
        bundle,
        entries: entries.map((entry) => entry.id)
      })
    }
  })
  ctx.effect(() => dispose)
  console.info(`[session-link-diag] 诊断路由已挂载：${ROUTE}`)
}
