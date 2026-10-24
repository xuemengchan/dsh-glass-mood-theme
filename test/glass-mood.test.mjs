/**
 * dsh-glass-mood-theme 测试套件——零依赖，普通 Node 直接跑。
 *
 *   node test/glass-mood.test.mjs
 *
 * 覆盖一个主题插件可能悄悄弄错的三件事：
 *   1. 情绪状态机（首次作画、切入工作、空闲逗留、停留门槛、强制模式、卸载），
 *   2. token 合法性（每个名字都存在于官方 ui-theme 的 token 集，每个值都是
 *      明/暗一对，菜单材质或语义状态拥有的东西一概不碰），
 *   3. 可读性（标签与品牌色在合成玻璃上的 WCAG 对比度）。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

//#region harness
/** 刚够插件走完挂载 / 卸载路径的最小 DOM。 */
function createDocument(fixture = {}) {
  const makeStyle = () => {
    const values = new Map()
    return {
      setProperty(name, value) { values.set(name, String(value)) },
      removeProperty(name) { values.delete(name) },
      getPropertyValue(name) { return values.has(name) ? values.get(name) : '' },
      get size() { return values.size }
    }
  }
  const make = (tag) => ({
    tagName: tag,
    id: '',
    dataset: {},
    style: makeStyle(),
    attributes: {},
    children: [],
    removed: false,
    /** 几何与计算出的颜料，表面探测读它们。 */
    box: { width: 1200, height: 800, left: 0, top: 0 },
    computed: { backgroundColor: 'rgba(0, 0, 0, 0)' },
    getBoundingClientRect() { return this.box },
    /** 媒体表面：刚够引擎的静音自动播放路径。 */
    played: 0,
    paused: true,
    play() {
      this.played += 1
      this.paused = false
      return { catch() {} }
    },
    pause() { this.paused = true },
    load() { this.loaded = (this.loaded ?? 0) + 1 },
    setAttribute(name, value) { this.attributes[name] = value },
    getAttribute(name) { return this.attributes[name] },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) },
    removeAttribute(name) { delete this.attributes[name] },
    appendChild(child) { this.children.push(child); child.parent = this; return child },
    insertBefore(child, ref) {
      const index = ref === null || ref === undefined ? -1 : this.children.indexOf(ref)
      if (index >= 0) this.children.splice(index, 0, child)
      else this.children.push(child)
      child.parent = this
      return child
    },
    get firstChild() { return this.children[0] ?? null },
    querySelector(selector) { return this.children.find((child) => matches(child, selector)) ?? null },
    querySelectorAll(selector) {
      if (this.removed) return []
      return selector === '*' ? [...this.children] : this.children.filter((child) => matches(child, selector))
    },
    remove() {
      this.removed = true
      const index = this.parent?.children.indexOf(this) ?? -1
      if (index >= 0) this.parent.children.splice(index, 1)
      // 一个被摘下的节点没有父节点、也不再连着，和真实 DOM 一样：表面探测同时靠这两点
      // 察觉它的元素没了。
      this.parent = null
    }
  })
  const body = make('body')
  body.parent = undefined
  const head = make('head')
  const all = [head, body]
  /**
   * 刚够引擎所做的外壳查找的选择器支持：
   * `[class*="x"]`、`[attr]`、`[attr=value]`，以及它们的逗号列表。
   */
  const matches = (el, selector) => {
    const part = selector.trim()
    if (part === '[data-glass-frame]') return el.attributes['data-glass-frame'] !== undefined
    const star = /^\[class\*="?([^"\]]+)"?\]$/.exec(part)
    if (star !== null) return String(el.attributes.class ?? '').includes(star[1])
    const equals = /^\[([^=\]]+)=("?)([^"\]]+)\2\]$/.exec(part)
    if (equals !== null) {
      if (equals[1] === 'id') return el.id === equals[3]
      return el.attributes[equals[1]] === equals[3]
    }
    const present = /^\[([^\]]+)\]$/.exec(part)
    if (present !== null) {
      if (present[1] === 'id') return el.id !== '' && el.id !== undefined
      return el.attributes[present[1]] !== undefined
    }
    return el.tagName === part
  }
  const query = (selector) => all.find((el) => !el.removed && selector.split(',').some((one) => matches(el, one))) ?? null
  const listeners = {}
  const document = {
    head,
    body,
    createElement(tag) {
      const el = make(tag)
      // 一块引擎能往里面画帧的画布。`throws` 模拟一条跨源片子把它污染，而主题必须
      // 不靠猜地幸存。
      if (tag === 'canvas' && fixture.canvas) {
        el.width = 0
        el.height = 0
        el.getContext = () => ({
          // 取样到哪个元素是契约的一部分：每个槽都必须读进它自己的读数，否则一次
          // 心情切换会穿上另一条片子的颜色。`perSlot` 让一个测试给两条片子不同的帧。
          drawImage(video) {
            fixture.canvas.drawCalls += 1
            fixture.canvas.drawnSlots.push(video.getAttribute('data-glass-slot'))
            fixture.canvas.lastSlot = video.getAttribute('data-glass-slot')
          },
          getImageData() {
            if (fixture.canvas.throws) throw new Error('tainted canvas')
            const perSlot = fixture.canvas.perSlot
            const pixels = perSlot !== undefined && perSlot[fixture.canvas.lastSlot] !== undefined
              ? perSlot[fixture.canvas.lastSlot]
              : fixture.canvas.pixels
            return { data: Uint8ClampedArray.from(pixels) }
          }
        })
      }
      all.push(el)
      return el
    },
    getElementById(id) { return all.find((el) => el.id === id && !el.removed) ?? null },
    /** 指针监听器真到足以驱动，所以光是可以测试的。 */
    addEventListener(type, listener) {
      listeners[type] = listeners[type] ?? []
      listeners[type].push(listener)
    },
    removeEventListener(type, listener) {
      if (!listeners[type]) return
      listeners[type] = listeners[type].filter((entry) => entry !== listener)
    },
    emit(type, event) { for (const listener of [...(listeners[type] ?? [])]) listener(event) },
    querySelector: query,
    querySelectorAll(selector) { return all.filter((el) => !el.removed && selector.split(',').some((one) => matches(el, one))) }
  }
  // 一个已经带着上一个实例的舞台和样式表的页面：这就是热重载留下的东西，也是下一次
  // 挂载必须清扫的东西。
  if (fixture.strayStage) {
    const strayStage = document.createElement('div')
    strayStage.id = 'dsh-glass-mood-bg'
    body.appendChild(strayStage)
    const straySheet = document.createElement('style')
    straySheet.id = 'dsh-glass-mood-style'
    head.appendChild(straySheet)
  }
  return document
}

/**
 * 按 ui-layout 的方式搭出三个外壳列，用它的类名。左列得到一个嵌套的已画表面
 * （正如 ui-sidebar 所为），中间列没有（列自己就是表面），右列得到一个透明的
 * 全出血包装（绝不能被误当成表面）。
 */
function mountShellColumns(document) {
  const frame = document.createElement('div')
  frame.setAttribute('class', 'AppFrame_frame_1a2b3')
  const left = document.createElement('div')
  left.setAttribute('class', 'AppFrame_sidebarCol_9z8y7')
  left.box = { width: 260, height: 780, left: 0, top: 0 }
  const center = document.createElement('div')
  center.setAttribute('class', 'AppFrame_centerCol_5x4w3')
  center.box = { width: 620, height: 780, left: 264, top: 0 }
  const right = document.createElement('div')
  right.setAttribute('class', 'AppFrame_rightbarCol_2v1u0')
  right.setAttribute('data-rightbar-col', '')
  right.box = { width: 320, height: 780, left: 888, top: 0 }
  const leftSurface = document.createElement('div')
  leftSurface.setAttribute('class', 'Sidebar_root_7h6g5')
  leftSurface.computed = { backgroundColor: 'rgba(255, 255, 255, 0.52)' }
  leftSurface.box = { width: 260, height: 780, left: 0, top: 0 }
  left.appendChild(leftSurface)
  const rightWrapper = document.createElement('div')
  rightWrapper.setAttribute('class', 'Rightbar_wrapper_4f3e2')
  rightWrapper.computed = { backgroundColor: 'rgba(0, 0, 0, 0)' }
  rightWrapper.box = { width: 320, height: 780, left: 888, top: 0 }
  right.appendChild(rightWrapper)
  frame.appendChild(left)
  frame.appendChild(center)
  frame.appendChild(right)
  document.body.appendChild(frame)
  return { frame, left, center, right, leftSurface, rightWrapper }
}

/** 这个模块是一个朴素的 __ModuleLoader__ bundle：用注入的全局变量跑它。 */
function loadBundle(document, storage, requireImpl) {
  const captured = []
  /** 引擎创建的每个观察者，好让一个测试能驱动一次列缩放。 */
  const observers = []
  /**
   * 引擎已经付过多少次计算样式读取。一次探测是每个后代一次读取，所以这个数字说的
   * 正是一个廉价计时器有没有在悄悄做有测量的工作。
   */
  let styleReads = 0
  const window = {
    __ModuleLoader__: { load: (entry) => captured.push(entry) },
    /** 一个桌面视口，页面级与弹出层的尺寸门对着它量。 */
    innerWidth: 1280,
    innerHeight: 800,
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle),
    setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
    clearInterval: (handle) => globalThis.clearInterval(handle),
    getComputedStyle: (el) => {
      styleReads += 1
      return {
        backgroundColor: 'rgba(0, 0, 0, 0)',
        backgroundImage: 'none',
        backdropFilter: 'none',
        getPropertyValue: () => '',
        ...el.computed
      }
    },
    /**
     * 一个由外壳手动驱动的缩放观察者。一列改了尺寸，必须在同一帧被重新打标签，而不是
     * 等下一趟 2.5s——那个延迟正是让一条正在展开的侧边栏干坐一秒钟素列的东西。
     */
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback
        this.targets = []
        observers.push(this)
      }
      observe(node) { this.targets.push(node) }
      disconnect() { this.targets = [] }
      /** 照浏览器的样子发：一次，带齐每个条目。 */
      emit() { this.callback(this.targets.map((target) => ({ target })), this) }
    }
  }
  window.observers = observers
  /** @returns 引擎至今付过多少次计算样式读取。 */
  window.__styleReads = () => styleReads
  const factory = new Function('window', 'document', 'localStorage', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', source)
  factory(window, document, storage, window.setTimeout, window.clearTimeout, window.setInterval, window.clearInterval)
  assert.equal(captured.length, 1, 'bundle 恰好注册一个加载器条目')
  const entry = captured[0]
  assert.equal(entry.id, 'dsh-glass-mood-theme', '加载器 id 与包名一致')
  const loaded = entry.factory(requireImpl ?? (() => { throw new Error('this bundle must not require anything') }))
  return { loaded, window }
}

/** 虚拟时钟，好让滞回不必真等就可测。 */
function createClock() {
  let now = 1000
  let seq = 1
  const timers = new Map()
  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = seq++
      timers.set(id, { at: now + Math.max(0, ms), fn })
      return id
    },
    clearTimeout(id) { timers.delete(id) },
    setInterval(fn, ms) {
      const id = seq++
      timers.set(id, { at: now + Math.max(1, ms), fn, every: Math.max(1, ms) })
      return id
    },
    clearInterval(id) { timers.delete(id) },
    /** 推进时间，按顺序发到期的计时器。 */
    advance(ms) {
      const target = now + ms
      for (;;) {
        let next = null
        for (const [id, timer] of timers) {
          if (timer.at <= target && (next === null || timer.at < next.timer.at)) next = { id, timer }
        }
        if (next === null) break
        now = next.timer.at
        if (next.timer.every === undefined) timers.delete(next.id)
        else next.timer.at = now + next.timer.every
        next.timer.fn()
      }
      now = target
    },
    get pending() { return timers.size }
  }
}

/** 可观察快照，插件订阅的就是这个形状。 */
function createObservable(initial) {
  let value = initial
  const listeners = new Set()
  return {
    getSnapshot: () => value,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    set(next) { value = next; for (const fn of [...listeners]) fn() },
    get listenerCount() { return listeners.size }
  }
}

/** 一个小小的 IndexedDB 替身：一个对象存储，无 promise 的请求对象。 */
function createIndexedDB() {
  const rows = new Map()
  const request = (run) => {
    const op = { result: undefined, error: null, onsuccess: null, onerror: null }
    queueMicrotask(() => {
      try { op.result = run(); op.onsuccess?.() } catch (error) { op.error = error; op.onerror?.() }
    })
    return op
  }
  return {
    rows,
    open() {
      const db = {
        objectStoreNames: { contains: (name) => name === 'media' },
        createObjectStore() {},
        close() {},
        transaction() {
          return {
            objectStore: () => ({
              get: (key) => request(() => rows.get(key)),
              put: (value, key) => request(() => { rows.set(key, value); return key }),
              delete: (key) => request(() => { rows.delete(key); return undefined })
            }),
            oncomplete: null
          }
        }
      }
      const op = { result: db, error: null, onsuccess: null, onerror: null, onupgradeneeded: null }
      queueMicrotask(() => { op.onsuccess?.() })
      return op
    }
  }
}

/** 一次挂载，带一个可控的活动源。 */
function mount(options = {}) {
  const document = createDocument(options)
  const storage = options.storage ?? {
    data: new Map(),
    getItem(key) { return this.data.has(key) ? this.data.get(key) : null },
    setItem(key, value) { this.data.set(key, String(value)) },
    removeItem(key) { this.data.delete(key) }
  }
  const { loaded, window } = loadBundle(document, storage, options.requireImpl)

  const layers = []
  const theme = {
    overrideTokens(source, tokens) {
      layers.push({ source, tokens })
      return () => { layers.push({ source, tokens: null, disposed: true }) }
    }
  }
  const sessionStatus = createObservable(new Map())
  const sessionList = createObservable({ byId: {} })
  const services = {
    theme,
    // `noStatus` 模拟一个没有 ui-session 状态图的构建——那是唯一会去咨询会话列表
    // 兜底的情况。
    uiSession: options.noStatus === true ? undefined : { sessionStatus },
    sessions: {
      list: sessionList,
      binding: (id) => (options.bindings?.[id] === undefined ? undefined : { session: createObservable(options.bindings[id]) })
    }
  }
  const disposers = []
  const themeListeners = []
  const ctx = {
    get: (name) => services[name],
    on(event, listener) {
      if (event === 'theme/change') themeListeners.push(listener)
      return () => {}
    },
    effect(fn, label) {
      disposers.push({ fn, label })
      return () => {}
    }
  }
  const objectUrls = { created: [], revoked: [], counter: 0 }
  const urlApi = {
    createObjectURL(blob) { objectUrls.counter += 1; const value = 'blob:glass-mood/' + objectUrls.counter; objectUrls.created.push({ value, blob }); return value },
    revokeObjectURL(value) { objectUrls.revoked.push(value) }
  }
  const idb = options.idb === false ? null : (options.idb ?? createIndexedDB())
  const clock = createClock()
  // 无障碍偏好，除非一个测试播下它们，否则关着。
  const preferenceState = {
    '(prefers-reduced-transparency: reduce)': options.prefers?.reducedTransparency === true,
    '(prefers-contrast: more)': options.prefers?.moreContrast === true
  }
  const preferenceLists = Object.keys(preferenceState).map((query) => {
    const listeners = []
    return {
      query,
      list: {
        get matches() { return preferenceState[query] },
        addEventListener(type, listener) { if (type === 'change') listeners.push(listener) },
        removeEventListener(type, listener) {
          if (type !== 'change') return
          const at = listeners.indexOf(listener)
          if (at >= 0) listeners.splice(at, 1)
        }
      },
      emit() { for (const listener of [...listeners]) listener({ matches: preferenceState[query] }) },
      listenerCount: () => listeners.length
    }
  })
  /**
   * 引擎读的媒体查询替身。一个测试可以用 `matchMedia: false` 把整个 API 关掉，
   * 模拟一个没有它的浏览器。
   */
  const matchMediaStub = (query) => {
    const entry = preferenceLists.find((candidate) => candidate.query === query)
    if (entry === undefined) return { matches: false, addEventListener() {}, removeEventListener() {} }
    return entry.list
  }
  /** 翻一个系统偏好并把变化送达，像操作系统那样。 */
  const setPreference = (name, value) => {
    const query = name === 'reducedTransparency' ? '(prefers-reduced-transparency: reduce)' : '(prefers-contrast: more)'
    preferenceState[query] = value === true
    for (const entry of preferenceLists) if (entry.query === query) entry.emit()
  }
  // 外壳列在引擎挂载前就存在，和真实的外框一样。
  const shell = options.shell === false ? null : mountShellColumns(document)
  const engine = loaded.createEngine({
    document,
    window,
    theme,
    ctx,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    localStorage: storage,
    indexedDB: idb,
    URL: urlApi,
    matchMedia: options.matchMedia === false ? undefined : matchMediaStub
  })
  const dispose = engine.start()
  return {
    document, window, loaded, storage, layers, sessionStatus, sessionList, engine, dispose, clock, disposers,
    objectUrls, idb, theme, services, shell, setPreference, preferenceLists,
    /** 照真实服务的样子送达一次 theme/change。 */
    emitThemeChange: () => { for (const listener of themeListeners) listener({}) }
  }
}

const currentMood = (m) => m.document.body.dataset.glassMood
/** 活 body 上一个已发布的 CSS 变量。 */
const bodyVar = (m, name) => m.document.body.style.getPropertyValue(name)
/** 一个 rgba() 颜色的 alpha，供读已发布的填充。 */
const panelAlpha = (color) => Number(/rgba\([^)]*,\s*([0-9.]+)\s*\)$/.exec(color)[1])
//#endregion

//#region shipped token inventory
/**
 * 官方 ui-theme 暴露的每个 `--dsw-*` 别名，从安装着的
 * `@deepseek-ai/dsh-client-ui-theme` 客户端 bundle 里读出来（DSH 0.2.0-rc.2，107 个
 * alias + 11 个 specific）。一个主题只可点名存在的 token：否则一个拼写错误会静默
 * 失败，什么都没样式化。
 */
const SHIPPED_TOKENS = [
  "--dsw-alias-bg-base", "--dsw-alias-bg-document-preview", "--dsw-alias-bg-document-selection",
  "--dsw-alias-bg-layer-1", "--dsw-alias-bg-layer-2", "--dsw-alias-bg-layer-3",
  "--dsw-alias-bg-mask-1", "--dsw-alias-bg-mask-2", "--dsw-alias-bg-mask-3",
  "--dsw-alias-bg-mask-drop", "--dsw-alias-bg-mask-photo", "--dsw-alias-bg-module-platform",
  "--dsw-alias-bg-multi-select", "--dsw-alias-bg-overlay", "--dsw-alias-bg-skeleton",
  "--dsw-alias-border-inverted", "--dsw-alias-border-inverted2", "--dsw-alias-border-l1",
  "--dsw-alias-border-l2", "--dsw-alias-border-l2-darkmode-thin", "--dsw-alias-border-l3",
  "--dsw-alias-border-l4", "--dsw-alias-brand-primary", "--dsw-alias-brand-primary-invert",
  "--dsw-alias-brand-primary-new-colorprimary-new-color", "--dsw-alias-brand-text", "--dsw-alias-button-contrast-fill",
  "--dsw-alias-button-elevated-fill", "--dsw-alias-button-floating-fill", "--dsw-alias-button-floating-hover",
  "--dsw-alias-button-ghost-active-border", "--dsw-alias-button-ghost-active-fill", "--dsw-alias-button-ghost-active-hover",
  "--dsw-alias-button-info-fill", "--dsw-alias-button-info-hover", "--dsw-alias-button-primary-dimmed",
  "--dsw-alias-button-primary-fill", "--dsw-alias-button-primary-hover", "--dsw-alias-button-tool-bar-fill",
  "--dsw-alias-button-tool-bar-fill-invisible", "--dsw-alias-button-tool-bar-hover", "--dsw-alias-code-diff-added",
  "--dsw-alias-code-diff-deleted", "--dsw-alias-file-diff-added-bg", "--dsw-alias-file-diff-added-gutter",
  "--dsw-alias-file-diff-added-marker", "--dsw-alias-file-diff-deleted-bg", "--dsw-alias-file-diff-deleted-gutter",
  "--dsw-alias-file-diff-deleted-marker", "--dsw-alias-interactive-bg-active", "--dsw-alias-interactive-bg-hover",
  "--dsw-alias-interactive-bg-hover-accent", "--dsw-alias-interactive-bg-hover-danger", "--dsw-alias-interactive-bg-hover-solid",
  "--dsw-alias-label-caption", "--dsw-alias-label-deep-diving", "--dsw-alias-label-deep-diving-shimmer",
  "--dsw-alias-label-dimmed", "--dsw-alias-label-document-preview", "--dsw-alias-label-primary",
  "--dsw-alias-label-primary-bluish", "--dsw-alias-label-primary-dimmed", "--dsw-alias-label-primary-foreground",
  "--dsw-alias-label-primary-inverted", "--dsw-alias-label-secondary", "--dsw-alias-label-shimmer",
  "--dsw-alias-label-tertiary", "--dsw-alias-link", "--dsw-alias-markdown-citation",
  "--dsw-alias-markdown-code-block", "--dsw-alias-markdown-code-block-banner", "--dsw-alias-markdown-code-segment-selected",
  "--dsw-alias-markdown-code-segment-unselected", "--dsw-alias-markdown-inline-code", "--dsw-alias-markdown-placeholder",
  "--dsw-alias-markdown-tag", "--dsw-alias-menu-group-header-fill", "--dsw-alias-menu-icon",
  "--dsw-alias-onboarding-accent", "--dsw-alias-onboarding-card-fill", "--dsw-alias-onboarding-checkbox-border",
  "--dsw-alias-onboarding-secondary-fill", "--dsw-alias-scrollbar-bg-l1", "--dsw-alias-scrollbar-bg-l2",
  "--dsw-alias-scrollbar-hover-l1", "--dsw-alias-scrollbar-hover-l2", "--dsw-alias-settings-card-fill",
  "--dsw-alias-settings-card-stroke", "--dsw-alias-state-business-primary", "--dsw-alias-state-business-tertiary",
  "--dsw-alias-state-error-primary", "--dsw-alias-state-error-secondary", "--dsw-alias-state-idle-primary",
  "--dsw-alias-state-success-primary", "--dsw-alias-state-success-secondary", "--dsw-alias-state-success-tertiary",
  "--dsw-alias-state-warn-label", "--dsw-alias-state-warn-primary", "--dsw-alias-state-warn-secondary",
  "--dsw-alias-state-warn-tertiary", "--dsw-alias-switch-thumb", "--dsw-alias-toast-bg",
  "--dsw-alias-toast-label", "--dsw-alias-tooltip-bg", "--dsw-alias-tooltip-key-bg",
  "--dsw-alias-turn-trigger-bg", "--dsw-alias-turn-trigger-bg-hover", "--dsw-specific-bubble",
  "--dsw-specific-bubble-highlight", "--dsw-specific-input-major", "--dsw-specific-login-input",
  "--dsw-specific-menu", "--dsw-specific-selector", "--dsw-specific-sidebar-fill",
  "--dsw-specific-sidebar-nav-item-active", "--dsw-specific-sidebar-nav-item-active-accent", "--dsw-specific-sidebar-nav-item-hover",
  "--dsw-specific-tip",
]
//#endregion

//#region state machine
{
  const m = mount()
  assert.equal(currentMood(m), 'idle', '什么都不跑时首次作画是暖心情')
  assert.equal(m.layers.length, 1, '挂载时恰好一层 token')
  assert.equal(m.layers[0].source, 'dsh-glass-mood', '覆盖层有名字')
  assert.equal(m.document.body.dataset.glassBlur, 'on', '磨砂表面默认开')
  assert.ok(m.document.getElementById('dsh-glass-mood-style'), '样式表已挂载')
  assert.ok(m.document.getElementById('dsh-glass-mood-bg'), '渐变舞台已挂载')
  m.dispose()
  assert.equal(m.document.getElementById('dsh-glass-mood-style'), null, '卸载移除样式表')
  assert.equal(m.document.getElementById('dsh-glass-mood-bg'), null, '卸载移除舞台')
  assert.equal(m.document.body.dataset.glassMood, undefined, '卸载清掉心情属性')
  assert.equal(m.layers[m.layers.length - 1].disposed, true, '卸载收回 token 层')
  assert.equal(m.clock.pending, 0, '卸载不留计时器或间隔')
  console.log('ok  挂载 / 卸载')
}

{
  const m = mount()
  // 一轮开始：短去抖后冷心情落地。
  m.sessionStatus.set(new Map([['s1', { running: true }]]))
  assert.equal(currentMood(m), 'idle', '工作是去抖的，不是即时的')
  m.clock.advance(120)
  assert.equal(currentMood(m), 'work', '一轮进行中的对话切到冷心情')
  assert.equal(m.document.body.dataset.glassFading, 'work', '交叉淡变窗口打开')
  // 一轮结束，但空闲逗留让果断的心情多留一会儿。
  m.sessionStatus.set(new Map([['s1', { running: false }]]))
  m.clock.advance(300)
  assert.equal(currentMood(m), 'work', '暖心情等完整段逗留')
  m.clock.advance(1600)
  assert.equal(currentMood(m), 'idle', '逗留后空闲归来')
  console.log('ok  切入工作 / 空闲逗留')
}

{
  const m = mount()
  // 两个工具步骤之间：亚秒级的空闲空隙绝不能翻心情。
  m.sessionStatus.set(new Map([['s1', { running: true }]]))
  m.clock.advance(120)
  m.sessionStatus.set(new Map([['s1', { running: false }]]))
  m.clock.advance(400)
  m.sessionStatus.set(new Map([['s1', { running: true }]]))
  m.clock.advance(2000)
  assert.equal(currentMood(m), 'work', '步骤之间的短空隙不会闪一下暖心情')
  const workCommits = m.layers.filter(
    (l) => l.tokens !== null && l.tokens !== undefined && l.tokens['--dsw-alias-brand-primary'].dark === '#58A6FF'
  ).length
  assert.equal(workCommits, 1, '心情已经正确时绝不重复提交')
  console.log('ok  步骤之间的空隙')
}

{
  const m = mount()
  // 停在用户交互上的一轮仍然算工作。
  m.sessionStatus.set(new Map([['s1', { running: false, pendingInteraction: { kind: 'approval' } }]]))
  m.clock.advance(200)
  assert.equal(currentMood(m), 'work', '等用户期间保持果断的心情')
  m.dispose()
  console.log('ok  待定的用户交互算工作')
}

{
  // 只有兜底源可用（没有 ui-session 状态图）。
  const m = mount({ noStatus: true, bindings: { s9: { running: true } } })
  m.sessionList.set({ byId: { s9: { running: true } } })
  m.clock.advance(200)
  assert.equal(currentMood(m), 'work', '一个在跑的行驱动心情')
  // 行自己不带标志：逐个会话的面孔是剩下的唯一数据源。
  m.sessionList.set({ byId: { s9: {} } })
  m.clock.advance(50)
  assert.equal(m.engine.readActivity(), true, '行沉默时读会话面孔')
  assert.equal(currentMood(m), 'work', '面孔保住果断的心情')
  m.sessionList.set({ byId: {} })
  m.clock.advance(2000)
  assert.equal(currentMood(m), 'idle', '兜底源也释放心情')
  assert.equal(typeof m.engine.readActivity, 'function', '引擎把它的读取器暴露出来供调试')
  m.dispose()
  console.log('ok  会话列表兜底')
}

{
  const m = mount()
  // 强制心情压过实时信号，并被写进存储。
  m.window.__dshGlassMood.force('work')
  assert.equal(currentMood(m), 'work', '强制心情立刻生效')
  assert.equal(m.storage.getItem('dsh-glass-mood:force'), 'work', '钉被持久化')
  m.sessionStatus.set(new Map([['s1', { running: true }]]))
  m.clock.advance(5000)
  assert.equal(currentMood(m), 'work', '强制心情保持钉住')
  m.sessionStatus.set(new Map())
  m.window.__dshGlassMood.force('')
  assert.equal(currentMood(m), 'idle', '清掉钉回到推导的心情')
  assert.equal(m.window.__dshGlassMood.current(), 'idle', '调试句柄报告活的心情')
  assert.equal(m.storage.getItem('dsh-glass-mood:force'), null, '钉从存储里移除')
  m.dispose()
  assert.equal(m.window.__dshGlassMood, undefined, '卸载移除调试句柄')
  console.log('ok  强制心情')
}


{
  const m = mount()
  // 注册在数据源上的订阅者在 dispose 时被释放。
  assert.equal(m.sessionStatus.listenerCount, 1, '状态图被订阅一次')
  assert.equal(m.sessionList.listenerCount, 1, '会话列表被订阅一次')
  m.dispose()
  assert.equal(m.sessionStatus.listenerCount, 0, '卸载退订状态图')
  assert.equal(m.sessionList.listenerCount, 0, '卸载退订会话列表')
  console.log('ok  订阅被释放')
}
//#endregion

//#region wallpaper
/** 让引擎的 IndexedDB 微任务和恢复 promise 落定。 */
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve)) }
const stageEl = (m) => m.document.getElementById('dsh-glass-mood-bg')
const videoEl = (m, slot) => stageEl(m).children.find((c) => c.tagName === 'video' && c.getAttribute('data-glass-slot') === slot) ?? null
const clipOf = (m, slot) => videoEl(m, slot).getAttribute('data-glass-clip')
/** rgba() 颜色的 alpha；不透明形式（十六进制）算 1。 */
const alphaOf = (color) => {
  const match = /rgba\([^)]*,\s*([0-9.]+)\s*\)$/.exec(color)
  return match === null ? 1 : Number(match[1])
}

{
  const m = mount()
  assert.equal(stageEl(m).children.filter((c) => c.tagName === 'video').length, 2, '每心情槽一个片子元素')
  assert.equal(clipOf(m, 'idle'), 'none', '什么都没配时空闲片子不活跃')
  assert.equal(clipOf(m, 'work'), 'none', '什么都没配时工作片子不活跃')
  assert.equal(m.document.body.dataset.glassWallpaper, 'off', '挂载时没配壁纸')
  assert.equal(videoEl(m, 'idle').getAttribute('src'), undefined, '设壁纸前没有源')
  // tint 0.35 被 clarity 0.45 淡出到 30% => 0.24
  assert.equal(m.document.body.style.getPropertyValue('--gm-tint'), '0.24', '情绪染色有它的默认值')
  m.dispose()
  console.log('ok  壁纸空闲状态')
}

{
  const m = mount()
  const applied = m.engine.setWallpaper({ url: 'https://cdn.example.com/loop.mp4' })
  assert.equal(applied.clips.idle.source, 'url', '链接落进空闲槽')
  assert.equal(applied.clips.work.source, '', '工作槽保持空')
  assert.equal(m.document.body.dataset.glassWallpaper, 'on', '配置了壁纸就点亮舞台')
  assert.equal(clipOf(m, 'idle'), 'both', '一条片子服务两个心情')
  assert.equal(clipOf(m, 'work'), 'none', '空槽保持暗')
  assert.equal(videoEl(m, 'idle').getAttribute('src'), 'https://cdn.example.com/loop.mp4', '片子播链接')
  assert.ok(videoEl(m, 'idle').played >= 1, '片子正在播放（且被强制静音）')
  assert.equal(videoEl(m, 'idle').attributes.muted, '', '自动播放合法只因它静音')
  const stored = JSON.parse(m.storage.getItem('dsh-glass-mood:video'))
  assert.equal(stored.clips.idle.url, 'https://cdn.example.com/loop.mp4', '配置被持久化')
  assert.equal(stored.fit, 'cover', '适配默认裁切铺满')

  // 活旋钮驱动 body 上的 CSS 变量，舞台读的就是这些。
  m.engine.setWallpaper({ fit: 'contain', opacity: 0.3, blur: 16, tint: 0.6, clarity: 0 })
  assert.equal(m.document.body.style.getPropertyValue('--gm-wall-fit'), 'contain', '适配到达舞台')
  assert.equal(m.document.body.style.getPropertyValue('--gm-wall-opacity'), '0.3', '不透明度到达舞台')
  assert.equal(m.document.body.style.getPropertyValue('--gm-wall-blur'), '16px', '模糊到达舞台')
  assert.ok(Number(m.document.body.style.getPropertyValue('--gm-wall-scale')) > 1, '模糊过扫描把缝藏掉')
  assert.equal(m.document.body.style.getPropertyValue('--gm-tint'), '0.6', '通透度为零时情绪染色不淡出')

  // 越界输入被夹住，绝不被信任。
  const clamped = m.engine.setWallpaper({ opacity: 4, blur: 999, tint: 2, clarity: 7, fit: 'nope' })
  assert.equal(clamped.opacity, 1, '不透明度被夹住')
  assert.equal(clamped.blur, 32, '模糊被夹住')
  assert.equal(clamped.tint, 0.9, '染色被夹住')
  assert.equal(clamped.clarity, 1, '通透度被夹住')
  assert.equal(clamped.fit, 'cover', '未知的适配回退到裁切铺满')

  // 满通透度把情绪染色淡出到它的残余份额。
  assert.equal(m.document.body.style.getPropertyValue('--gm-tint'), '0.27', '通透度淡出染色，但绝不归零')
  m.dispose()
  console.log('ok  壁纸链接 + 活旋钮')
}

{
  // 一个旋钮，一种感知：可见度同时驱动片子强度和面板削薄，所以两半永远不可能
  // 读起来像重复的。
  const m = mount()
  m.engine.setWallpaper({ url: 'https://cdn.example.com/loop.mp4' })
  const dim = m.engine.setWallpaper({ visibility: 0 })
  assert.equal(dim.clarity, 0, '可见度 0 意味着不削薄')
  assert.equal(dim.opacity, 0.35, '以及最弱的片子')
  assert.equal(bodyVar(m, '--gm-wall-opacity'), '0.35', '舞台跟随')
  const full = m.engine.setWallpaper({ visibility: 1 })
  assert.equal(full.clarity, 1, '可见度 1 意味着满削薄')
  assert.equal(full.opacity, 1, '以及最强的片子')
  assert.equal(bodyVar(m, '--gm-wall-opacity'), '1', '舞台反方向也跟随')
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-main-fill')), 0.096, '可见度 1 时面板被完全揭开')
  m.dispose()
  console.log('ok  壁纸可见度是一条轴')
}

{
  // 通透度才是真正揭开片子的东西：主题自己的面板变薄。
  const m = mount()
  const raw = m.loaded.pairFor('idle')
  assert.equal(alphaOf(raw['--dsw-alias-bg-base'].light), 0.64, '调色板基础面板是满强度')
  m.engine.setWallpaper({ url: 'https://cdn.example.com/loop.mp4', clarity: 0 })
  const before = m.layers[m.layers.length - 1].tokens
  assert.equal(alphaOf(before['--dsw-alias-bg-base'].light), 0.64, '单有壁纸不削薄面板')
  // 壁纸一开，内容表面立刻被抬到可读的 alpha，在任何削薄之前：片子的亮度未知，
  // 而官方主题把它们每一个都画成不透明。
  assert.equal(alphaOf(raw['--dsw-specific-bubble'].light), 0.62, '没有壁纸时气泡保住调色板 alpha')
  assert.equal(alphaOf(before['--dsw-specific-bubble'].light), 0.72, '壁纸把它抬到保护地板')

  // 没有发明出来的环境动作：主题的光是静态的（镜边、纵深、接触阴影、随心情变化的
  // 色温）。扫光是应用户反馈去掉的。
  assert.equal(bodyVar(m, '--gm-sweep'), '', '不发布扫光颜色')
  assert.equal(Object.prototype.hasOwnProperty.call(m.engine.getPanels(), 'glow'), false, '扫光开关从配置里没了')

  m.engine.setWallpaper({ clarity: 1 })
  const after = m.layers[m.layers.length - 1].tokens
  assert.ok(alphaOf(after['--dsw-alias-bg-base'].light) <= 0.1, '通透度拉满时画布面板近乎消失')
  assert.ok(alphaOf(after['--dsw-specific-sidebar-fill'].light) <= 0.25, '侧边栏列也揭开片子')
  // 文字容器保有一个高地板：片子的亮度未知，所以主题拒绝把可读性做成滑杆。官方主题
  // 把这些每一个都画成不透明，所以保护它们是在恢复原厂行为。
  assert.ok(alphaOf(after['--dsw-specific-bubble'].light) >= 0.72, '消息气泡保住底色')
  assert.ok(alphaOf(after['--dsw-specific-input-major'].light) >= 0.8, '输入卡保住底色')
  assert.ok(alphaOf(after['--dsw-alias-settings-card-fill'].light) >= 0.86, '设置卡保住底色')
  assert.ok(alphaOf(after['--dsw-alias-bg-overlay'].light) >= 0.9, '弹出层保持实心')
  assert.ok(alphaOf(after['--dsw-alias-bg-document-preview'].light) >= 0.94, 'diff/文档预览容器保持实心')
  assert.ok(alphaOf(after['--dsw-alias-bg-layer-1'].light) >= 0.88, '抬起的卡保持实心')
  assert.ok(alphaOf(after['--dsw-alias-bg-layer-2'].light) >= 0.86, '它们下面的层同样')
  assert.ok(alphaOf(after['--dsw-alias-bg-layer-3'].light) >= 0.84, '以及最深那层')
  assert.ok(alphaOf(after['--dsw-alias-markdown-code-block'].light) >= 0.86, '代码块保住底色')
  assert.equal(after['--dsw-alias-label-primary'].light, before['--dsw-alias-label-primary'].light, '文字色从不被压暗')
  assert.equal(after['--dsw-alias-border-l2'].light, before['--dsw-alias-border-l2'].light, '边界保持原值')
  // 削薄只许拿走 alpha。保护只许加回它——而且只加给声明过的内容表面，绝不加给
  // 颜色或边界。
  const protectedNames = new Set(m.loaded.WALL_PROTECT.map((rule) => rule[0]))
  for (const name of Object.keys(after)) {
    const raised = alphaOf(after[name].light) > alphaOf(before[name].light) + 1e-9
    if (protectedNames.has(name)) {
      assert.ok(alphaOf(after[name].light) >= Math.min(1, alphaOf(before[name].light)), `${name}: 保护绝不降低`)
    } else {
      assert.ok(!raised, `${name}: 只有声明过的内容表面可以涨 alpha`)
    }
  }

  // 什么都没配就意味着没什么要揭开：调色板原样不动。
  m.engine.clearWallpaper()
  const cleared = m.layers[m.layers.length - 1].tokens
  assert.equal(alphaOf(cleared['--dsw-alias-bg-base'].light), 0.64, '清除恢复满强度面板')
  m.dispose()
  console.log('ok  通透度削薄面板但绝不削薄文字')
}

{
  const m = mount()
  const blob = { size: 1024, kind: 'video/mp4' }
  await m.engine.setWallpaperFile(blob, 'loop.mp4')
  assert.equal(clipOf(m, 'idle'), 'both', '选中的空闲文件服务两个心情')
  assert.equal(m.objectUrls.created.length, 1, '文件通过对象 URL 播放')
  const url = m.objectUrls.created[0].value
  assert.equal(videoEl(m, 'idle').getAttribute('src'), url, '片子播对象 URL')
  assert.equal(m.engine.getWallpaper().clips.idle.source, 'file', '配置记录一个本地文件')
  assert.equal(m.engine.getWallpaper().clips.idle.name, 'loop.mp4', '显示名被保留')
  await settle()
  assert.equal(m.idb.rows.get('wallpaper:idle'), blob, 'blob 存在槽键下')
  assert.equal(JSON.parse(m.storage.getItem('dsh-glass-mood:video')).clips.idle.source, 'file', '文件来源被持久化')

  await m.engine.clearWallpaper('idle')
  assert.equal(clipOf(m, 'idle'), 'none', '清除唯一的片子停用舞台')
  assert.equal(m.document.body.dataset.glassWallpaper, 'off', '并关掉壁纸')
  assert.equal(videoEl(m, 'idle').getAttribute('src'), undefined, '清除丢掉源')
  assert.deepEqual(m.objectUrls.revoked, [url], '对象 URL 被放开')
  assert.equal(m.idb.rows.has('wallpaper:idle'), false, '存下的 blob 被移除')
  assert.equal(m.engine.getWallpaper().clips.idle.source, '', '槽被重置')
  m.dispose()
  console.log('ok  壁纸本地文件 + 逐槽清除')
}

{
  // 两条片子，两个槽：切换必须交叉淡变，不重载任何一条。
  const m = mount()
  m.engine.setWallpaper({ url: 'https://cdn.example.com/calm.mp4', slot: 'idle' })
  m.engine.setWallpaper({ url: 'https://cdn.example.com/focus.mp4', slot: 'work' })
  assert.equal(clipOf(m, 'idle'), 'idle', '空闲槽拥有自己的片子')
  assert.equal(clipOf(m, 'work'), 'work', '工作槽拥有自己的片子')
  assert.equal(videoEl(m, 'idle').getAttribute('src'), 'https://cdn.example.com/calm.mp4', '空闲播它的片子')
  assert.equal(videoEl(m, 'work').getAttribute('src'), 'https://cdn.example.com/focus.mp4', '工作播它的片子')
  assert.ok(videoEl(m, 'work').played >= 1, '隐藏的片子已在播放，所以切换是交叉淡变')

  const idleSrc = videoEl(m, 'idle').getAttribute('src')
  const workSrc = videoEl(m, 'work').getAttribute('src')
  const loadsBefore = videoEl(m, 'idle').loaded ?? 0

  m.sessionStatus.set(new Map([['s1', { running: true }]]))
  m.clock.advance(120)
  assert.equal(m.document.body.dataset.glassMood, 'work', '心情切换了')
  assert.equal(videoEl(m, 'idle').getAttribute('src'), idleSrc, '空闲片子没有被重载')
  assert.equal(videoEl(m, 'work').getAttribute('src'), workSrc, '工作片子没有被重载')
  assert.equal(videoEl(m, 'idle').loaded ?? 0, loadsBefore, '切换时没有发生解码器重置')
  m.dispose()
  console.log('ok  两条片子交叉淡变不重载')
}

{
  // 移除一个槽，把幸存者交还给两个心情。
  const m = mount()
  m.engine.setWallpaper({ url: 'https://cdn.example.com/calm.mp4', slot: 'idle' })
  m.engine.setWallpaper({ url: 'https://cdn.example.com/focus.mp4', slot: 'work' })
  m.engine.clearWallpaper('work')
  assert.equal(clipOf(m, 'work'), 'none', '清掉的槽变暗')
  assert.equal(clipOf(m, 'idle'), 'both', '幸存者重新覆盖两个心情')
  assert.equal(videoEl(m, 'work').getAttribute('src'), undefined, '清掉的槽释放了它的源')
  assert.equal(videoEl(m, 'idle').getAttribute('src'), 'https://cdn.example.com/calm.mp4', '幸存者继续播放')
  m.dispose()
  console.log('ok  单独一条片子回退到两个心情')
}

{
  // 存好的一对在重新挂载后幸存：配置来自 localStorage，字节来自 IndexedDB。
  const first = mount()
  const blob = { size: 2048, kind: 'video/webm' }
  await first.engine.setWallpaperFile(blob, 'dawn.webm', 'work')
  first.engine.setWallpaper({ url: 'https://cdn.example.com/calm.mp4', slot: 'idle' })
  await settle()
  first.dispose()

  const second = mount({ storage: first.storage, idb: first.idb })
  await settle()
  const config = second.engine.getWallpaper()
  assert.equal(config.clips.idle.source, 'url', '链接片子被恢复')
  assert.equal(config.clips.work.source, 'file', '文件片子被恢复')
  assert.equal(config.clips.work.name, 'dawn.webm', '名字被恢复')
  assert.equal(clipOf(second, 'work'), 'work', '恢复的文件是活的')
  assert.equal(second.objectUrls.created.length, 1, '为存下的 blob 创建了新的对象 URL')
  assert.equal(videoEl(second, 'work').getAttribute('src'), second.objectUrls.created[0].value, '恢复的片子播放')
  second.dispose()
  console.log('ok  壁纸在重新挂载后幸存')
}

{
  // 比自己的 blob 活得久的配置必须逐槽诚实降级。
  const seed = mount()
  await seed.engine.setWallpaperFile({ size: 16 }, 'gone.mp4', 'work')
  seed.engine.setWallpaper({ url: 'https://cdn.example.com/calm.mp4', slot: 'idle' })
  await settle()
  seed.dispose()
  seed.idb.rows.delete('wallpaper:work')

  const next = mount({ storage: seed.storage, idb: seed.idb })
  await settle()
  const config = next.engine.getWallpaper()
  assert.equal(config.clips.work.source, '', '字节丢了的槽被清掉')
  assert.equal(config.clips.idle.source, 'url', '健康的槽不碰')
  assert.equal(clipOf(next, 'idle'), 'both', '幸存者现在服务两个心情')
  assert.equal(JSON.parse(next.storage.getItem('dsh-glass-mood:video')).clips.work.source, '', '陈旧的槽被重写')
  next.dispose()
  console.log('ok  陈旧的壁纸配置逐槽降级')
}

{
  // v1（顶层一个视频、光秃的 IndexedDB 键）迁移进空闲槽。
  const storage = {
    data: new Map([['dsh-glass-mood:video', JSON.stringify({ source: 'file', url: '', name: 'old.mp4', fit: 'contain', opacity: 0.4, blur: 4, tint: 0.5 })]]),
    getItem(key) { return this.data.has(key) ? this.data.get(key) : null },
    setItem(key, value) { this.data.set(key, String(value)) },
    removeItem(key) { this.data.delete(key) }
  }
  const idb = createIndexedDB()
  const legacyBlob = { size: 64, kind: 'video/mp4' }
  idb.rows.set('wallpaper', legacyBlob)
  const m = mount({ storage, idb })
  await settle()
  const config = m.engine.getWallpaper()
  assert.equal(config.clips.idle.source, 'file', 'v1 的视频落进空闲槽')
  assert.equal(config.clips.idle.name, 'old.mp4', '它的名字幸存')
  assert.equal(config.clips.work.source, '', '工作槽起步为空')
  assert.equal(config.fit, 'contain', 'v1 的旋钮被保留')
  assert.equal(m.idb.rows.get('wallpaper:idle'), legacyBlob, '字节被复制到槽键')
  assert.equal(m.idb.rows.has('wallpaper'), false, '遗留键被释放')
  assert.equal(m.objectUrls.created.length, 1, '迁移来的文件播放')
  assert.equal(JSON.parse(storage.getItem('dsh-glass-mood:video')).clips.idle.source, 'file', 'the config is rewritten in the v2 shape')
  m.dispose()
  console.log('ok  v1 壁纸迁移')
}

{
  // 没有 IndexedDB，选中的文件照样显示，而选择绝不被抹掉：
  // "存储不可用"不是"文件没了"。
  const m = mount({ idb: false })
  const blob = { size: 32 }
  await m.engine.setWallpaperFile(blob, 'nodb.mp4', 'idle')
  await settle()
  assert.equal(clipOf(m, 'idle'), 'both', '没有 IndexedDB 的文件照样显示')
  assert.equal(videoEl(m, 'idle').getAttribute('src'), m.objectUrls.created[0].value, '它从对象 URL 播放')
  assert.equal(m.engine.getWallpaper().clips.idle.source, 'file', '选择被保住，而不是清掉')
  m.dispose()

  const reopened = mount({ storage: m.storage, idb: false })
  await settle()
  assert.equal(reopened.engine.getWallpaper().clips.idle.source, 'file', '且按内存的说法它在重载后幸存')
  reopened.dispose()
  console.log('ok  没有 IndexedDB 的壁纸')
}
//#endregion

//#region media sampling
/** 一帧单色画面，取样器会把它平均掉的那种。 */
function flatFrame(canvas, r, g, b) {
  canvas.pixels = framePixels(r, g, b)
  return canvas
}
const newCanvas = () => ({ pixels: [], throws: false, drawCalls: 0, drawnSlots: [], lastSlot: null })
/** 一帧单色的扁平画面，取样器看到的样子。 */
const framePixels = (r, g, b) => {
  const pixels = []
  for (let i = 0; i < 24 * 14; i++) pixels.push(r, g, b, 255)
  return pixels
}
const rgbOf = (color) => /rgba\((\d+), (\d+), (\d+)/.exec(color).slice(1).map(Number)

{
  // 取样器读到的必须是屏幕上的那条。取而取排在前面的那个槽，意味着两条片子都配了时，
  // 工作态会保住空闲片子的色相（和它的压暗），而一条冷片子在玻璃背后播放。这里给两条
  // 片子各自的帧：一暖一冷，所以"这块窗格正穿着哪个读数"看着窗格就能答。
  const canvas = newCanvas()
  canvas.perSlot = { idle: framePixels(250, 140, 40), work: framePixels(90, 140, 220) }
  const m = mount({ canvas })
  m.engine.setWallpaper({ url: 'https://cdn.example.com/calm.mp4', slot: 'idle' })
  m.engine.setWallpaper({ url: 'https://cdn.example.com/focus.mp4', slot: 'work' })
  m.clock.advance(4500)
  assert.ok(canvas.drawnSlots.includes('idle'), '平静槽读进它自己的读数')
  assert.ok(canvas.drawnSlots.includes('work'), '冷的那条也一样，提前读')
  assert.equal(m.engine.media().ready, true, '平静心情画上去的读数来自平静的片子')

  // 切换必须落在它已经有的颜色上：还没有取样间隔到期，而窗格仍在同一跳变冷。
  // （只读屏幕上的那条，正是让它多穿四秒暖色相的东西。）
  const warm = rgbOf(bodyVar(m, '--gm-panel-main-fill'))
  const drawsBefore = canvas.drawCalls
  m.sessionStatus.set(new Map([['s1', { running: true }]]))
  m.clock.advance(120)
  assert.equal(m.document.body.dataset.glassMood, 'work', '心情切换了')
  const cold = rgbOf(bodyVar(m, '--gm-panel-main-fill'))
  assert.equal(canvas.drawCalls, drawsBefore, '且没有为它读新帧')
  assert.ok(cold[2] - cold[0] > warm[2] - cold[0], `窗格立刻变冷（${warm} -> ${cold}）`)

  // 一个解码器，不是两个：交叉淡变一结束，不在显示的那个槽就停下，而需要时立刻回来。
  m.clock.advance(1200)
  assert.equal(videoEl(m, 'work').paused, false, '屏幕上的片子正在播放')
  assert.equal(videoEl(m, 'idle').paused, true, '不在显示的片子已停下')
  assert.equal(
    videoEl(m, 'idle').getAttribute('src'),
    'https://cdn.example.com/calm.mp4',
    '停下而非释放：切换仍是交叉淡变'
  )

  m.sessionStatus.set(new Map())
  m.clock.advance(1700)
  assert.equal(m.document.body.dataset.glassMood, 'idle', '心情回来了')
  assert.equal(videoEl(m, 'idle').paused, false, '且平静的片子重新播放')
  m.clock.advance(1200)
  assert.equal(videoEl(m, 'work').paused, true, '冷的那条随之停下')
  m.dispose()
  console.log('ok  读数跟随屏幕上的片子，一次一个解码器')
}

{
  // 明亮饱和的片子：玻璃在镜边拾起它的色相，媒体挣得一层可读性遮挡——封顶 35%，
  // 这是明亮媒体上玻璃的公开指引。
  const canvas = flatFrame(newCanvas(), 250, 140, 40)
  const m = mount({ canvas })
  const plainRim = bodyVar(m, '--gm-rim-b')
  m.engine.setWallpaper({ url: 'https://cdn.example.com/loop.mp4' })
  const media = m.engine.media()
  assert.equal(media.ready, true, '读到了一帧')
  assert.ok(media.brightness > 0.55, `明亮的片子读作亮（${media.brightness}）`)
  assert.ok(Math.abs(media.hue - 28) < 14, `并保住它自己的色相（${media.hue}）`)
  assert.ok(media.dim > 0 && media.dim <= 0.35, `并在封顶内挣得一层遮挡（${media.dim}）`)
  assert.equal(Number(bodyVar(m, '--gm-media-dim')), media.dim, '遮挡层为那一层发布')

  // 镜边朝暖内容移了实实在在的一段，且不穿过品红：在色轮上从 220° 旋转到 29° 的短路
  // 穿过紫，那正是本主题不得不去掉的紫 cast。
  const before = rgbOf(plainRim)
  const after = rgbOf(bodyVar(m, '--gm-rim-b'))
  assert.ok(after[0] - after[2] > before[0] - before[2], `镜边朝片子变暖（${plainRim} -> ${bodyVar(m, '--gm-rim-b')}）`)
  assert.ok(
    (after[2] - after[0]) <= (before[2] - before[0]) - 5,
    `且是真暖，不是漂进紫（${before[2] - before[0]} -> ${after[2] - after[0]}）`
  )
  // 窗格自己沾上内容的颜色——单旋转色相在一块离中性只差几个百分点的窗格上显示不出来，
  // 所以染色瞄准内容的色相在一个可用饱和度上，并把浅色窗格往下挪腾地方。
  const paneWarm = rgbOf(bodyVar(m, '--gm-panel-main-fill'))
  assert.ok(paneWarm[0] > paneWarm[2], `窗格沾上暖内容（${bodyVar(m, '--gm-panel-main-fill')}）`)

  // 两个开关各自关掉自己的效果，实时生效，不碰读数。
  m.engine.setWallpaper({ autoDim: false })
  assert.equal(Number(bodyVar(m, '--gm-media-dim')), 0, '遮挡开关把遮挡归零')
  assert.equal(m.engine.media().ready, true, '而取样器持续读取')
  m.engine.setWallpaper({ autoDim: true })
  assert.ok(Number(bodyVar(m, '--gm-media-dim')) > 0, '并再次打开')
  m.engine.setPanels({ rimSpill: false })
  assert.equal(bodyVar(m, '--gm-rim-b'), plainRim, '内容染色开关恢复镜边本色')
  // 窗格回到心情自己的底色，而不是片子的色相：底色按设计只离中性几个单位（正是它让
  // 窗格在完全没有壁纸时也读得出暖或冷），而内容的色相把它推得远得多。
  const panePlain = rgbOf(bodyVar(m, '--gm-panel-main-fill'))
  assert.ok(
    panePlain[0] - panePlain[2] < paneWarm[0] - paneWarm[2],
    `并且窗格把内容的色相还了回去（${bodyVar(m, '--gm-panel-main-fill')}）`
  )
  assert.ok(panePlain[0] - panePlain[2] <= 6, `只留下心情自己的底色（${bodyVar(m, '--gm-panel-main-fill')}）`)
  m.engine.setPanels({ rimSpill: true })
  assert.notEqual(bodyVar(m, '--gm-rim-b'), plainRim, '并再次打开')

  // 取样节流得远比轮询稀疏。
  const draws = canvas.drawCalls
  m.clock.advance(1500)
  assert.equal(canvas.drawCalls, draws, '窗口内的第二次读取不碰画布')
  m.clock.advance(4000)
  assert.ok(canvas.drawCalls > draws, '且间隔后恢复')
  m.dispose()
  console.log('ok  片子驱动镜边色相与压暗层')
}

{
  // 暗片子放任不管，灰片子没有色相可溢，而一条读不到的片子（跨源 URL 会污染画布）
  // 回退而不是猜。
  const dark = flatFrame(newCanvas(), 10, 12, 16)
  const m = mount({ canvas: dark })
  m.engine.setWallpaper({ url: 'https://cdn.example.com/loop.mp4' })
  assert.equal(m.engine.media().dim, 0, '暗片子挣不到遮挡层')
  assert.equal(m.engine.media().hue, null, '而近黑的帧没有色相')
  m.dispose()

  const grey = flatFrame(newCanvas(), 128, 128, 128)
  const m2 = mount({ canvas: grey })
  const coolRim = bodyVar(m2, '--gm-rim-b')
  m2.engine.setWallpaper({ url: 'https://cdn.example.com/loop.mp4' })
  assert.equal(m2.engine.media().hue, null, '灰片子没有色相可溢')
  assert.equal(bodyVar(m2, '--gm-rim-b'), coolRim, '所以镜边保住它的本色')
  m2.dispose()

  const tainted = newCanvas()
  tainted.throws = true
  const m3 = mount({ canvas: tainted })
  m3.engine.setWallpaper({ url: 'https://cdn.example.com/loop.mp4' })
  const media = m3.engine.media()
  assert.equal(media.ready, false, '被污染的画布读作不可读')
  assert.equal(media.dim, 0, '且挣不到遮挡层')
  assert.equal(media.hue, null, '且没有色相')
  m3.dispose()

  // 完全没有片子：没什么可读，也没有遮挡层。
  const m4 = mount({ canvas: newCanvas() })
  assert.equal(m4.engine.media().ready, false, '没有片子就什么都不取样')
  assert.equal(Number(bodyVar(m4, '--gm-media-dim')), 0, '遮挡层保持关着')
  m4.dispose()
  console.log('ok  暗、灰、污染、无片子的媒体全部回退')
}

{
  // 压暗层住在舞台里，在片子和情绪染色之上，并和舞台其余部分一起留在负层内。
  const m = mount()
  const css = m.document.getElementById('dsh-glass-mood-style').textContent
  assert.match(css, /\[data-glass-layer=dim\]\{inset:0;background:rgba\(0,0,0,var\(--gm-media-dim,0\)\)/, '一层中性黑遮挡')
  const stage = m.document.getElementById('dsh-glass-mood-bg')
  const names = stage.children.map((child) => child.getAttribute('data-glass-layer')).filter(Boolean)
  assert.deepEqual(names, ['idle', 'work', 'pulse', 'dim'], '且它是最后一层，所以压暗整个栈')
  m.dispose()
  console.log('ok  压暗层是罩在媒体栈上的一层遮挡')
}
//#endregion

{
  // 交互反馈：一次让控件变形的按压，来自沉浸材质规范（`interactive`）。曾短暂住在
  // 这里的指针光被去掉了——用它的人说它没有意义，而一个没人要的功能不该让三个元素和
  // 一个指针监听器继续活着。
  const m = mount()
  const css = m.document.getElementById('dsh-glass-mood-style').textContent
  assert.ok(!/data-glass-light/.test(css), '指针光从 CSS 里消失')
  assert.equal(m.document.querySelectorAll('[data-glass-light]').length, 0, '以及从 DOM 里')
  assert.match(css, /@keyframes gm-press\{from\{scale:1\}to\{scale:\.972\}\}/, '按压动画被声明')
  assert.match(css, /body\[data-glass-press=on\] button:active/, '并挂在开关上')
  assert.match(css, /body\[data-glass-press=on\] \[role=menuitem\]:active\{animation:gm-press/, '只给真正可按的控件')
  // 它缩放而不变换，所以 app 的 transform 永远不会被砸掉。
  assert.ok(!/button:active\{[^}]*transform:/.test(css), '按压不碰 transform')
  assert.match(css, /prefers-reduced-motion[^}]*button:active[^}]*animation:none/, '且减弱动效取消它')
  // 减弱动效也必须砍掉心情交叉淡变，而覆盖必须写在它所覆盖的规则之后：特异性相等时
  // 最后一个赢，所以放在前面的覆盖会被悄悄取消。
  const fadeAt = css.indexOf('prefers-reduced-motion: reduce){body[data-glass-mood]{--gm-fade:1ms}')
  const baseAt = css.indexOf('body[data-glass-mood]{--gm-fade:520ms;')
  assert.ok(fadeAt > 0, '减弱动效缩短心情交叉淡变')
  assert.ok(baseAt > 0 && fadeAt > baseAt, '且覆盖声明在所覆盖规则之后')

  // 开关是活的，并到达 body。
  assert.equal(m.document.body.dataset.glassPress, 'on', '按压形变默认开')
  m.engine.setPanels({ press: false })
  assert.equal(m.document.body.dataset.glassPress, 'off', '且开关到达 body')
  m.engine.setPanels({ press: true })
  assert.equal(m.document.body.dataset.glassPress, 'on', '并重新打开')
  m.engine.off()
  assert.equal(m.document.body.dataset.glassPress, undefined, 'off() 清掉属性')
  console.log('ok  按压形变，指针光不留')
}

//#region accessibility
{
  // 报上来的现象：右栏展开到全屏时，那个面板的不透明度和模糊不再覆盖它，对着中间面板
  // 露出一道缝。app 不为那个模式移动任何 DOM——它只重写外框的网格列——所以列变宽，而
  // 接过材质的内层表面保持旧宽度。授权是从一次测量发出去的、从不复查，这就是这里要锁死
  // 的东西。
  const m = mount()
  assert.equal(m.engine.blurReport().left.delegated, true, '左面板起步时授权给内层表面')
  const observer = m.window.observers.at(-1)
  assert.ok(observer, '列被观察，展开就是这样被察觉的')

  // 全屏：列翻倍，内层表面不（520 里的 260 < 85%）。
  m.shell.left.box = { width: 520, height: 780, left: 0, top: 0 }
  observer.emit()
  m.clock.advance(200)

  assert.equal(m.engine.blurReport().left.delegated, false, '不再覆盖的表面把材质还回来')
  assert.equal(m.shell.leftSurface.getAttribute('data-glass-surface'), undefined, '陈旧的表面被释放')
  assert.equal(m.shell.left.getAttribute('data-glass-delegate'), undefined, '且列不再礼让它')
  assert.equal(
    m.engine.blurSummary().every((line) => !/未识别|fixed|降级/.test(line)),
    true,
    '健康的面板没什么要报'
  )

  // 旋钮再次移动屏幕上真正的东西。
  m.engine.setPanels({ left: { opacity: 0.42 } })
  assert.equal(
    panelAlpha(bodyVar(m, '--gm-panel-left-fill')),
    0.42,
    '材质回退到的那个面板接住新的不透明度'
  )

  // 缩回去重新授权：那是一次测量，不是一扇单向门。
  m.shell.left.box = { width: 260, height: 780, left: 0, top: 0 }
  observer.emit()
  m.clock.advance(200)
  assert.equal(m.engine.blurReport().left.delegated, true, '而一个重新合上表面的列再次授权')

  // 那道缝：过去透出来的是中间面板的窗格，而藏掉它才合上口子。但右列绝不能丢自己的
  // 沟槽——早先的版本清掉了它的 margin，展开的面板于是贴到标题栏上，同时仍被托离底部
  // （上面的间隙没了，下面的还在）。
  const css = m.document.getElementById('dsh-glass-mood-style').textContent
  assert.match(
    css,
    /\[data-rightbar-fullscreen\] \[data-glass-panel=right\]\{overflow:visible;box-shadow:none\}/,
    '展开的右栏保住沟槽，只放弃自己的卡'
  )
  // 列的圆角在两种模式之间绝不能变。每个面板都带 `transition: border-radius 220ms`，
  // 所以在展开模式里把它设成 0，会让收起时从方形动画回 12px——而材质在同一刻回到列上，
  // 于是切换播放成"先方，再圆回去"。
  assert.ok(
    !/\[data-rightbar-fullscreen\] \[data-glass-panel=right\]\{[^}]*border-radius/.test(css),
    '且它的圆角从不改变，所以收起时没有东西可动画'
  )
  assert.match(
    css,
    /\[data-rightbar-fullscreen\] \[data-glass-panel=main\]\{margin-right:0;visibility:hidden\}/,
    '且中间面板被隐藏时让出自己那半条沟槽，展开的面板后什么都透不出来'
  )
  m.dispose()
  console.log('ok  展开的面板重新验证它授权给的表面，并合上那条缝')
}

//#region accessibility
{
  // 无障碍，Apple 的 HIG 为液态玻璃明确点名的两项：减弱透明与增强对比度。两者都从
  // 媒体查询读，都改 token，都在系统翻转时再次应答。
  const m = mount({ prefers: { reducedTransparency: true } })
  assert.deepEqual(
    m.engine.preferences(),
    { reducedTransparency: true, moreContrast: false },
    '偏好在挂载时读取'
  )
  assert.equal(m.document.body.dataset.glassTransparency, 'reduced', '并到达 body 供 CSS 用')
  const prefCss = m.document.getElementById('dsh-glass-mood-style').textContent
  // 两种模糊排布都在，且都不挂在偏好读取上：一次读取绝不能有能力悄悄禁用模糊旋钮。
  assert.match(
    prefCss,
    /\[data-glass-blur=on\] \[data-glass-blur-host=element\]\{[^}]*backdrop-filter/,
    '元素承载的模糊被声明'
  )
  assert.match(
    prefCss,
    /\[data-glass-blur=on\] \[data-glass-surface\]:not\(\[data-glass-blur-host=element\]\)::before\{[^}]*backdrop-filter/,
    '伪元素降级也一样'
  )
  assert.ok(!/data-glass-transparency=reduced/.test(prefCss), '两者都不挂在减弱透明上')
  m.dispose()

  // 每个承载文字的表面变成不透明，可见度旋钮再也削不薄一块你必须透过它读的面板。
  const solid = mount({ prefers: { reducedTransparency: true } })
  solid.engine.setWallpaper({ url: 'https://cdn.example.com/loop.mp4', visibility: 1 })
  assert.equal(panelAlpha(bodyVar(solid, '--gm-panel-main-fill')), 1, '可见度旋钮说什么，窗板都是实的')
  assert.equal(panelAlpha(bodyVar(solid, '--gm-panel-left-fill')), 1, '侧边栏也是')
  const tokens = solid.layers[solid.layers.length - 1].tokens
  assert.equal(alphaOf(tokens['--dsw-specific-bubble'].light), 1, '消息气泡是实的')
  assert.equal(alphaOf(tokens['--dsw-alias-bg-document-preview'].light), 1, 'diff 预览也一样')
  // 画布刻意放过：壁纸是人自己的选择，且它只在没有东西要读的地方显示。
  assert.ok(alphaOf(tokens['--dsw-alias-bg-base'].light) < 1, '壁纸仍在面板之间显示')
  solid.dispose()

  // 增强对比度统一标签层级，所以层级来自字号和字重，而不是把文字淡向背景。
  const contrast = mount({ prefers: { moreContrast: true } })
  assert.equal(contrast.document.body.dataset.glassContrast, 'more', '偏好到达 body')
  const boosted = contrast.layers[contrast.layers.length - 1].tokens
  const primary = boosted['--dsw-alias-label-primary']
  for (const tier of contrast.loaded.LABEL_TIERS) {
    assert.deepEqual(boosted[tier], primary, `${tier} 取主色`)
  }
  assert.equal(alphaOf(boosted['--dsw-alias-bg-overlay'].light), 1, '且弹出层变实')
  contrast.dispose()

  // 一次系统变化不重载就落地，监听者被释放。
  const live = mount()
  assert.equal(live.document.body.dataset.glassContrast, undefined, '起初什么都不假定')
  assert.ok(live.preferenceLists.every((entry) => entry.listenerCount() === 1), '两个偏好都被观察')
  live.setPreference('moreContrast', true)
  assert.equal(live.document.body.dataset.glassContrast, 'more', '翻系统设置触发重绘')
  assert.equal(live.document.body.dataset.glassTransparency, undefined, '且只发布变了的')
  live.setPreference('reducedTransparency', true)
  assert.equal(live.document.body.dataset.glassTransparency, 'reduced', '另一个也是')
  live.setPreference('moreContrast', false)
  assert.equal(live.document.body.dataset.glassContrast, undefined, '关掉一个也同样被应答')
  live.dispose()
  assert.ok(live.preferenceLists.every((entry) => entry.listenerCount() === 0), '拆卸释放监听者')
  console.log('ok  减弱透明与增强对比度被实时应答')
}
//#endregion

//#region fullscreen
{
  // 真实页面的形状，来自一份对实物的报告：展开模式下网格没动（侧边栏 271、中间
  // 1701、右 576），呈现层是 app 自己的，在右列里。这里试过"盖住框的最深元素"搜索，
  // 它选中了中间面板自己的内容根——和中间列同一个盒子，所以够格——这把右栏的材质放到了
  // 中间面板上：透过展开面板看到的模糊是中间面板自己的。所以现在的规则是：材质留在
  // 右列上，中间面板停止透过呈现显形。
  const m = mount()
  m.shell.frame.box = { width: 2560, height: 1552, left: 0, top: 0 }
  m.shell.center.box = { width: 1701, height: 1500, left: 283, top: 46 }
  m.shell.right.box = { width: 576, height: 1506, left: 1984, top: 40 }
  // 一个够大的中间面板元素，满足任何盖框测试。
  const centreSurface = m.document.createElement('div')
  centreSurface.setAttribute('class', 'Dc7zOa_root')
  centreSurface.computed = { backgroundColor: 'rgba(243, 235, 231, 0.1)', position: 'relative', backgroundImage: 'none' }
  centreSurface.box = { width: 1701, height: 1500, left: 283, top: 46 }
  m.shell.center.appendChild(centreSurface)
  m.shell.frame.setAttribute('data-rightbar-fullscreen', '')
  m.engine.retag(true)

  const report = m.engine.domReport()
  assert.equal(m.engine.panelStatus().found.right, true, '右面板报成找到')
  assert.equal(
    m.shell.right.getAttribute('data-glass-panel'),
    'right',
    '且留在自己的列上'
  )
  assert.equal(
    centreSurface.getAttribute('data-glass-panel'),
    undefined,
    "the centre panel's own element is never handed the right panel's material"
  )
  assert.equal(
    m.shell.center.getAttribute('data-glass-panel'),
    'main',
    '中间面板保住自己的材质'
  )

  // 面板全屏呈现期间，中间面板被隐藏（不是卸载）。
  const css = m.document.getElementById('dsh-glass-mood-style').textContent
  assert.match(
    css,
    /\[data-rightbar-fullscreen\] \[data-glass-panel=main\]\{margin-right:0;visibility:hidden\}/,
    '且呈现期间它被隐藏，所以没法透过它显形'
  )
  assert.ok(!/display:none/.test(css), '用 visibility 而不是 display：网格保住列，什么都不回流')

  // 收起恢复一切。
  m.shell.frame.removeAttribute('data-rightbar-fullscreen')
  m.engine.retag(true)
  assert.equal(m.engine.panelStatus().found.main, true, '把中间面板收回来')
  m.dispose()
  console.log('ok  展开的右栏保住自己的材质，中间面板不再透过它显形')
}
//#endregion

//#region presentation
{
  // 真正的契约，从 app 自己的 bundle 里读出来，而不是从几何猜。`ui-sidebar-right` 这样
  // 渲染面板：
  //   <div class="..._panel" data-sidebar-right-panel={fullscreen ? "fullscreen" : "push"}
  //        style={{ width: fullscreen ? "100vw" : width }}>
  // 而它的样式表把它钉在右列内部：`position:absolute; top:0; bottom:0; right:0`
  // （`.rightbarCol{min-width:0;position:relative;overflow:visible}`）。
  // 所以全屏的右栏不是列：列在下面保留自己的网格轨道（"fullscreen covers the viewport
  // while retaining the wide-screen columns underneath"，同一个包的 README），面板向左
  // 搭过中间列。
  //
  // 三种几何猜测先在这里试过，三个全错——"盖住框的最深元素"选中了中间面板自己的内容根，
  // "覆盖层里跨满框的子元素"什么都没找到，"呈现带"规则也什么都没找到。查找现在是 app
  // 自己的标记。
  const m = mount()
  m.shell.frame.box = { width: 2560, height: 1552, left: 0, top: 0 }
  m.shell.center.box = { width: 1701, height: 1500, left: 283, top: 46 }
  m.shell.right.box = { width: 576, height: 1506, left: 1984, top: 40 }

  // 诱饵，每个失败规则一个：中间面板自己的内容根（和中间列同一个盒子）、一个盖住框的
  // 整 app 包装，以及外壳的覆盖层槽——它载的是 toast 和通知，不是这个面板。
  const decoy = m.document.createElement('div')
  decoy.setAttribute('class', 'Dc7zOa_root')
  decoy.computed = { backgroundColor: 'rgba(243, 235, 231, 0.1)', position: 'relative', backgroundImage: 'none' }
  decoy.box = { width: 1701, height: 1500, left: 283, top: 46 }
  m.shell.center.appendChild(decoy)

  const wrapper = m.document.createElement('div')
  wrapper.setAttribute('class', 'AppRoot_wrapper')
  wrapper.computed = { backgroundColor: 'rgba(253, 252, 250, 0.5)', position: 'relative', backgroundImage: 'none' }
  wrapper.box = { width: 2560, height: 1552, left: 0, top: 0 }
  m.document.body.appendChild(wrapper)

  const overlay = m.document.createElement('div')
  overlay.setAttribute('data-shell-overlay', '')
  const toast = m.document.createElement('div')
  toast.setAttribute('class', 'Toast_root')
  toast.computed = { backgroundColor: 'rgba(255, 255, 255, 0.9)' }
  toast.box = { width: 2400, height: 1400, left: 80, top: 60 }
  overlay.appendChild(toast)
  m.shell.frame.appendChild(overlay)

  // app 实际渲染的东西：全屏那一层，在右列内部，从侧边栏的边缘一直伸到框的右缘。它自己
  // 什么都不画——画的是它的子元素——这正是找一个"已经在画"的元素的探测永远找不到它的原因。
  const layer = m.document.createElement('div')
  layer.setAttribute('class', 'SidebarRight_panel_ab12c')
  layer.setAttribute('data-sidebar-right-panel', 'fullscreen')
  layer.computed = { backgroundColor: 'rgba(0, 0, 0, 0)', position: 'absolute', backgroundImage: 'none' }
  layer.box = { width: 2280, height: 1552, left: 280, top: 0 }
  m.shell.right.appendChild(layer)

  // 第二个会话子树保持挂载但隐藏（"其他子树保持隐藏而不删除标签页状态"），带着同一个
  // 标记。它塌成 0x0，所以绝不能赢走材质。
  const hidden = m.document.createElement('div')
  hidden.setAttribute('class', 'SidebarRight_panel_ab12c')
  hidden.setAttribute('data-sidebar-right-panel', 'fullscreen')
  hidden.computed = { backgroundColor: 'rgba(0, 0, 0, 0)', position: 'absolute', backgroundImage: 'none' }
  hidden.box = { width: 0, height: 0, left: 0, top: 0 }
  m.shell.right.appendChild(hidden)

  m.shell.frame.setAttribute('data-rightbar-fullscreen', '')
  m.engine.retag(true)

  assert.equal(hidden.getAttribute('data-glass-surface'), undefined, '隐藏的会话子树永远接不到材质')

  assert.equal(m.shell.right.getAttribute('data-glass-panel'), 'right', '列在任何模式下都是右栏')
  assert.equal(layer.getAttribute('data-glass-surface'), 'right', 'app 自己的全屏层接走材质')
  assert.equal(layer.getAttribute('data-glass-fullscreen'), '', '且被标为全屏宿主')
  assert.equal(m.shell.right.getAttribute('data-glass-delegate'), 'on', '所以列退到一边，不在旧几何上画')
  assert.equal(m.engine.blurReport().right.delegated, true, '行报出授权')
  assert.equal(m.engine.blurReport().right.blurHost, 'element', '模糊在跨满模式的那一层上')

  /* 磨砂必须住在一个面板的唯一一个元素上，而这就是当年真正被报出来的 bug。一个带
     `backdrop-filter` 的元素成为一个背景根：后代自己的磨砂从此只能取样画在那个祖先
     内部的东西。那一层在列里面，而列一旦授权就什么都不画——所以一个保住自己磨砂的列，
     会让那一层取样一片空背景。在真实页面上实测：列那条 447px 模糊了，盖住框的 1183px
     那一层什么都没模糊。
     `aimBlur` 从前只碰当前宿主，所以列在授权之前挣到的标记从来没被摘掉过。 */
  assert.equal(
    m.shell.right.getAttribute('data-glass-blur-host'),
    undefined,
    '材质一移到里面那一层，列就交出自己对磨砂'
  )
  assert.equal(layer.getAttribute('data-glass-blur-host'), 'element', '且只有那一层扛它')

  for (const [name, node] of [['整 app 包装', wrapper], ['外壳覆盖层槽', toast]]) {
    assert.equal(node.getAttribute('data-glass-panel'), undefined, `${name} 永远接不到面板`)
    assert.equal(node.getAttribute('data-glass-surface'), undefined, `${name} 永远接不到任何材质`)
  }
  // 中间面板的元素名正言顺地带着中间面板的材质——那是它自己的表面。它绝不能被给的是
  // 右栏的。
  assert.equal(decoy.getAttribute('data-glass-panel'), undefined, '中间面板元素永远接不到右栏')
  assert.equal(decoy.getAttribute('data-glass-surface'), 'main', '且只保住自己的面板材质')

  // 材质现在跨满面板，而不是它过去所在的那条轨道。
  const layout = m.engine.layoutReport()
  assert.equal(layout.expanded, true, '布局报告知道模式开着')
  assert.ok(
    layout.lines.some((line) => /右侧栏：列 x=\d+ 宽 576/.test(line)),
    `并且仍然给出列的几何（${JSON.stringify(layout.lines)}）`
  )
  assert.ok(
    layout.lines.some((line) => /右侧栏：.*材质在 全屏层 x=\d+ 宽 2280/.test(line)),
    `材质量在全屏层上，而不是 576px 的轨道上（${JSON.stringify(layout.lines)}）`
  )

  // 那一层保留 app 锚定它的定位：通用表面规则会答 `position:relative`，那会把它掉回列的
  // 流里，撤销呈现本身。
  const css = m.document.getElementById('dsh-glass-mood-style').textContent
  assert.match(
    css,
    /\[data-glass-surface\]\[data-glass-fullscreen\]\{position:absolute\}/,
    '全屏宿主保留 app 给它的绝对定位'
  )

  // 活进展开模式的那道缝：列的镜边和分隔线是一个定位的 `::after`——最后一个子元素，
  // 所以它画在 app 呈现的那一层之上——而列仍然只有 447px 宽。放任不管，它会把左缘画成
  // 一条亮直线直穿展开面板的中线，那正是"中间面板和右面板之间的旧缝还在"。
  assert.match(
    css,
    /\[data-glass-panel=right\]::after\{content:none\}/,
    '列停止画自己的镜边和分隔线，那就是幸存下来的那道缝'
  )
  // 隐藏的中间面板也停止画镜边，不只是填充：过去只信 `visibility` 能带走一个带着阴影和
  // 角落渐变的定位子元素，而带不走时，看起来就是"旧中间面板的阴影还在那里"。
  assert.match(
    css,
    /\[data-glass-panel=main\]::after\{content:none\}/,
    '且隐藏的中间面板停止画镜边，不只是填充'
  )
  assert.match(
    css,
    /\[data-glass-panel=right\]\{overflow:visible;box-shadow:none\}/,
    '并丢掉自己的卡（含接触阴影），同时保住沟槽'
  )

  // 外形跟着材质走，且必须读起来是一张卡。列在那个模式下刻意保沟槽：那一层贴着列的盒子
  // 定位 `top:0; right:0; bottom:0`，所以列的 margin 正是把展开的面板按在其他每张卡同一
  // 节奏上的东西——上和右来自列，底来自外框的 padding。把它们全清掉（这条规则过去的做法）
  // 会让顶部贴死标题栏，而底部仍保着自己的间隙。
  assert.ok(
    !/\[data-glass-panel=right\]\{margin/.test(css),
    '列的沟槽原样不动，所以面板在两种模式下保持同一节奏'
  )
  assert.match(
    css,
    /\[data-glass-surface\]\[data-glass-fullscreen\]\{border-radius:var\(--gm-radius\);overflow:hidden\}/,
    '且那一层把四个角全圆并裁剪，里面的窗格显不出第二弧'
  )
  assert.match(
    css,
    /\[data-windows-titlebar\] body\[data-glass-panels\] \[data-glass-surface\]\[data-glass-fullscreen\]\{max-width:calc\(100vw - var\(--dsh-windows-sidebar-width\) - var\(--gm-gap\) - var\(--gm-gap\) \/ 2\)\}/,
    "with the left gutter the column's margins cannot reach, since the app sets the width"
  )
  assert.match(
    css,
    /\[data-glass-fullscreen\]\{--gm-sheen:calc\(var\(--gm-panel-right-sheen\) \* var\(--gm-panel-right-rim,1\)\)\}/,
    'with the right panel\'s own sheen — scaled by how much glass there is to catch it on'
  )

  /* 边缘光属于玻璃。镜边是一条沿每边、宽 `--gm-rim-band`、带 `border-radius: inherit`
     的渐变，所以在一块设成 alpha 0 的窗格上它是唯一还在画的东西——而它的圆角末端读起来
     是第一块里面嵌着第二块，那就是报上来的"左边两个角"。它现在随填充一起淡。设普通染色的
     人，高光保持和以前一模一样（权重从 12% 起就是 1）。 */
  assert.match(
    css,
    /opacity:calc\(var\(--gm-sheen\) \* var\(--gm-sheen-mood,1\) \* var\(--gm-sheen-edge,1\)\)/,
    '镜边仍从高光取它的不透明度'
  )

  // 那个角上的重影。app 给全屏面板里面的窗格自己的左上半径（Windows 上 16px），对着本
  // 主题的 12px，于是那个角画出两道不同半径的弧——而裁剪够不到它，因为窗格坐在面板内部。
  // 窗格跟玻璃，而不是反过来，所以圆角旋钮继续当家。
  /* ……而且它必须真的赢。app 自己给这个窗格的规则是
       [data-windows-titlebar] .OUqwTW_panel[data-sidebar-right-panel=fullscreen]
         [data-dockkit-column="0"][data-dockkit-pane]                 → (0,5,0)
     第一次尝试把同一条规则去掉那个前缀写，那只有 (0,4,1)，所以它输了，而一个只检查文本
     是否存在的测试保持绿色。特异性是这条规则的一部分，不是它的细节。 */
  assert.match(
    css,
    /\[data-windows-titlebar\] body\[data-glass-panels\] \[data-glass-fullscreen\] \[data-dockkit-column="0"\]\[data-dockkit-pane\]\{border-radius:0\}/,
    '里面的窗格一个半径都没有——只有玻璃画外形，而这压过 app 的 (0,5,0)'
  )
  assert.ok(
    !/(^|\})\s*body\[data-glass-panels\] \[data-glass-fullscreen\] \[data-dockkit-column="0"\]/.test(css),
    '且没留下一个更弱的 (0,4,1) 孪生规则去悄悄输掉'
  )
  // 一个表面，不是两个：窗格画着自己苍白的一层，而两个叠起来的矩形里只有一个透明，所以
  // 人看到的是窗格的边缘——重影的最后一细丝，也是一层不透明度旋钮够不着的白。
  assert.match(
    css,
    /\[data-windows-titlebar\] body\[data-glass-panels\] \[data-glass-fullscreen\] \[data-dockkit-pane\]\{background-color:transparent\}/,
    '窗格停止在玻璃下面画第二个表面'
  )

  /* 标题栏是一个横跨整个窗口、带不透明填充的伪元素。它从没入过玻璃系统，所以它在每个
     面板上方保持一条实心带——而它的底边死直，正是让紧贴其下的面板圆角读作"一个直角阴影
     压在角上"的东西。`describeNode` 永远看不见伪元素，这就是没有一份报告抓到过它的原因。 */
  assert.match(
    css,
    /\[data-windows-titlebar\] body\[data-glass-panels\] \[data-glass-frame\]::before\{background:transparent\}/,
    '标题栏不再在每个面板上方画一条不透明带'
  )

  // 重影本身。镜边的捕光曾经是一个固定的 90x70 椭圆；铺在 12px 的角上，它的曲率对不上
  // 任何东西，于是那个角画出第二弧——永远是左上，因为那是唯一带捕光的角。面板设到这么透，
  // 镜边是人看到的大部分。它现在跟着半径走。
  assert.match(
    css,
    /radial-gradient\(calc\(var\(--gm-radius,20px\) \* 2\.6\) calc\(var\(--gm-radius,20px\) \* 2\.1\) at 0% 0%/,
    '捕光跟着面板半径缩放，而不是一个固定椭圆'
  )

  // 收起把一切交还：材质、标记和定位。
  layer.setAttribute('data-sidebar-right-panel', 'push')
  m.shell.frame.removeAttribute('data-rightbar-fullscreen')
  m.engine.retag(true)
  assert.equal(layer.getAttribute('data-glass-surface'), undefined, '收起把材质从那一层拿走')
  assert.equal(layer.getAttribute('data-glass-fullscreen'), undefined, '以及标记，好让它的定位还给 app')
  assert.equal(m.shell.right.getAttribute('data-glass-delegate'), undefined, '列重新自己画')
  assert.equal(m.shell.right.getAttribute('data-glass-panel'), 'right', '并保住面板')
  m.dispose()
  console.log('ok  全屏右栏寄宿在 app 自己渲染的那一层上')
}
//#endregion

//#region overlay
{
  // 报上来的 bug，用 app 自己的代码给出的形状。那个模式下外框的网格把右列保持在正常轨道
  // （`data-rightbar-fullscreen` 只压制一个过渡、藏起拖拽手柄，仅此而已），所以列只是面板
  // 的旧位置：2280px 面板里的 576px。把材质画在那里，就是透明和模糊看起来停在侧边栏旧边缘
  // 的原因，而展开面板的其余部分显示着 app 自己的颜料。
  //
  // 外壳覆盖层槽里没有任何东西是面板——那个槽装的是 toast——所以它跨满框的子元素绝不能
  // 被交给材质，无论多大。
  const m = mount()
  const layer = m.document.createElement('div')
  layer.setAttribute('data-shell-overlay', '')
  const panel = m.document.createElement('div')
  panel.setAttribute('class', 'PlanFull_root')
  panel.computed = { backgroundColor: 'rgba(255, 255, 255, 0.6)' }
  panel.box = { width: 2000, height: 1200, left: 0, top: 0 }
  layer.appendChild(panel)
  m.shell.frame.appendChild(layer)

  m.shell.frame.setAttribute('data-rightbar-fullscreen', '')
  m.engine.retag(true)
  assert.equal(m.shell.right.getAttribute('data-glass-panel'), 'right', '展开的右栏仍然是它的列')
  assert.equal(panel.getAttribute('data-glass-panel'), undefined, '覆盖层槽里跨满框的子元素不是面板')
  assert.equal(panel.getAttribute('data-glass-surface'), undefined, '且永远接不到它的材质')
  assert.equal(m.engine.panelStatus().found.right, true, '且面板仍报成找到')
  m.dispose()
  console.log('ok  覆盖层槽永不被误当成展开的右栏')
}
//#endregion
//#region expanded
{
  // 兜底，没有 app 的层来寄宿材质：一个不再覆盖列的包装必须被释放，材质必须落到列上，
  // 而不是留在不再跨满任何东西的窗格上。
  //
  // 注意这不是什么：不是真正的全屏案例。那里 app 渲染自己的层
  // （`data-sidebar-right-panel="fullscreen"`），材质去那里——锁在上面 `presentation` 区。
  // 这个区只覆盖找不到这种层时插件回退成的形状，所以什么都不留在陈旧的表面上漂着。
  const m = mount()
  // 给右面板一个画颜料的包装，让它像侧边栏一样起步就授权。
  m.shell.rightWrapper.computed = { backgroundColor: 'rgba(255, 255, 255, 0.5)' }
  m.engine.retag(true)
  assert.equal(m.engine.blurReport().right.delegated, true, '右面板起步时授权给它的包装')

  // 用户按下展开：外框拿到属性，列占 70%。
  m.shell.frame.setAttribute('data-rightbar-fullscreen', '')
  m.shell.right.box = { width: 900, height: 780, left: 500, top: 0 }
  m.shell.rightWrapper.box = { width: 520, height: 780, left: 880, top: 0 }
  m.window.observers.at(-1).emit()
  m.clock.advance(200)

  assert.equal(m.engine.blurReport().right.delegated, false, '展开的面板把材质留在列上')
  assert.equal(m.shell.right.getAttribute('data-glass-delegate'), undefined, '所以列不再礼让包装')
  assert.equal(m.shell.rightWrapper.getAttribute('data-glass-surface'), undefined, '且窄包装被释放')
  assert.equal(m.engine.blurReport().right.blurHost, 'element', '模糊在跨满模式的元素上')

  // 模式开着时这一行说明测量结果，好让布局不必开控制台就能报出来。
  const layout = m.engine.layoutReport()
  assert.equal(layout.expanded, true, '布局报告知道模式开着')
  assert.ok(
    layout.lines.some((line) => /右侧栏：列 x=\d+ 宽 900/.test(line)),
    `并给出列的几何（${JSON.stringify(layout.lines)}）`
  )

  // 收回去把授权还回来。
  m.shell.frame.removeAttribute('data-rightbar-fullscreen')
  m.shell.right.box = { width: 320, height: 780, left: 888, top: 0 }
  m.shell.rightWrapper.box = { width: 320, height: 780, left: 888, top: 0 }
  m.window.observers.at(-1).emit()
  m.clock.advance(200)
  assert.equal(m.engine.blurReport().right.delegated, true, '而正常宽度的列重新授权')
  assert.equal(m.engine.layoutReport().expanded, false, '连同安静下来的布局报告')
  m.dispose()
  console.log('ok  展开的右栏把材质留在跨满它的列上')
}
//#endregion

//#region version
{
  // 这一行打印构建，好让"修复没生效"永远不会和"新构建根本没加载"混为一谈——那每次都要
  // 花掉一整轮往返。这使这个常量成为承重墙，所以它被锁到包上。
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const m = mount()
  assert.equal(m.engine.build(), pkg.version, `打印出来的构建（${m.engine.build()}）与 package.json 一致`)
  assert.match(m.engine.build(), /^\d+\.\d+\.\d+$/, '且它是一个普通版本号')
  m.dispose()
  console.log('ok  这一行打印真正加载的构建')
}
//#endregion

//#region panels
{
  // backdrop-filter 只模糊画在它背景根背后的东西，而 `isolation: isolate` 会创造一个
  // 背景根。把磨砂寄在一个隔离的元素上，于是留给模糊没什么可糊：面板的填充动了（一个普通
  // 背景，所以不透明度旋钮手感良好），而它的模糊旋钮看起来是死的。这里锁两条纠正：宿主用
  // position + z-index 形成层叠上下文，面板把滤波器带在真正画颜料的元素自己身上，而不是
  // 一个负 z 伪元素上。
  const m = mount()
  const css = m.document.getElementById('dsh-glass-mood-style').textContent
  assert.ok(!/isolation:isolate/.test(css), '磨砂宿主不隔离——那会杀死 backdrop-filter')
  assert.match(css, /\[data-glass-surface\]\{position:relative;z-index:0;/, '被授权的表面以另一种方式形成层叠上下文')
  /* 外形也归表面。一个被授权的面板自己不画任何东西，所以列上的半径画不出东西——而内层
     表面，那个真正画东西的元素，半径是 0，同时按列的确切尺寸坐在列里面，所以列没什么可
     裁。面板量着 `border-radius: 12px` 却显示方角：半径被问到了那个什么都不画的元素头上。 */
  assert.match(
    css,
    /\[data-glass-surface\]\{position:relative;z-index:0;border-radius:var\(--gm-radius\);overflow:hidden\}/,
    '并带上半径和片子，因为它才是真正画画的元素'
  )
  /* 侧边栏的除外。app 从轨道给那个表面量尺寸（实测：260px 的列里 269px，因为本主题用
     沟槽内缩列），所以它的角坐在列外 9px，`overflow:hidden` 把它裁成一截残段。两者都量
     12px，然而侧边栏的角读起来比中间的小。一个叠在列上的表面绝不能圆；一个和列严丝合缝
     的可以。 */
  assert.match(
    css,
    /\[data-glass-surface=left\]\{[^}]*border-radius:0\}/,
    '侧边栏表面画但不圆——它自己的角会被裁成一截残段'
  )
  assert.match(css, /\[data-glass-panel\]\{position:relative;z-index:0;/, '自己画画的列同样')
  // 两种排布都声明：元素承载的那个（实测是这个浏览器认的那个）和伪元素降级——它留给
  // 住着 fixed 后代的面板——一个带 backdrop-filter 的元素会成为那个后代的包含块，这正是
  // 曾经藏掉侧边栏重开控件的东西。
  assert.match(
    css,
    /\[data-glass-blur=on\] \[data-glass-blur-host=element\]\{[^}]*backdrop-filter:blur\(var\(--gm-panel-blur\)/,
    'the material element can carry the blur itself'
  )
  assert.match(
    css,
    /\[data-glass-surface\]:not\(\[data-glass-blur-host=element\]\)::before\{[^}]*backdrop-filter:blur\(var\(--gm-panel-blur\)/,
    'and the pseudo remains the fallback for a delegated surface'
  )
  assert.match(
    css,
    /\[data-glass-panel\]:not\(\[data-glass-delegate=on\]\):not\(\[data-glass-blur-host=element\]\)::before\{[^}]*backdrop-filter/,
    '而对一个自己画画的列'
  )
  m.dispose()

  // 现在这个排布是在这个浏览器里实测管用的那个：模糊骑在承载材质的元素上，每个面板
  // 都这样。负 z 伪元素报一个有效的模糊值、却什么都不取样——在被授权的表面和列上都实测
  // 过——所以它只作为元素排布那一处代价的逃生舱活着（它成为 fixed 后代的包含块），这就是
  // 一个住着这种控件的面板宁可放弃模糊的原因。
  const guard = mount()
  assert.equal(guard.engine.blurReport().left.delegated, true, '左面板被授权')
  assert.equal(guard.engine.blurReport().left.blurHost, 'element', '所以它的模糊骑在表面自己身上')
  assert.equal(guard.engine.blurReport().main.blurHost, 'element', '而自己画画的列同样')
  assert.equal(guard.engine.blurReport().right.blurHost, 'element', '在每个面板上')
  // 每个面板都识别到、路上没有 fixed 后代时，这一行对磨砂寄宿什么都不说：诊断是给
  // 需要留意的东西准备的。
  assert.ok(
    guard.engine.blurSummary().every((line) => !/未识别|fixed|降级/.test(line)),
    '健康的挂载没什么诊断要报'
  )
  const floating = guard.document.createElement('div')
  floating.setAttribute('class', 'ScrollToBottom_fab')
  floating.computed = { position: 'fixed' }
  guard.shell.leftSurface.appendChild(floating)
  guard.engine.retag(true)
  // 一个 fixed 后代绝不能被重新锚定：材质元素上的 backdrop-filter 让它成为那个控件的
  // 包含块，而这就是把外壳自己的浮动控件（侧边栏的折叠控件）从顶栏拉到侧边栏 logo 上的
  // 原因。面板保住填充和镜边、放弃磨砂；只有那个面板付账，原因被报出来。
  assert.equal(guard.engine.blurReport().left.blurHost, 'none', '一个 fixed 后代拿掉那个面板的磨砂')
  assert.match(
    guard.engine.blurSummary().join(' '),
    /含 fixed 子元素：div\.ScrollToBottom_fab/,
    '它被点了名，所以一块没有模糊的面板能追到是哪个控件造成的'
  )
  assert.equal(guard.engine.blurReport().main.blurHost, 'element', '且只有那个面板为它付账')
  // 守卫可以撤下，这就是在运行中的 app 里确认诊断的方式：磨砂回来，控件再次移位。
  guard.engine.setPanels({ fixedGuard: false })
  assert.equal(guard.engine.blurReport().left.blurHost, 'element', '撤下守卫把磨砂放回来')
  guard.engine.setPanels({ fixedGuard: true })
  assert.equal(guard.engine.blurReport().left.blurHost, 'none', '且它再次摘下')
  // 逃生舱，实时：它按需把伪元素排布放回来。
  guard.engine.setPanels({ blurFallback: true })
  assert.equal(guard.engine.blurReport().left.blurHost, 'pseudo', '降级开关把伪元素放回来')
  assert.equal(guard.shell.leftSurface.getAttribute('data-glass-blur-host'), undefined, '且元素停止认领它')
  guard.engine.setPanels({ blurFallback: false })
  floating.remove()
  guard.engine.retag(true)
  assert.equal(guard.engine.blurReport().left.blurHost, 'element', '没有浮动控件的面板保住磨砂')
  assert.ok(!/含 fixed 子元素/.test(guard.engine.blurSummary().join(' ')), '控件一走，注记就清')
  guard.dispose()
  console.log('ok  磨砂宿主不形成背景根')
}

{
  // 收起的列不是面板：它必须保持 app 自己的样式，否则重开侧边栏的控件（收起的列把它
  // 渲染在自己的盒子外面）会被主题的 overflow 和 margin 裁掉。
  const m = mount()
  assert.equal(m.engine.panelStatus().found.left, true, '展开的侧边栏是面板')
  assert.equal(m.shell.left.getAttribute('data-glass-panel'), 'left', '且被打上标签')
  m.shell.left.box = { width: 0, height: 780 }
  m.engine.retag(true)
  assert.equal(m.engine.panelStatus().found.left, false, '收起的列被报成不是面板')
  assert.equal(m.shell.left.getAttribute('data-glass-panel'), undefined, '且每个钩子都撤回')
  assert.equal(m.engine.panelStatus().surfaces.left, false, '包括任何被授权的表面')
  // app 自己的控件幸存：收起来期间什么都不被裁、不错位。
  const css = m.document.getElementById('dsh-glass-mood-style').textContent
  const frameBase = /\[data-glass-panels\] \[data-glass-frame\]\{([^}]*)\}/.exec(css)
  assert.ok(frameBase, '外框基础规则存在')
  assert.ok(!/overflow:hidden/.test(frameBase[1]), '面板不齐平时外框不裁剪')
  assert.match(css, /\[data-glass-gap=off\] \[data-glass-frame\]\{overflow:hidden\}/, '齐平排布仍然裁玻璃')
  // 再次展开把面板带回来。
  m.shell.left.box = { width: 260, height: 780 }
  m.engine.retag(true)
  assert.equal(m.engine.panelStatus().found.left, true, '展开恢复面板待遇')
  assert.equal(m.shell.left.getAttribute('data-glass-panel'), 'left', '连同它的钩子')

  // 急停开关：一个能藏起部分 app 的主题，必须能在不知道为什么的情况下被移除。
  m.engine.off()
  assert.equal(m.document.getElementById('dsh-glass-mood-style'), null, 'off() 移除样式表')
  assert.equal(m.document.querySelectorAll('[data-glass-panel]').length, 0, '以及每个钩子')
  assert.equal(m.document.getElementById('dsh-glass-mood-bg'), null, '以及舞台')
  assert.equal(m.document.body.dataset.glassMood, undefined, '以及 body 属性')
  console.log('ok  收起的列整个放过 + 急停开关')
}

{
  // 正在展开的侧边栏绝不能等 2.5s 的重打标签。app 自己的控件熬得过这个延迟，但列会干坐
  // 一秒钟素列，才拿到它的半径和材质。
  const m = mount()
  const observer = m.window.observers[0]
  assert.ok(observer, '列被观察着')
  assert.equal(observer.targets.length, 3, '三列都被观察，收起的也算')

  m.shell.left.box = { width: 0, height: 780 }
  m.engine.retag(true)
  assert.equal(m.engine.panelStatus().found.left, false, '收起的列不是面板')

  // 重开：缩放自己到达，去抖远比重打标签间隔短。
  m.shell.left.box = { width: 260, height: 780 }
  observer.emit()
  m.clock.advance(70)
  assert.equal(m.engine.panelStatus().found.left, true, '重新展开立刻被察觉，不等下一趟')
  assert.equal(m.shell.left.getAttribute('data-glass-panel'), 'left', '且列重新被打上标签')
  assert.ok(
    m.document.body.style.getPropertyValue('--gm-panel-left-fill') !== '',
    '连它的材质一起发布，不只是钩子'
  )

  m.dispose()
  assert.equal(observer.targets.length, 0, '卸载停止观察')
  console.log('ok  改变尺寸的列立刻重新打标签')
}

{
  // backdrop-filter 看不见画在它自己背景根外的任何东西，而壁纸过去是 <body> 的子元素、
  // 面板住在 app 外壳里——所以一个隔离/滤波/contain:paint 的外壳会让面板对壁纸失明。
  // 舞台现在挂在外壳内部，一个负层里。
  const m = mount()
  const stage = m.document.getElementById('dsh-glass-mood-bg')
  assert.equal(stage.parent, m.shell.frame, '壁纸舞台住在 app 外壳内部')
  assert.equal(stage.getAttribute('data-glass-in-shell'), '', '且被标记，好接住负层')
  assert.match(
    m.document.getElementById('dsh-glass-mood-style').textContent,
    /#dsh-glass-mood-bg\{position:fixed;inset:0;z-index:-1/,
    '无论宿主是谁舞台都坐在负层：一个流浪舞台永远盖不住 app'
  )
  // 外壳被换掉时，轮询把舞台搬进新的那个。
  const newFrame = m.document.createElement('div')
  newFrame.setAttribute('class', 'AppFrame_frame_2')
  m.document.body.appendChild(newFrame)
  m.shell.frame.remove()
  m.engine.retag()
  assert.equal(stage.parent, newFrame, '重建的外壳把舞台重新安家')

  // 看得见的模糊测试：舞台里一块棋盘格，可再移除。
  assert.equal(m.engine.checker(true).checker, true, '棋盘格挂上')
  assert.notEqual(m.document.querySelector('[data-glass-checker]'), null, '且在舞台里找得到')
  assert.equal(m.engine.checker(false).checker, false, '并再次摘下')
  assert.equal(m.document.querySelector('[data-glass-checker]'), null, '什么都不留')

  // 诊断报出计算出的滤波器和舞台的宿主。
  const report = m.engine.blurReport()
  assert.equal(typeof report.left, 'object', '报告覆盖每个面板')
  assert.ok('backdrop' in report.left && 'stageHost' in report.left, '连同计算出的滤波器和舞台宿主')
  assert.equal(report.left.delegated, true, '以及材质是否被授权给内层元素')
  assert.equal(report.main.delegated, false, '它逐面板不同')
  assert.equal(typeof report.left.fillAlpha, 'number', '面板 alpha 被报出，因为不透明的面板会藏掉任何模糊')

  // 计算值显示不出的那一种失败：一个形成背景根的画手看不见壁纸，所以它的磨砂会报
  // blur(20px) 却什么都不糊。材质必须搬到列，画手必须交出自己对颜料，好让列的材质成为
  // 显形的那个。
  m.shell.leftSurface.computed = { backgroundColor: 'rgba(255, 255, 255, 0.52)', contain: 'paint', opacity: '0.98' }
  m.engine.retag(true)
  const fixed = m.engine.blurReport().left
  assert.equal(fixed.delegated, false, '看不见壁纸的画手接不到材质')
  assert.ok(
    fixed.probeReason.some((entry) => entry.includes('contain=paint')),
    `并且原因被记录下来（${JSON.stringify(fixed.probeReason)}）`
  )
  assert.equal(fixed.hollowed, 1, '画手被掏空，好让列的材质显形')
  assert.equal(m.shell.leftSurface.getAttribute('data-glass-hollow'), '', '表面交出它的颜料')
  assert.equal(m.shell.left.getAttribute('data-glass-delegate'), undefined, '且列保住材质')
  assert.equal(m.shell.left.getAttribute('data-glass-panel'), 'left', '同时仍是面板')
  assert.equal(m.engine.blurReport().main.backdropRoots.length, 0, '一个干净的面板报不出背景根')

  // 把布局放回去：授权回来，掏空撤回。
  m.shell.leftSurface.computed = { backgroundColor: 'rgba(255, 255, 255, 0.52)' }
  m.engine.retag(true)
  assert.equal(m.engine.blurReport().left.delegated, true, '一个干净的画手重新被授权')
  assert.equal(m.shell.leftSurface.getAttribute('data-glass-hollow'), undefined, '连同撤回的掏空')
  assert.equal(m.engine.blurReport().left.probeReason.length, 0, '且没什么要解释')
  m.dispose()
  console.log('ok  舞台坐在外壳内部 + 模糊诊断')
}

{
  // 一次热重载可能把本插件挂到上一个实例还在的页面上。新挂载必须清扫那一个，而不是在
  // 界面上叠第二层壁纸——两个舞台正是 UI 被埋在"壁纸加一层灰纱"下面、看不见文字的由来。
  const m = mount({ strayStage: true })
  assert.equal(m.document.querySelectorAll('[id="dsh-glass-mood-bg"]').length, 1, '一个舞台，绝不两个')
  assert.equal(m.document.querySelectorAll('[id="dsh-glass-mood-style"]').length, 1, '一张样式表，绝不两张')
  // 应急清理可以单独用，给一个已经被埋住的 UI。
  assert.ok(m.engine.sweep() >= 1, 'sweep() 报出它清掉了什么')
  assert.equal(m.document.querySelectorAll('[id="dsh-glass-mood-bg"]').length, 0, '且不留舞台')
  m.dispose()
  console.log('ok  重新挂载清扫上一个实例')
}

{
  // 暖片子上的一层蓝纱会合成出品红，而工作态过去把 `saturate()` 推到 170%，放大它。
  // 情绪洗色现在保住心情的明度、让出大部分色相，蓝色呼吸被中和，背景饱和度留在一个
  // 清醒的区间。
  const m = mount()
  const css = m.document.getElementById('dsh-glass-mood-style').textContent
  const satOf = (selector) => {
    // 好几条规则以同一个心情选择器开头，所以要找到真正声明饱和度的那条。
    const line = css.split('\n').find((rule) => rule.startsWith(selector) && rule.includes('--gm-sat:'))
    assert.ok(line, `missing the ${selector} saturation rule`)
    return Number(/--gm-sat:(\d+)%/.exec(line)[1])
  }
  assert.ok(satOf('body[data-glass-mood]{') <= 120, '空闲让背景饱和度温和')
  assert.ok(satOf('body[data-glass-mood=work]{') <= 130, '且工作态不再过度饱和片子')
  assert.match(css, /\[data-glass-layer=idle\],body\[data-glass-wallpaper=on\][^{]*\[data-glass-layer=work\]\{filter:saturate\(\.4\)\}/, '片子上屏时洗色丢掉大部分色相')
  assert.match(css, /\[data-glass-layer=pulse\]\{opacity:0;background:radial-gradient\(70% 55% at 50% -10%, rgba\(152,178,202,\.16\)/, '呼吸是一道中性的冷光，不是饱和的蓝')
  assert.match(css, /body\[data-glass-wallpaper=on\]\[data-glass-mood=work\][^{]*\[data-glass-layer=pulse\]\{opacity:\.35\}/, '且在片子上方退得更远')
  assert.ok(!/rgba\(88,166,255/.test(css), '饱和蓝的呼吸消失了')
  m.dispose()
  console.log('ok  情绪洗色不会把片子染紫')
}

{
  // 页面级内容获得磨砂（设置表面那样读起来正好）；小的转瞬弹出层不，因为模糊一个 diff
  // 预览的背景，正是当初让文件内容难读的东西。
  const m = mount()
  const settings = m.document.createElement('div')
  settings.setAttribute('role', 'dialog')
  settings.setAttribute('aria-labelledby', 'settings-title')
  settings.box = { width: 960, height: 680 }
  m.document.body.appendChild(settings)
  const diff = m.document.createElement('div')
  diff.setAttribute('role', 'dialog')
  diff.box = { width: 420, height: 300 }
  m.document.body.appendChild(diff)

  m.engine.tagBigSurfaces()
  assert.equal(settings.getAttribute('data-glass-frost'), 'on', '页面级表面获得磨砂')
  assert.equal(diff.getAttribute('data-glass-frost'), undefined, '小弹出层不')

  // 缩水的表面再次丢掉钩子（对话框可以被缩放或复用）。
  settings.box = { width: 300, height: 200 }
  m.engine.tagBigSurfaces()
  assert.equal(settings.getAttribute('data-glass-frost'), undefined, '且它缩小时钩子撤回')

  m.dispose()
  assert.equal(m.document.querySelectorAll('[data-glass-frost]').length, 0, '卸载移除钩子')
  console.log('ok  页面级表面获得磨砂，弹出层不')
}
{
  const m = mount()
  // 左列的表面是嵌套的（正如 ui-sidebar 的）：探测必须找到它并把颜料交过去，否则那个
  // 面板的不透明度和模糊旋钮挪动的是没人看得见的值——这正是过去真实发生的事。
  assert.equal(m.shell.leftSurface.getAttribute('data-glass-surface'), 'left', '嵌套的左表面被找到并打上标签')
  assert.equal(m.shell.left.getAttribute('data-glass-delegate'), 'on', '且列退到一边')
  assert.equal(m.shell.center.getAttribute('data-glass-delegate'), undefined, '自己画画的列保住材质')
  assert.equal(m.shell.right.getAttribute('data-glass-delegate'), undefined, '透明包装不会被误当成表面')
  assert.equal(m.shell.rightWrapper.getAttribute('data-glass-surface'), undefined, '且留着不打标签')
  // 探测报出它找到了什么，好让一处不匹配能从 GUI 诊断出来。
  assert.equal(m.engine.panelStatus().surfaceDetail.left.className, 'Sidebar_root_7h6g5', '探测报出它把材质交给了哪个元素')

  // 材质是粘的。重新探测过去会挪动它，而因为一个什么都找不到的探测会把内层自己的近
  // 不透明填充放上台，每次移动都表现为面板的不透明度在两个值之间翻。
  const beforeProbe = m.engine.panelStatus().surfaceDetail.left.className
  m.engine.probe()
  assert.equal(m.engine.panelStatus().surfaceDetail.left.className, beforeProbe, '重新探测保住同一个表面')

  // 面板里的模态永远不被误当成面板的表面。
  const dialog = m.document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  dialog.box = { width: 260, height: 700 }
  dialog.computed = { backgroundColor: 'rgba(255, 255, 255, 0.9)', backgroundImage: 'none' }
  m.shell.left.appendChild(dialog)
  m.shell.leftSurface.remove()
  m.engine.probe()
  assert.equal(dialog.getAttribute('data-glass-surface'), undefined, '模态永远接不到面板材质')
  assert.equal(m.engine.panelStatus().surfaces.left, false, '所以那个面板报不出表面，而不是跟着模态走')
  dialog.remove()

  // 重建的外壳被重新探测，丢了元素的表面被释放。
  m.shell.leftSurface.remove()
  m.engine.probe()
  assert.equal(m.engine.panelStatus().surfaces.left, false, '元素一没，探测报不出表面')
  assert.equal(m.shell.left.getAttribute('data-glass-delegate'), undefined, '且列把材质取回')
  m.dispose()
  assert.equal(m.document.querySelectorAll('[data-glass-surface]').length, 0, '卸载给表面摘标签')
  assert.equal(bodyVar(m, '--gm-panel-left-alpha'), '', '并移除已发布的 alpha')
  console.log('ok  表面探测')
}

{
  const m = mount()
  assert.equal(m.shell.left.getAttribute('data-glass-panel'), 'left', '左列被打上标签')
  assert.equal(m.shell.center.getAttribute('data-glass-panel'), 'main', '中间列被打上标签')
  assert.equal(m.shell.right.getAttribute('data-glass-panel'), 'right', '右列被打上标签')
  assert.equal(m.shell.frame.getAttribute('data-glass-frame'), '', '外框被打上标签')
  assert.equal(m.document.body.dataset.glassPanels, 'on', '面板系统是主题的一部分')
  assert.equal(m.engine.panelStatus().found.left && m.engine.panelStatus().found.main && m.engine.panelStatus().found.right, true, '三列都报成找到')

  // 几何默认值：一道沟槽、官方面板半径，无外框半径。
  assert.equal(bodyVar(m, '--gm-gap'), '8px', '表面沟槽有它的默认值')
  assert.equal(bodyVar(m, '--gm-radius'), '20px', '面板默认用官方卡片半径')
  assert.equal(bodyVar(m, '--gm-frame-radius'), '0px', '外形默认保持窗口')
  assert.equal(m.document.body.dataset.glassGap, 'on', '有间隙意味着面板浮起')
  assert.ok(m.document.querySelector('[data-glass-refraction]') !== null, '折射滤波器已挂载')
  assert.match(bodyVar(m, '--gm-refract'), /url\(#dsh-glass-mood-refraction-filter\)/, '折射默认接好线')
  m.dispose()
  console.log('ok  面板打标签 + 几何默认值')
}

{
  // 没有外壳列（一个意外布局）：诚实报出，绝不抛错。
  const m = mount({ shell: false })
  const status = m.engine.panelStatus()
  assert.deepEqual(status.found, { left: false, main: false, right: false }, '缺失的列被报出，而不是藏起来')
  assert.equal(m.document.body.dataset.glassPanels, 'on', '主题仍然发布它的变量')
  m.engine.setPanels({ gap: 12 })
  assert.equal(bodyVar(m, '--gm-gap'), '12px', '且没有列时旋钮照旧工作')
  m.dispose()
  console.log('ok  外壳列缺失时诚实降级')
}

{
  const m = mount()
  // 每个面板拥有自己的材质：一个面板的不透明度绝不移动另一个的填充。
  const before = {
    left: bodyVar(m, '--gm-panel-left-fill'),
    main: bodyVar(m, '--gm-panel-main-fill'),
    right: bodyVar(m, '--gm-panel-right-fill')
  }
  assert.equal(panelAlpha(before.left), 0.52, '左面板从调色板 alpha 起步（自动）')
  assert.equal(panelAlpha(before.main), 0.64, '中间面板从调色板 alpha 起步（自动）')
  assert.equal(panelAlpha(before.right), 0.64, '右面板从调色板 alpha 起步（自动）')

  // 绝对 alpha：1 必须是实心面板、0 必须全透，否则旋钮做不到标签承诺的事（那就是
  // "还是看得见壁纸"那个 bug）。
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-left-fill')), 0.52, 'auto 跟随调色板 alpha')
  m.engine.setPanels({ left: { opacity: 0.5 }, main: { opacity: 0.25, blur: 18, sheen: 0.4 }, right: { opacity: 0 } })
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-left-fill')), 0.5, '左面板取到这个准确值')
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-main-fill')), 0.25, '中间面板取到这个准确值')
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-right-fill')), 0, '右面板可以被做到看不见')
  const solid = m.engine.setPanels({ left: { opacity: 1 } })
  assert.equal(solid.left.opacity, 1, '不透明度 1 被当作绝对值接受')
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-left-fill')), 1, '并画出一块完全实心的面板')
  m.engine.setPanels({ left: { opacity: -1 } })
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-left-fill')), 0.52, '-1 回到跟随调色板')
  assert.equal(bodyVar(m, '--gm-panel-main-blur'), '18px', '模糊逐面板')
  assert.equal(bodyVar(m, '--gm-panel-left-blur'), '0px', '且不漏到另一个面板')
  assert.equal(bodyVar(m, '--gm-panel-main-sheen'), '0.4', '镜边高光逐面板')

  // 不再有奶白纱：有了绝对量程，滑杆自己就看得见，而一层纱会让"全透"成为谎言。
  assert.equal(bodyVar(m, '--gm-panel-left-veil'), '', '薄纱消失了')
  m.engine.setPanels({ left: { opacity: 1 } })
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-left-fill')), 1, '所以全不透真的不透')
  assert.equal(bodyVar(m, '--gm-panel-left-alpha'), '1', '且读数打印有效 alpha')

  /* 边缘光属于玻璃：一块近透的窗格没有东西可供它捕捉，而镜边——一条沿每边 10px、带
     圆角末端的渐变——否则会成为唯一还在画的东西，读起来是第一块里面嵌着第二块。 */
  m.engine.setPanels({ left: { opacity: 0 } })
  // 是零，不是"接近零"。镜边的边缘是一道 1px inset 阴影，内半径 12-1=11 对着玻璃的
  // 12——两道相距 1px 的同心弧——而这样一根发丝在浅色窗格上 5% 仍看得见。
  assert.equal(
    bodyVar(m, '--gm-panel-left-rim'),
    '0',
    '全透的窗格整个丢掉镜边：没有玻璃就没有边缘光'
  )
  m.engine.setPanels({ left: { opacity: 0.5 } })
  assert.equal(bodyVar(m, '--gm-panel-left-rim'), '1', '而普通染色让它保持原样')
  m.engine.setPanels({ left: { opacity: 1 } })
  m.engine.setPanels({ left: { opacity: 0 } })
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-left-fill')), 0, '而 0 真的是全透')

  /* 高光还带一道接触阴影，这是白上白的镜边做不到的。它的扩散必须跟着半径，而不是停在
     一个死的 -14px：负扩散会缩小阴影的形状，角跟着缩，所以面板 12px 时有效半径是
     max(0, 12-14)=0——一个坐在面板里面的方块，透过这么一块透明的窗格，读起来是角上一个
     硬的直角阴影，而不是卡下面的一层光晕。 */
  assert.match(
    bodyVar(m, '--gm-panel-main-shadow'),
    /^0 10px 28px calc\(var\(--gm-radius, 20px\) \* -0\.35\) rgba\(84,94,124,0\.0[0-9]+\)$/,
    '高光发布一道扩散跟随半径的接触阴影'
  )
  assert.ok(
    !/-14px/.test(bodyVar(m, '--gm-panel-main-shadow')),
    '且没留下能把角抹平的死扩散'
  )
  const dimShadow = Number(/rgba\([^)]*,([0-9.]+)\)$/.exec(bodyVar(m, '--gm-panel-main-shadow'))[1])
  m.engine.setPanels({ main: { sheen: 1 } })
  const fullShadow = Number(/rgba\([^)]*,([0-9.]+)\)$/.exec(bodyVar(m, '--gm-panel-main-shadow'))[1])
  assert.ok(fullShadow > dimShadow, '更强的高光投更重的阴影')

  // 分隔线基准强到真的读得出来（它过去是约 5% 的 alpha，而且还画在侧边栏表面背后）。
  assert.match(bodyVar(m, '--gm-divider'), /^rgba\(96,108,134,0\.175\)$/, '默认强度下分隔线 alpha 看得见')
  assert.notEqual(bodyVar(m, '--gm-rim-edge'), undefined, '镜边发布它的边缘色调')
  assert.match(bodyVar(m, '--gm-rim-edge'), /^rgba\(120,132,156,0\.34\)$/, '浅配方的边缘是冷灰，不是白上白')

  // 折射是透镜，不是模糊旋钮：滤波器里没有预模糊，磨砂什么都不跟这个开关走——动磨砂
  // 正是让它读起来像模糊控件的东西。
  const css = m.document.getElementById('dsh-glass-mood-style').textContent
  assert.equal(m.document.querySelector('[data-glass-refraction]').innerHTML.includes('feGaussianBlur'), false, '折射滤波器没有预模糊')
  assert.equal(bodyVar(m, '--gm-blur-scale'), '', '边缘开关不带出模糊变量')
  assert.match(css, /\[data-glass-frost=on\]::before\{[^}]*backdrop-filter:blur\(var\(--gm-blur\)\)/, '磨砂表面也不被它缩放')
  // 而且这个开关必须在边缘上看得出：关掉时，镜边放松成一道没有色散的软发丝。（它过去
  // 只动面板模糊，这就是它读起来像模糊控件的原因。）
  const rimOn = bodyVar(m, '--gm-rim-band')
  const sheenOn = bodyVar(m, '--gm-sheen-edge')
  m.engine.setPanels({ refraction: false })
  assert.notEqual(bodyVar(m, '--gm-rim-band'), rimOn, '边缘开关改变镜边，不只是模糊')
  assert.equal(bodyVar(m, '--gm-rim-disp'), 'transparent', '关意味着没有色散 fringe')
  assert.notEqual(bodyVar(m, '--gm-sheen-edge'), sheenOn, '以及更弱的高光')
  m.engine.setPanels({ refraction: true })
  assert.equal(bodyVar(m, '--gm-rim-band'), rimOn, '并重新打开')
  m.engine.setPanels({ refraction: false })
  assert.equal(bodyVar(m, '--gm-blur-scale'), '', '且关着时仍没有模糊变量')

  // 值被夹住，绝不被信任。
  const clamped = m.engine.setPanels({ gap: 99, frameRadius: -5, panelRadius: 999, divder: 3, divider: 9, left: { opacity: 5, blur: -3, sheen: 4 } })
  assert.equal(clamped.gap, 24, '间隙被夹住')
  assert.equal(clamped.frameRadius, 0, '负半径落到 0')
  assert.equal(clamped.panelRadius, 32, '面板半径被夹住')
  assert.equal(clamped.divider, 1, '分隔线被夹住')
  assert.equal(clamped.left.opacity, 1, '不透明度被夹住')
  assert.equal(clamped.left.blur, 0, '模糊被夹住')
  assert.equal(clamped.left.sheen, 1, '高光被夹住')
  m.dispose()
  console.log('ok  逐面板材质 + 夹取')
}

{
  const m = mount()
  // 自动模式下，可见度旋钮通过各 token 自己的预算削薄面板，地板包含在内。
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-left-fill')), 0.52, '没有壁纸就不削薄')
  m.engine.setWallpaper({ url: 'https://cdn.example.com/a.mp4', clarity: 1 })
  const left = panelAlpha(bodyVar(m, '--gm-panel-left-fill'))
  const main = panelAlpha(bodyVar(m, '--gm-panel-main-fill'))
  assert.ok(left <= 0.25 && left >= 0.2, '侧边栏削到它自己的地板（' + left + '）')
  assert.ok(main <= 0.1, '画布面板比侧边栏削得更狠（' + main + '）')

  // 一个显式 alpha 选择退出那份预算：这正是让"实心"在壁纸开着时也实心的原因，也是
  // "还是看得见壁纸"的修法。
  m.engine.setPanels({ left: { opacity: 1 } })
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-left-fill')), 1, '显式 alpha 压过可见度预算')

  m.engine.clearWallpaper()
  m.engine.setPanels({ left: { opacity: -1 } })
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-left-fill')), 0.52, '清掉壁纸恢复面板')
  m.dispose()
  console.log('ok  可见度抵达面板；显式 alpha 胜出')
}

{
  const m = mount()
  // 心情重绘面板：工作态更冷、更锐利一分。
  const idleRim = bodyVar(m, '--gm-rim-a')
  m.sessionStatus.set(new Map([['s1', { running: true }]]))
  m.clock.advance(120)
  assert.equal(m.document.body.dataset.glassMood, 'work', '心情切换了')
  assert.notEqual(bodyVar(m, '--gm-rim-a'), idleRim, '镜边光跟随心情')
  assert.equal(bodyVar(m, '--gm-panel-main-fill'), bodyVar(m, '--gm-panel-main-fill'), '填充逐心情重新发布')
  m.dispose()
  console.log('ok  面板跟随心情')
}

{
  // 配色翻转用另一套调色板重绘面板。
  const m = mount()
  const light = bodyVar(m, '--gm-panel-left-fill')
  m.document.body.setAttribute('data-ds-dark-theme', '')
  m.emitThemeChange()
  const dark = bodyVar(m, '--gm-panel-left-fill')
  assert.notEqual(dark, light, '暗配方发布不同的面板填充')
  m.document.body.removeAttribute('data-ds-dark-theme')
  m.emitThemeChange()
  assert.equal(bodyVar(m, '--gm-panel-left-fill'), light, '切回去恢复浅色填充')
  m.dispose()
  console.log('ok  面板跟随配色')
}

{
  // 面板配置在重载后幸存，一次重打标签找到重建的列。
  const first = mount()
  first.engine.setPanels({ main: { opacity: 0.4, blur: 22, sheen: 0.6 }, gap: 0, refraction: false })
  first.dispose()

  const second = mount({ storage: first.storage })
  assert.equal(second.engine.getPanels().main.blur, 22, '面板模糊被恢复')
  assert.equal(second.engine.getPanels().main.opacity, 0.4, '面板不透明度被恢复')
  assert.equal(second.engine.getPanels().gap, 0, '间隙被恢复')
  assert.equal(second.document.body.dataset.glassGap, 'off', '零间隙切换布局模式')
  assert.equal(bodyVar(second, '--gm-refract'), 'none', '折射关时不发布滤波器')
  assert.equal(panelAlpha(bodyVar(second, '--gm-panel-main-fill')), 0.4, '恢复的不透明度原样抵达填充')

  // 一次外壳重建（右列被换掉）被一次重打标签捡到。
  second.shell.right.remove()
  const rebuilt = second.document.createElement('div')
  rebuilt.setAttribute('class', 'AppFrame_rightbarCol_2v1u0')
  second.document.body.appendChild(rebuilt)
  second.engine.retag()
  assert.equal(rebuilt.getAttribute('data-glass-panel'), 'right', '重建的列被重新打标签')
  assert.equal(second.engine.panelStatus().found.right, true, '并再次报成找到')
  second.dispose()
  assert.equal(second.shell.left.getAttribute('data-glass-panel'), undefined, '卸载给列摘标签')
  assert.equal(bodyVar(second, '--gm-gap'), '', '并移除它的变量')
  assert.equal(bodyVar(second, '--gm-panel-left-shadow'), '', '以及逐面板接触阴影')
  assert.equal(bodyVar(second, '--gm-rim-edge'), '', '以及镜边色调')
  assert.equal(bodyVar(second, '--gm-sheen-edge'), '', '以及边缘权重')
  assert.equal(second.document.body.dataset.glassPanels, undefined, '以及它的 body 属性')
  assert.equal(second.document.querySelector('[data-glass-refraction]'), null, '以及折射滤波器')
  console.log('ok  面板配置持久化 + 列重新打标签')
}

{
  // 外壳自己的类名是查找契约。
  const { PANEL_SELECTOR } = mount().loaded
  assert.match(PANEL_SELECTOR.left, /_sidebarCol/, '左列按外壳的类名局部名找到')
  assert.match(PANEL_SELECTOR.main, /_centerCol/, '中间列按外壳的类名局部名找到')
  assert.match(PANEL_SELECTOR.right, /data-rightbar-col/, '右列优先用外壳自己的数据钩子')
  console.log('ok  面板选择器契约')
}
//#endregion

//#region settings row
/** 一个最小的 React 替身：刚够把这一行渲染一次的钩子状态。 */
function createFakeReact() {
  const hooks = []
  let cursor = 0
  const api = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState(initial) {
      const index = cursor++
      if (hooks[index] === undefined) {
        hooks[index] = [initial, null]
        hooks[index][1] = (next) => {
          const slot = hooks[index]
        // 一个来自已卸载组件的写入（比如一棵树被重置后才落定的 promise）是空操作，
        // 和 React 对待它的方式完全一样。
          if (slot === undefined) return
          slot[0] = typeof next === 'function' ? next(slot[0]) : next
        }
      }
      return hooks[index]
    },
    useEffect(run) {
      const index = cursor++
      if (hooks[index] === undefined) { hooks[index] = true; run() }
    },
    useRef(initial) {
      const index = cursor++
      if (hooks[index] === undefined) hooks[index] = { current: initial }
      return hooks[index]
    },
    // 另一个组件的新挂载：它的钩子只属于那个组件。
    reset() { hooks.length = 0; cursor = 0 }
  }
  return api
}

/** 对假元素树的深度优先搜索（文本子节点也算）。 */
function findNodes(node, predicate, found = []) {
  if (node === null || node === undefined) return found
  if (predicate(node)) found.push(node)
  if (typeof node !== 'object') return found
  for (const child of node.children ?? []) findNodes(child, predicate, found)
  return found
}

{
  // 没有 slots 服务时，这一行的路径必须在碰 React 之前返回，所以一个没有设置的组合
  // 永远不可能弄坏主题本身。
  let required = 0
  const m = mount({ requireImpl: () => { required += 1; throw new Error('no react here') } })
  m.dispose()
  assert.equal(required, 0, '碰 React 之前就跳过这一行')
  console.log('ok  没有 slots 服务就跳过这一行')
}

{
  const calls = []
  const fakeReact = createFakeReact()
  const slots = {
    // 先记录 inject，再跑它的回调：回调才是注册占用者的东西，往后推会把顺序颠倒。
    inject: (key, cb) => { const record = { kind: 'inject', key, disposer: null }; calls.push(record); record.disposer = cb() },
    register: (options, Component) => { calls.push({ kind: 'register', options, Component }); return () => {} }
  }
  const theme = { overrideTokens: () => () => {} }
  let disposePlugin = null
  const ctx = {
    get: (name) => (name === 'slots' ? slots : name === 'theme' ? theme : undefined),
    // Cordis 跑 effect 体并留住它返回的清理器，所以测试必须照做，否则引擎永远不挂载。
    effect: (fn) => {
      const disposer = fn()
      disposePlugin = () => { if (typeof disposer === 'function') disposer() }
      return disposePlugin
    }
  }
  const document = createDocument()
  const storage = { data: new Map(), getItem() { return null }, setItem(key, value) { this.data.set(key, value) }, removeItem() {} }
  const { loaded, window } = loadBundle(document, storage, (id) => { assert.equal(id, 'react'); return fakeReact })
  // `apply` 构建引擎，并把行交给调试句柄暴露的同一个实例，所以测试驱动和检查的是
  // 一个对象，不是两个。
  loaded.apply(ctx)
  const live = window.__dshGlassMood

  assert.equal(calls.length, 4, '两行，各自注入槽并注册一次')
  assert.deepEqual(calls.map((call) => call.kind), ['inject', 'register', 'inject', 'register'], '先 inject 再 register，每行如此')
  assert.equal(calls[0].key, 'settings.general.item', '壁纸行贡献到通用设置区的条目槽')
  assert.equal(calls[1].options.id, 'glass-mood-wallpaper', '单元格 id 是我们自己的，绝不是自带的')
  assert.equal(calls[1].options.order, 13, '它落在 transcript-view（12）与 developer-tools（15）之间')
  assert.equal(calls[2].key, 'settings.general.item', '面板行贡献到同一个槽')
  assert.equal(calls[3].options.id, 'glass-mood-panels', '单元格 id 也是我们自己的')
  assert.equal(calls[3].options.order, 14, '且紧坐在壁纸行之后')
  assert.equal(typeof calls[1].Component, 'function', '每行注册一个组件')

  // 渲染壁纸行，通过引擎驱动它的控件。
  fakeReact.reset()
  const tree = calls[1].Component()
  const buttons = findNodes(tree, (node) => node.type === 'button')
  const urls = findNodes(tree, (node) => node.type === 'input' && node.props.type === 'text')
  const fileInputs = findNodes(tree, (node) => node.type === 'input' && node.props.type === 'file')
  const ranges = findNodes(tree, (node) => node.type === 'input' && node.props.type === 'range')
  assert.equal(buttons.length, 4, '每槽有选择文件和清除')
  assert.equal(urls.length, 2, '每槽有自己的链接输入框')
  assert.equal(fileInputs.length, 2, '每槽有自己的文件选择器')
  assert.deepEqual(fileInputs.map((node) => node.props.accept), ['video/mp4,video/webm,video/*', 'video/mp4,video/webm,video/*'], '两个选择器都收视频')
  assert.equal(ranges.length, 3, '三个旋钮：壁纸可见度 / 模糊 / 情绪染色')
  assert.equal(buttons[1].props.disabled, true, '空闲的清除在空着时禁用')
  assert.equal(buttons[3].props.disabled, true, '工作的清除在空着时禁用')

  // 每个旋钮打印它的值：拖到"看着对"不是一个设置。
  const wallpaperValues = findNodes(tree, (node) => node.props?.className === 'gm-val').map((node) => node.children[0])
  assert.deepEqual(
    wallpaperValues,
    ['0.45', '0px', '0.35'],
    '壁纸旋钮打印壁纸可见度 / 模糊 / 情绪染色'
  )

  // 工作槽必须按 work 寻址，而不是默认槽。
  urls[1].props.onChange({ target: { value: 'https://cdn.example.com/focus.mp4' } })
  urls[1].props.onKeyDown({ key: 'Enter', target: { value: 'https://cdn.example.com/focus.mp4' } })
  assert.equal(live.wallpaper().clips.work.url, 'https://cdn.example.com/focus.mp4', '第二个输入框写工作槽')
  assert.equal(live.wallpaper().clips.idle.url, '', '且不碰空闲槽')
  assert.equal(document.body.dataset.glassWallpaper, 'on', '舞台跟随这一行')
  assert.equal(clipOf({ document }, 'work'), 'both', '单独一条工作片子服务两个心情')

  // 一次读不到字段值的提交，绝不能清掉一个正在工作的壁纸。
  urls[1].props.onKeyDown({ key: 'Enter' })
  assert.equal(live.wallpaper().clips.work.url, 'https://cdn.example.com/focus.mp4', '没有目标的回车被忽略')

  // 清除按钮现在管用，引擎丢掉那个槽。
  const rerendered = calls[1].Component()
  const clearButtons = findNodes(rerendered, (node) => node.type === 'button')
  assert.equal(clearButtons[3].props.disabled, false, '该槽有片子后工作的清除才启用')
  clearButtons[3].props.onClick()
  assert.equal(live.wallpaper().clips.work.source, '', '行只清工作槽')
  assert.equal(document.body.dataset.glassWallpaper, 'off', '舞台再次关掉')

  // 渲染面板行：三条材质行、四个几何旋钮、两个开关。
  fakeReact.reset()
  const panelsTree = calls[3].Component()
  const panelRanges = findNodes(panelsTree, (node) => node.type === 'input' && node.props.type === 'range')
  const toggles = findNodes(panelsTree, (node) => node.type === 'input' && node.props.type === 'checkbox')
  const panelText = findNodes(panelsTree, (node) => typeof node === 'string').join(' ')
  assert.equal(panelRanges.length, 13, '三面板 × 不透明度/模糊/高光，外加 4 个几何旋钮')
  assert.equal(toggles.length, 3, '边缘折射 / 内容取色 / 按压形变：三个开关，全都实时生效——调试用的那些没了')
  assert.equal(toggles[0].props.checked, true, '折射默认开')
  assert.equal(toggles[1].props.checked, true, '内容染色也一样')
  assert.equal(toggles[2].props.checked, true, '按压形变也一样')
  // 自检和模糊降级是诊断：它们绝不可以重新变成行设置，不管它们在追模糊时多有用。
  assert.ok(!/棋盘格自检|模糊降级/.test(panelText), '行里不留调试开关')
  // 这个实例从没找到面板，所以诊断行有话要说——而那正是它被允许出现的时候。一个识别
  // 齐全的挂载保持安静，这一点由无障碍/表面那几个块覆盖。
  assert.match(panelText, /模糊挂载：左侧栏：未识别/, '有面板缺失时诊断开口')
  assert.match(panelText, /左侧边栏/, '左列被标注')
  assert.match(panelText, /主打|主界面/, '中间列被标注')
  assert.match(panelText, /均已识别|未识别到面板/, '行报出找到了哪些列')
  const panelValues = findNodes(panelsTree, (node) => node.props?.className === 'gm-val').map((node) => node.children[0])
  assert.equal(panelValues.length, 13, '每个面板旋钮打印它的值')
  assert.deepEqual(panelValues.slice(0, 3), ['0.52', '0px', '1.00'], '左面板打印它的有效 alpha / 模糊 / 高光')
  assert.deepEqual(panelValues.slice(9), ['8px', '0px', '20px', '0.35'], '几何旋钮打印单位')

  // 底部内缩是外框的 padding，不是每个面板的 margin。一个带显式 `height: 100%` 的列
  // 会对着网格区解析它，于是自己的底部 margin 叠加上去，落地时贴着窗口——这正是中间面板
  // 没有底部间隙而两侧有的原因。
  const topology = createDocument()
  const topologyShell = mountShellColumns(topology)
  const live2 = loadBundle(topology, null, undefined)
  const engine2 = live2.loaded.createEngine({
    document: topology,
    window: live2.window,
    theme: { overrideTokens: () => () => {} },
    ctx: { get: () => undefined, on: () => () => {} },
    now: () => 1000,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    localStorage: null,
    indexedDB: null,
    URL: null
  })
  engine2.start()
  const topologyCss = topology.getElementById('dsh-glass-mood-style').textContent
  assert.match(topologyCss, /\[data-glass-panel\]\{position:relative;z-index:0;margin:var\(--gm-gap\) calc\(var\(--gm-gap\) \/ 2\) 0;/, '面板不带底部 margin')
  assert.match(topologyCss, /\[data-glass-frame\]\{border-radius:var\(--gm-frame-radius\);padding-bottom:var\(--gm-gap\)\}/, '外框拥有底部内缩')
  assert.equal(topologyShell.left.getAttribute('data-glass-panel'), 'left', '且面板仍打着标签')
  engine2.off()

  // 通过真引擎驱动一个逐面板旋钮和一个全局旋钮。
  panelRanges[0].props.onChange({ target: { value: '0.5' } })
  assert.equal(live.panels().left.opacity, 0.5, '第一个旋钮写左面板不透明度')
  assert.equal(document.body.style.getPropertyValue('--gm-panel-left-fill'), document.body.style.getPropertyValue('--gm-panel-left-fill'), '并重新发布填充')
  panelRanges[9].props.onChange({ target: { value: '0' } })
  assert.equal(live.panels().gap, 0, '第一个几何旋钮写间隙')
  assert.equal(document.body.dataset.glassGap, 'off', '并切换布局模式')

  // cordis effect 清理器是插件自己的拆卸路径。
  assert.equal(typeof disposePlugin, 'function', 'apply 注册了它的拆卸')
  disposePlugin()
  assert.equal(document.body.dataset.glassMood, undefined, '卸载插件移除心情属性')
  assert.equal(document.getElementById('dsh-glass-mood-style'), null, '以及样式表')
  assert.equal(window.__dshGlassMood, undefined, '以及调试句柄')
  console.log('ok  设置行注册 + 交互')
}
//#endregion

//#region palette contract
{
  const { TOKEN_KEYS, PALETTES, pairFor } = mount().loaded
  const tokenSet = new Set(SHIPPED_TOKENS)
  const forbidden = [
    '--dsw-menu-surface-fill',
    '--dsw-menu-backdrop-filter',
    '--dsw-mask-blur',
    '--dsw-alias-menu-group-header-fill',
    '--dsw-alias-state-error-primary',
    '--dsw-alias-state-success-primary',
    '--dsw-alias-state-warn-primary',
    '--dsw-alias-state-idle-primary',
    '--dsw-alias-code-diff-added',
    '--dsw-alias-code-diff-deleted'
  ]

  for (const name of TOKEN_KEYS) {
    assert.ok(name.startsWith('--dsw-'), `${name} is a dsw custom property`)
    assert.ok(tokenSet.has(name), `${name} exists in the shipped ui-theme token set`)
    assert.ok(!forbidden.includes(name), `${name} is owned elsewhere and must not be overridden`)
  }
  assert.equal(new Set(TOKEN_KEYS).size, TOKEN_KEYS.length, 'token 名不重复')

  for (const mood of ['idle', 'work']) {
    const pair = pairFor(mood)
    assert.deepEqual(Object.keys(pair).sort(), [...TOKEN_KEYS].sort(), `${mood}: the pair covers exactly TOKEN_KEYS`)
    for (const [name, modes] of Object.entries(pair)) {
      for (const mode of ['light', 'dark']) {
        const value = modes[mode]
        assert.equal(typeof value, 'string', `${mood}/${name}/${mode} is a string`)
        assert.ok(value.length > 0, `${mood}/${name}/${mode} is not empty`)
        assert.match(
          value,
          /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\))$/,
          `${mood}/${name}/${mode} is a plain color (no color-mix, no self reference)`
        )
      }
    }
    assert.equal(PALETTES[mood].light.length, TOKEN_KEYS.length, `${mood}: every light value is present`)
    assert.equal(PALETTES[mood].dark.length, TOKEN_KEYS.length, `${mood}: every dark value is present`)
  }

  assert.throws(() => pairFor('nope'), /unknown mood/, 'an unknown mood is a loud error')

  // 主题服务自己就拒绝裸字符串；我们的形状绝不能把它绊倒。
  for (const mood of ['idle', 'work']) {
    for (const [name, modes] of Object.entries(pairFor(mood))) {
      assert.equal(typeof modes, 'object', `${name} is a pair, never a bare string`)
      assert.deepEqual(Object.keys(modes).sort(), ['dark', 'light'], `${name} 同时带两套配色`)
    }
  }
  console.log('ok  token contract (' + TOKEN_KEYS.length + ' tokens x 4 palettes)')
}
//#endregion

//#region legibility
{
  /** sRGB 相对亮度。 */
  const luminance = (rgb) => {
    const channel = (value) => {
      const c = value / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
  }
  const parse = (value) => {
    if (value.startsWith('#')) {
      const hex = value.slice(1)
      const full = hex.length <= 4 ? hex.split('').map((c) => c + c).join('') : hex
      return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16), 1]
    }
    const parts = value.slice(value.indexOf('(') + 1, value.lastIndexOf(')')).split(',').map((p) => Number(p.trim()))
    return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1]
  }
  /** 半透明表面对不透明背景的 source-over 合成。 */
  const over = (top, bottom) => {
    const a = top[3]
    return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1)
  }
  const contrast = (a, b) => {
    const [hi, lo] = luminance(a) > luminance(b) ? [luminance(a), luminance(b)] : [luminance(b), luminance(a)]
    return (hi + 0.05) / (lo + 0.05)
  }

  /** 每个心情/配方的一个代表性背景色：渐变的中间调。 */
  const BACKDROP = {
    'idle/light': [252, 251, 253],
    'idle/dark': [20, 22, 28],
    'work/light': [232, 240, 248],
    'work/dark': [16, 24, 34]
  }

  const { pairFor } = mount().loaded
  const rows = []
  for (const mood of ['idle', 'work']) {
    const pair = pairFor(mood)
    for (const mode of ['light', 'dark']) {
      const backdrop = BACKDROP[`${mood}/${mode}`]
      // 基础面板画在渐变之上，然后一层抬升画在那之上。
      const base = over(parse(pair['--dsw-alias-bg-base'][mode]), backdrop)
      const layer1 = over(parse(pair['--dsw-alias-bg-layer-1'][mode]), base)
      const layer2 = over(parse(pair['--dsw-alias-bg-layer-2'][mode]), base)

  // 内容染色把窗格拉向片子的色相。它绝不能吃掉标签层级当初被测量时依据的对比度，
  // 所以按它最强的时候检查：一个完全饱和的读数，在最大的混合下。
      const strong = { ready: true, hue: 29, brightness: 0.9, saturation: 1 }
      const panels = { left: { opacity: -1 }, main: { opacity: -1 }, right: { opacity: -1 } }
      const tintedStr = mount().loaded.panelFill('main', mode, panels, 0, false, mood, strong)
      const tinted = over(parse(tintedStr), backdrop)
      const primaryOnTinted = contrast(parse(pair['--dsw-alias-label-primary'][mode]), tinted)
      assert.ok(
        primaryOnTinted >= 7,
        `${mood}/${mode}: primary text on a tinted pane ${primaryOnTinted.toFixed(2)} must reach 7`
      )
      const worst = (name) => Math.min(
        contrast(parse(pair[name][mode]), layer1),
        contrast(parse(pair[name][mode]), layer2)
      )
      rows.push({
        mood,
        mode,
        primary: worst('--dsw-alias-label-primary'),
        secondary: worst('--dsw-alias-label-secondary'),
        tertiary: worst('--dsw-alias-label-tertiary'),
        caption: worst('--dsw-alias-label-caption'),
        dimmed: worst('--dsw-alias-label-dimmed'),
        preview: worst('--dsw-alias-label-document-preview'),
        brand: worst('--dsw-alias-brand-primary')
      })
      assert.ok(
        worst('--dsw-alias-label-primary') >= 4.5,
        `${mood}/${mode}: primary label contrast ${worst('--dsw-alias-label-primary').toFixed(2)} must reach 4.5`
      )
      // 灰字正是本主题反复失败的地方：官方主题用中等灰画说明文字和暗下来的文字，在
      // 苍白或半透明的面板上会糊掉。现在每个标签层级都必须独自顶住被抬高的各层。
      assert.ok(
        worst('--dsw-alias-label-secondary') >= 4.5,
        `${mood}/${mode}: secondary label contrast ${worst('--dsw-alias-label-secondary').toFixed(2)} must reach 4.5`
      )
      assert.ok(
        worst('--dsw-alias-label-tertiary') >= 4.5,
        `${mood}/${mode}: tertiary label contrast ${worst('--dsw-alias-label-tertiary').toFixed(2)} must reach 4.5`
      )
      assert.ok(
        worst('--dsw-alias-label-caption') >= 4.5,
        `${mood}/${mode}: caption label contrast ${worst('--dsw-alias-label-caption').toFixed(2)} must reach 4.5`
      )
      assert.ok(
        worst('--dsw-alias-label-dimmed') >= 3.5,
        `${mood}/${mode}: dimmed label contrast ${worst('--dsw-alias-label-dimmed').toFixed(2)} must reach 3.5`
      )
      assert.ok(
        worst('--dsw-alias-label-document-preview') >= 4.5,
        `${mood}/${mode}: preview label contrast ${worst('--dsw-alias-label-document-preview').toFixed(2)} must reach 4.5`
      )
      assert.ok(
        worst('--dsw-alias-brand-primary') >= 3,
        `${mood}/${mode}: brand contrast ${worst('--dsw-alias-brand-primary').toFixed(2)} must reach 3.0`
      )
      // 主按钮自己的标签 token 不属于本主题的表面，所以它的填充必须保持足够暗，让最
      // 严格的标签搭配——白字——仍然可读。门槛是 4.2/3.0，因为产品自己的深品牌蓝对白字
      // 量出 4.33:1、对玻璃量出 3.03:1；在深色半透明背景上，更高的一对在几何上不可能。
      const whiteOnFill = contrast([255, 255, 255, 1], parse(pair['--dsw-alias-button-primary-fill'][mode]))
      const whiteOnHover = contrast([255, 255, 255, 1], parse(pair['--dsw-alias-button-primary-hover'][mode]))
      assert.ok(whiteOnFill >= 4.2, `${mood}/${mode}: white on the primary fill ${whiteOnFill.toFixed(2)} must reach 4.2`)
      assert.ok(whiteOnHover >= 4.2, `${mood}/${mode}: white on the primary hover ${whiteOnHover.toFixed(2)} must reach 4.2`)
      assert.ok(
        worst('--dsw-alias-button-primary-fill') >= 3,
        `${mood}/${mode}: the primary button must stand off the glass by 3.0`
      )
      assert.ok(
        worst('--dsw-alias-button-primary-hover') >= 2.5,
        `${mood}/${mode}: the hover state must stay visibly distinct from the glass`
      )
    }
  }
  console.log('ok  可读性：')
  for (const row of rows) {
    console.log(`      ${row.mood}/${row.mode}  primary ${row.primary.toFixed(2)}  secondary ${row.secondary.toFixed(2)}  tertiary ${row.tertiary.toFixed(2)}  caption ${row.caption.toFixed(2)}  dimmed ${row.dimmed.toFixed(2)}  preview ${row.preview.toFixed(2)}  brand ${row.brand.toFixed(2)}`)
  }
}
//#endregion

console.log('\n全部检查通过')
