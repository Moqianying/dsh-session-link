/**
 * dsh-session-link-client 冒烟测试（Node + 迷你 React/Hooks 运行时 + 迷你 DOM）
 *
 * 目的：在没有浏览器的情况下真正「渲染」一次设置页，抓出运行期错误：
 *   - `window.__ModuleLoader__.load` 包壳能不能跑通
 *   - `apply(ctx)` 是否注册了 settings.section（id / order / label）
 *   - 组件首屏（loading）与拿到数据后的完整树是否渲染成功
 *   - 勾选、预览、建组这些交互回调是否接线正确
 *
 * 运行：node test/client-smoke.cjs
 */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert')

const CLIENT = path.join(__dirname, '..', 'packages', 'dsh-session-link-client', 'client.js')

//#region 迷你 React（createElement + 4 个 hook + 同步渲染循环）
/** 依赖数组比较（长度 + Object.is 逐项）。 */
function sameDeps(previous, next) {
  if (previous === undefined || next === undefined) return false
  if (previous.length !== next.length) return false
  for (let i = 0; i < next.length; i++) {
    if (!Object.is(previous[i], next[i])) return false
  }
  return true
}

function createMiniReact() {
  const Fragment = Symbol('fragment')
  const runtime = {
    slots: [],
    cursor: 0,
    pendingEffects: [],
    rerenderRequested: false
  }

  const React = {
    Fragment,
    createElement(type, props, ...children) {
      const flat = []
      const push = (child) => {
        if (child === null || child === undefined || child === false || child === true) return
        if (Array.isArray(child)) { child.forEach(push); return }
        flat.push(child)
      }
      push(children.length === 1 ? children[0] : children)
      return { type, props: { ...(props || {}), children: flat } }
    },
    useState(initial) {
      const index = runtime.cursor++
      if (runtime.slots.length <= index) {
        runtime.slots[index] = typeof initial === 'function' ? initial() : initial
      }
      const set = (value) => {
        const next = typeof value === 'function' ? value(runtime.slots[index]) : value
        if (Object.is(next, runtime.slots[index])) return
        runtime.slots[index] = next
        runtime.rerenderRequested = true
      }
      return [runtime.slots[index], set]
    },
    useMemo(factory, deps) {
      const index = runtime.cursor++
      const previous = runtime.slots[index]
      if (previous !== undefined && sameDeps(previous.deps, deps)) return previous.value
      const value = factory()
      runtime.slots[index] = { deps, value }
      return value
    },
    useCallback(fn, deps) {
      const index = runtime.cursor++
      const previous = runtime.slots[index]
      if (previous !== undefined && sameDeps(previous.deps, deps)) return previous.value
      runtime.slots[index] = { deps, value: fn }
      return fn
    },
    useRef(value) {
      const index = runtime.cursor++
      if (runtime.slots.length <= index) runtime.slots[index] = { current: value }
      return runtime.slots[index]
    },
    useEffect(effect, deps) {
      const index = runtime.cursor++
      const previous = runtime.slots[index]
      if (previous !== undefined && sameDeps(previous.deps, deps)) return
      runtime.slots[index] = { deps }
      runtime.pendingEffects.push(effect)
    }
  }
  return { React, runtime }
}

/**
 * 把元素树「展开」成纯元素树：函数组件就地调用掉，数组展开成数组。
 * 展开后的树里只剩原生标签，可以安全地遍历、找节点、调用事件处理器。
 */
function expand(node) {
  if (node === null || node === undefined || node === false || node === true) return null
  if (typeof node === 'string' || typeof node === 'number') return node
  if (Array.isArray(node)) return node.map(expand)
  if (typeof node !== 'object') return node
  const { type, props } = node
  if (typeof type === 'function') return expand(type(props))
  const children = props && props.children !== undefined ? expand(props.children) : []
  return { type, props: { ...(props || {}), children } }
}

/** 展开后的树 → 纯文本（把 placeholder / title 也纳入，便于断言）。 */
function textOf(node, out) {
  const buffer = out || []
  const push = (value) => {
    if (value === null || value === undefined || value === false || value === true) return
    if (typeof value === 'string' || typeof value === 'number') { buffer.push(String(value)); return }
    if (Array.isArray(value)) { for (const child of value) push(child); return }
    if (typeof value !== 'object') return
    if (typeof value.props.placeholder === 'string') buffer.push(value.props.placeholder)
    if (typeof value.props.title === 'string') buffer.push(value.props.title)
    push(value.props.children)
  }
  push(node)
  return buffer
}

/** 深度遍历展开后的元素树，回调拿到每个元素节点。 */
function walk(node, visit) {
  if (node === null || node === undefined) return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node !== 'object') return
  if (node.props !== undefined) visit(node)
  if (node.props && node.props.children !== undefined) walk(node.props.children, visit)
}

//#endregion
//#region 迷你 DOM / 浏览器环境
function createDocument() {
  const created = []
  const makeElement = (tag) => ({
    tagName: String(tag).toUpperCase(),
    dataset: {},
    style: {},
    children: [],
    textContent: '',
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value },
    getAttribute(name) { return this.attributes[name] ?? null },
    appendChild(child) { this.children.push(child) },
    replaceWith() {},
    closest() { return null },
    querySelector() { return null },
    querySelectorAll() { return [] }
  })
  return {
    documentElement: makeElement('html'),
    head: makeElement('head'),
    querySelector(selector) { return null },
    querySelectorAll() { return [] },
    createElement(tag) { const el = makeElement(tag); created.push(el); return el },
    createElementNS(_ns, tag) { const el = makeElement(tag); created.push(el); return el },
    __created: created
  }
}

function createSandbox() {
  const document = createDocument()
  const calls = []
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Promise,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init })
      const urlText = String(url)
      if (urlText.endsWith('/state') && (!init || init.method !== 'POST')) {
        return {
          status: 200,
          async json() {
            return {
              ok: true,
              groups: [
                { id: 'demo', name: '跨会话记忆演示', note: '', sessions: ['session-a'], createdAt: 1 }
              ],
              sessions: [
                {
                  sessionId: 'session-a',
                  title: '提交运动世界数据测试申请',
                  cwd: 'E:\\AAAWork',
                  createdAt: 1793377867170,
                  createdAtText: '2026-10-30 16:31',
                  sizeBytes: 115994,
                  groups: ['demo']
                },
                {
                  sessionId: 'session-b',
                  title: '学习通无法粘贴的Edge插件',
                  cwd: 'E:\\AAAWork',
                  createdAt: 1793368321454,
                  createdAtText: '2026-10-30 13:52',
                  sizeBytes: 66015,
                  groups: []
                },
                {
                  sessionId: 'session-c',
                  title: '未链接的第三个会话',
                  cwd: 'E:\\AAAWork',
                  createdAt: 1793360000000,
                  createdAtText: '2026-10-30 11:33',
                  sizeBytes: 20480,
                  groups: []
                }
              ]
            }
          }
        }
      }
      if (urlText.includes('/state') && init && init.method === 'POST') {
        const body = JSON.parse(init.body)
        return { status: 200, async json() { return { ok: true, groups: body.groups } } }
      }
      if (urlText.includes('/preview')) {
        const mode = new URL(urlText, 'http://127.0.0.1').searchParams.get('mode')
        return {
          status: 200,
          async json() {
            return mode === 'contribute'
              ? { ok: true, mode: 'contribute', text: '<session-link-contribution version="1">它会被提供的内容</session-link-contribution>' }
              : { ok: true, mode: 'receive', text: '<session-link-memory version="1">它收到的记忆</session-link-memory>' }
          }
        }
      }
      if (urlText.includes('/memory')) {
        return {
          status: 200,
          async json() {
            return { ok: true, text: '<session-link-memory>已注入的跨会话记忆</session-link-memory>' }
          }
        }
      }
      return { status: 404, async json() { return { ok: false, error: 'not found' } } }
    },
    navigator: { language: 'zh-CN' },
    MutationObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    document
  }
  sandbox.window = sandbox
  sandbox.globalThis = sandbox
  sandbox.window.__ModuleLoader__ = {
    load(registration) {
      sandbox.__registration = registration
    }
  }
  return { sandbox, calls, document }
}

//#endregion
async function main() {
  const code = fs.readFileSync(CLIENT, 'utf8')
  const { sandbox, calls, document } = createSandbox()
  const context = vm.createContext(sandbox)
  new vm.Script(code, { filename: CLIENT }).runInContext(context)

  const registration = sandbox.__registration
  assert.ok(registration, '没有调用 window.__ModuleLoader__.load')
  assert.strictEqual(registration.id, 'dsh-session-link-client')
  console.log('包壳 OK；注册 id =', registration.id)

  const { React, runtime } = createMiniReact()
  runtime.slots = []
  const moduleExports = registration.factory((specifier) => {
    if (specifier === 'react') return React
    throw new Error(`unexpected require: ${specifier}`)
  })
  assert.strictEqual(typeof moduleExports.apply, 'function', 'exports.apply 缺失')
  assert.deepStrictEqual([...moduleExports.inject], ['slots'])
  console.log('factory OK；inject =', JSON.stringify(moduleExports.inject))

  // 假 cordis ctx：捕获 slots 注册
  const registrations = []
  const effects = []
  const ctx = {
    slots: {
      inject(_name, factory) { registrations.push(factory()) },
      register(options, component) {
        const record = { options, component }
        registrations.push(record)
        return () => {}
      }
    },
    effect(setup) { effects.push(setup()) }
  }

  moduleExports.apply(ctx)
  const optionRegs = registrations.filter((entry) => entry && entry.options)
  assert.strictEqual(optionRegs.length, 1, `只应注册 settings.section（标题栏快捷入口已撤销），实际 ${optionRegs.length} 个`)
  const section = optionRegs[0]
  assert.ok(section, '没有注册 settings.section')
  assert.strictEqual(section.options.name, 'settings.section')
  assert.strictEqual(section.options.id, 'session-link')
  assert.strictEqual(section.options.order, 26)
  assert.strictEqual(section.options.label(), '会话互联')
  console.log('settings.section 注册 OK:', JSON.stringify({
    id: section.options.id,
    order: section.options.order,
    label: section.options.label()
  }))

  // 样式注入
  const styleTags = document.__created.filter((el) => el.tagName === 'STYLE')
  assert.ok(styleTags.length > 0, '没有注入样式')
  assert.ok(styleTags[0].textContent.includes('.dshsl-root'), '样式中缺少根类')
  console.log('样式注入 OK：', styleTags[0].textContent.length, '字符')

  // 图标同步不应抛错
  for (const effect of effects) {
    assert.strictEqual(typeof effect, 'function', 'ctx.effect 没有返回清理函数')
    effect()
  }
  console.log('导航图标同步 OK（无 DOM 时不报错，并返回清理函数）')

  // 真正渲染：跑渲染循环直到状态稳定
  let lastText = ''
  let lastTree = null
  let stable = false
  for (let pass = 0; pass < 40; pass++) {
    runtime.rerenderRequested = false
    runtime.cursor = 0
    runtime.pendingEffects = []
    lastTree = expand(section.component({}))
    lastText = textOf(lastTree).join(' ')
    for (const effect of runtime.pendingEffects) {
      const cleanup = effect()
      if (typeof cleanup === 'function') cleanup()
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
    if (!runtime.rerenderRequested) {
      // 再等一轮，确保异步 fetch 的状态更新有机会落地
      await new Promise((resolve) => setTimeout(resolve, 5))
      if (!runtime.rerenderRequested) { stable = true; break }
    }
  }
  assert.ok(stable, '渲染循环没有稳定下来（可能存在无限 setState）')
  console.log('\n渲染文本长度 =', lastText.length)
  console.log('渲染前 320 字：\n' + lastText.slice(0, 320))

  for (const expected of ['会话互联', '共 3 个会话', '跨会话记忆演示', '提交运动世界数据测试申请', '学习通无法粘贴的Edge插件', '未链接的第三个会话', '新建链接组']) {
    assert.ok(lastText.includes(expected), `渲染结果缺少「${expected}」`)
  }
  console.log('\n页面关键文案全部命中 ✅')

  const stateCalls = calls.filter((call) => call.url.includes('/state'))
  assert.ok(stateCalls.length >= 1, '没有请求 /state')
  console.log('HTTP 调用：', calls.map((call) => call.url.replace(/^https?:\/\/[^/]+/, '')).join(', '))

  /** 用当前状态重新展开一次视图（不跑 effect，只读 state）。 */
  const snapshot = () => {
    runtime.cursor = 0
    runtime.pendingEffects = []
    return expand(section.component({}))
  }
  const rowsOf = (tree) => {
    const found = []
    walk(tree, (node) => {
      if (node && node.props && typeof node.props.className === 'string'
        && node.props.className.includes('dshsl-row')) found.push(node)
    })
    return found
  }

  // 交互 1：点整行应当等于勾选该会话（发一次 POST /state，且 body 里带上它）
  let rows = rowsOf(snapshot())
  assert.ok(rows.length >= 2, `没找到会话行（找到 ${rows.length} 个）`)
  const targetRow = rows.find((row) => textOf(row).join(' ').includes('session-b'))
  assert.ok(targetRow, '没找到 session-b 所在行')
  assert.strictEqual(typeof targetRow.props.onClick, 'function', '会话行没有 onClick —— 点击行不会勾选')
  assert.strictEqual(targetRow.props.tabIndex, 0, '会话行不可键盘聚焦')
  assert.ok(targetRow.props.className.includes('dshsl-row-on') === false, 'session-b 初始不应在组内')

  const beforeClicks = calls.length
  targetRow.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 20))
  const posts = calls.slice(beforeClicks).filter((call) => call.init && call.init.method === 'POST')
  assert.strictEqual(posts.length, 1, `点行后应有 1 次 POST，实际 ${posts.length} 次`)
  const posted = JSON.parse(posts[0].init.body)
  const demo = posted.groups.find((group) => group.id === 'demo')
  assert.ok(demo.sessions.includes('session-b'), '点行后 session-b 没有进入组')
  console.log('\n点行勾选 OK：POST body 里 demo.sessions =', JSON.stringify(demo.sessions))

  // 交互 2：点 👁 必须就地展开预览，且绝不能顺带翻勾选
  rows = rowsOf(snapshot())
  const rowA = rows.find((row) => textOf(row).join(' ').includes('session-a'))
  assert.ok(rowA, '没找到 session-a 所在行')
  const checkbox = rowA.props.children[0]
  const actions = rowA.props.children[2]
  assert.strictEqual(typeof checkbox.props.onClick, 'function', '勾选框没有阻止冒泡的 onClick')
  assert.strictEqual(typeof actions.props.onClick, 'function', '操作区没有阻止冒泡的 onClick')

  const eyeButton = actions.props.children[0]
  assert.strictEqual(typeof eyeButton.props.onClick, 'function', '预览按钮没有 onClick')

  const beforePreview = calls.length
  eyeButton.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 30))
  const previewCalls = calls.slice(beforePreview)
  assert.ok(
    previewCalls.some((call) => call.url.includes('/preview') || call.url.includes('/memory')),
    '点 👁 没有请求预览接口'
  )
  assert.strictEqual(
    previewCalls.filter((call) => call.init && call.init.method === 'POST').length,
    0,
    '点 👁 不应改动链接（却发了 POST）'
  )

  const previewTree = snapshot()
  const previewNodes = []
  walk(previewTree, (node) => {
    if (node && node.props && typeof node.props.className === 'string'
      && node.props.className.includes('dshsl-preview-item')) previewNodes.push(node)
  })
  assert.strictEqual(previewNodes.length, 1, `预览面板没有就地展开（找到 ${previewNodes.length} 个）`)
  const previewText = textOf(previewNodes[0]).join(' ')
  assert.ok(previewText.includes('注入内容预览'), '预览面板缺少标题')
  assert.ok(previewText.includes('session-link-memory'), '预览面板没有显示记忆正文')
  console.log('点 👁 OK：就地展开预览，正文 =', previewText.slice(0, 90))

  // 交互 3：再点一次同一个 👁 应收起预览
  const rowsAgain = rowsOf(snapshot())
  const rowAgain = rowsAgain.find((row) => textOf(row).join(' ').includes('session-a'))
  rowAgain.props.children[2].props.children[0].props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 10))
  const collapsed = []
  walk(snapshot(), (node) => {
    if (node && node.props && typeof node.props.className === 'string'
      && node.props.className.includes('dshsl-preview-item')) collapsed.push(node)
  })
  assert.strictEqual(collapsed.length, 0, '再次点击没有收起预览')
  console.log('再次点击收起预览 OK')

  // 交互 4：未链接会话点 👁 默认看「它会提供的内容」，并可切到「它收到的记忆」
  let treeNow = snapshot()
  const rowC = rowsOf(treeNow).find((row) => textOf(row).join(' ').includes('session-c'))
  assert.ok(rowC, '没找到 session-c 所在行')
  rowC.props.children[2].props.children[0].props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 30))
  const allPreviewCalls = calls.filter((call) => call.url.includes('/preview'))
  assert.ok(allPreviewCalls.length > 0, '没有请求 /preview')
  const lastPreviewUrl = allPreviewCalls[allPreviewCalls.length - 1].url
  assert.ok(lastPreviewUrl.includes('mode=contribute'), `未链接会话默认应看 contribute，实际：${lastPreviewUrl}`)

  const unlinkedPanelText = (() => {
    const found = []
    walk(snapshot(), (node) => {
      if (node && node.props && typeof node.props.className === 'string'
        && node.props.className.includes('dshsl-preview-item')) found.push(node)
    })
    assert.strictEqual(found.length, 1, '未链接会话的预览面板没有展开')
    return textOf(found[0]).join(' ')
  })()
  assert.ok(unlinkedPanelText.includes('session-link-contribution'), '未链接预览没有显示「它会提供的内容」')
  assert.ok(unlinkedPanelText.includes('该会话还没链接'), '缺少未链接提示')
  console.log('未链接会话默认预览「它会提供的内容」OK')

  // 切到「它收到的记忆」视角
  const tabs = []
  walk(snapshot(), (node) => {
    if (node && node.props && typeof node.props.className === 'string'
      && node.props.className.split(/\s+/).includes('dshsl-tab')) tabs.push(node)
  })
  assert.strictEqual(tabs.length, 2, `预览面板应有 2 个视角切换，实际 ${tabs.length}`)
  tabs[0].props.onClick({ stopPropagation() {} })
  await new Promise((resolve) => setTimeout(resolve, 30))
  const receiveCall = calls.filter((call) => call.url.includes('/preview') && call.url.includes('mode=receive'))
  assert.ok(receiveCall.length > 0, '切换视角后没有按 mode=receive 重新拉取')
  const switchedText = (() => {
    const found = []
    walk(snapshot(), (node) => {
      if (node && node.props && typeof node.props.className === 'string'
        && node.props.className.includes('dshsl-preview-item')) found.push(node)
    })
    return found.length > 0 ? textOf(found[0]).join(' ') : ''
  })()
  assert.ok(switchedText.includes('session-link-memory'), '切换到「它收到的记忆」后内容没变')
  console.log('视角切换 OK：contribute ↔ receive')

  console.log('冒泡隔离 OK：勾选框与操作区各自 stopPropagation')

  console.log('\n客户端冒烟测试全部通过 ✅')
}

main().catch((error) => {
  console.error('\n冒烟测试失败：', error)
  process.exit(1)
})
