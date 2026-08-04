/* ═══════════════════════════════════════════════════
   app.js — Hash Router / Tab 管理 / 过渡动效 / PWA 注册
   ═══════════════════════════════════════════════════ */

import * as journal from './views/journal.v2.js';
import * as memo from './views/memo.v3.js';
import * as books from './views/books.v2.js';
import * as movies from './views/movies.v2.js';
import * as settings from './views/settings.v2.js';
import * as flow from './views/flow.v2.js';
import * as search from './views/search.v2.js';
import './theme.v2.js';   // 侧效导入：加载即应用已保存主题

const MODULES = { flow, journals: journal, memos: memo, books: books, movies: movies, settings: settings, search };
const TABS = ['flow', 'journals', 'memos', 'books', 'movies'];

const viewEl = document.getElementById('view');
let rendering = false;

/* ---------- 路由解析 ---------- */
function parse() {
  const raw = (location.hash || '#/journals').replace(/^#\/?/, '');
  const [pathPart, queryStr] = raw.split('?');
  const seg = pathPart.split('/').filter(Boolean);
  const ROUTES = ['flow', 'journals', 'memos', 'books', 'movies', 'settings', 'search'];
  const tab = ROUTES.includes(seg[0]) ? seg[0] : 'flow';
  const query = new URLSearchParams(queryStr || '');
  if (tab === 'settings' || tab === 'search') return { tab, mode: 'list', id: null, query };
  const rest = seg[1] || '';
  if (!rest) return { tab, mode: 'list', id: null, query };
  if (rest === 'new') return { tab, mode: 'edit', id: null, query };
  if (rest === 'd') return { tab, mode: 'detail', id: seg[2] || null, query };
  if (rest === 'checkin') return { tab, mode: 'checkin', id: null, query };
  return { tab, mode: 'edit', id: rest, query };
}

/** 统一导航入口；replace=true 时用 replaceState 并强制重绘 */
export function nav(hash, replace = false) {
  if (replace && location.hash === hash) { render(); return; }
  if (replace) { history.replaceState(null, '', hash); render(); }
  else location.hash = hash;
}

/* ---------- 列表视图缓存 + 滚动位置记忆 ---------- */
/* 回到已渲染过的列表页时，直接复用 DOM 节点（不重读 IndexedDB / 不重建），
   并恢复离开时的 scrollTop，消除「返回跳顶部 + 卡顿 1 秒」的刷新感。 */
const LIST_TABS = ['flow', 'journals', 'memos', 'books', 'movies'];
const listCache = new Map();      // tab -> 已渲染的列表 DOM 节点
const scrollMemory = new Map();   // tab -> 离开列表时记录的 scrollTop
let currentTab = null;
let currentMode = null;

/* ---------- 渲染 ---------- */
async function render() {
  if (rendering) return;
  rendering = true;

  // 1) 离开前：若当前是数据类列表页，记录其滚动位置（节点尚在文档中，scrollTop 准确）
  if (currentMode === 'list' && currentTab && LIST_TABS.includes(currentTab)) {
    const sc = viewEl.querySelector('.scroll');
    if (sc) scrollMemory.set(currentTab, sc.scrollTop);
  }

  const { tab, mode, id, query } = parse();
  document.body.classList.toggle('editing', mode === 'edit');
  TABS.forEach(t => {
    const el = document.querySelector(`.tab[data-tab="${t}"]`);
    if (el) el.classList.toggle('on', t === tab);
  });
  const stEl = document.querySelector('.tab[data-tab="settings"]');
  if (stEl) stEl.classList.toggle('on', tab === 'settings');

  viewEl.classList.add('fading');
  const mod = MODULES[tab];
  const cacheable = mode === 'list' && LIST_TABS.includes(tab);
  let reused = false;

  let node;
  try {
    if (cacheable && listCache.has(tab)) {
      node = listCache.get(tab);          // 复用已渲染节点：零 DB 读取、零重建 → 无卡顿
      reused = true;
    } else if (mode === 'list') {
      node = await mod.list(nav, query);
      if (cacheable) listCache.set(tab, node);
    } else if (mode === 'detail') node = mod.detail ? await mod.detail(id, nav, query) : await mod.list(nav, query);
    else if (mode === 'checkin') node = mod.checkin ? await mod.checkin(nav, query) : await mod.list(nav, query);
    else node = mod.edit ? await mod.edit(id, nav, query) : await mod.list(nav, query);
  } catch (err) {
    console.error('[我思故我在] 页面渲染错误:', err);
    node = document.createElement('div');
    node.className = 'empty';
    node.innerHTML = `<div style="text-align:center;padding:2rem 1rem">
      <div style="font-size:2rem;margin-bottom:.5rem">🌧️</div>
      <div style="font-weight:600;color:var(--text);margin-bottom:.5rem">页面加载出错了</div>
      <pre style="font-size:.72rem;color:var(--muted);text-align:left;background:color-mix(in srgb, var(--text) 5%, transparent);padding:.5rem;border-radius:.4rem;overflow:auto;white-space:pre-wrap">${String(err.stack || err.message || err).replace(/</g,'&lt;')}</pre>
      <div style="margin-top:.8rem;font-size:.78rem;color:var(--muted)">请下拉重试 · 或在浏览器地址栏按 Enter 刷新</div>
    </div>`;
  }

  // 等待淡出完成（0.2s，与 CSS 一致）
  await new Promise(r => setTimeout(r, 180));
  viewEl.innerHTML = '';
  viewEl.appendChild(node);

  // 2) 进入列表页：仅当复用已渲染节点时，恢复离开前的滚动位置（避免误用到新建节点的旧位移）
  if (reused && scrollMemory.has(tab)) {
    const sc = node.querySelector('.scroll');
    if (sc) sc.scrollTop = scrollMemory.get(tab);
  }

  requestAnimationFrame(() => viewEl.classList.remove('fading'));

  currentTab = tab;
  currentMode = mode;
  rendering = false;
}

window.addEventListener('hashchange', render);
window.addEventListener('popstate', render);            /* 覆盖 iOS PWA 系统左滑返回：导航事件未触发时也重渲染 */
window.addEventListener('cogito:dbchange', () => {
  listCache.clear();   /* 数据已变更：作废列表缓存，下次进入列表重建以反映最新数据 */
  render();
});

/* ---------- 禁止缩放（iOS Safari 双指 / 双击）---------- */
['gesturestart', 'gesturechange', 'gestureend'].forEach(ev =>
  document.addEventListener(ev, e => e.preventDefault(), { passive: false })
);
document.addEventListener('touchmove', e => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });
let lastTouch = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTouch < 320) e.preventDefault();
  lastTouch = now;
}, { passive: false });

/* ---------- 启动 ---------- */
if (!location.hash) location.replace('#/flow');
render();

/* ---------- Service Worker ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // 先注销所有旧的 SW（解决 iOS 已安装 PWA 卡在旧版的问题）
    navigator.serviceWorker.getRegistrations()
      .then(regs => Promise.all(regs.map(r => r.unregister())))
      .then(() => navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }))
      .catch(err => console.warn('SW 注册失败', err));
  });
}
