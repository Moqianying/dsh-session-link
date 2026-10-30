/**
 * 离线验证 dsh-session-link 的核心逻辑：
 *   - 用假的 cordis ctx + 真实会话文件（自行解多帧 zstd）模拟 sessionPersistence
 *   - 走 apply()，拿到注册的工具与 pre-step 钩子，逐一验证
 *
 * 运行：node test/offline-test.cjs
 *       （需要真实会话文件：设置 DSH_SESSIONS_DIR，或先跑 scripts/install 装进 profile）
 */
const fs = require('node:fs')
const os = require('node:os')
const z = require('node:zlib')
const path = require('node:path')
const assert = require('node:assert')

/** 需要一个装着真实会话的目录：优先 $DSH_SESSIONS_DIR，否则在 $DSH_HOME/sessions 下挑第一个项目目录。 */
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

function detectSessionsRoot() {
  if (process.env.DSH_SESSIONS_DIR) return process.env.DSH_SESSIONS_DIR
  const root = path.join(DSH_HOME, 'sessions')
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (!/^session-/.test(entry.name)) {
        const candidate = path.join(root, entry.name)
        if (fs.readdirSync(candidate).some((name) => name.startsWith('session-'))) return candidate
      }
    }
  } catch {
    /* 没有 sessions 目录 */
  }
  return undefined
}

const SESSIONS_ROOT = detectSessionsRoot()
const TMP_STORE = path.join(__dirname, 'links.json')

/**
 * 优先用「已安装到 profile」的那份插件：它的 peer 依赖（@deepseek-ai/dsh-llm 等）
 * 能从 profiles/web/node_modules 里解析到。仓库里直接跑会缺 peer，因此给出提示。
 */
const PROFILE = process.env.DSH_PROFILE || 'web'
const INSTALLED_INDEX = path.join(DSH_HOME, 'profiles', PROFILE, 'node_modules', 'dsh-session-link', 'index.js')
const REPO_INDEX = path.join(__dirname, '..', 'packages', 'dsh-session-link', 'index.js')
const PACKAGE_INDEX = fs.existsSync(INSTALLED_INDEX) ? INSTALLED_INDEX : REPO_INDEX

/** 解多帧 zstd：按 magic 切分并逐个校验。 */
function decodeFrames(buffer) {
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
  const starts = []
  let cursor = buffer.indexOf(magic, 0)
  while (cursor !== -1) {
    starts.push(cursor)
    cursor = buffer.indexOf(magic, cursor + 4)
  }
  const out = []
  let i = 0
  const bounds = [...starts, buffer.length]
  while (i < bounds.length - 1) {
    let j = i + 1
    let ok = false
    for (; j < bounds.length; j++) {
      try {
        out.push(z.zstdDecompressSync(buffer.subarray(bounds[i], bounds[j])))
        ok = true
        break
      } catch {
        /* 试下一段 */
      }
    }
    if (!ok) throw new Error(`无法解帧 @${bounds[i]}`)
    i = j
  }
  return Buffer.concat(out).toString('utf8')
}

function readSession(sessionDir) {
  const file = path.join(sessionDir, 'session.v3.jsonl.zstd')
  const plain = decodeFrames(fs.readFileSync(file))
  const lines = plain.split('\n').filter((line) => line.trim().length > 0)
  const header = JSON.parse(lines[0])
  const events = []
  for (const line of lines.slice(1)) {
    try {
      events.push(JSON.parse(line))
    } catch {
      /* 略过残行 */
    }
  }
  return { header, events }
}

// —— 假的 sessionPersistence ——
const ids = fs.readdirSync(SESSIONS_ROOT).filter((name) => name.startsWith('session-'))
const cache = new Map()
const persistence = {
  async list() {
    return ids.map((id) => {
      const { header } = readSession(path.join(SESSIONS_ROOT, id))
      return { header, revision: 'r', sizeBytes: fs.statSync(path.join(SESSIONS_ROOT, id, 'session.v3.jsonl.zstd')).size }
    })
  },
  async open(id, access) {
    assert.strictEqual(access, 'read', 'open 必须以 read 访问')
    const { header, events } = readSession(path.join(SESSIONS_ROOT, id))
    cache.set(id, events)
    return {
      async read() {
        return { meta: header, events }
      },
      async close() {}
    }
  }
}

// —— 假的 cordis ctx ——
const tools = new Map()
const handlers = new Map()
const ctx = {
  on(event, listener) {
    const list = handlers.get(event) ?? []
    list.push(listener)
    handlers.set(event, list)
    return () => {}
  },
  effect(fn) {
    return () => {}
  },
  get(key) {
    if (key === 'sessionPersistence') return persistence
    return undefined
  },
  tools: {
    register(definition) {
      tools.set(definition.name, definition)
      return () => {}
    }
  }
}

async function main() {
  if (SESSIONS_ROOT === undefined) {
    console.log('跳过：找不到真实会话目录。')
    console.log('设置 DSH_SESSIONS_DIR 指向 <DSH_HOME>/sessions/<project-dir> 后再跑（这个测试需要真实会话文件）。')
    return
  }
  const pluginUrl = 'file:///' + PACKAGE_INDEX.replace(/\\/g, '/')
  let plugin
  try {
    plugin = await import(pluginUrl)
  } catch (error) {
    if (error && error.code === 'ERR_MODULE_NOT_FOUND') {
      console.error('导入插件失败：缺少 dsh 的 peer 依赖（@deepseek-ai/dsh-llm 等）。')
      console.error('先跑 scripts/install.ps1 / install.sh 装进 profile，再执行本测试；')
      console.error(`或者用 DSH_HOME / DSH_PROFILE 指向已安装的环境。当前尝试的是：${PACKAGE_INDEX}`)
      process.exit(2)
    }
    throw error
  }
  const config = plugin.Config({ storePath: TMP_STORE, includeToolCalls: false })
  plugin.apply(ctx, config)

  console.log('注册的工具：', [...tools.keys()])
  console.log('注册的钩子事件：', [...handlers.keys()])

  const linkTool = tools.get('session_link')
  const recallTool = tools.get('session_recall')
  assert.ok(linkTool, 'session_link 未注册')
  assert.ok(recallTool, 'session_recall 未注册')
  assert.ok(handlers.has('agent/pre-step'), 'pre-step 钩子未注册')

  // 1) list
  const listed = await linkTool.execute({ action: 'list' }, {})
  const sessionRows = listed.sessions
  console.log('\n[list] 会话数 =', sessionRows.length)
  console.log('[list] 前 3 行：\n' + listed.message.split('\n').slice(0, 5).join('\n'))
  assert.ok(sessionRows.length >= 2, '至少需要 2 个会话才能测链接')

  // 2) link：把第一个会话当「本会话」，串上最多 2 个别的会话
  const self = sessionRows[0].sessionId
  const peers = sessionRows
    .map((row) => row.sessionId)
    .filter((id) => id !== self)
    .slice(0, 2)
  const linked = await linkTool.execute(
    { action: 'link', sessions: [self, ...peers], group: '测试组' },
    { agent: { session: { id: self } } }
  )
  console.log('\n[link]', linked.message)
  assert.strictEqual(linked.groups.length, 1)
  assert.strictEqual(linked.groups[0].sessions.length, 1 + peers.length)

  // 3) status
  const status = await linkTool.execute({ action: 'status' }, { agent: { session: { id: self } } })
  console.log('\n[status]', status.message)

  // 4) recall digest / search（含中文与英文关键字）
  const digest = await recallTool.execute({ action: 'digest' }, { agent: { session: { id: self } } })
  console.log('\n[digest] 长度 =', digest.text.length, '字节 =', Buffer.byteLength(digest.text))
  console.log(digest.text.slice(0, 700))
  assert.ok(digest.text.includes('session-link-memory'), 'digest 缺少记忆包裹标签')
  assert.ok(Buffer.byteLength(digest.text) <= 9000 + 64, 'digest 超出预算')

  const firstUserLine = digest.text.split('\n').find((line) => line.startsWith('- [用户]')) || ''
  const cjkRun = firstUserLine.match(/[\u4e00-\u9fa5]{3,}/)
  const keyword = cjkRun ? cjkRun[0].slice(0, 3) : '申请'
  console.log('\n[search] 关键字 =', keyword)
  const hits = await recallTool.execute(
    { action: 'search', query: keyword, limit: 5 },
    { agent: { session: { id: self } } }
  )
  console.log('[search] 命中 =', hits.hits.length)
  assert.ok(hits.hits.length > 0, 'search 无命中')

  // 5) pre-step 注入：内容应出现在 decision.messages 尾部
  const preStep = handlers.get('agent/pre-step')[0]
  const fakeAgent = {
    session: {
      id: self,
      surface: { nodes: [] },
      eventAt: () => undefined
    }
  }
  const decision = { kind: 'continue', messages: [] }
  const injected = await preStep({ agent: fakeAgent, messages: [], step: 1, signal: undefined }, async () => decision)
  console.log('\n[pre-step] 返回消息数 =', injected.messages.length)
  assert.strictEqual(injected.messages.length, 1, 'pre-step 未注入消息')
  const message = injected.messages[0]
  console.log('[pre-step] source =', JSON.stringify(message.source))
  assert.strictEqual(message.source.kind, 'plugin')
  assert.strictEqual(message.source.plugin, 'session-link')
  assert.strictEqual(message.source.form, 'recall')
  assert.ok(message.content[0].text.includes('跨会话记忆'))

  // 6) 去重：同一内容第二次不应再注入
  fakeAgent.session.surface.nodes = [1]
  fakeAgent.session.eventAt = () => ({ type: 'user/message', data: message })
  const second = await preStep({ agent: fakeAgent, messages: [], step: 2, signal: undefined }, async () => decision)
  assert.strictEqual(second.messages.length, 0, '去重失败：同内容被重复注入')
  console.log('[pre-step] 去重正常')

  // 7) 未链接会话不应注入
  const lonelyAgent = {
    session: { id: 'session-not-linked', surface: { nodes: [] }, eventAt: () => undefined }
  }
  const lonely = await preStep({ agent: lonelyAgent, messages: [], step: 1, signal: undefined }, async () => decision)
  assert.strictEqual(lonely.messages.length, 0, '未链接会话被注入了记忆')
  console.log('[pre-step] 未链接会话不注入，正常')

  // 8) 落盘格式
  const saved = JSON.parse(fs.readFileSync(TMP_STORE, 'utf8'))
  console.log('\n[store]', TMP_STORE, '→', JSON.stringify(saved).slice(0, 240))
  assert.strictEqual(saved.version, 1)

  // 9) unlink / delete_group
  const unlinked = await linkTool.execute({ action: 'unlink', sessions: peers }, { agent: { session: { id: self } } })
  assert.strictEqual(unlinked.groups[0].sessions.length, 1)
  const deleted = await linkTool.execute({ action: 'delete_group', group: '测试组' }, { agent: { session: { id: self } } })
  assert.strictEqual(deleted.groups.length, 0)
  console.log('\n[unlink]', unlinked.message)
  console.log('[delete_group]', deleted.message)

  console.log('\n全部断言通过 ✅')
}

main().catch((error) => {
  console.error('\n测试失败：', error)
  process.exit(1)
})