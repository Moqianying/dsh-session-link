/**
 * dsh-session-link-preview — BYTE-STABLE 加载壳。
 *
 * 挂载行（`session-link-preview`）只会 import 这个文件一次，Node 的 ESM 缓存
 * 之后就一直返回同一个模块对象。所以真正的实现放在 `./lib/impl.js`，这里用
 * 「自身内容 sha256」拼在 URL 后面动态 import：
 *   - 本文件永不修改（改了需要重启进程）
 *   - impl.js 改了 → 新的 hash → 新 URL → 立刻拿到新代码，热更新
 *
 * 刻意不写 `export default`：loader 的 `unwrapExports` 会把
 * `exports.default ?? exports` 折叠掉，默认导出会顺带丢掉具名 `inject`，
 * 插件就会在服务还没就绪时提前 apply。
 *
 * @module dsh-session-link-preview
 */

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const IMPL_URL = new URL('./lib/impl.js', import.meta.url)

export const name = 'session-link-preview'

export const inject = ['sessionPersistence']

async function loadImpl() {
  let href = IMPL_URL.href
  try {
    const bytes = await readFile(IMPL_URL)
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
    href = `${IMPL_URL.href}?v=${hash}`
  } catch {
    // 读不到就退回原 URL，让 import 自己把真实错误抛出来
  }
  return await import(/* @vite-ignore */ href)
}

/**
 * 挂载实现模块。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} config - 预算参数（可选）。
 */
export async function apply(ctx, config) {
  if (ctx.get('sessionLinkPreview') !== undefined) return
  const mod = await loadImpl()
  if (ctx.get('sessionLinkPreview') !== undefined) return
  ctx.plugin(
    {
      name: 'session-link-preview-impl',
      inject: ['sessionPersistence'],
      apply: mod.apply
    },
    config
  )
}
