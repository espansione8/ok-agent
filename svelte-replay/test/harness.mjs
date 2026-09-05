import { JSDOM } from 'jsdom';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE_URL = pathToFileURL(join(HERE, '.build', 'embedded.mjs')).href;

// Realistic-enough DOM: innerText getter (census reads it) and zero rects for
// display:none subtrees (visibility filtering relies on real geometry).
export function makeDom(html, url = 'http://localhost:5173/invoices') {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  const win = dom.window;
  Object.defineProperty(win.Element.prototype, 'innerText', {
    get() { return this.textContent; },
    configurable: true,
  });
  win.Element.prototype.getBoundingClientRect = function () {
    let p = this;
    while (p && p !== win.document.documentElement) {
      if (win.getComputedStyle(p).display === 'none')
        return { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0 };
      p = p.parentElement;
    }
    return { x: 8, y: 8, width: 80, height: 20, top: 8, left: 8, bottom: 28, right: 88 };
  };
  return dom;
}

// Mock Playwright Page over the JSDOM context. Census runs INSIDE the JSDOM
// vm (page.evaluate of a function), so [data-replay-cid] tagging and
// modal-scoped queries are tested for real, not re-implemented.
export function makeMockPage(dom, opts = {}) {
  const win = dom.window;
  const doc = win.document;
  const ctx = dom.getInternalVMContext();
  const clickLog = opts.clickLog ?? [];
  let mockUrl = opts.url ?? 'http://localhost:5173/invoices';
  const page = {
    url: () => mockUrl,
    _setUrl(u) { mockUrl = new URL(u, mockUrl).href; },
    evaluate: async (fn, arg) => {
      const result = vm.runInContext(`(${fn.toString()})(${JSON.stringify(arg ?? null)})`, ctx);
      return JSON.parse(JSON.stringify(result ?? null));
    },
    locator: (sel) => makeLocator(doc, sel, clickLog, page),
    // Simulate SPA navigation: moves BOTH the mock URL and the JSDOM location
    // (in-page fingerprint() reads location.pathname).
    _pushUrl: (u) => { try { win.history.pushState({}, '', u); } catch {} mockUrl = new URL(u, mockUrl).href; },
    keyboard: {
      press: async (k) => {
        clickLog.push({ type: 'key', key: k });
        // Native <dialog> behavior: Escape closes it. (Legacy .modal-open
        // checkbox hacks have no Escape handling — deliberately untouched.)
        if (k === 'Escape') doc.querySelector('dialog[open]')?.removeAttribute('open');
      },
    },
    mouse: {
      move: async () => {},
      click: async (x, y) => {
        clickLog.push({ type: 'mouse-click', x, y });
        const hook = page?._clickHook ?? opts.onClick;
        if (hook) await hook(null);
      },
    },
    _setClickHook(fn) { page._clickHook = fn; },
    _setGotoHook(fn) { page._gotoHook = fn; },
    goto: async (u) => {
      mockUrl = u;
      try { win.history.pushState({}, '', u); } catch {}
      if (opts.onGoto || page?._gotoHook) { try { await (page?._gotoHook ?? opts.onGoto)(u); } catch {} }
    },
    goBack: async () => { if (opts.onGoBack) await opts.onGoBack(); },
    waitForURL: async () => {},
    waitForFunction: async () => {},
    waitForTimeout: async () => {},
    waitForLoadState: async () => {},
    screenshot: async () => {},
    on: () => {},
    _clickLog: clickLog,
    _dispatchGate: null,
    _setDispatchGate(fn) { page._dispatchGate = fn; },
  };
  page._clickHook = null;
  page._optsOnClick = opts.onClick ?? null;   // handle dispatch falls back to the creation-time hook
  return page;
}

function makeLocator(doc, sel, clickLog, page) {
  const api = {
    nth(n) {
      const els = Array.from(doc.querySelectorAll(sel));
      const el = els[n] ?? null;
      return makeElementHandle(doc, el, sel, n, clickLog, page);
    },
    first() { return api.nth(0); },
    locator(inner) {
      if (inner.startsWith('xpath=')) {
        const expr = inner.slice(6);
        return makeXpath(doc, expr, clickLog, page, doc.querySelector(sel));
      }
      return makeLocator(doc, inner, clickLog, page);
    },
    count: async () => doc.querySelectorAll(sel).length,
    isVisible: async () => !!doc.querySelector(sel),
    inputValue: async () => doc.querySelector(sel)?.value ?? null,
    selectOption: async (v) => { const el = doc.querySelector(sel); if (el) el.value = (v && typeof v === 'object' && 'label' in v) ? v.label : v; },
    focus: async () => {},
    fill: async (v) => { const el = doc.querySelector(sel); if (el) el.value = v; },
    getAttribute: async (a) => doc.querySelector(sel)?.getAttribute(a) ?? null,
    textContent: async () => doc.querySelector(sel)?.textContent ?? null,
    click: async () => {
      // Real Playwright semantics: locator.click() on a zero-match selector
      // throws after its actionability wait — it does NOT silently no-op. The
      // embedded click() relies on this exact throw: the handle.click()
      // fallback must re-resolve the selector and fail loudly when the tagged
      // node detached (the throw is probe()'s retry signal).
      const el = doc.querySelector(sel);
      if (!el) throw new Error('locator.click: no element matches ' + sel);
      clickLog.push({ type: 'locator-click', text: el.textContent });
    },
    // v2.9.1 element-anchored dispatch: locator.evaluateHandle() wraps the
    // locator's CURRENT match in a handle; handle.click() must resolve THAT
    // node at dispatch time — an impostor at the glided coordinates can
    // never receive the event. Throws when the node detached post-resolution
    // (real ElementHandle behavior; probe treats it as its retry signal).
    // _dispatchGate is the test seam for a mid-dispatch detach: it runs at
    // dispatch time BEFORE the isConnected check, letting a test re-render
    // the DOM in the "final ms" (the v2.9.3 click() fallback contract).
    evaluateHandle: async (fn) => {
      const el = doc.querySelector(sel);
      if (!el) return null;
      let detached = false;
      return {
        _mockHandle: true,
        _el: el,
        _detachCheck() { detached = true; },
        evaluate: async (f) => f(el),
        click: async () => {
          if (page?._dispatchGate) await page._dispatchGate(el);
          if (detached || !el.isConnected) throw new Error('Element is not attached to the DOM');
          clickLog.push({ type: 'handle-click', text: el.textContent, id: el.id || null });
          const hook = page?._clickHook ?? page?._optsOnClick ?? null;
          if (hook) await hook(el);
        },
      };
    },
    hover: async () => {},
    boundingBox: async () => ({ x: 10, y: 10, width: 100, height: 20 }),
    scrollIntoViewIfNeeded: async () => {},
    getByRole: (role, o) => {
      const name = o?.name;
      if (name == null) return api;
      // Playwright semantics: role/name candidates are the matched elements
      // AND their interactive descendants (a dialog matches with its inner
      // Cancel button, not with its own concatenated text).
      const rx = navReOf(name);
      const matched = Array.from(doc.querySelectorAll(sel));
      const candidates = matched.flatMap((el) => [el, ...el.querySelectorAll('button, [role="button"], summary, a')]);
      const hits = candidates.filter((el) => {
        const txt = (el.textContent || '').trim();
        const aria = el.getAttribute?.('aria-label') ?? '';
        return rx ? (rx.test(txt) || (aria && rx.test(aria))) : txt === name;
      });
      return makeMultiHandle(doc, hits, clickLog, page);
    },
    getByText: (pat, o) => {
      const exact = o && 'exact' in o;
      const rx = navReOf(pat);
      const matches = Array.from(doc.querySelectorAll(sel)).filter((el) => {
        const txt = (el.textContent || '').trim();
        if (rx) return rx.test(txt);
        return exact ? txt === pat : txt.includes(pat);
      });
      return makeMultiHandle(doc, matches, clickLog, page);
    },
    filter: () => api,
  };
  return api;
}

// Accepts plain strings AND RegExp in nav-label style matches.
function navReOf(pat) {
  if (pat instanceof RegExp) return pat;
  if (typeof pat === 'string' && pat.startsWith('^')) return new RegExp(pat);
  return null;
}

// A locator-like handle over a pre-resolved set of elements (getByText result).
function makeMultiHandle(doc, els, clickLog, page) {
  const first = els[0] ?? null;
  return {
    _els: els,
    async isVisible() { return els.length > 0; },
    async count() { return els.length; },
    first() { return makeElementHandle(doc, first, '(multi)', 0, clickLog, page); },
    async click() {
      if (first) {
        clickLog.push({ type: 'element-click', text: (first.textContent || '').trim(), id: first.id });
        if (page?._clickHook) await page._clickHook(first);
      }
    },
    async hover() {},
    async boundingBox() { return { x: 10, y: 10, width: 80, height: 16 }; },
    async scrollIntoViewIfNeeded() {},
    async getAttribute(a) { return first?.getAttribute?.(a) ?? null; },
    async textContent() { return first?.textContent ?? null; },
    locator(inner) { return makeElementHandle(doc, first, inner, 0, clickLog, page).locator(inner); },
  };
}

// Minimal xpath support: 'following-sibling::TAG[n]' relative to a base element.
function makeXpath(doc, expr, clickLog, page, baseEl) {
  const m = expr.match(/^following-sibling::(\w+)\[(\d+)\]$/);
  const resolve = () => {
    if (!m || !baseEl) return null;
    const tag = m[1].toLowerCase(); const n = parseInt(m[2], 10);
    let sib = baseEl.nextElementSibling; let idx = 0;
    while (sib) { if (sib.tagName.toLowerCase() === tag) { idx++; if (idx === n) return sib; } sib = sib.nextElementSibling; }
    return null;
  };
  return {
    isVisible: async () => !!resolve(),
    count: async () => (resolve() ? 1 : 0),
    first() { return this; },
    click: async () => { const t = resolve(); if (t) clickLog.push({ type: 'element-click', text: (t.textContent || '').trim(), id: t.id }); },
  };
}

function makeElementHandle(doc, el, sel, n, clickLog, page) {
  const click = async () => {
    if (el) clickLog.push({ type: 'element-click', text: (el.textContent || '').trim(), id: el.id, sel, n });
    if (page?._clickHook) await page._clickHook(el);
  };
  return {
    _el: el, _sel: sel, _n: n,
    locator(inner) {
      const scope = el ?? doc;
      if (inner.startsWith('xpath=')) return makeXpath(doc, inner.slice(6), clickLog, page, el);
      return {
        count: async () => scope.querySelectorAll(inner).length,
        isVisible: async () => !!scope.querySelector(inner),
        first() { return this; },
        click: async () => { const t = scope.querySelector(inner) ?? el; if (t) clickLog.push({ type: 'element-click', text: (t.textContent || '').trim(), id: t.id }); },
        boundingBox: async () => ({ x: 10, y: 10, width: 80, height: 16 }),
        scrollIntoViewIfNeeded: async () => {},
        inputValue: async () => null,
        getAttribute: async (a) => (el ?? doc).getAttribute?.(a) ?? null,
      };
    },
    async count() { return el ? 1 : 0; },
    async isVisible() { return !!el; },
    async inputValue() { return el?.value ?? null; },
    async selectOption(v) { if (el) el.value = (v && typeof v === 'object' && 'label' in v) ? v.label : v; },
    click,
    async focus() {},
    async boundingBox() { return { x: 10, y: 10, width: 80, height: 16 }; },
    async scrollIntoViewIfNeeded() {},
    async getAttribute(a) { return el?.getAttribute?.(a) ?? null; },
    async textContent() { return el?.textContent ?? null; },
    filter() { return this; },
    first() { return this; },
    getByRole(role, o) {
      // Element-handle-scoped role/name filter (mock of Playwright chaining).
      if (!el) return makeMultiHandle(doc, [], clickLog, page);
      const name = o?.name;
      if (name == null) return makeMultiHandle(doc, [el], clickLog, page);
      const txt = (el.textContent || '').trim();
      const aria = el.getAttribute?.('aria-label') ?? '';
      const rx = navReOf(name);
      const hit = rx ? (rx.test(txt) || (aria && rx.test(aria))) : txt === name;
      return makeMultiHandle(doc, hit ? [el] : [], clickLog, page);
    },
    hover: async () => {},
  };
}

let modCounter = 0;
export async function loadEmbedded() {
  const url = MODULE_URL + '?v=' + (++modCounter);
  return import(url);
}
