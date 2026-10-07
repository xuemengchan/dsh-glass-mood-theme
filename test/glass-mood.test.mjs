/**
 * dsh-glass-mood-theme test suite — no dependencies, runs on plain Node.
 *
 *   node test/glass-mood.test.mjs
 *
 * Covers the three things a theme plugin can get wrong silently:
 *   1. the mood state machine (initial paint, work cut, idle linger, dwell,
 *      forced mode, dispose),
 *   2. token legality (every name exists in the shipped ui-theme token set,
 *      every value is a light/dark pair, nothing owned by the menu material or
 *      by a semantic state is touched),
 *   3. legibility (WCAG contrast of labels and brand over the composited glass).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

//#region harness
/** Minimal DOM good enough for the plugin's mount / dispose path. */
function createDocument() {
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
    /** Geometry and computed paint, which the surface probe reads. */
    box: { width: 1200, height: 800 },
    computed: { backgroundColor: 'rgba(0, 0, 0, 0)' },
    getBoundingClientRect() { return this.box },
    /** Media surface: enough for the engine's muted-autoplay path. */
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
    remove() {
      this.removed = true
      const index = this.parent?.children.indexOf(this) ?? -1
      if (index >= 0) this.parent.children.splice(index, 1)
      // A detached node has no parent and is no longer connected, like the real DOM:
      // the surface probe relies on both to notice that its element is gone.
      this.parent = null
    }
  })
  const body = make('body')
  body.parent = undefined
  const head = make('head')
  const all = [head, body]
  /**
   * Just enough selector support for the shell lookup the engine performs:
   * `[class*="x"]`, `[attr]`, `[attr=value]` and comma lists of those.
   */
  const matches = (el, selector) => {
    const part = selector.trim()
    if (part === '[data-glass-frame]') return el.attributes['data-glass-frame'] !== undefined
    const star = /^\[class\*="?([^"\]]+)"?\]$/.exec(part)
    if (star !== null) return String(el.attributes.class ?? '').includes(star[1])
    const equals = /^\[([^=\]]+)=("?)([^"\]]+)\2\]$/.exec(part)
    if (equals !== null) return el.attributes[equals[1]] === equals[3]
    const present = /^\[([^\]]+)\]$/.exec(part)
    if (present !== null) return el.attributes[present[1]] !== undefined
    return el.tagName === part
  }
  const query = (selector) => all.find((el) => !el.removed && selector.split(',').some((one) => matches(el, one))) ?? null
  const document = {
    head,
    body,
    createElement(tag) { const el = make(tag); all.push(el); return el },
    getElementById(id) { return all.find((el) => el.id === id && !el.removed) ?? null },
    querySelector: query,
    querySelectorAll(selector) { return all.filter((el) => !el.removed && selector.split(',').some((one) => matches(el, one))) }
  }
  return document
}

/**
 * Build the three shell columns the way ui-layout does, with its class names.
 * The left column gets a nested painted surface (as ui-sidebar does), the centre
 * gets none (the column itself is the surface), and the right gets a transparent
 * full-bleed wrapper (which must NOT be mistaken for a surface).
 */
function mountShellColumns(document) {
  const frame = document.createElement('div')
  frame.setAttribute('class', 'AppFrame_frame_1a2b3')
  const left = document.createElement('div')
  left.setAttribute('class', 'AppFrame_sidebarCol_9z8y7')
  left.box = { width: 260, height: 780 }
  const center = document.createElement('div')
  center.setAttribute('class', 'AppFrame_centerCol_5x4w3')
  center.box = { width: 620, height: 780 }
  const right = document.createElement('div')
  right.setAttribute('class', 'AppFrame_rightbarCol_2v1u0')
  right.setAttribute('data-rightbar-col', '')
  right.box = { width: 320, height: 780 }
  const leftSurface = document.createElement('div')
  leftSurface.setAttribute('class', 'Sidebar_root_7h6g5')
  leftSurface.computed = { backgroundColor: 'rgba(255, 255, 255, 0.52)' }
  leftSurface.box = { width: 260, height: 780 }
  left.appendChild(leftSurface)
  const rightWrapper = document.createElement('div')
  rightWrapper.setAttribute('class', 'Rightbar_wrapper_4f3e2')
  rightWrapper.computed = { backgroundColor: 'rgba(0, 0, 0, 0)' }
  rightWrapper.box = { width: 320, height: 780 }
  right.appendChild(rightWrapper)
  frame.appendChild(left)
  frame.appendChild(center)
  frame.appendChild(right)
  document.body.appendChild(frame)
  return { frame, left, center, right, leftSurface, rightWrapper }
}

/** The module is a plain __ModuleLoader__ bundle: run it with injected globals. */
function loadBundle(document, storage, requireImpl) {
  const captured = []
  const window = {
    __ModuleLoader__: { load: (entry) => captured.push(entry) },
    /** A desktop viewport, which the page-versus-popover size gate measures against. */
    innerWidth: 1280,
    innerHeight: 800,
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle),
    setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
    clearInterval: (handle) => globalThis.clearInterval(handle),
    getComputedStyle: (el) => ({
      backgroundColor: 'rgba(0, 0, 0, 0)',
      backgroundImage: 'none',
      backdropFilter: 'none',
      getPropertyValue: () => '',
      ...el.computed
    })
  }
  const factory = new Function('window', 'document', 'localStorage', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', source)
  factory(window, document, storage, window.setTimeout, window.clearTimeout, window.setInterval, window.clearInterval)
  assert.equal(captured.length, 1, 'the bundle registers exactly one loader entry')
  const entry = captured[0]
  assert.equal(entry.id, 'dsh-glass-mood-theme', 'loader id matches the package name')
  const loaded = entry.factory(requireImpl ?? (() => { throw new Error('this bundle must not require anything') }))
  return { loaded, window }
}

/** Virtual clock so the hysteresis is testable without waiting. */
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
    /** Advance time, firing due timers in order. */
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

/** Observable snapshot, the shape the plugin subscribes to. */
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

/** A tiny IndexedDB stand-in: one object store, promise-free request objects. */
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

/** One mount with a controllable activity source. */
function mount(options = {}) {
  const document = createDocument()
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
    // `noStatus` models a build without the ui-session status map, which is the
    // only case where the session-list fallback is consulted at all.
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
  // The shell columns exist before the engine mounts, the way the real frame does.
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
    URL: urlApi
  })
  const dispose = engine.start()
  return {
    document, window, loaded, storage, layers, sessionStatus, sessionList, engine, dispose, clock, disposers,
    objectUrls, idb, theme, services, shell,
    /** Deliver a theme/change the way the real service does. */
    emitThemeChange: () => { for (const listener of themeListeners) listener({}) }
  }
}

const currentMood = (m) => m.document.body.dataset.glassMood
/** A published CSS variable on the live body. */
const bodyVar = (m, name) => m.document.body.style.getPropertyValue(name)
/** Alpha of an rgba() colour, for reading the published fills. */
const panelAlpha = (color) => Number(/rgba\([^)]*,\s*([0-9.]+)\s*\)$/.exec(color)[1])
//#endregion

//#region shipped token inventory
/**
 * Every `--dsw-*` alias the shipped ui-theme exposes, read out of the installed
 * `@deepseek-ai/dsh-client-ui-theme` client bundle (DSH 0.2.0-rc.2, 107 alias +
 * 11 specific). A theme may only name tokens that exist: a typo would otherwise
 * fail silently, styling nothing.
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
  assert.equal(currentMood(m), 'idle', 'first paint with nothing running is the warm mood')
  assert.equal(m.layers.length, 1, 'exactly one token layer at mount')
  assert.equal(m.layers[0].source, 'dsh-glass-mood', 'the override layer is named')
  assert.equal(m.document.body.dataset.glassBlur, 'on', 'frosted surfaces are on by default')
  assert.ok(m.document.getElementById('dsh-glass-mood-style'), 'the stylesheet is mounted')
  assert.ok(m.document.getElementById('dsh-glass-mood-bg'), 'the gradient stage is mounted')
  m.dispose()
  assert.equal(m.document.getElementById('dsh-glass-mood-style'), null, 'dispose removes the stylesheet')
  assert.equal(m.document.getElementById('dsh-glass-mood-bg'), null, 'dispose removes the stage')
  assert.equal(m.document.body.dataset.glassMood, undefined, 'dispose clears the mood attribute')
  assert.equal(m.layers[m.layers.length - 1].disposed, true, 'dispose retracts the token layer')
  assert.equal(m.clock.pending, 0, 'dispose leaves no timer or interval behind')
  console.log('ok  mount / dispose')
}

{
  const m = mount()
  // A turn starts: the cool mood lands after the short work debounce.
  m.sessionStatus.set(new Map([['s1', { running: true }]]))
  assert.equal(currentMood(m), 'idle', 'work is debounced, not instant')
  m.clock.advance(120)
  assert.equal(currentMood(m), 'work', 'a running turn cuts to the cool mood')
  assert.equal(m.document.body.dataset.glassFading, 'work', 'the cross-fade window opens')
  // The turn ends, but the idle linger keeps the decisive mood a moment longer.
  m.sessionStatus.set(new Map([['s1', { running: false }]]))
  m.clock.advance(300)
  assert.equal(currentMood(m), 'work', 'the warm mood waits out the antara linger')
  m.clock.advance(1600)
  assert.equal(currentMood(m), 'idle', 'idle returns after the linger')
  console.log('ok  work cut / idle linger')
}

{
  const m = mount()
  // Between two tool steps: a sub-second idle gap must not flip the mood.
  m.sessionStatus.set(new Map([['s1', { running: true }]]))
  m.clock.advance(120)
  m.sessionStatus.set(new Map([['s1', { running: false }]]))
  m.clock.advance(400)
  m.sessionStatus.set(new Map([['s1', { running: true }]]))
  m.clock.advance(2000)
  assert.equal(currentMood(m), 'work', 'a between-step gap does not flash the warm mood')
  const workCommits = m.layers.filter(
    (l) => l.tokens !== null && l.tokens !== undefined && l.tokens['--dsw-alias-brand-primary'].dark === '#58A6FF'
  ).length
  assert.equal(workCommits, 1, 'the mood is never re-committed while it is already correct')
  console.log('ok  between-step gap')
}

{
  const m = mount()
  // A turn parked on a user interaction still counts as work.
  m.sessionStatus.set(new Map([['s1', { running: false, pendingInteraction: { kind: 'approval' } }]]))
  m.clock.advance(200)
  assert.equal(currentMood(m), 'work', 'waiting on the user keeps the decisive mood')
  m.dispose()
  console.log('ok  pending interaction counts as work')
}

{
  // Only the fallback source available (no ui-session status map).
  const m = mount({ noStatus: true, bindings: { s9: { running: true } } })
  m.sessionList.set({ byId: { s9: { running: true } } })
  m.clock.advance(200)
  assert.equal(currentMood(m), 'work', 'a running row drives the mood')
  // The row itself carries no flag: the per-session face is the remaining source.
  m.sessionList.set({ byId: { s9: {} } })
  m.clock.advance(50)
  assert.equal(m.engine.readActivity(), true, 'the session face is read when the row is silent')
  assert.equal(currentMood(m), 'work', 'the face keeps the decisive mood')
  m.sessionList.set({ byId: {} })
  m.clock.advance(2000)
  assert.equal(currentMood(m), 'idle', 'the fallback source releases the mood too')
  assert.equal(typeof m.engine.readActivity, 'function', 'the engine exposes its reader for debugging')
  m.dispose()
  console.log('ok  session-list fallback')
}

{
  const m = mount()
  // Forced mood wins over the live signal, and is written to storage.
  m.window.__dshGlassMood.force('work')
  assert.equal(currentMood(m), 'work', 'a forced mood applies immediately')
  assert.equal(m.storage.getItem('dsh-glass-mood:force'), 'work', 'the pin is persisted')
  m.sessionStatus.set(new Map([['s1', { running: true }]]))
  m.clock.advance(5000)
  assert.equal(currentMood(m), 'work', 'the forced mood stays pinned')
  m.sessionStatus.set(new Map())
  m.window.__dshGlassMood.force('')
  assert.equal(currentMood(m), 'idle', 'clearing the pin returns to the derived mood')
  assert.equal(m.window.__dshGlassMood.current(), 'idle', 'the debug handle reports the live mood')
  assert.equal(m.storage.getItem('dsh-glass-mood:force'), null, 'the pin is removed from storage')
  m.dispose()
  assert.equal(m.window.__dshGlassMood, undefined, 'dispose removes the debug handle')
  console.log('ok  forced mood')
}

{
  const m = mount()
  // Subscribers registered on the sources are released on dispose.
  assert.equal(m.sessionStatus.listenerCount, 1, 'the status map is subscribed once')
  assert.equal(m.sessionList.listenerCount, 1, 'the session list is subscribed once')
  m.dispose()
  assert.equal(m.sessionStatus.listenerCount, 0, 'dispose unsubscribes the status map')
  assert.equal(m.sessionList.listenerCount, 0, 'dispose unsubscribes the session list')
  console.log('ok  subscriptions released')
}
//#endregion

//#region wallpaper
/** Let the engine's IndexedDB microtasks and restore promise settle. */
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve)) }
const stageEl = (m) => m.document.getElementById('dsh-glass-mood-bg')
const videoEl = (m, slot) => stageEl(m).children.find((c) => c.tagName === 'video' && c.getAttribute('data-glass-slot') === slot) ?? null
const clipOf = (m, slot) => videoEl(m, slot).getAttribute('data-glass-clip')
/** Alpha of an rgba() color; opaque forms (hex) count as 1. */
const alphaOf = (color) => {
  const match = /rgba\([^)]*,\s*([0-9.]+)\s*\)$/.exec(color)
  return match === null ? 1 : Number(match[1])
}

{
  const m = mount()
  assert.equal(stageEl(m).children.filter((c) => c.tagName === 'video').length, 2, 'one clip element per mood slot')
  assert.equal(clipOf(m, 'idle'), 'none', 'the idle clip is inactive with nothing configured')
  assert.equal(clipOf(m, 'work'), 'none', 'the work clip is inactive with nothing configured')
  assert.equal(m.document.body.dataset.glassWallpaper, 'off', 'no wallpaper configured at mount')
  assert.equal(videoEl(m, 'idle').getAttribute('src'), undefined, 'no source before a wallpaper is set')
  // tint 0.35 faded by clarity 0.45 down to 30% => 0.24
  assert.equal(m.document.body.style.getPropertyValue('--gm-tint'), '0.24', 'the mood wash has its default')
  m.dispose()
  console.log('ok  wallpaper idle state')
}

{
  const m = mount()
  const applied = m.engine.setWallpaper({ url: 'https://cdn.example.com/loop.mp4' })
  assert.equal(applied.clips.idle.source, 'url', 'the url lands in the idle slot')
  assert.equal(applied.clips.work.source, '', 'the work slot stays empty')
  assert.equal(m.document.body.dataset.glassWallpaper, 'on', 'a configured wallpaper turns the stage on')
  assert.equal(clipOf(m, 'idle'), 'both', 'a single clip serves both moods')
  assert.equal(clipOf(m, 'work'), 'none', 'the empty slot stays dark')
  assert.equal(videoEl(m, 'idle').getAttribute('src'), 'https://cdn.example.com/loop.mp4', 'the clip plays the url')
  assert.ok(videoEl(m, 'idle').played >= 1, 'the clip is playing (and muted by force)')
  assert.equal(videoEl(m, 'idle').attributes.muted, '', 'autoplay is legal only because it is muted')
  const stored = JSON.parse(m.storage.getItem('dsh-glass-mood:video'))
  assert.equal(stored.clips.idle.url, 'https://cdn.example.com/loop.mp4', 'the config is persisted')
  assert.equal(stored.fit, 'cover', 'fit defaults to cover')

  // Live knobs drive CSS variables on body, which is what the stage reads.
  m.engine.setWallpaper({ fit: 'contain', opacity: 0.3, blur: 16, tint: 0.6, clarity: 0 })
  assert.equal(m.document.body.style.getPropertyValue('--gm-wall-fit'), 'contain', 'fit reaches the stage')
  assert.equal(m.document.body.style.getPropertyValue('--gm-wall-opacity'), '0.3', 'opacity reaches the stage')
  assert.equal(m.document.body.style.getPropertyValue('--gm-wall-blur'), '16px', 'blur reaches the stage')
  assert.ok(Number(m.document.body.style.getPropertyValue('--gm-wall-scale')) > 1, 'blur overscans to hide the seam')
  assert.equal(m.document.body.style.getPropertyValue('--gm-tint'), '0.6', 'at zero clarity the mood wash is unfaded')

  // Out-of-range input is clamped, never trusted.
  const clamped = m.engine.setWallpaper({ opacity: 4, blur: 999, tint: 2, clarity: 7, fit: 'nope' })
  assert.equal(clamped.opacity, 1, 'opacity is clamped')
  assert.equal(clamped.blur, 32, 'blur is clamped')
  assert.equal(clamped.tint, 0.9, 'tint is clamped')
  assert.equal(clamped.clarity, 1, 'clarity is clamped')
  assert.equal(clamped.fit, 'cover', 'an unknown fit falls back to cover')

  // Full clarity fades the mood wash down to its residual share.
  assert.equal(m.document.body.style.getPropertyValue('--gm-tint'), '0.27', 'clarity fades the wash, never to zero')
  m.dispose()
  console.log('ok  wallpaper url + live knobs')
}

{
  // One knob, one perception: visibility drives the clip strength AND the pane
  // thinning together, so the two halves can never read as duplicates.
  const m = mount()
  m.engine.setWallpaper({ url: 'https://cdn.example.com/loop.mp4' })
  const dim = m.engine.setWallpaper({ visibility: 0 })
  assert.equal(dim.clarity, 0, 'visibility 0 means no thinning')
  assert.equal(dim.opacity, 0.35, 'and the faintest clip')
  assert.equal(bodyVar(m, '--gm-wall-opacity'), '0.35', 'the stage follows')
  const full = m.engine.setWallpaper({ visibility: 1 })
  assert.equal(full.clarity, 1, 'visibility 1 means full thinning')
  assert.equal(full.opacity, 1, 'and the strongest clip')
  assert.equal(bodyVar(m, '--gm-wall-opacity'), '1', 'the stage follows the other way too')
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-main-fill')), 0.096, 'and the panels are fully uncovered at 1')
  m.dispose()
  console.log('ok  wallpaper visibility is one axis')
}

{
  // Clarity is what actually uncovers the clip: the theme's own panes get thin.
  const m = mount()
  const raw = m.loaded.pairFor('idle')
  assert.equal(alphaOf(raw['--dsw-alias-bg-base'].light), 0.64, 'the palette base pane is full strength')
  m.engine.setWallpaper({ url: 'https://cdn.example.com/loop.mp4', clarity: 0 })
  const before = m.layers[m.layers.length - 1].tokens
  assert.equal(alphaOf(before['--dsw-alias-bg-base'].light), 0.64, 'a wallpaper alone does not thin the panes')
  // Content surfaces are lifted to a readable alpha the moment a wallpaper is on,
  // even before any thinning: the clip's brightness is unknown, and the shipped
  // theme keeps every one of them opaque.
  assert.equal(alphaOf(raw['--dsw-specific-bubble'].light), 0.62, 'without a wallpaper the bubble keeps its palette alpha')
  assert.equal(alphaOf(before['--dsw-specific-bubble'].light), 0.72, 'a wallpaper lifts it to the protection floor')

  // No invented ambient motion: the theme's light is static (rim, depth, contact
  // shadow, mood-responsive temperature). The sweep was removed on user feedback.
  assert.equal(bodyVar(m, '--gm-sweep'), '', 'no sweep colour is published')
  assert.equal(Object.prototype.hasOwnProperty.call(m.engine.getPanels(), 'glow'), false, 'the sweep toggle is gone from the config')

  m.engine.setWallpaper({ clarity: 1 })
  const after = m.layers[m.layers.length - 1].tokens
  assert.ok(alphaOf(after['--dsw-alias-bg-base'].light) <= 0.1, 'at full clarity the canvas pane nearly vanishes')
  assert.ok(alphaOf(after['--dsw-specific-sidebar-fill'].light) <= 0.25, 'the sidebar column uncovers the clip too')
  // Text containers keep a high floor: the clip's brightness is unknown, so the
  // theme refuses to make readability a slider. The shipped theme paints every one
  // of these opaque, so protecting them is restoring stock behaviour.
  assert.ok(alphaOf(after['--dsw-specific-bubble'].light) >= 0.72, 'message bubbles keep their backing')
  assert.ok(alphaOf(after['--dsw-specific-input-major'].light) >= 0.8, 'the composer keeps its backing')
  assert.ok(alphaOf(after['--dsw-alias-settings-card-fill'].light) >= 0.86, 'settings cards keep their backing')
  assert.ok(alphaOf(after['--dsw-alias-bg-overlay'].light) >= 0.9, 'popovers stay solid')
  assert.ok(alphaOf(after['--dsw-alias-bg-document-preview'].light) >= 0.94, 'the diff/document preview container stays solid')
  assert.ok(alphaOf(after['--dsw-alias-bg-layer-1'].light) >= 0.88, 'raised cards stay solid')
  assert.ok(alphaOf(after['--dsw-alias-bg-layer-2'].light) >= 0.86, 'and so does the layer beneath them')
  assert.ok(alphaOf(after['--dsw-alias-bg-layer-3'].light) >= 0.84, 'and the deepest layer')
  assert.ok(alphaOf(after['--dsw-alias-markdown-code-block'].light) >= 0.86, 'code blocks keep their backing')
  assert.equal(after['--dsw-alias-label-primary'].light, before['--dsw-alias-label-primary'].light, 'text colors are never dimmed')
  assert.equal(after['--dsw-alias-border-l2'].light, before['--dsw-alias-border-l2'].light, 'borders keep their exact value')
  // Thinning may only ever remove alpha. Protection may only ever add it — and only
  // to the declared content surfaces, never to a colour or a border.
  const protectedNames = new Set(m.loaded.WALL_PROTECT.map((rule) => rule[0]))
  for (const name of Object.keys(after)) {
    const raised = alphaOf(after[name].light) > alphaOf(before[name].light) + 1e-9
    if (protectedNames.has(name)) {
      assert.ok(alphaOf(after[name].light) >= Math.min(1, alphaOf(before[name].light)), `${name}: protection never lowers`)
    } else {
      assert.ok(!raised, `${name}: only declared content surfaces may gain alpha`)
    }
  }

  // Nothing configured means nothing to uncover: the palettes stay untouched.
  m.engine.clearWallpaper()
  const cleared = m.layers[m.layers.length - 1].tokens
  assert.equal(alphaOf(cleared['--dsw-alias-bg-base'].light), 0.64, 'clearing restores the full-strength panes')
  m.dispose()
  console.log('ok  clarity thins the panes but never the text')
}

{
  const m = mount()
  const blob = { size: 1024, kind: 'video/mp4' }
  await m.engine.setWallpaperFile(blob, 'loop.mp4')
  assert.equal(clipOf(m, 'idle'), 'both', 'a picked idle file serves both moods')
  assert.equal(m.objectUrls.created.length, 1, 'the file is played through an object URL')
  const url = m.objectUrls.created[0].value
  assert.equal(videoEl(m, 'idle').getAttribute('src'), url, 'the clip plays the object URL')
  assert.equal(m.engine.getWallpaper().clips.idle.source, 'file', 'the config records a local file')
  assert.equal(m.engine.getWallpaper().clips.idle.name, 'loop.mp4', 'the display name is kept')
  await settle()
  assert.equal(m.idb.rows.get('wallpaper:idle'), blob, 'the blob is stored under the slot key')
  assert.equal(JSON.parse(m.storage.getItem('dsh-glass-mood:video')).clips.idle.source, 'file', 'the file source is persisted')

  await m.engine.clearWallpaper('idle')
  assert.equal(clipOf(m, 'idle'), 'none', 'clearing the only clip deactivates the stage')
  assert.equal(m.document.body.dataset.glassWallpaper, 'off', 'and turns the wallpaper off')
  assert.equal(videoEl(m, 'idle').getAttribute('src'), undefined, 'clearing drops the source')
  assert.deepEqual(m.objectUrls.revoked, [url], 'the object URL is revoked')
  assert.equal(m.idb.rows.has('wallpaper:idle'), false, 'the stored blob is removed')
  assert.equal(m.engine.getWallpaper().clips.idle.source, '', 'the slot is reset')
  m.dispose()
  console.log('ok  wallpaper local file + per-slot clear')
}

{
  // Two clips, two slots: the switch must crossfade without reloading either.
  const m = mount()
  m.engine.setWallpaper({ url: 'https://cdn.example.com/calm.mp4', slot: 'idle' })
  m.engine.setWallpaper({ url: 'https://cdn.example.com/focus.mp4', slot: 'work' })
  assert.equal(clipOf(m, 'idle'), 'idle', 'the idle slot owns its own clip')
  assert.equal(clipOf(m, 'work'), 'work', 'the work slot owns its own clip')
  assert.equal(videoEl(m, 'idle').getAttribute('src'), 'https://cdn.example.com/calm.mp4', 'idle plays its clip')
  assert.equal(videoEl(m, 'work').getAttribute('src'), 'https://cdn.example.com/focus.mp4', 'work plays its clip')
  assert.ok(videoEl(m, 'work').played >= 1, 'the hidden clip is already playing, so the switch is a crossfade')

  const idleSrc = videoEl(m, 'idle').getAttribute('src')
  const workSrc = videoEl(m, 'work').getAttribute('src')
  const loadsBefore = videoEl(m, 'idle').loaded ?? 0

  m.sessionStatus.set(new Map([['s1', { running: true }]]))
  m.clock.advance(120)
  assert.equal(m.document.body.dataset.glassMood, 'work', 'the mood switched')
  assert.equal(videoEl(m, 'idle').getAttribute('src'), idleSrc, 'the idle clip was not reloaded')
  assert.equal(videoEl(m, 'work').getAttribute('src'), workSrc, 'the work clip was not reloaded')
  assert.equal(videoEl(m, 'idle').loaded ?? 0, loadsBefore, 'no decoder reset happened on the switch')
  m.dispose()
  console.log('ok  two clips crossfade without a reload')
}

{
  // Removing one slot hands the survivor back to both moods.
  const m = mount()
  m.engine.setWallpaper({ url: 'https://cdn.example.com/calm.mp4', slot: 'idle' })
  m.engine.setWallpaper({ url: 'https://cdn.example.com/focus.mp4', slot: 'work' })
  m.engine.clearWallpaper('work')
  assert.equal(clipOf(m, 'work'), 'none', 'the cleared slot goes dark')
  assert.equal(clipOf(m, 'idle'), 'both', 'the survivor covers both moods again')
  assert.equal(videoEl(m, 'work').getAttribute('src'), undefined, 'the cleared slot released its source')
  assert.equal(videoEl(m, 'idle').getAttribute('src'), 'https://cdn.example.com/calm.mp4', 'the survivor keeps playing')
  m.dispose()
  console.log('ok  solo clip falls back to both moods')
}

{
  // A stored pair survives a remount: config from localStorage, bytes from IndexedDB.
  const first = mount()
  const blob = { size: 2048, kind: 'video/webm' }
  await first.engine.setWallpaperFile(blob, 'dawn.webm', 'work')
  first.engine.setWallpaper({ url: 'https://cdn.example.com/calm.mp4', slot: 'idle' })
  await settle()
  first.dispose()

  const second = mount({ storage: first.storage, idb: first.idb })
  await settle()
  const config = second.engine.getWallpaper()
  assert.equal(config.clips.idle.source, 'url', 'the linked clip is restored')
  assert.equal(config.clips.work.source, 'file', 'the file clip is restored')
  assert.equal(config.clips.work.name, 'dawn.webm', 'the name is restored')
  assert.equal(clipOf(second, 'work'), 'work', 'the restored file is live')
  assert.equal(second.objectUrls.created.length, 1, 'a fresh object URL is created for the stored blob')
  assert.equal(videoEl(second, 'work').getAttribute('src'), second.objectUrls.created[0].value, 'the restored clip plays')
  second.dispose()
  console.log('ok  wallpaper survives a remount')
}

{
  // Config that outlived its blob must degrade honestly, slot by slot.
  const seed = mount()
  await seed.engine.setWallpaperFile({ size: 16 }, 'gone.mp4', 'work')
  seed.engine.setWallpaper({ url: 'https://cdn.example.com/calm.mp4', slot: 'idle' })
  await settle()
  seed.dispose()
  seed.idb.rows.delete('wallpaper:work')

  const next = mount({ storage: seed.storage, idb: seed.idb })
  await settle()
  const config = next.engine.getWallpaper()
  assert.equal(config.clips.work.source, '', 'the slot whose bytes vanished is cleared')
  assert.equal(config.clips.idle.source, 'url', 'the healthy slot is left alone')
  assert.equal(clipOf(next, 'idle'), 'both', 'the survivor now serves both moods')
  assert.equal(JSON.parse(next.storage.getItem('dsh-glass-mood:video')).clips.work.source, '', 'the stale slot is rewritten')
  next.dispose()
  console.log('ok  stale wallpaper config degrades per slot')
}

{
  // v1 (one top-level video, bare IndexedDB key) migrates into the idle slot.
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
  assert.equal(config.clips.idle.source, 'file', 'the v1 video lands in the idle slot')
  assert.equal(config.clips.idle.name, 'old.mp4', 'its name survives')
  assert.equal(config.clips.work.source, '', 'the work slot starts empty')
  assert.equal(config.fit, 'contain', 'the v1 knobs are kept')
  assert.equal(m.idb.rows.get('wallpaper:idle'), legacyBlob, 'the bytes are copied to the slot key')
  assert.equal(m.idb.rows.has('wallpaper'), false, 'the legacy key is released')
  assert.equal(m.objectUrls.created.length, 1, 'the migrated file plays')
  assert.equal(JSON.parse(storage.getItem('dsh-glass-mood:video')).clips.idle.source, 'file', 'the config is rewritten in the v2 shape')
  m.dispose()
  console.log('ok  v1 wallpaper migrates')
}

{
  // Without IndexedDB a picked file still shows, and the choice is never wiped:
  // "the store is unavailable" is not "the file is gone".
  const m = mount({ idb: false })
  const blob = { size: 32 }
  await m.engine.setWallpaperFile(blob, 'nodb.mp4', 'idle')
  await settle()
  assert.equal(clipOf(m, 'idle'), 'both', 'a file without IndexedDB still shows')
  assert.equal(videoEl(m, 'idle').getAttribute('src'), m.objectUrls.created[0].value, 'it plays from the object URL')
  assert.equal(m.engine.getWallpaper().clips.idle.source, 'file', 'the choice is kept rather than cleared')
  m.dispose()

  const reopened = mount({ storage: m.storage, idb: false })
  await settle()
  assert.equal(reopened.engine.getWallpaper().clips.idle.source, 'file', 'and it survives a reload in memory terms')
  reopened.dispose()
  console.log('ok  wallpaper without IndexedDB')
}
//#endregion

//#region panels
{
  // A backdrop-filter only blurs what is painted behind its backdrop root, and
  // `isolation: isolate` CREATES a backdrop root. Hosting the frost on an isolated
  // element therefore left the blur with nothing to blur: the panel's fill moved
  // (a plain background, so the opacity knob felt fine) while its blur knob looked
  // dead. Two corrections are locked here: the hosts form their stacking context
  // with position + z-index, and the panels carry the filter on the painted element
  // itself rather than on a negative-z pseudo.
  const m = mount()
  const css = m.document.getElementById('dsh-glass-mood-style').textContent
  assert.ok(!/isolation:isolate/.test(css), 'no frost host isolates — that would kill backdrop-filter')
  assert.match(css, /\[data-glass-surface\]\{position:relative;z-index:0\}/, 'the delegated surface forms a stacking context the other way')
  assert.match(css, /\[data-glass-panel\]\{position:relative;z-index:0;/, 'and so does a column that paints itself')
  assert.match(
    css,
    /\[data-glass-surface\]::before\{[^}]*backdrop-filter:blur\(calc\(var\(--gm-panel-blur\)/,
    'the delegated surface frosts on a pseudo'
  )
  assert.match(
    css,
    /\[data-glass-panel\]:not\(\[data-glass-delegate=on\]\)::before\{[^}]*backdrop-filter:blur\(calc\(var\(--gm-panel-blur\)/,
    'and a column that paints itself does too'
  )
  // The element itself must never take the filter: that would make it the containing
  // block of its fixed-position descendants, displacing any floating control inside a
  // panel (this is what hid the sidebar's reopen control).
  assert.ok(
    !/\[data-glass-blur=on\] \[data-glass-surface\],/.test(css),
    'no panel element carries the backdrop-filter directly'
  )
  m.dispose()
  console.log('ok  frost hosts do not form a backdrop root')
}

{
  // A collapsed column is not a panel: it must keep the app's own styling, or the
  // control that reopens the sidebar (which the collapsed column renders outside its
  // own box) gets clipped by the theme's overflow and margins.
  const m = mount()
  assert.equal(m.engine.panelStatus().found.left, true, 'an open sidebar is a panel')
  assert.equal(m.shell.left.getAttribute('data-glass-panel'), 'left', 'and is tagged')
  m.shell.left.box = { width: 0, height: 780 }
  m.engine.retag(true)
  assert.equal(m.engine.panelStatus().found.left, false, 'a collapsed column is reported as not a panel')
  assert.equal(m.shell.left.getAttribute('data-glass-panel'), undefined, 'and every hook is withdrawn')
  assert.equal(m.engine.panelStatus().surfaces.left, false, 'including any delegated surface')
  // The app's own control survives: nothing is clipped or offset while collapsed.
  const css = m.document.getElementById('dsh-glass-mood-style').textContent
  const frameBase = /\[data-glass-panels\] \[data-glass-frame\]\{([^}]*)\}/.exec(css)
  assert.ok(frameBase, 'the frame base rule exists')
  assert.ok(!/overflow:hidden/.test(frameBase[1]), 'the frame does not clip unless the panels are flush')
  assert.match(css, /\[data-glass-gap=off\] \[data-glass-frame\]\{overflow:hidden\}/, 'the flush arrangement still cuts the sheet')
  // Expanding again brings the panel back.
  m.shell.left.box = { width: 260, height: 780 }
  m.engine.retag(true)
  assert.equal(m.engine.panelStatus().found.left, true, 'expanding restores the panel treatment')
  assert.equal(m.shell.left.getAttribute('data-glass-panel'), 'left', 'with its hook')

  // The panic switch: a theme that can hide part of the app must be removable
  // without knowing why.
  m.engine.off()
  assert.equal(m.document.getElementById('dsh-glass-mood-style'), null, 'off() removes the stylesheet')
  assert.equal(m.document.querySelectorAll('[data-glass-panel]').length, 0, 'and every hook')
  assert.equal(m.document.getElementById('dsh-glass-mood-bg'), null, 'and the stage')
  assert.equal(m.document.body.dataset.glassMood, undefined, 'and the body attributes')
  console.log('ok  collapsed columns are left alone + panic switch')
}

{
  // A backdrop-filter cannot see anything painted outside its own backdrop root, and
  // the wallpaper used to be a child of <body> while the panels live inside the app
  // shell — so a shell that isolates/filters/contains:paint made the panels blind to
  // the wallpaper. The stage now mounts inside the shell, in a negative layer.
  const m = mount()
  const stage = m.document.getElementById('dsh-glass-mood-bg')
  assert.equal(stage.parent, m.shell.frame, 'the wallpaper stage lives inside the app shell')
  assert.equal(stage.getAttribute('data-glass-in-shell'), '', 'and is marked so it can take the negative layer')
  assert.match(m.document.getElementById('dsh-glass-mood-style').textContent, /\[data-glass-in-shell\]\{z-index:-1\}/, 'the negative layer rule exists')

  // If the shell is replaced, the poll moves the stage into the new one.
  const newFrame = m.document.createElement('div')
  newFrame.setAttribute('class', 'AppFrame_frame_2')
  m.document.body.appendChild(newFrame)
  m.shell.frame.remove()
  m.engine.retag()
  assert.equal(stage.parent, newFrame, 'a rebuilt shell re-homes the stage')

  // The visible blur test: a checkerboard inside the stage, removable again.
  assert.equal(m.engine.checker(true).checker, true, 'the checkerboard mounts')
  assert.notEqual(m.document.querySelector('[data-glass-checker]'), null, 'and is findable in the stage')
  assert.equal(m.engine.checker(false).checker, false, 'and comes off again')
  assert.equal(m.document.querySelector('[data-glass-checker]'), null, 'leaving nothing behind')

  // The diagnostic reports the computed filter and the stage's host.
  const report = m.engine.blurReport()
  assert.equal(typeof report.left, 'object', 'the report covers each panel')
  assert.ok('backdrop' in report.left && 'stageHost' in report.left, 'with the computed filter and the stage host')
  m.dispose()
  console.log('ok  stage sits inside the shell + blur diagnostics')
}

{
  // A blue veil over warm footage composites to magenta, and work mode used to push
  // `saturate()` to 170%, amplifying it. The mood wash now keeps the mood's
  // lightness and gives up most of its hue, the blue pulse is neutralised, and the
  // backdrop saturation stays in a sane range.
  const m = mount()
  const css = m.document.getElementById('dsh-glass-mood-style').textContent
  const satOf = (selector) => {
    const line = css.split('\n').find((rule) => rule.startsWith(selector))
    assert.ok(line, `missing the ${selector} rule`)
    return Number(/--gm-sat:(\d+)%/.exec(line)[1])
  }
  assert.ok(satOf('body[data-glass-mood]{') <= 120, 'idle keeps backdrop saturation gentle')
  assert.ok(satOf('body[data-glass-mood=work]{') <= 130, 'and work no longer over-saturates the footage')
  assert.match(css, /\[data-glass-layer=idle\],body\[data-glass-wallpaper=on\][^{]*\[data-glass-layer=work\]\{filter:saturate\(\.4\)\}/, 'with footage on screen the wash drops most of its hue')
  assert.match(css, /\[data-glass-layer=pulse\]\{opacity:0;background:radial-gradient\(70% 55% at 50% -10%, rgba\(152,178,202,\.16\)/, 'the pulse is a neutral cool light, not a saturated blue')
  assert.match(css, /body\[data-glass-wallpaper=on\]\[data-glass-mood=work\][^{]*\[data-glass-layer=pulse\]\{opacity:\.35\}/, 'and it steps back further over footage')
  assert.ok(!/rgba\(88,166,255/.test(css), 'the saturated blue pulse is gone')
  m.dispose()
  console.log('ok  the mood wash cannot purple-shift footage')
}

{
  // Page-like content is frosted (the settings surface reads well that way); a small
  // transient popover is not, because blurring a diff preview's backdrop is what made
  // the file content hard to read in the first place.
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
  assert.equal(settings.getAttribute('data-glass-frost'), 'on', 'a page-sized surface is frosted')
  assert.equal(diff.getAttribute('data-glass-frost'), undefined, 'a small popover is not')

  // A shrunk surface loses the hook again (a dialog can be resized or reused).
  settings.box = { width: 300, height: 200 }
  m.engine.tagBigSurfaces()
  assert.equal(settings.getAttribute('data-glass-frost'), undefined, 'and the hook is withdrawn when it shrinks')

  m.dispose()
  assert.equal(m.document.querySelectorAll('[data-glass-frost]').length, 0, 'dispose removes the hook')
  console.log('ok  page-like surfaces get frosted, popovers do not')
}
{
  const m = mount()
  // The left column's surface is nested (as ui-sidebar's is): the probe must find
  // it and hand the paint over, or that panel's opacity and blur knobs move values
  // nobody can see — which is exactly what happened before.
  assert.equal(m.shell.leftSurface.getAttribute('data-glass-surface'), 'left', 'the nested left surface is found and tagged')
  assert.equal(m.shell.left.getAttribute('data-glass-delegate'), 'on', 'and the column steps aside')
  assert.equal(m.shell.center.getAttribute('data-glass-delegate'), undefined, 'a column that paints itself keeps the material')
  assert.equal(m.shell.right.getAttribute('data-glass-delegate'), undefined, 'a transparent wrapper is not mistaken for a surface')
  assert.equal(m.shell.rightWrapper.getAttribute('data-glass-surface'), undefined, 'and is left untagged')
  // The probe reports what it found, so a mismatch can be diagnosed from the GUI.
  assert.equal(m.engine.panelStatus().surfaceDetail.left.className, 'Sidebar_root_7h6g5', 'the probe reports which element it handed the material to')

  // The material is sticky. Re-probing used to move it, and because a probe that
  // finds nothing leaves the inner layer's own near-opaque fill in charge, every
  // move showed up as the panel's opacity flipping between two values.
  const beforeProbe = m.engine.panelStatus().surfaceDetail.left.className
  m.engine.probe()
  assert.equal(m.engine.panelStatus().surfaceDetail.left.className, beforeProbe, 'a re-probe keeps the same surface')

  // A modal inside the panel is never mistaken for the panel's surface.
  const dialog = m.document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  dialog.box = { width: 260, height: 700 }
  dialog.computed = { backgroundColor: 'rgba(255, 255, 255, 0.9)', backgroundImage: 'none' }
  m.shell.left.appendChild(dialog)
  m.shell.leftSurface.remove()
  m.engine.probe()
  assert.equal(dialog.getAttribute('data-glass-surface'), undefined, 'a modal is never handed the panel material')
  assert.equal(m.engine.panelStatus().surfaces.left, false, 'so that panel reports no surface rather than following the modal')
  dialog.remove()

  // A rebuilt shell is re-probed, and a surface that lost its element is released.
  m.shell.leftSurface.remove()
  m.engine.probe()
  assert.equal(m.engine.panelStatus().surfaces.left, false, 'the probe reports no surface once the element is gone')
  assert.equal(m.shell.left.getAttribute('data-glass-delegate'), undefined, 'and the column takes the material back')
  m.dispose()
  assert.equal(m.document.querySelectorAll('[data-glass-surface]').length, 0, 'dispose un-tags surfaces')
  assert.equal(bodyVar(m, '--gm-panel-left-alpha'), '', 'and removes the published alphas')
  console.log('ok  surface probe')
}

{
  const m = mount()
  assert.equal(m.shell.left.getAttribute('data-glass-panel'), 'left', 'the left column is tagged')
  assert.equal(m.shell.center.getAttribute('data-glass-panel'), 'main', 'the centre column is tagged')
  assert.equal(m.shell.right.getAttribute('data-glass-panel'), 'right', 'the right column is tagged')
  assert.equal(m.shell.frame.getAttribute('data-glass-frame'), '', 'the frame is tagged')
  assert.equal(m.document.body.dataset.glassPanels, 'on', 'the panel system is part of the theme')
  assert.equal(m.engine.panelStatus().found.left && m.engine.panelStatus().found.main && m.engine.panelStatus().found.right, true, 'all three columns are reported found')

  // Geometry defaults: a gutter with the official panel radius, no frame radius.
  assert.equal(bodyVar(m, '--gm-gap'), '8px', 'the surface gutter has its default')
  assert.equal(bodyVar(m, '--gm-radius'), '20px', 'panels use the official card radius by default')
  assert.equal(bodyVar(m, '--gm-frame-radius'), '0px', 'the outer contour stays the window by default')
  assert.equal(m.document.body.dataset.glassGap, 'on', 'a gap means floating panels')
  assert.ok(m.document.querySelector('[data-glass-refraction]') !== null, 'the refraction filter is mounted')
  assert.match(bodyVar(m, '--gm-refract'), /url\(#dsh-glass-mood-refraction-filter\)/, 'the refraction is wired by default')
  m.dispose()
  console.log('ok  panel tagging + geometry defaults')
}

{
  // No shell columns (an unexpected layout): report honestly, never throw.
  const m = mount({ shell: false })
  const status = m.engine.panelStatus()
  assert.deepEqual(status.found, { left: false, main: false, right: false }, 'missing columns are reported, not hidden')
  assert.equal(m.document.body.dataset.glassPanels, 'on', 'the theme still publishes its variables')
  m.engine.setPanels({ gap: 12 })
  assert.equal(bodyVar(m, '--gm-gap'), '12px', 'and the knobs still work without the columns')
  m.dispose()
  console.log('ok  missing shell columns degrade honestly')
}

{
  const m = mount()
  // Each panel owns its material: one panel's opacity never moves another's fill.
  const before = {
    left: bodyVar(m, '--gm-panel-left-fill'),
    main: bodyVar(m, '--gm-panel-main-fill'),
    right: bodyVar(m, '--gm-panel-right-fill')
  }
  assert.equal(panelAlpha(before.left), 0.52, 'the left panel starts at its palette alpha (auto)')
  assert.equal(panelAlpha(before.main), 0.64, 'the main panel starts at its palette alpha (auto)')
  assert.equal(panelAlpha(before.right), 0.64, 'the right panel starts at its palette alpha (auto)')

  // Absolute alpha: 1 has to be a solid panel and 0 a fully clear one, or the knob
  // cannot do what its label promises (that was the "still see the wallpaper" bug).
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-left-fill')), 0.52, 'auto follows the palette alpha')
  m.engine.setPanels({ left: { opacity: 0.5 }, main: { opacity: 0.25, blur: 18, sheen: 0.4 }, right: { opacity: 0 } })
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-left-fill')), 0.5, 'the left panel takes the exact value')
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-main-fill')), 0.25, 'the main panel takes the exact value')
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-right-fill')), 0, 'the right panel can be made invisible')
  const solid = m.engine.setPanels({ left: { opacity: 1 } })
  assert.equal(solid.left.opacity, 1, 'opacity 1 is accepted as absolute')
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-left-fill')), 1, 'and paints a fully solid panel')
  m.engine.setPanels({ left: { opacity: -1 } })
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-left-fill')), 0.52, '-1 returns to following the palette')
  assert.equal(bodyVar(m, '--gm-panel-main-blur'), '18px', 'blur is per panel')
  assert.equal(bodyVar(m, '--gm-panel-left-blur'), '0px', 'and does not leak to another panel')
  assert.equal(bodyVar(m, '--gm-panel-main-sheen'), '0.4', 'the rim highlight is per panel')

  // No milky veil any more: with an absolute range the slider is visible on its own,
  // and a veil would have made "fully clear" a lie.
  assert.equal(bodyVar(m, '--gm-panel-left-veil'), '', 'the veil is gone')
  m.engine.setPanels({ left: { opacity: 1 } })
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-left-fill')), 1, 'so fully opaque really is opaque')
  assert.equal(bodyVar(m, '--gm-panel-left-alpha'), '1', 'and the readout prints the effective alpha')
  m.engine.setPanels({ left: { opacity: 0 } })
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-left-fill')), 0, 'while 0 really is fully clear')

  // The highlight also carries a contact shadow, which a white-on-white rim cannot.
  assert.match(bodyVar(m, '--gm-panel-main-shadow'), /^0 10px 28px -14px rgba\(84,94,124,0\.0[0-9]+\)$/, 'the highlight publishes a contact shadow')
  const dimShadow = Number(/rgba\([^)]*,([0-9.]+)\)$/.exec(bodyVar(m, '--gm-panel-main-shadow'))[1])
  m.engine.setPanels({ main: { sheen: 1 } })
  const fullShadow = Number(/rgba\([^)]*,([0-9.]+)\)$/.exec(bodyVar(m, '--gm-panel-main-shadow'))[1])
  assert.ok(fullShadow > dimShadow, 'a stronger highlight casts a stronger shadow')

  // The divider base is strong enough to actually read (it used to be ~5% alpha
  // AND it was painted behind the sidebar surface).
  assert.match(bodyVar(m, '--gm-divider'), /^rgba\(96,108,134,0\.175\)$/, 'the divider alpha is visible at the default strength')
  assert.notEqual(bodyVar(m, '--gm-rim-edge'), undefined, 'the rim publishes its edge tone')
  assert.match(bodyVar(m, '--gm-rim-edge'), /^rgba\(120,132,156,0\.34\)$/, 'the light scheme edge is a cool grey, not white-on-white')

  // Refraction is a lens, not a blur knob: no pre-blur in the filter, and the
  // frost gives up a little blur while it is on.
  assert.equal(m.document.querySelector('[data-glass-refraction]').innerHTML.includes('feGaussianBlur'), false, 'the refraction filter has no pre-blur')
  assert.equal(bodyVar(m, '--gm-blur-scale'), '0.86', 'refraction slightly reduces the frost blur')
  m.engine.setPanels({ refraction: false })
  assert.equal(bodyVar(m, '--gm-blur-scale'), '1', 'and restores the full blur when off')

  // Values are clamped, never trusted.
  const clamped = m.engine.setPanels({ gap: 99, frameRadius: -5, panelRadius: 999, divder: 3, divider: 9, left: { opacity: 5, blur: -3, sheen: 4 } })
  assert.equal(clamped.gap, 24, 'the gap is clamped')
  assert.equal(clamped.frameRadius, 0, 'a negative radius lands at 0')
  assert.equal(clamped.panelRadius, 32, 'the panel radius is clamped')
  assert.equal(clamped.divider, 1, 'the divider is clamped')
  assert.equal(clamped.left.opacity, 1, 'opacity is clamped')
  assert.equal(clamped.left.blur, 0, 'blur is clamped')
  assert.equal(clamped.left.sheen, 1, 'sheen is clamped')
  m.dispose()
  console.log('ok  per-panel material + clamping')
}

{
  const m = mount()
  // In AUTO mode the visibility knob thins the panels through their own token
  // budgets, floors included.
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-left-fill')), 0.52, 'no wallpaper, no thinning')
  m.engine.setWallpaper({ url: 'https://cdn.example.com/a.mp4', clarity: 1 })
  const left = panelAlpha(bodyVar(m, '--gm-panel-left-fill'))
  const main = panelAlpha(bodyVar(m, '--gm-panel-main-fill'))
  assert.ok(left <= 0.25 && left >= 0.2, 'the sidebar thins to its own floor (' + left + ')')
  assert.ok(main <= 0.1, 'the canvas panel thins further than the sidebar (' + main + ')')

  // An explicit alpha opts OUT of that budget: that is exactly what makes "solid"
  // solid while a wallpaper is on, and it is the fix for "still see the wallpaper".
  m.engine.setPanels({ left: { opacity: 1 } })
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-left-fill')), 1, 'an explicit alpha overrides the visibility budget')

  m.engine.clearWallpaper()
  m.engine.setPanels({ left: { opacity: -1 } })
  assert.equal(panelAlpha(bodyVar(m, '--gm-panel-left-fill')), 0.52, 'clearing the wallpaper restores the panels')
  m.dispose()
  console.log('ok  visibility reaches the panels; explicit alpha wins')
}

{
  const m = mount()
  // The mood repaints the panels: work is cooler and slightly crisper.
  const idleRim = bodyVar(m, '--gm-rim-a')
  m.sessionStatus.set(new Map([['s1', { running: true }]]))
  m.clock.advance(120)
  assert.equal(m.document.body.dataset.glassMood, 'work', 'the mood switched')
  assert.notEqual(bodyVar(m, '--gm-rim-a'), idleRim, 'the rim light follows the mood')
  assert.equal(bodyVar(m, '--gm-panel-main-fill'), bodyVar(m, '--gm-panel-main-fill'), 'the fill is republished per mood')
  m.dispose()
  console.log('ok  panels follow the mood')
}

{
  // The scheme flip repaints the panels from the other palette.
  const m = mount()
  const light = bodyVar(m, '--gm-panel-left-fill')
  m.document.body.setAttribute('data-ds-dark-theme', '')
  m.emitThemeChange()
  const dark = bodyVar(m, '--gm-panel-left-fill')
  assert.notEqual(dark, light, 'the dark scheme publishes a different panel fill')
  m.document.body.removeAttribute('data-ds-dark-theme')
  m.emitThemeChange()
  assert.equal(bodyVar(m, '--gm-panel-left-fill'), light, 'and switching back restores the light fill')
  m.dispose()
  console.log('ok  panels follow the colour scheme')
}

{
  // Panel config survives a reload, and a re-tag finds rebuilt columns.
  const first = mount()
  first.engine.setPanels({ main: { opacity: 0.4, blur: 22, sheen: 0.6 }, gap: 0, refraction: false })
  first.dispose()

  const second = mount({ storage: first.storage })
  assert.equal(second.engine.getPanels().main.blur, 22, 'the panel blur is restored')
  assert.equal(second.engine.getPanels().main.opacity, 0.4, 'the panel opacity is restored')
  assert.equal(second.engine.getPanels().gap, 0, 'the gap is restored')
  assert.equal(second.document.body.dataset.glassGap, 'off', 'a zero gap switches the layout mode')
  assert.equal(bodyVar(second, '--gm-refract'), 'none', 'refraction off publishes no filter')
  assert.equal(panelAlpha(bodyVar(second, '--gm-panel-main-fill')), 0.4, 'the restored opacity reaches the fill verbatim')

  // A shell rebuild (right column replaced) is picked up by a re-tag.
  second.shell.right.remove()
  const rebuilt = second.document.createElement('div')
  rebuilt.setAttribute('class', 'AppFrame_rightbarCol_2v1u0')
  second.document.body.appendChild(rebuilt)
  second.engine.retag()
  assert.equal(rebuilt.getAttribute('data-glass-panel'), 'right', 'a rebuilt column is re-tagged')
  assert.equal(second.engine.panelStatus().found.right, true, 'and reported found again')
  second.dispose()
  assert.equal(second.shell.left.getAttribute('data-glass-panel'), undefined, 'dispose un-tags the columns')
  assert.equal(bodyVar(second, '--gm-gap'), '', 'and removes its variables')
  assert.equal(bodyVar(second, '--gm-panel-left-shadow'), '', 'and the per-panel contact shadow')
  assert.equal(bodyVar(second, '--gm-rim-edge'), '', 'and the rim edge tone')
  assert.equal(bodyVar(second, '--gm-blur-scale'), '', 'and the refraction blur scale')
  assert.equal(second.document.body.dataset.glassPanels, undefined, 'and its body attributes')
  assert.equal(second.document.querySelector('[data-glass-refraction]'), null, 'and the refraction filter')
  console.log('ok  panel config persists + columns re-tag')
}

{
  // The shell's own class names are the lookup contract.
  const { PANEL_SELECTOR } = mount().loaded
  assert.match(PANEL_SELECTOR.left, /_sidebarCol/, 'the left column is found by its shell local name')
  assert.match(PANEL_SELECTOR.main, /_centerCol/, 'the centre column is found by its shell local name')
  assert.match(PANEL_SELECTOR.right, /data-rightbar-col/, 'the right column prefers the shell\'s own data hook')
  console.log('ok  panel selector contract')
}
//#endregion

//#region settings row
/** A minimal React stand-in: enough hook state to render the row once. */
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
          // A write from an unmounted component (e.g. a promise that settled after
          // the tree was reset) is a no-op, exactly as React treats it.
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
    // A fresh mount of another component: its hooks belong to that component only.
    reset() { hooks.length = 0; cursor = 0 }
  }
  return api
}

/** Depth-first search of the fake element tree (text children included). */
function findNodes(node, predicate, found = []) {
  if (node === null || node === undefined) return found
  if (predicate(node)) found.push(node)
  if (typeof node !== 'object') return found
  for (const child of node.children ?? []) findNodes(child, predicate, found)
  return found
}

{
  // Without the slots service the row path must return before it touches React,
  // so a composition without settings can never break the theme itself.
  let required = 0
  const m = mount({ requireImpl: () => { required += 1; throw new Error('no react here') } })
  m.dispose()
  assert.equal(required, 0, 'the row is skipped before React is touched')
  console.log('ok  row skipped without the slots service')
}

{
  const calls = []
  const fakeReact = createFakeReact()
  const slots = {
    // Record the inject BEFORE running its callback: the callback is what
    // registers the occupant, so pushing afterwards would invert the order.
    inject: (key, cb) => { const record = { kind: 'inject', key, disposer: null }; calls.push(record); record.disposer = cb() },
    register: (options, Component) => { calls.push({ kind: 'register', options, Component }); return () => {} }
  }
  const theme = { overrideTokens: () => () => {} }
  let disposePlugin = null
  const ctx = {
    get: (name) => (name === 'slots' ? slots : name === 'theme' ? theme : undefined),
    // Cordis runs the effect body and keeps its returned disposer, so the test
    // must do the same or the engine never mounts.
    effect: (fn) => {
      const disposer = fn()
      disposePlugin = () => { if (typeof disposer === 'function') disposer() }
      return disposePlugin
    }
  }
  const document = createDocument()
  const storage = { data: new Map(), getItem() { return null }, setItem(key, value) { this.data.set(key, value) }, removeItem() {} }
  const { loaded, window } = loadBundle(document, storage, (id) => { assert.equal(id, 'react'); return fakeReact })
  // `apply` builds the engine and hands the row the same instance the debug
  // handle exposes, so the test drives and checks one object, not two.
  loaded.apply(ctx)
  const live = window.__dshGlassMood

  assert.equal(calls.length, 4, 'two rows, each injecting into the slot and registering once')
  assert.deepEqual(calls.map((call) => call.kind), ['inject', 'register', 'inject', 'register'], 'inject before register, per row')
  assert.equal(calls[0].key, 'settings.general.item', 'the wallpaper row contributes to the General section item slot')
  assert.equal(calls[1].options.id, 'glass-mood-wallpaper', 'the cell id is ours, never a shipped one')
  assert.equal(calls[1].options.order, 13, 'it lands between transcript-view (12) and developer-tools (15)')
  assert.equal(calls[2].key, 'settings.general.item', 'the panel row contributes to the same slot')
  assert.equal(calls[3].options.id, 'glass-mood-panels', 'its cell id is ours too')
  assert.equal(calls[3].options.order, 14, 'and sits right after the wallpaper row')
  assert.equal(typeof calls[1].Component, 'function', 'a component is registered per row')

  // Render the wallpaper row and drive its controls through the engine.
  fakeReact.reset()
  const tree = calls[1].Component()
  const buttons = findNodes(tree, (node) => node.type === 'button')
  const urls = findNodes(tree, (node) => node.type === 'input' && node.props.type === 'text')
  const fileInputs = findNodes(tree, (node) => node.type === 'input' && node.props.type === 'file')
  const ranges = findNodes(tree, (node) => node.type === 'input' && node.props.type === 'range')
  assert.equal(buttons.length, 4, 'each slot gets 选择文件 and 清除')
  assert.equal(urls.length, 2, 'each slot gets its own url field')
  assert.equal(fileInputs.length, 2, 'each slot gets its own file picker')
  assert.deepEqual(fileInputs.map((node) => node.props.accept), ['video/mp4,video/webm,video/*', 'video/mp4,video/webm,video/*'], 'both pickers accept video')
  assert.equal(ranges.length, 3, 'three knobs: 壁纸可见度 / 模糊 / 情绪染色')
  assert.equal(buttons[1].props.disabled, true, 'the idle 清除 is disabled while empty')
  assert.equal(buttons[3].props.disabled, true, 'the work 清除 is disabled while empty')

  // Every knob prints its value: dragging until it "looks right" is not a setting.
  const wallpaperValues = findNodes(tree, (node) => node.props?.className === 'gm-val').map((node) => node.children[0])
  assert.deepEqual(
    wallpaperValues,
    ['0.45', '0px', '0.35'],
    'the wallpaper knobs print 壁纸可见度 / 模糊 / 情绪染色'
  )

  // The work slot must be addressed as work, not as the default slot.
  urls[1].props.onChange({ target: { value: 'https://cdn.example.com/focus.mp4' } })
  urls[1].props.onKeyDown({ key: 'Enter', target: { value: 'https://cdn.example.com/focus.mp4' } })
  assert.equal(live.wallpaper().clips.work.url, 'https://cdn.example.com/focus.mp4', 'the second field writes the work slot')
  assert.equal(live.wallpaper().clips.idle.url, '', 'and leaves the idle slot alone')
  assert.equal(document.body.dataset.glassWallpaper, 'on', 'the stage follows the row')
  assert.equal(clipOf({ document }, 'work'), 'both', 'a solo work clip serves both moods')

  // A commit with no readable field value must never clear a working wallpaper.
  urls[1].props.onKeyDown({ key: 'Enter' })
  assert.equal(live.wallpaper().clips.work.url, 'https://cdn.example.com/focus.mp4', 'a targetless Enter is ignored')

  // The clear button now works, and the engine drops that slot.
  const rerendered = calls[1].Component()
  const clearButtons = findNodes(rerendered, (node) => node.type === 'button')
  assert.equal(clearButtons[3].props.disabled, false, 'the work 清除 enables once that slot has a clip')
  clearButtons[3].props.onClick()
  assert.equal(live.wallpaper().clips.work.source, '', 'the row clears only the work slot')
  assert.equal(document.body.dataset.glassWallpaper, 'off', 'the stage turns off again')

  // Render the panel row: three material lines, four geometry knobs, two toggles.
  fakeReact.reset()
  const panelsTree = calls[3].Component()
  const panelRanges = findNodes(panelsTree, (node) => node.type === 'input' && node.props.type === 'range')
  const toggles = findNodes(panelsTree, (node) => node.type === 'input' && node.props.type === 'checkbox')
  const panelText = findNodes(panelsTree, (node) => typeof node === 'string').join(' ')
  assert.equal(panelRanges.length, 13, 'three panels x 不透明度/模糊/高光 plus 4 geometry knobs')
  assert.equal(toggles.length, 1, 'only 边缘折射 remains: the invented sweep is gone')
  assert.equal(toggles[0].props.checked, true, 'refraction is on by default')
  assert.match(panelText, /左侧边栏/, 'the left column is labelled')
  assert.match(panelText, /主打|主界面/, 'the centre column is labelled')
  assert.match(panelText, /均已识别|未识别到面板/, 'the row reports which columns were found')
  const panelValues = findNodes(panelsTree, (node) => node.props?.className === 'gm-val').map((node) => node.children[0])
  assert.equal(panelValues.length, 13, 'every panel knob prints its value')
  assert.deepEqual(panelValues.slice(0, 3), ['0.52', '0px', '1.00'], 'the left panel prints its effective alpha / blur / highlight')
  assert.deepEqual(panelValues.slice(9), ['8px', '0px', '20px', '0.35'], 'the geometry knobs print their units')

  // Drive one per-panel knob and one global knob through the real engine.
  panelRanges[0].props.onChange({ target: { value: '0.5' } })
  assert.equal(live.panels().left.opacity, 0.5, 'the first knob writes the left panel opacity')
  assert.equal(document.body.style.getPropertyValue('--gm-panel-left-fill'), document.body.style.getPropertyValue('--gm-panel-left-fill'), 'and republishes the fill')
  panelRanges[9].props.onChange({ target: { value: '0' } })
  assert.equal(live.panels().gap, 0, 'the first geometry knob writes the gap')
  assert.equal(document.body.dataset.glassGap, 'off', 'and switches the layout mode')

  // The cordis effect disposer is the plugin's own teardown path.
  assert.equal(typeof disposePlugin, 'function', 'apply registered its teardown')
  disposePlugin()
  assert.equal(document.body.dataset.glassMood, undefined, 'disposing the plugin removes the mood attribute')
  assert.equal(document.getElementById('dsh-glass-mood-style'), null, 'and the stylesheet')
  assert.equal(window.__dshGlassMood, undefined, 'and the debug handle')
  console.log('ok  settings rows registration + interaction')
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
  assert.equal(new Set(TOKEN_KEYS).size, TOKEN_KEYS.length, 'no duplicate token names')

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

  // The theme service itself rejects a bare string; our shape must not trip it.
  for (const mood of ['idle', 'work']) {
    for (const [name, modes] of Object.entries(pairFor(mood))) {
      assert.equal(typeof modes, 'object', `${name} is a pair, never a bare string`)
      assert.deepEqual(Object.keys(modes).sort(), ['dark', 'light'], `${name} carries both schemes`)
    }
  }
  console.log('ok  token contract (' + TOKEN_KEYS.length + ' tokens x 4 palettes)')
}
//#endregion

//#region legibility
{
  /** sRGB relative luminance. */
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
  /** Source-over compositing of a translucent surface onto an opaque backdrop. */
  const over = (top, bottom) => {
    const a = top[3]
    return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1)
  }
  const contrast = (a, b) => {
    const [hi, lo] = luminance(a) > luminance(b) ? [luminance(a), luminance(b)] : [luminance(b), luminance(a)]
    return (hi + 0.05) / (lo + 0.05)
  }

  /** A representative backdrop color for each mood/scheme: the gradient's mid tone. */
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
      // The base pane is painted over the gradient, then a raised layer over that.
      const base = over(parse(pair['--dsw-alias-bg-base'][mode]), backdrop)
      const layer1 = over(parse(pair['--dsw-alias-bg-layer-1'][mode]), base)
      const layer2 = over(parse(pair['--dsw-alias-bg-layer-2'][mode]), base)
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
      // Grey text is where this theme kept failing: the shipped theme draws captions
      // and dimmed text with mid greys that wash out on a pale or translucent panel.
      // Every label tier now has to hold its own against the raised layers.
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
      // The primary button's own label token is not part of this theme's surface,
      // so its fill must stay dark enough that the strictest label pairing — white
      // text — remains readable. The bar is 4.2/3.0 because the product's own dark
      // brand blue measures 4.33:1 for white text and 3.03:1 against the glass; a
      // higher pair is geometrically impossible on a dark translucent backdrop.
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
  console.log('ok  legibility:')
  for (const row of rows) {
    console.log(`      ${row.mood}/${row.mode}  primary ${row.primary.toFixed(2)}  secondary ${row.secondary.toFixed(2)}  tertiary ${row.tertiary.toFixed(2)}  caption ${row.caption.toFixed(2)}  dimmed ${row.dimmed.toFixed(2)}  preview ${row.preview.toFixed(2)}  brand ${row.brand.toFixed(2)}`)
  }
}
//#endregion

console.log('\nall glass-mood checks passed')
