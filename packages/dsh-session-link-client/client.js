/**
 * dsh-session-link-client — 「会话互联」设置页（浏览器半侧）
 *
 * 手写 `__ModuleLoader__` 包壳（与 dsh-session-recycle-bin 同构，无需构建）：
 *   - 在设置面板注册一个 section：id `session-link`，order 26（紧跟会话回收站）
 *   - 导航图标用 DOM 同步换成「链接」图标（设置的 nav 图标是按 section id 硬映射的，
 *     自注册 id 会退化成齿轮，所以复用回收站插件的替换手法）
 *   - 页面本身：搜索 / 排序 / 链接组标签 / 勾选式会话卡片 / 记忆预览，样式取
 *     `--dsw-alias-*` 主题变量，与宿主设置页一致
 *
 * 数据全部走宿主半侧（dsh-session-link）的 HTTP 接口：
 *   GET  /api/session-link/state
 *   POST /api/session-link/state
 *   GET  /api/session-link/memory?sessionId=…
 */

window.__ModuleLoader__.load({
  id: 'dsh-session-link-client',
  factory: (require) => {
    'use strict'

    const module = { exports: {} }
    const exports = module.exports

    const React = require('react')
    const { useState, useEffect, useCallback, useMemo, useRef } = React
    const h = React.createElement

    const API = '/api/session-link'
    const NAV_LABEL_ID = 'session-link'
    const NAV_ORDER = 26
    const CSS_TAG_ID = 'dsh-session-link-client'

    //#region 文案
    const MESSAGES = {
      zh: {
        nav: '会话互联',
        title: '会话互联',
        subtitle: (sessions, groups) => `共 ${sessions} 个会话 · ${groups} 个链接组`,
        searchPlaceholder: '搜索会话（标题 / ID / 工作目录）…',
        allGroups: '全部会话',
        sortRecent: '最近创建（降序）',
        sortOldest: '最早创建（升序）',
        sortTitle: '按标题',
        sortSize: '按体积',
        newGroup: '新建链接组',
        newGroupPlaceholder: '组名，例如 逆向研究线',
        create: '创建',
        cancel: '取消',
        deleteGroup: '删除当前组',
        confirmDelete: '确认删除',
        noGroups: '还没有链接组。新建一个组，然后把要互通的会话勾进来。',
        noSessions: '没有匹配的会话。',
        loading: '加载中…',
        loadFailed: '加载失败',
        retry: '重试',
        linked: '已链接',
        link: '加入本组',
        unlink: '移出本组',
        preview: '预览记忆',
        previewTitle: '注入内容预览',
        previewClose: '收起预览',
        previewReceive: '它收到的记忆',
        previewContribute: '它会提供的内容',
        previewUnlinkedHint: '该会话还没链接：默认显示「它会提供的内容」；勾选后就能看「它收到的记忆」。',
        previewHint: '点 👁 就在该会话下面展开预览：未链接时看它「会提供什么」，已链接时看它「收到什么」。',
        previewEmpty: '（该会话不在当前组里，或组内没有其它会话）',
        saved: '已保存，链接立即生效',
        saveFailed: '保存失败',
        groupCreated: '已创建链接组',
        groupDeleted: '已删除链接组',
        missingGroup: '先新建或选择一个链接组',
        emptyGroup: '这个组还没有会话，勾选下面的会话即可加入',
        hint: '勾选即写入 $DSH_HOME/session-links.json，下一步模型请求就带上跨会话记忆。',
        sessionsCount: (n) => `${n} 个会话`,
        selectedCount: (n) => `已链接 ${n} 个`,
        unknown: '未知'
      },
      en: {
        nav: 'Session Link',
        title: 'Session Link',
        subtitle: (sessions, groups) => `${sessions} sessions · ${groups} link group(s)`,
        searchPlaceholder: 'Search sessions (title / id / cwd)…',
        allGroups: 'All sessions',
        sortRecent: 'Newest first',
        sortOldest: 'Oldest first',
        sortTitle: 'By title',
        sortSize: 'By size',
        newGroup: 'New link group',
        newGroupPlaceholder: 'Group name',
        create: 'Create',
        cancel: 'Cancel',
        deleteGroup: 'Delete this group',
        confirmDelete: 'Confirm delete',
        noGroups: 'No link group yet. Create one, then tick the sessions to link together.',
        noSessions: 'No matching session.',
        loading: 'Loading…',
        loadFailed: 'Failed to load',
        retry: 'Retry',
        linked: 'Linked',
        link: 'Add to group',
        unlink: 'Remove from group',
        preview: 'Preview memory',
        previewTitle: 'Injected context preview',
        previewClose: 'Collapse preview',
        previewReceive: 'What it receives',
        previewContribute: 'What it provides',
        previewUnlinkedHint: 'This session is not linked yet: showing "What it provides". Tick it to see "What it receives".',
        previewHint: 'Click 👁 to expand the preview under the row: "provides" when unlinked, "receives" when linked.',
        previewEmpty: '(This session is not in the group, or the group has no other member.)',
        saved: 'Saved — linking is live',
        saveFailed: 'Save failed',
        groupCreated: 'Link group created',
        groupDeleted: 'Link group deleted',
        missingGroup: 'Create or select a link group first',
        emptyGroup: 'This group is empty — tick a session below to add it',
        hint: 'Ticking writes $DSH_HOME/session-links.json; the next model request carries the memory.',
        sessionsCount: (n) => `${n} session(s)`,
        selectedCount: (n) => `${n} linked`,
        unknown: 'unknown'
      }
    }

    const locale = (() => {
      try {
        return String(navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
      } catch {
        return 'zh'
      }
    })()
    const t = (key, ...args) => {
      const dict = MESSAGES[locale] || MESSAGES.zh
      const value = dict[key]
      return typeof value === 'function' ? value(...args) : String(value ?? key)
    }

    //#endregion
    //#region 图标
    const svgProps = (props) => ({
      xmlns: 'http://www.w3.org/2000/svg',
      width: props.width || 16,
      height: props.height || 16,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      className: props.className
    })

    /** 链接（chain）图标 —— 本插件的身份图标。 */
    const LinkIcon = (props = {}) =>
      h('svg', svgProps(props),
        h('path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }),
        h('path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' })
      )

    const EyeIcon = (props = {}) =>
      h('svg', svgProps(props),
        h('path', { d: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z' }),
        h('circle', { cx: '12', cy: '12', r: '3' })
      )

    const SearchIcon = (props = {}) =>
      h('svg', svgProps(props),
        h('circle', { cx: '11', cy: '11', r: '7' }),
        h('path', { d: 'm20 20-3.5-3.5' })
      )

    const PlusIcon = (props = {}) =>
      h('svg', svgProps(props), h('path', { d: 'M12 5v14M5 12h14' }))

    const MinusIcon = (props = {}) =>
      h('svg', svgProps(props), h('path', { d: 'M5 12h14' }))

    const TrashIcon = (props = {}) =>
      h('svg', svgProps(props),
        h('path', { d: 'M3 6h18' }),
        h('path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }),
        h('path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' })
      )

    const CloseIcon = (props = {}) =>
      h('svg', svgProps(props),
        h('path', { d: 'M18 6 6 18' }),
        h('path', { d: 'm6 6 12 12' })
      )

    const DiskIcon = (props = {}) =>      h('svg', svgProps(props),
        h('path', { d: 'M4 4h16v16H4z' }),
        h('path', { d: 'M4 14h16' }),
        h('path', { d: 'M8 18h.01' })
      )

    //#endregion
    //#region 样式
    const CSS = `
.dshsl-root{display:flex;flex-direction:column;gap:14px;min-height:0;color:var(--dsw-alias-label-primary,inherit);font-family:inherit}
.dshsl-head{display:flex;flex-direction:column;gap:2px}
.dshsl-title-row{display:flex;align-items:center;gap:8px}
.dshsl-title{font-size:20px;font-weight:600;margin:0;line-height:1.35}
.dshsl-title-icon{color:var(--dsw-alias-label-secondary,#8a8f98);flex:none}
.dshsl-sub{margin:0;color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:13px}
.dshsl-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dshsl-search{position:relative;flex:1 1 260px;min-width:180px;display:flex;align-items:center}
.dshsl-search .dshsl-search-icon{position:absolute;left:10px;color:var(--dsw-alias-label-tertiary,#8a8f98);pointer-events:none}
.dshsl-input{width:100%;font:inherit;font-size:13px;padding:8px 10px 8px 32px;border-radius:10px;color:inherit;
  background:var(--dsw-alias-bg-module-platform,transparent);
  border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.24));outline:none}
.dshsl-input:focus{border-color:var(--dsw-alias-state-business-primary,#3b82f6)}
.dshsl-input::placeholder{color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dshsl-select{font:inherit;font-size:13px;padding:8px 10px;border-radius:10px;color:inherit;cursor:pointer;
  background:var(--dsw-alias-bg-module-platform,transparent);
  border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.24));outline:none}
.dshsl-btn{font:inherit;font-size:13px;display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:10px;cursor:pointer;
  color:inherit;background:var(--dsw-alias-button-tool-bar-fill,transparent);
  border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.24));transition:background .15s,opacity .15s}
.dshsl-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))}
.dshsl-btn:disabled{opacity:.5;cursor:not-allowed}
/* 主按钮 = 宿主的「对比色」按钮：底色取墨色、文字取其前景色，
   亮主题下是深底白字、暗主题下是浅底深字，两侧都够清晰。 */
.dshsl-btn-primary{background:var(--dsw-alias-label-primary,#1b1f24);
  color:var(--dsw-alias-label-primary-foreground,#fff);border-color:transparent;font-weight:500}
.dshsl-btn-primary:hover{background:var(--dsw-alias-label-primary,#1b1f24);opacity:.86}
.dshsl-btn-danger{color:var(--dsw-alias-state-error-primary,#e5484d)}
.dshsl-btn-danger:hover{background:var(--dsw-alias-interactive-bg-hover-danger,rgba(229,72,77,.12))}
.dshsl-btn-icon{padding:6px;border-radius:9px}
/* 预览按钮的「已展开」态：品牌蓝描边 + 淡蓝底，一眼看出点中了哪一个。 */
.dshsl-btn-active{border-color:var(--dsw-alias-state-business-primary,#3b82f6);
  color:var(--dsw-alias-state-business-primary,#3b82f6);
  background:rgba(103,158,254,.16);
  background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b82f6) 16%,transparent)}
.dshsl-chips{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dshsl-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;cursor:pointer;font-size:13px;
  border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.24));background:transparent;color:inherit}
.dshsl-chip:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))}
.dshsl-chip-active{background:rgba(103,158,254,.16);
  background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b82f6) 16%,transparent);
  border-color:var(--dsw-alias-state-business-primary,#3b82f6);color:inherit;font-weight:600}
.dshsl-chip-count{font-size:11px;opacity:.7}
.dshsl-list{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none;min-height:0;overflow:auto}
.dshsl-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.2));
  background:var(--dsw-alias-bg-layer-1,transparent)}
.dshsl-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.06))}
.dshsl-row:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#3b82f6);outline-offset:2px}
.dshsl-row-busy{cursor:progress}
.dshsl-row-on{border-color:rgba(103,158,254,.55);
  border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b82f6) 55%,transparent);
  background:rgba(103,158,254,.09);
  background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b82f6) 9%,transparent)}
.dshsl-check{flex:none;width:15px;height:15px;cursor:pointer;accent-color:var(--dsw-alias-state-business-primary,#3b82f6)}
.dshsl-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:3px}
.dshsl-name{font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshsl-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dshsl-badge{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:6px;font-size:11px;
  border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.2))}
.dshsl-mono{font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);font-size:11px}
.dshsl-actions{display:flex;align-items:center;gap:4px;flex:none}
.dshsl-empty{padding:24px 12px;text-align:center;color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:13px;
  border:1px dashed var(--dsw-alias-border-l2,rgba(127,127,127,.24));border-radius:12px}
.dshsl-preview-item{list-style:none;margin:-4px 0 4px 26px;animation:dshsl-slide-in .16s ease-out}
@keyframes dshsl-slide-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
.dshsl-panel{border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.2));border-radius:12px;overflow:hidden;
  background:var(--dsw-alias-bg-layer-1,transparent)}
.dshsl-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;
  border-bottom:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.2));font-size:13px}
.dshsl-panel-title{display:inline-flex;align-items:center;gap:6px;font-weight:500}
.dshsl-panel-actions{display:flex;align-items:center;gap:8px;min-width:0}
.dshsl-tabs{display:flex;align-items:center;gap:6px;padding:8px 12px 0}
.dshsl-tab{font:inherit;font-size:12px;padding:4px 10px;border-radius:999px;cursor:pointer;color:inherit;
  border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.24));background:transparent}
.dshsl-tab:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))}
.dshsl-tab-active{border-color:var(--dsw-alias-state-business-primary,#3b82f6);font-weight:600;
  background:rgba(103,158,254,.16);
  background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b82f6) 16%,transparent)}
.dshsl-panel-note{padding:8px 12px 0;font-size:12px;color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dshsl-panel-hint{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a8f98);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshsl-pre{margin:0;padding:12px;max-height:320px;overflow:auto;white-space:pre-wrap;word-break:break-word;
  font-family:var(--ds-font-family-code,ui-monospace,Consolas,monospace);font-size:12px;line-height:1.6;
  color:var(--dsw-alias-label-secondary,#c9ccd1)}.dshsl-footer{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dshsl-toast{position:sticky;bottom:0;align-self:flex-end;padding:7px 12px;border-radius:10px;font-size:12px;
  background:var(--dsw-alias-toast-bg,rgba(40,44,52,.94));color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.2)}
.dshsl-error{color:var(--dsw-alias-state-error-primary,#e5484d);font-size:13px;display:flex;align-items:center;gap:8px}
.dshsl-create{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
`

    function injectStylesheet() {
      if (typeof document === 'undefined') return
      if (document.querySelector(`style[data-plugin-css="${CSS_TAG_ID}"]`)) return
      const style = document.createElement('style')
      style.dataset.pluginCss = CSS_TAG_ID
      style.textContent = CSS
      document.head.appendChild(style)
    }

    //#endregion
    //#region HTTP
    async function request(path, init) {
      const response = await fetch(`${API}${path}`, {
        headers: { 'content-type': 'application/json' },
        ...init
      })
      let payload
      try {
        payload = await response.json()
      } catch {
        throw new Error(`HTTP ${response.status}`)
      }
      if (!payload || payload.ok !== true) {
        throw new Error((payload && payload.error) || `HTTP ${response.status}`)
      }
      return payload
    }

    function formatBytes(value) {
      if (!Number.isFinite(value) || value <= 0) return '—'
      if (value < 1024) return `${value} B`
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
      return `${(value / 1024 / 1024).toFixed(1)} MB`
    }

    function groupIdOf(name) {
      const base = String(name || '').trim().replace(/[\\/:*?"<>|\s]+/g, '-')
      return (base.length > 0 ? base : 'default').slice(0, 48)
    }

    //#endregion
    //#region 页面
    function SessionLinkSection(props) {
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState(null)
      const [groups, setGroups] = useState([])
      const [sessions, setSessions] = useState([])
      const [activeGroupId, setActiveGroupId] = useState(null)
      const [query, setQuery] = useState('')
      const [sort, setSort] = useState('recent')
      const [previewId, setPreviewId] = useState(null)
      const [previewMode, setPreviewMode] = useState('receive')
      const [previewText, setPreviewText] = useState('')
      const [previewLoading, setPreviewLoading] = useState(false)
      /** 展开中的预览面板节点（用于 scrollIntoView）与当前展开的会话/视角（回调里读最新值）。 */
      const previewRef = useRef(null)
      const previewIdRef = useRef(null)
      const previewModeRef = useRef(null)
      const [busy, setBusy] = useState(false)
      const [toast, setToast] = useState(null)
      const [creating, setCreating] = useState(false)
      const [newGroupName, setNewGroupName] = useState('')
      const [confirmDelete, setConfirmDelete] = useState(false)
      const toastTimer = useRef(0)

      const showToast = useCallback((message) => {
        setToast(message)
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(null), 2400)
      }, [])

      useEffect(() => () => {
        if (toastTimer.current) clearTimeout(toastTimer.current)
      }, [])

      const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
          const data = await request('/state')
          setGroups(Array.isArray(data.groups) ? data.groups : [])
          setSessions(Array.isArray(data.sessions) ? data.sessions : [])
          setActiveGroupId((current) => {
            const list = Array.isArray(data.groups) ? data.groups : []
            if (current !== null && list.some((group) => group.id === current)) return current
            return list.length > 0 ? list[0].id : null
          })
        } catch (cause) {
          setError(String(cause.message || cause))
        } finally {
          setLoading(false)
        }
      }, [])

      useEffect(() => {
        load()
      }, [load])

      const activeGroup = useMemo(
        () => groups.find((group) => group.id === activeGroupId) || null,
        [groups, activeGroupId]
      )

      const visible = useMemo(() => {
        const needle = query.trim().toLowerCase()
        let rows = sessions
        if (needle.length > 0) {
          rows = rows.filter((session) =>
            String(session.title || '').toLowerCase().includes(needle)
            || String(session.sessionId || '').toLowerCase().includes(needle)
            || String(session.cwd || '').toLowerCase().includes(needle))
        }
        const sorted = [...rows]
        if (sort === 'recent') sorted.sort((a, b) => b.createdAt - a.createdAt)
        else if (sort === 'oldest') sorted.sort((a, b) => a.createdAt - b.createdAt)
        else if (sort === 'title') sorted.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
        else if (sort === 'size') sorted.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0))
        return sorted
      }, [sessions, query, sort])

      const persist = useCallback(async (nextGroups) => {
        setBusy(true)
        try {
          const data = await request('/state', { method: 'POST', body: JSON.stringify({ groups: nextGroups }) })
          setGroups(Array.isArray(data.groups) ? data.groups : nextGroups)
          showToast(t('saved'))
          return true
        } catch (cause) {
          showToast(`${t('saveFailed')}: ${cause.message || cause}`)
          await load()
          return false
        } finally {
          setBusy(false)
        }
      }, [load, showToast])

      const toggleMember = useCallback(async (sessionId) => {
        if (activeGroup === null) {
          showToast(t('missingGroup'))
          return
        }
        const has = activeGroup.sessions.includes(sessionId)
        const nextGroups = groups.map((group) => {
          if (group.id !== activeGroup.id) return group
          return {
            ...group,
            sessions: has
              ? group.sessions.filter((id) => id !== sessionId)
              : [...group.sessions, sessionId]
          }
        })
        setGroups(nextGroups)
        await persist(nextGroups)
      }, [activeGroup, groups, persist, showToast])

      const createGroup = useCallback(async () => {
        const name = newGroupName.trim()
        if (name.length === 0) return
        const id = groupIdOf(name)
        if (groups.some((group) => group.id === id)) {
          setActiveGroupId(id)
          setCreating(false)
          setNewGroupName('')
          showToast(t('groupCreated'))
          return
        }
        const nextGroups = [...groups, { id, name, note: '', sessions: [], createdAt: Date.now() }]
        setActiveGroupId(id)
        setCreating(false)
        setNewGroupName('')
        const saved = await persist(nextGroups)
        if (saved) showToast(t('groupCreated'))
      }, [groups, newGroupName, persist, showToast])

      const removeGroup = useCallback(async () => {
        if (activeGroup === null) return
        if (!confirmDelete) {
          setConfirmDelete(true)
          return
        }
        const nextGroups = groups.filter((group) => group.id !== activeGroup.id)
        setConfirmDelete(false)
        setActiveGroupId(nextGroups.length > 0 ? nextGroups[0].id : null)
        const saved = await persist(nextGroups)
        if (saved) showToast(t('groupDeleted'))
      }, [activeGroup, confirmDelete, groups, persist, showToast])

      useEffect(() => {
        setConfirmDelete(false)
      }, [activeGroupId])

      /** 拉一次预览文本：优先 /preview（两种视角），旧宿主回退到 /memory（只有 receive）。 */
      const fetchPreview = useCallback(async (sessionId, mode) => {
        const id = encodeURIComponent(sessionId)
        try {
          const response = await fetch(`${API}/preview?sessionId=${id}&mode=${mode}`)
          if (response.status === 404) {
            const legacy = await fetch(`${API}/memory?sessionId=${id}`)
            const legacyData = await legacy.json()
            return legacyData && legacyData.ok === true
              ? (legacyData.text || t('previewEmpty'))
              : `${t('loadFailed')}: ${(legacyData && legacyData.error) || legacy.status}`
          }
          const data = await response.json()
          if (!data || data.ok !== true) return `${t('loadFailed')}: ${(data && data.error) || response.status}`
          return data.text || t('previewEmpty')
        } catch (cause) {
          return `${t('loadFailed')}: ${cause.message || cause}`
        }
      }, [])

      const loadPreview = useCallback(async (sessionId, mode) => {
        previewIdRef.current = sessionId
        previewModeRef.current = mode
        setPreviewId(sessionId)
        setPreviewMode(mode)
        setPreviewLoading(true)
        setPreviewText('')
        const text = await fetchPreview(sessionId, mode)
        setPreviewLoading(false)
        setPreviewText(text)
      }, [fetchPreview])

      /**
       * 👁 的行为：未链接的会话默认看「它会提供的内容」（这样未链接也能单独预览）；
       * 已链接的默认看「它收到的记忆」；再点一次同一个会话则收起。
       */
      const togglePreview = useCallback((sessionId, linked) => {
        if (previewIdRef.current === sessionId) {
          previewIdRef.current = null
          previewModeRef.current = null
          setPreviewId(null)
          setPreviewText('')
          return
        }
        loadPreview(sessionId, linked ? 'receive' : 'contribute')
      }, [loadPreview])

      const switchPreviewMode = useCallback((mode) => {
        const id = previewIdRef.current
        if (typeof id !== 'string' || id.length === 0) return
        if (previewModeRef.current === mode) return
        loadPreview(id, mode)
      }, [loadPreview])

      const closePreview = useCallback(() => {
        previewIdRef.current = null
        previewModeRef.current = null
        setPreviewId(null)
        setPreviewText('')
      }, [])

      // 预览展开后把它滚进视野（设置面板自身可滚动，不滚就等于「点了没反应」）
      useEffect(() => {
        if (previewId === null) return
        const node = previewRef.current
        if (node === null || node === undefined) return
        if (typeof node.scrollIntoView === 'function') {
          node.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
      }, [previewId, previewMode, previewLoading, previewText])

      const header = h('div', { className: 'dshsl-head' },
        h('div', { className: 'dshsl-title-row' },
          h('span', { className: 'dshsl-title-icon' }, h(LinkIcon, { width: 20, height: 20 })),
          h('h2', { className: 'dshsl-title' }, t('title'))
        ),
        h('p', { className: 'dshsl-sub' }, t('subtitle', sessions.length, groups.length))
      )

      const toolbar = h('div', { className: 'dshsl-toolbar' },
        h('div', { className: 'dshsl-search' },
          h('span', { className: 'dshsl-search-icon' }, h(SearchIcon, { width: 15, height: 15 })),
          h('input', {
            className: 'dshsl-input',
            type: 'text',
            value: query,
            placeholder: t('searchPlaceholder'),
            onChange: (event) => setQuery(event.target.value)
          })
        ),
        h('select', {
          className: 'dshsl-select',
          value: sort,
          onChange: (event) => setSort(event.target.value)
        },
          h('option', { value: 'recent' }, t('sortRecent')),
          h('option', { value: 'oldest' }, t('sortOldest')),
          h('option', { value: 'title' }, t('sortTitle')),
          h('option', { value: 'size' }, t('sortSize'))
        ),
        creating
          ? h('div', { className: 'dshsl-create' },
              h('input', {
                className: 'dshsl-input',
                style: { paddingLeft: '10px', flex: '1 1 180px' },
                type: 'text',
                autoFocus: true,
                value: newGroupName,
                placeholder: t('newGroupPlaceholder'),
                onChange: (event) => setNewGroupName(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') createGroup()
                  if (event.key === 'Escape') { setCreating(false); setNewGroupName('') }
                }
              }),
              h('button', { className: 'dshsl-btn dshsl-btn-primary', onClick: createGroup, disabled: busy }, t('create')),
              h('button', { className: 'dshsl-btn', onClick: () => { setCreating(false); setNewGroupName('') } }, t('cancel'))
            )
          : h('button', { className: 'dshsl-btn dshsl-btn-primary', onClick: () => setCreating(true) },
              h(PlusIcon, { width: 15, height: 15 }), t('newGroup')
            ),
        h('button', {
          className: `dshsl-btn ${confirmDelete ? 'dshsl-btn-danger' : ''}`,
          onClick: removeGroup,
          disabled: busy || activeGroup === null
        },
          h(TrashIcon, { width: 15, height: 15 }),
          confirmDelete ? t('confirmDelete') : t('deleteGroup')
        )
      )

      const chips = groups.length === 0
        ? null
        : h('div', { className: 'dshsl-chips' },
            groups.map((group) =>
              h('button', {
                key: group.id,
                className: `dshsl-chip ${group.id === activeGroupId ? 'dshsl-chip-active' : ''}`,
                onClick: () => setActiveGroupId(group.id)
              },
                h(LinkIcon, { width: 13, height: 13 }),
                h('span', null, group.name),
                h('span', { className: 'dshsl-chip-count' }, String(group.sessions.length))
              )
            )
          )

      const rows = []
      for (const session of visible) {
        const linked = activeGroup !== null && activeGroup.sessions.includes(session.sessionId)
        const canToggle = !busy && activeGroup !== null
        const toggle = () => {
          if (!canToggle) return
          toggleMember(session.sessionId)
        }
        const open = previewId === session.sessionId
        rows.push(h('li', {
          key: session.sessionId,
          className: `dshsl-row ${linked ? 'dshsl-row-on' : ''} ${open ? 'dshsl-row-previewing' : ''} ${busy ? 'dshsl-row-busy' : ''}`,
          role: 'button',
          tabIndex: 0,
          'aria-pressed': linked,
          'aria-label': `${session.title || session.sessionId} — ${linked ? t('unlink') : t('link')}`,
          // 整行可点：点标题、点空白处都等于勾选/取消勾选。
          onClick: toggle,
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
              event.preventDefault()
              toggle()
            }
          }
        },
          h('input', {
            className: 'dshsl-check',
            type: 'checkbox',
            checked: linked,
            disabled: !canToggle,
            // 勾选框自己已经触发一次 toggleMember，阻止冒泡避免行点击再翻一次。
            onClick: (event) => event.stopPropagation(),
            onChange: (event) => {
              event.stopPropagation()
              toggle()
            }
          }),
          h('div', { className: 'dshsl-main' },
            h('div', { className: 'dshsl-name', title: session.title || session.sessionId },
              session.title || session.sessionId),
            h('div', { className: 'dshsl-meta' },
              h('span', null, session.createdAtText || '—'),
              h('span', { className: 'dshsl-badge' },
                h(DiskIcon, { width: 11, height: 11 }),
                formatBytes(session.sizeBytes)
              ),
              session.cwd ? h('span', { className: 'dshsl-mono', title: session.cwd }, session.cwd) : null,
              h('span', { className: 'dshsl-mono' }, session.sessionId)
            )
          ),
          // 操作区整体阻止冒泡：点图标按钮只执行按钮行为，不会顺带翻勾选。
          h('div', {
            className: 'dshsl-actions',
            onClick: (event) => event.stopPropagation(),
            onKeyDown: (event) => event.stopPropagation()
          },
            h('button', {
              className: `dshsl-btn dshsl-btn-icon ${open ? 'dshsl-btn-active' : ''}`,
              title: open ? t('previewClose') : (linked ? t('previewReceive') : t('previewContribute')),
              'aria-label': open ? t('previewClose') : t('preview'),
              'aria-expanded': open,
              onClick: () => togglePreview(session.sessionId, linked)
            }, h(EyeIcon, { width: 15, height: 15 })),
            h('button', {
              className: 'dshsl-btn dshsl-btn-icon',
              title: linked ? t('unlink') : t('link'),
              'aria-label': linked ? t('unlink') : t('link'),
              disabled: !canToggle,
              onClick: toggle
            }, linked ? h(MinusIcon, { width: 15, height: 15 }) : h(PlusIcon, { width: 15, height: 15 }))
          )
        ))

        // 就地展开的预览：紧贴被点的会话下面，不用去底部找。
        if (open) {
          rows.push(h('li', {
            key: `${session.sessionId}__preview`,
            className: 'dshsl-preview-item',
            ref: (node) => { previewRef.current = node || null }
          },
            h('div', {
              className: 'dshsl-panel dshsl-panel-inline',
              onClick: (event) => event.stopPropagation()
            },
              h('div', { className: 'dshsl-panel-head' },
                h('span', { className: 'dshsl-panel-title' },
                  h(EyeIcon, { width: 13, height: 13 }),
                  t('previewTitle')
                ),
                h('div', { className: 'dshsl-panel-actions' },
                  h('span', { className: 'dshsl-panel-hint', title: session.title || session.sessionId },
                    session.title || session.sessionId),
                  h('button', {
                    className: 'dshsl-btn dshsl-btn-icon',
                    title: t('previewClose'),
                    'aria-label': t('previewClose'),
                    onClick: (event) => {
                      event.stopPropagation()
                      closePreview()
                    }
                  }, h(CloseIcon, { width: 14, height: 14 }))
                )
              ),
              // 两个视角：它收到的 / 它会提供的。未链接会话也能看后者。
              h('div', { className: 'dshsl-tabs' },
                h('button', {
                  className: `dshsl-tab ${previewMode === 'receive' ? 'dshsl-tab-active' : ''}`,
                  'aria-pressed': previewMode === 'receive',
                  onClick: (event) => {
                    event.stopPropagation()
                    switchPreviewMode('receive')
                  }
                }, t('previewReceive')),
                h('button', {
                  className: `dshsl-tab ${previewMode === 'contribute' ? 'dshsl-tab-active' : ''}`,
                  'aria-pressed': previewMode === 'contribute',
                  onClick: (event) => {
                    event.stopPropagation()
                    switchPreviewMode('contribute')
                  }
                }, t('previewContribute'))
              ),
              !linked ? h('div', { className: 'dshsl-panel-note' }, t('previewUnlinkedHint')) : null,
              h('pre', { className: 'dshsl-pre' },
                previewLoading
                  ? t('loading')
                  : (previewText || t('previewEmpty')))
            )
          ))
        }
      }

      const list = visible.length === 0
        ? h('div', { className: 'dshsl-empty' }, groups.length === 0 ? t('noGroups') : t('noSessions'))
        : h('ul', { className: 'dshsl-list' }, rows)

      if (loading) {
        return h('div', { className: 'dshsl-root' }, header, h('div', { className: 'dshsl-empty' }, t('loading')))
      }
      if (error !== null) {
        return h('div', { className: 'dshsl-root' },
          header,
          h('div', { className: 'dshsl-error' },
            `${t('loadFailed')}：${error}`,
            h('button', { className: 'dshsl-btn', onClick: load }, t('retry'))
          )
        )
      }

      return h('div', { className: 'dshsl-root' },
        header,
        toolbar,
        chips,
        activeGroup !== null && activeGroup.sessions.length === 0
          ? h('div', { className: 'dshsl-footer' }, t('emptyGroup'))
          : null,
        list,
        h('div', { className: 'dshsl-footer' }, t('hint')),
        toast !== null ? h('div', { className: 'dshsl-toast' }, toast) : null
      )
    }

    //#endregion
    //#region 导航图标同步
    /**
     * 设置的导航图标由 shell 按 section id 硬映射（models / agent-presets /
     * plugins，其余一律齿轮）。自注册的 section 只能用 DOM 替换拿到自己的图标：
     * 找到文字等于本 section label 的叶子节点，爬到按钮，替换其中的 <svg>。
     * 幂等：已经注入过的节点打标记，重复调用无副作用。
     */
    function injectNavIcon() {
      if (typeof document === 'undefined') return
      const label = t('nav')
      const candidates = [...document.querySelectorAll('span,div,p')].filter(
        (el) => el.children.length === 0 && (el.textContent || '').trim() === label
      )
      for (const textEl of candidates) {
        const item = textEl.closest('button') || textEl.closest('[role="tab"]')
          || textEl.closest('[role="button"]') || textEl.closest('li')
        if (item === null) continue
        const svg = item.querySelector('svg')
        if (svg === null) continue
        if (svg.dataset.dshSlIcon === 'link') continue
        const replacement = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        replacement.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
        replacement.setAttribute('width', '16')
        replacement.setAttribute('height', '16')
        replacement.setAttribute('viewBox', '0 0 24 24')
        replacement.setAttribute('fill', 'none')
        replacement.setAttribute('stroke', 'currentColor')
        replacement.setAttribute('stroke-width', '2')
        replacement.setAttribute('stroke-linecap', 'round')
        replacement.setAttribute('stroke-linejoin', 'round')
        replacement.setAttribute('aria-hidden', 'true')
        replacement.dataset.dshSlIcon = 'link'
        const existingClass = svg.getAttribute('class')
        if (existingClass) replacement.setAttribute('class', existingClass)
        for (const d of [
          'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
          'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'
        ]) {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          path.setAttribute('d', d)
          replacement.appendChild(path)
        }
        svg.replaceWith(replacement)
      }
    }

    /** 持续观察 DOM：设置面板每次打开都是新渲染，图标要跟着补。 */
    function startNavIconSync() {
      if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
      let raf = 0
      const schedule = () => {
        if (raf) return
        raf = requestAnimationFrame(() => {
          raf = 0
          try {
            injectNavIcon()
          } catch (error) {
            console.error('[session-link] 导航图标替换失败', error)
          }
        })
      }
      const observer = new MutationObserver(schedule)
      observer.observe(document.documentElement || document, { childList: true, subtree: true })
      schedule()
      return () => {
        observer.disconnect()
        if (raf) cancelAnimationFrame(raf)
      }
    }

    //#endregion
    //#region apply
    function apply(ctx) {
      injectStylesheet()

      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: NAV_LABEL_ID,
            order: NAV_ORDER,
            label: () => t('nav')
          },
          (props) => h(SessionLinkSection, { ...props, ctx })
        )
      )

      ctx.effect(() => startNavIconSync())
    }

    exports.apply = apply
    exports.inject = ['slots']

    return module.exports
  }
})
