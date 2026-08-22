/* ═══════════════════════════════════════════════════
   ui.js — DOM 工具 + 通用组件（Toast / 确认框 / 星级 /
   图片选择 / 表单控件 / 长按删除）
   ═══════════════════════════════════════════════════ */

import { db, getCustomOptions, addCustomOption, renameCustomOption, deleteCustomOption, updateRecordsField } from './db.v2.js';

/* ---------- DOM ---------- */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  // iOS Safari 坑：非原生交互元素（div/span 等）若无 cursor:pointer，
  // 即使 addEventListener('click') 也不会派发 click 事件 → 真机按钮全失效。
  // 这里统一给「带事件处理器的非交互标签」自动补 cursor:pointer，从源头根治。
  const CLICKABLE = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'SUMMARY']);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
      if (!CLICKABLE.has(el.tagName)) el.style.cursor = el.style.cursor || 'pointer';
    }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && k !== 'list' && typeof v !== 'object') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v);
  }
  children.flat(Infinity).forEach(c => {
    if (c === null || c === undefined || c === false) return;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  });
  return el;
}
export const frag = (...nodes) => { const f = document.createDocumentFragment(); nodes.flat(Infinity).filter(Boolean).forEach(n => f.appendChild(n)); return f; };

/* ---------- 日期 ---------- */
const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
export const pad = n => String(n).padStart(2, '0');
export function todayISO(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function nowLocalDT(d = new Date()) { return `${todayISO(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
export function weekdayCN(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  return isNaN(d) ? '' : WEEK[d.getDay()];
}
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  return isNaN(d) ? iso : `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}
export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? iso : `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fmtMonth(iso) {
  if (!iso) return '';
  const [y, m] = iso.split('-');
  return m ? `${y} 年 ${Number(m)} 月` : y;
}
export const dayOf = iso => (iso || '').slice(8, 10);
export const monOf = iso => { const m = (iso || '').slice(5, 7); return m ? `${Number(m)}月` : ''; };

/* ---------- Toast ---------- */
export function toast(msg, ms = 2000) {
  const host = document.getElementById('toast-host');
  const t = h('div', { class: 'toast' }, msg);
  host.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, ms);
}

/* ---------- 底部确认框 ---------- */
export function confirmSheet({ title = '确认操作', message = '', confirmText = '确定', danger = true } = {}) {
  return new Promise(resolve => {
    const host = document.getElementById('sheet-host');
    const close = val => { host.classList.remove('on'); host.innerHTML = ''; resolve(val); };
    const sheet = h('div', { class: 'sheet' },
      h('h3', {}, title),
      message ? h('p', {}, message) : null,
      h('div', { class: 'sheet-btns' },
        h('button', { class: 'sheet-btn ' + (danger ? 'danger' : 'cancel'), onclick: () => close(true) }, confirmText),
        h('button', { class: 'sheet-btn cancel', onclick: () => close(false) }, '取消')
      )
    );
    host.innerHTML = '';
    host.appendChild(h('div', { class: 'sheet-mask', onclick: () => close(false) }));
    host.appendChild(sheet);
    host.classList.add('on');
  });
}

/* ---------- 长按删除 ---------- */
/* 给任意卡片元素绑定长按手势：touch 或鼠标按住约 550ms 后触发 onTrigger。
   自动过滤滚动 / 位移，触发后抑制随之而来的点击事件，避免误跳转。
   返回原元素（不包裹），可直接当作卡片节点使用。 */
export function longPress(el, onTrigger) {
  let timer = null, lpFired = false, sx = 0, sy = 0;
  const DUR = 550, TOL = 12;
  const clear = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    el.classList.remove('lp-pending');
  };
  const start = (x, y) => {
    sx = x; sy = y; lpFired = false;
    el.classList.add('lp-pending');
    timer = setTimeout(() => {
      lpFired = true; clear(); el.classList.add('lp-active');
      if (navigator.vibrate) { try { navigator.vibrate(30); } catch {} }
      /* 抑制紧接着在卡片上的点击，防止跳转进详情 */
      const kill = e => {
        document.removeEventListener('click', kill, true);
        el.classList.remove('lp-active');
        if (el.contains(e.target)) { e.stopPropagation(); e.preventDefault(); lpFired = false; }
      };
      document.addEventListener('click', kill, true);
      onTrigger();
    }, DUR);
  };
  const move = (x, y) => {
    if (timer && (Math.abs(x - sx) > TOL || Math.abs(y - sy) > TOL)) clear();
  };
  /* 触摸端 */
  el.addEventListener('touchstart', e => { const t = e.touches[0]; start(t.clientX, t.clientY); }, { passive: true });
  el.addEventListener('touchmove', e => { const t = e.touches[0]; move(t.clientX, t.clientY); }, { passive: true });
  el.addEventListener('touchend', clear);
  el.addEventListener('touchcancel', clear);
  /* 桌面端（鼠标长按，便于测试）*/
  el.addEventListener('mousedown', e => {
    start(e.clientX, e.clientY);
    const up = () => { clear(); document.removeEventListener('mouseup', up); };
    document.addEventListener('mouseup', up);
  });
  el.addEventListener('mousemove', e => { if (timer) move(e.clientX, e.clientY); });
  /* 阻止 iOS 长按弹出系统菜单 / 选择 */
  el.addEventListener('contextmenu', e => { if (lpFired) e.preventDefault(); });
  return el;
}

/* ---------- 左滑操作行（露出 编辑 / 删除）---------- */
const _openRows = new Set();
function _closeOthers() { _openRows.forEach(w => { if (w._close) w._close(); }); }

/**
 * 把一张卡片包成可左滑的行。
 * @param card 原始卡片元素
 * @param opts.onEdit  点击「编辑」时触发
 * @param opts.onDelete 点击「删除」时触发
 * @param opts.onTap   未展开时单击卡片（通常进入详情）
 * 行为：触摸横向滑动 / 鼠标拖拽 露出右侧按钮；长按（桌面兜底）展开；纵向滑动交还页面滚动；单击触发 onTap。
 */
/**
 * 把一张卡片包成可左滑的行（Pointer Events 统一触摸 / 鼠标）。
 * @param card 原始卡片元素
 * @param opts.onEdit  点击「编辑」时触发
 * @param opts.onDelete 点击「删除」时触发
 * @param opts.onTap   未展开时单击卡片（通常进入详情）
 * 行为：横向滑动 / 鼠标拖拽 露出右侧按钮（单一可信状态源 `open` 同时驱动 class 与 pointer-events）；
 *       纵向滑动交还页面滚动；单击卡片在「展开时收起 / 未展开时触发 onTap」。
 */
export function swipeRow(card, { onEdit, onDelete, onTap } = {}) {
  const wrap = h('div', { class: 'swipe' });
  const editBtn = h('button', { class: 'swipe-btn edit', type: 'button' }, '编辑');
  const delBtn = h('button', { class: 'swipe-btn del', type: 'button' }, '删除');
  const actions = h('div', { class: 'swipe-actions' }, editBtn, delBtn);
  wrap.appendChild(actions);
  wrap.appendChild(card);

  let open = false, dragging = false, decided = false, horiz = false;
  let startX = 0, startY = 0, curX = 0, pid = null, suppressClick = false;
  const ACT_W = () => actions.offsetWidth || 150;
  const setX = (v) => { curX = v; card.style.transform = `translateX(${v}px)`; };
  const setOpen = (v) => {
    open = v;
    wrap.classList.toggle('open', v);
    actions.style.pointerEvents = v ? 'auto' : 'none';   // 单一可信状态源：露出的按钮立刻可点
    if (v) { _closeOthers(); _openRows.add(wrap); } else { _openRows.delete(wrap); }
    card.style.transition = 'transform .25s ease';
    setX(v ? -ACT_W() : 0);
  };
  setOpen(false);
  wrap._close = () => setOpen(false);

  // 按钮：纯 click。按钮是 card 的兄弟节点，触摸不冒泡到 card，iOS 合成 click 直接命中按钮本身。
  const fire = (fn) => { setOpen(false); fn && fn(); };
  editBtn.addEventListener('click', e => { e.stopPropagation(); fire(onEdit); });
  delBtn.addEventListener('click', e => { e.stopPropagation(); fire(onDelete); });

  const onDown = (x, y, id) => { pid = id; startX = x; startY = y; dragging = true; decided = false; horiz = false; suppressClick = false; card.style.transition = ''; };
  const onMove = (x, y, e) => {
    if (!dragging) return;
    const mx = x - startX, my = y - startY;
    if (!decided) { if (Math.abs(mx) > 8 || Math.abs(my) > 8) { decided = true; horiz = Math.abs(mx) > Math.abs(my); } else return; }
    if (!horiz) { dragging = false; return; }               // 纵向 → 交还页面滚动
    if (e && e.cancelable) e.preventDefault();
    const max = ACT_W();
    let v = (open ? -max : 0) + mx;
    v = Math.max(-max - 24, Math.min(0, v));
    card.style.transition = ''; setX(v);
  };
  const onUp = (e) => {
    if (!dragging) return;
    dragging = false;
    if (decided && horiz) {
      suppressClick = true;                                // 拖拽后抑制 iOS 合成 click 误触
      if (e && e.cancelable) e.preventDefault();
      if (curX < -ACT_W() / 2) setOpen(true); else setOpen(false);
    }
  };

  card.style.touchAction = 'pan-y';                       // 纵向仍可滚动，横向交给 JS
  card.addEventListener('pointerdown', e => onDown(e.clientX, e.clientY, e.pointerId));
  card.addEventListener('pointermove', e => { if (e.pointerId !== pid) return; onMove(e.clientX, e.clientY, e); });
  card.addEventListener('pointerup', e => { if (e.pointerId !== pid) return; onUp(e); });
  card.addEventListener('pointercancel', () => { dragging = false; });
  card.addEventListener('click', e => {
    if (suppressClick) { suppressClick = false; e.stopPropagation(); return; }
    if (open) { e.stopPropagation(); setOpen(false); return; }
    if (onTap) onTap();
  });

  return wrap;
}

/* ---------- 只读详情页外壳 ---------- */
export function detailShell({ title, onBack, content, actions = [] }) {
  return h('div', { class: 'page' },
    h('header', { class: 'appbar' },
      h('button', { class: 'icon-btn', onclick: onBack, 'aria-label': '返回' }, '‹'),
      h('h1', { style: { fontSize: '1.15rem' } }, title),
      ...actions
    ),
    h('div', { class: 'scroll' }, h('div', { class: 'detail' }, content))
  );
}

/* ---------- 星级评分（支持半星）---------- */
function starSVG(fillPercent) {
  const id = 'g' + Math.random().toString(36).slice(2, 8);
  const isMist = document.documentElement.getAttribute('data-theme') === 'mist';
  if (isMist) {
    // 晨雾暮光主题：竖向渐变金色（#E8D5B5 → #DCC49A），半星用 clipPath 裁切
    return `<svg viewBox="0 0 24 24">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#E8D5B5"/><stop offset="100%" stop-color="#DCC49A"/>
      </linearGradient>
      <clipPath id="${id}c"><rect x="0" y="0" width="${fillPercent}%" height="24"/></clipPath>
    </defs>
    <path class="star-empty-bg" d="M12 2.3l2.85 6.06 6.4.86-4.72 4.42 1.2 6.5L12 16.95 6.27 20.14l1.2-6.5L2.75 9.22l6.4-.86z"/>
    <path d="M12 2.3l2.85 6.06 6.4.86-4.72 4.42 1.2 6.5L12 16.95 6.27 20.14l1.2-6.5L2.75 9.22l6.4-.86z"
      fill="url(#${id})" clip-path="url(#${id}c)" stroke="#DCC49A" stroke-width=".9" stroke-linejoin="round"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24">
    <defs><linearGradient id="${id}">
      <stop class="star-fill" offset="${fillPercent}%"/><stop class="star-empty" offset="${fillPercent}%"/>
    </linearGradient></defs>
    <path d="M12 2.3l2.85 6.06 6.4.86-4.72 4.42 1.2 6.5L12 16.95 6.27 20.14l1.2-6.5L2.75 9.22l6.4-.86z"
      fill="url(#${id})" class="f-deco-stroke" stroke-width=".9" stroke-linejoin="round"/></svg>`;
}
/** 交互式评分控件；返回 { el, get(), set(v) } */
export function starRating(value = 0, { readonly = false, onChange } = {}) {
  let v = Number(value) || 0;
  const stars = [];
  const score = h('span', { class: 'star-score' }, v ? v.toFixed(1) : '');
  const box = h('div', { class: 'stars' });
  const paint = () => {
    stars.forEach((s, i) => {
      const p = Math.max(0, Math.min(1, v - i)) * 100;
      s.innerHTML = starSVG(p);
    });
    score.textContent = v ? v.toFixed(1) : '';
  };
  for (let i = 0; i < 5; i++) {
    const s = h('div', { class: 'star' });
    if (!readonly) {
      s.addEventListener('click', ev => {
        const r = s.getBoundingClientRect();
        const half = (ev.clientX - r.left) < r.width / 2;
        v = i + (half ? 0.5 : 1);
        s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop');
        paint(); onChange && onChange(v);
      });
    }
    stars.push(s); box.appendChild(s);
  }
  box.appendChild(score);
  if (!readonly) {
    box.appendChild(h('button', {
      type: 'button', class: 'star-clear',
      onclick: () => { v = 0; paint(); onChange && onChange(0); }
    }, '清除'));
  }
  paint();
  return { el: box, get: () => v, set: nv => { v = Number(nv) || 0; paint(); } };
}
/** 只读小星星（列表展示用）*/
export function starsStatic(v) {
  const box = h('div', { class: 'stars', style: { gap: '1px' } });
  for (let i = 0; i < 5; i++) {
    const s = h('div', { class: 'star', style: { width: '.8rem', height: '.8rem' } });
    s.innerHTML = starSVG(Math.max(0, Math.min(1, (v || 0) - i)) * 100);
    box.appendChild(s);
  }
  if (v) box.appendChild(h('span', { style: { marginLeft: '.25rem', fontSize: '.7rem', color: 'var(--muted)' } }, v.toFixed(1)));
  return box;
}

/* ---------- 图片选择（相册）+ 压缩 ---------- */
export function compressImage(file, maxW = 720, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale), ht = Math.round(img.height * scale);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = ht;
        cv.getContext('2d').drawImage(img, 0, 0, w, ht);
        try { resolve(cv.toDataURL('image/jpeg', quality)); }
        catch { resolve(fr.result); }
      };
      img.onerror = reject;
      img.src = fr.result;
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

/** 封面/海报上传控件；返回 { el, get() } */
export function imagePicker(initial = '', placeholderEmoji = 'bookmark') {
  let data = initial || '';
  const preview = h('div', { class: 'up-preview' });
  const paint = () => {
    preview.innerHTML = '';
    if (data) preview.appendChild(h('img', { src: data, alt: '' }));
    else preview.appendChild(h('span', { class: 'up-ph' },
      document.getElementById('tw-' + placeholderEmoji) ? icon(placeholderEmoji) : document.createTextNode(placeholderEmoji)));
  };
  const input = h('input', {
    type: 'file', accept: 'image/*', style: { display: 'none' },
    onchange: async e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try { data = await compressImage(f); paint(); toast('图片已添加 🌿'); }
      catch { toast('图片读取失败'); }
      input.value = '';
    }
  });
  const el = h('div', { class: 'uploader' },
    preview,
    h('div', { class: 'up-actions' },
      h('button', { type: 'button', class: 'btn-soft', onclick: () => input.click() }, '从相册选择'),
      h('button', { type: 'button', class: 'btn-soft ghost', onclick: () => { data = ''; paint(); } }, '移除图片'),
      input
    )
  );
  paint();
  return { el, get: () => data };
}

/* ---------- 正文渲染 / @关联 检索 ---------- */
/** 去掉 HTML 标签，得到纯文本（用于列表预览 / 搜索 / 摘要）*/
export function stripBody(html) {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  return (d.textContent || '').replace(/​/g, '').replace(/\s+/g, ' ').trim();
}

export function truncate(s, n) {
  s = (s || '').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/** 异步渲染正文到容器：兼容纯文本 / HTML，并把 @关联 标签变成可点击链接 */
export async function renderBody(container, html, nav) {
  if (!html || !html.trim()) { container.textContent = '（空白）'; return; }
  if (html.indexOf('<') === -1) {
    const esc = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    container.innerHTML = esc.replace(/\n/g, '<br>');
  } else {
    container.innerHTML = html;
  }
  const mentions = container.querySelectorAll('.mention[data-type][data-id]');
  for (const m of mentions) {
    const type = m.dataset.type, id = m.dataset.id;
    let target = null;
    try { target = await db.get(type === 'book' ? 'books' : 'movies', id); } catch (e) {}
    if (target && target.title) m.textContent = (type === 'book' ? '📖' : '🎬') + '《' + target.title + '》';
    m.classList.add('mention-link');
    m.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); nav('#/' + (type === 'book' ? 'books' : 'movies') + '/d/' + id); });
  }
}

/* ---------- 空白日记氛围文案（系统配，非用户正文） ---------- */
const JOURNAL_AMBIANCE = [
  // 一、温柔日常
  '今日无话，只留存风和情绪。',
  '今日没有长篇思绪，简单标记生活碎片。',
  '思绪放空的一天，仅记下三餐与阴晴。',
  '今日沉默，把心情、天气好好收藏。',
  '不必强迫落笔，平淡本身也是日常。',
  // 二、极简冷淡风
  '今日无字，仅存生活痕迹。',
  '思绪留白，记录细碎日常。',
  '无话可说，仅标记今日状态。',
  '空白文字，完整生活。',
  // 三、治愈文艺短句
  '允许今天只感受，不诉说。',
  '语言暂时搁置，留住当下的天气与情绪。',
  '今日大脑放空，烟火与阴晴自有记录。',
  '有些日子，适合安静存档，无需文字注解。'
];

/**
 * 空白日记的氛围文案。按日记 id 稳定哈希取一句，保证同一篇日记永远显示同一句，
 * 不会因每次渲染而跳变（避免像 bug）。
 */
export function journalAmbiance(rec) {
  const seed = (rec && (rec.id || rec.date)) || '';
  let hsh = 0;
  for (let i = 0; i < seed.length; i++) hsh = (hsh * 31 + seed.charCodeAt(i)) >>> 0;
  return JOURNAL_AMBIANCE[hsh % JOURNAL_AMBIANCE.length];
}

/** 反向检索：找出正文里 @过 该 book / movie 的日记与备忘 */
export async function findMentions(type, id) {
  const out = [];
  for (const store of ['journals', 'memos']) {
    const rows = await db.all(store);
    for (const r of rows) {
      const html = r.content || '';
      if (html.indexOf('<') === -1) continue;            // 纯文本正文不含关联
      const doc = new DOMParser().parseFromString(html, 'text/html');
      if (doc.querySelector(`.mention[data-type="${type}"][data-id="${id}"]`)) out.push({ store, rec: r });
    }
  }
  return out;
}

/** 构建 @关联 数据源（书籍 + 影视，按最近添加排序）*/
export async function mentionSource() {
  const [bs, ms] = await Promise.all([db.all('books'), db.all('movies')]);
  const b = bs.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).map(r => ({ type: 'book', id: r.id, title: r.title }));
  const m = ms.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).map(r => ({ type: 'movie', id: r.id, title: r.title }));
  return [...b, ...m].filter(x => x.title);
}

/* ---------- 轻量富文本编辑器（正文内联图片） ---------- */
export function richBody(initial = '', { withImage = true, mention = null, placeholder = '' } = {}) {
  const editor = h('div', { class: 'rte', contenteditable: 'true', spellcheck: 'false' });
  if (placeholder) editor.setAttribute('data-placeholder', placeholder);
  const load = (txt) => {
    if (txt && txt.indexOf('<') !== -1) editor.innerHTML = txt;       // 已是 HTML（含图片）
    else editor.innerHTML = (txt || '').replace(/\n/g, '<br>');         // 旧纯文本：换行转 <br>
  };
  load(initial);
  const insertAtCursor = (url) => {
    editor.focus();
    let ok = false;
    try { ok = document.execCommand('insertImage', false, url); } catch (e) { ok = false; }
    if (!ok) {
      editor.appendChild(h('img', { src: url, class: 'rte-img', alt: '' }));
    } else {
      const imgs = editor.querySelectorAll('img');
      if (imgs.length) imgs[imgs.length - 1].classList.add('rte-img');
    }
  };
  const bar = h('div', { class: 'rte-bar' });
  let fileInput;
  if (withImage) {
    fileInput = h('input', {
      type: 'file', accept: 'image/*', style: { display: 'none' },
      onchange: async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        try { const url = await compressImage(f); insertAtCursor(url); toast('图片已插入 🌿'); }
        catch { toast('图片读取失败'); }
        fileInput.value = '';
      }
    });
    bar.appendChild(h('button', { type: 'button', class: 'rte-tool', onclick: () => fileInput.click() }, icon('image')));
    bar.appendChild(fileInput);
  }

  /* ── 富文本格式工具栏（扩展 rte-bar）──
     移动端要点：点工具栏按钮时编辑器易失焦丢选区，故按钮 mousedown 均 preventDefault 保住选区；
     颜色/高亮需先存选区、在弹层里选色后再恢复选区执行命令。 */
  try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
  let savedRange = null;
  const saveRange = () => {
    try { const s = window.getSelection(); if (s.rangeCount && editor.contains(s.anchorNode)) return s.getRangeAt(0).cloneRange(); } catch (e) {}
    return null;
  };
  const refreshStates = () => {
    try {
      bar.querySelectorAll('[data-cmd]').forEach((b) => {
        const on = document.queryCommandState(b.dataset.cmd);
        b.classList.toggle('on', !!on);
      });
    } catch (e) {}
  };
  const fmt = (cmd, val) => {
    // iOS 点工具栏按钮时选区会被 touch 塌缩，故先恢复最近一次有效选区再执行命令
    const s = window.getSelection();
    if (savedRange && (!s.rangeCount || s.getRangeAt(0).collapsed)) {
      try { s.removeAllRanges(); s.addRange(savedRange); } catch (e) {}
    }
    editor.focus();
    try { document.execCommand(cmd, false, val || null); } catch (e) {}
    refreshStates();
  };
  const tool = (label, cmd, val, title, stateCmd) => h('button', {
    type: 'button', class: 'rte-tool', title: title || label,
    ...(stateCmd ? { dataset: { cmd: stateCmd } } : {}),
    onmousedown: (e) => e.preventDefault(),
    onclick: () => fmt(cmd, val)
  }, label);

  // 颜色 / 高亮 弹层
  const pop = h('div', { class: 'rte-pop', style: { display: 'none' } });
  // 文字颜色用深色系（前景可读），高亮用粉彩系（背景柔和）
  const FORE_SWATCHES = ['#4D4A45','#A39D95','#D4A88A','#C8B8D4','#88B5C6','#B8848A','#8AA89A','#C8BC8A','#C8A8A8','#A89080','#8A9AA8','#D4B8B8'];
  const HILITE_SWATCHES = ['#F5D4D4','#C8E0D8','#F5ECD4','#D8D0E8','#D0E0ED','#F5DCC8'];
  let popMode = 'fore';
  const applyColor = (color, clearOnly) => {
    const s = window.getSelection();
    if (savedRange) { try { s.removeAllRanges(); s.addRange(savedRange); } catch (e) {} }
    editor.focus();
    try {
      if (clearOnly) document.execCommand('hiliteColor', false, 'transparent');
      else document.execCommand(popMode === 'fore' ? 'foreColor' : 'hiliteColor', false, color);
    } catch (e) {}
    refreshStates();
  };
  const closePop = () => { pop.style.display = 'none'; document.removeEventListener('mousedown', outside, true); };
  const outside = (e) => {
    if (!pop.contains(e.target) && !(e.target.closest && e.target.closest('.rte-tool-color'))) {
      pop.style.display = 'none';
      document.removeEventListener('mousedown', outside, true);
    }
  };
  const buildPop = () => {
    pop.innerHTML = '';
    const grid = h('div', { class: 'sw-row' });
    (popMode === 'fore' ? FORE_SWATCHES : HILITE_SWATCHES).forEach((c) => {
      grid.appendChild(h('button', {
        type: 'button', class: 'swatch', style: { background: c }, title: c,
        onmousedown: (e) => e.preventDefault(),
        onclick: () => { applyColor(c); closePop(); }
      }));
    });
    pop.appendChild(grid);
    const colorInput = h('input', { type: 'color', class: 'rte-color', value: '#1971c2' });
    colorInput.addEventListener('change', () => { applyColor(colorInput.value); closePop(); });
    pop.appendChild(h('label', { class: 'rte-color-label' }, [colorInput, ' 自定义颜色']));
    if (popMode === 'hilite') {
      pop.appendChild(h('button', {
        type: 'button', class: 'rte-clear',
        onmousedown: (e) => e.preventDefault(),
        onclick: () => { applyColor(null, true); closePop(); }
      }, '清除高亮'));
    }
  };
  const openPop = (mode) => {
    popMode = mode; buildPop();
    savedRange = saveRange();
    pop.style.display = 'block';
    setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
  };
  const colorBtn = (label, mode, title) => h('button', {
    type: 'button', class: 'rte-tool rte-tool-color', title: title,
    onmousedown: (e) => e.preventDefault(),
    onclick: () => openPop(mode)
  }, label);

  editor.addEventListener('keyup', refreshStates);
  editor.addEventListener('click', refreshStates);
  document.addEventListener('selectionchange', () => {
    try {
      if (document.activeElement === editor) { savedRange = saveRange(); refreshStates(); }
    } catch (e) {}
  });

  // 插入格式按钮（与插入图片并排）
  bar.appendChild(tool('B', 'bold', null, '加粗', 'bold'));
  bar.appendChild(tool('I', 'italic', null, '斜体', 'italic'));
  bar.appendChild(tool('U', 'underline', null, '下划线', 'underline'));
  bar.appendChild(tool('1.', 'insertOrderedList', null, '编号列表'));
  bar.appendChild(tool('•', 'insertUnorderedList', null, '项目符号'));
  bar.appendChild(colorBtn('🎨', 'fore', '文字颜色'));
  bar.appendChild(colorBtn('🖍', 'hilite', '高亮'));
  bar.appendChild(tool('⌫', 'removeFormat', null, '清除格式'));

  const wrap = h('div', { class: 'rte-wrap' }, bar, editor, pop);
  if (mention) attachMention(editor, mention);
  return {
    el: wrap,
    get: () => editor.innerHTML,
    set: load
  };
}

/* ---------- @关联 下拉（微信群模式：内联卡片，不追踪光标）---------- */
/**
 * 给 contenteditable 编辑器接入 @ 触发下拉。
 *
 * 【微信群模式】面板作为编辑器的内联兄弟节点（不挂 body、不用 getBoundingClientRect），
 *           紧贴编辑器下方弹出，键盘弹起时随编辑器上移，不会飘移。
 *           选中后在光标处插入不可编辑的 .mention 标签（含 data-type / data-id）。
 *
 * @param editor   contenteditable 元素
 * @param source   [{ type:'book'|'movie', id, title }, ...]
 */
function attachMention(editor, source) {
  try {
    /* 清理旧面板/遮罩（防御性，避免反复进出编辑器时堆积） */
    document.querySelectorAll('.mention-panel, .mention-scrim').forEach(p => p.remove());
    if (window.__mentionNav) { window.removeEventListener('hashchange', window.__mentionNav); window.__mentionNav = null; }

    /* 面板与遮罩都挂在 body 上，做成从屏幕底部弹起的浮层（微信式） */
    const scrim = h('div', { class: 'mention-scrim' });
    const panel = h('div', { class: 'mention-panel' });
    document.body.appendChild(scrim);
    document.body.appendChild(panel);

    let items = [], active = 0, open = false, captured = null;

    const close = () => {
      open = false; captured = null;
      panel.classList.remove('open'); scrim.classList.remove('open');
      setTimeout(() => { panel.style.display = 'none'; }, 220);
      panel.innerHTML = '';
    };

    const renderItems = () => {
      panel.innerHTML = '';
      const head = h('div', { class: 'mention-head' },
        h('span', { class: 'mention-title' }, '选择关联的作品'),
        h('button', {
          class: 'mention-close',
          onmousedown: (e) => { e.preventDefault(); close(); },
          ontouchstart: (e) => { e.preventDefault(); close(); }
        }, '✕')
      );
      panel.appendChild(head);
      const list = h('div', { class: 'mention-list' });
      panel.appendChild(list);
      if (!items.length) { list.appendChild(h('div', { class: 'mention-empty' }, '没有匹配的作品')); return; }
      items.forEach((it, i) => {
        const row = h('div', {
          class: 'mention-item' + (i === active ? ' on' : ''),
          onmousedown: (e) => { e.preventDefault(); choose(it); },
          /* 移动端触摸：touchstart 就选中，不用等 click（避免 iOS 300ms 延迟或合成 click 被拦截） */
          ontouchstart: (e) => { e.preventDefault(); choose(it); }
        },
          h('span', { class: 'mention-ico' }, icon(it.type === 'book' ? 'bookmark' : 'movie')),
          h('span', { class: 'mention-label' }, it.title || '(无标题)')
        );
        list.appendChild(row);
      });
    };

    /* 在 root 内按「全局文本偏移」定位到具体文本节点及其节点内偏移
       （兼容 iOS 把光标放在元素节点、而非文本节点的情况）*/
    const locate = (root, globalOffset) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let acc = 0, n;
      while ((n = walker.nextNode())) {
        const len = n.textContent.length;
        if (acc + len >= globalOffset) return { node: n, acc, localOffset: globalOffset - acc };
        acc += len;
      }
      return null;
    };

    const queryAt = () => {
      try {
        const sel = window.getSelection();
        if (!sel.rangeCount) return null;
        const range = sel.getRangeAt(0);
        if (!range.collapsed) return null;
        /* 取「编辑器开头 → 光标」的全部文本，不依赖 startContainer 是否为文本节点 */
        const pre = range.cloneRange();
        pre.selectNodeContents(editor); pre.setEnd(range.startContainer, range.startOffset);
        const before = pre.toString();
        const atGlobal = before.lastIndexOf('@');
        if (atGlobal === -1) return null;
        const q = before.slice(atGlobal + 1);
        if (/\s/.test(q)) return null;
        const pos = locate(editor, atGlobal);
        if (!pos) return null;
        const caretGlobal = before.length;
        const endLocal = (caretGlobal <= pos.acc + pos.node.textContent.length)
          ? caretGlobal - pos.acc : pos.node.textContent.length;
        return { node: pos.node, at: pos.localOffset, offset: endLocal, q };
      } catch { return null; }
    };

    const openPanel = () => {
      const info = queryAt();
      /* 已打开时保持（比如一次输入触发 input+keyup 两次），不闪烁、不误关 */
      if (!info) { if (open) { /* keep */ } return; }
      captured = info;                       // 冻结选区，失焦后仍能准确插入
      const q = info.q.toLowerCase();
      items = (source || [])
        .filter(s => (s.title || '').toLowerCase().includes(q))
        .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-Hans-CN-u-kf-upper'))
        .slice(0, 60);
      active = 0;
      if (!open) {
        open = true;
        panel.style.display = 'flex';
        scrim.classList.add('open');
        requestAnimationFrame(() => { panel.classList.add('open'); });
        /* 弹出即收起键盘，让底部卡片完整露出、可点选 */
        try { editor.blur(); } catch {}
      }
      renderItems();
    };

    const choose = (item) => {
      const info = captured;                 // 用冻结的选区，不依赖实时 selection
      if (!info || !item) { close(); return; }
      try {
        if (!info.node.isConnected) { close(); return; }
        const tn = info.node;
        const r = document.createRange();
        r.setStart(tn, info.at); r.setEnd(tn, info.offset);
        r.deleteContents();
        const span = h('span', {
          class: 'mention', contenteditable: 'false',
          dataset: { type: item.type, id: item.id }
        }, (item.type === 'book' ? '📖' : '🎬') + '《' + (item.title || '') + '》');
        r.insertNode(span);
        const space = document.createTextNode('\u00A0');
        span.parentNode.insertBefore(space, span.nextSibling);
        const after = document.createRange();
        after.setStart(space, 1); after.collapse(true);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(after);
        close();
        /* 回到编辑区并重新唤起键盘，继续打字 */
        editor.focus();
      } catch { close(); }
    };

    /* 点击遮罩（面板外区域）= 取消 */
    scrim.addEventListener('mousedown', (e) => { e.preventDefault(); close(); });
    scrim.addEventListener('touchstart', (e) => { e.preventDefault(); close(); }, { passive: false });

    editor.addEventListener('input', openPanel);
    editor.addEventListener('keyup', (e) => { if (e.key === ' ') close(); else openPanel(); });
    editor.addEventListener('click', openPanel);
    editor.addEventListener('keydown', (e) => {
      if (!open) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % Math.max(items.length, 1); renderItems(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % Math.max(items.length, 1); renderItems(); }
      else if (e.key === 'Enter') { if (items.length) { e.preventDefault(); choose(items[active]); } }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });

    /* 离开页面（路由切换）时清掉浮层，避免残留 */
    const onNav = () => { try { panel.remove(); scrim.remove(); } catch {} };
    window.addEventListener('hashchange', onNav);
    window.__mentionNav = onNav;
  } catch (err) {
    console.warn('[attachMention] 初始化失败（不影响其他功能）:', err.message);
  }
}

/* ---------- 表单控件 ---------- */
export function field(label, control, { required = false, hint = '' } = {}) {
  return h('div', { class: 'field' },
    h('label', {}, label, required ? h('span', { class: 'req' }, '*') : null),
    control,
    hint ? h('div', { class: 'hint' }, hint) : null
  );
}

export function input(props = {}) { return h('input', { class: 'input', ...props }); }

export function textarea({ value = '', maxlength = 0, placeholder = '', small = false } = {}) {
  const ta = h('textarea', { class: 'textarea' + (small ? ' sm' : ''), placeholder, value });
  if (maxlength) ta.maxLength = maxlength;
  const cnt = h('div', { class: 'counter' });
  const grow = () => {
    /* 先复位到 auto 再量真实内容高度，避免高度叠加误差 */
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  };
  const upd = () => {
    cnt.textContent = maxlength ? `${ta.value.length} / ${maxlength}` : `${ta.value.length} 字`;
    grow();
  };
  ta.addEventListener('input', upd);
  const el = h('div', { class: 'field', style: { gap: '.2rem' } }, ta, cnt);

  /* 初始撑高：必须等元素真正挂载到文档、布局完成后再量 scrollHeight 才准确。
     编辑页是异步构建的，构建时调度的 rAF 可能在挂载前就触发，量到 0 → 被 min-height 压成小框。
     故用 MutationObserver 等挂载完成后，再多次补撑（兼容字体/图片延迟加载）。 */
  const doGrow = () => { if (!ta.isConnected) return; grow(); };
  const scheduleGrow = () => {
    doGrow();
    requestAnimationFrame(doGrow);
    requestAnimationFrame(() => requestAnimationFrame(doGrow));
    setTimeout(doGrow, 80);
    setTimeout(doGrow, 250);
  };
  if (ta.isConnected) {
    scheduleGrow();
  } else {
    const mo = new MutationObserver(() => {
      if (ta.isConnected) { mo.disconnect(); scheduleGrow(); }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    /* 兜底：极端情况下 observer 未命中也在 600ms 后补撑一次 */
    setTimeout(() => { try { mo.disconnect(); } catch (e) {} scheduleGrow(); }, 600);
  }
  return { el, ta, get: () => ta.value };
}

export function select(options, value = '', props = {}) {
  const s = h('select', { class: 'select', ...props });
  options.forEach(o => {
    const [val, txt] = Array.isArray(o) ? o : [o, o];
    s.appendChild(h('option', { value: val, selected: val === value }, txt));
  });
  if (value && !options.some(o => (Array.isArray(o) ? o[0] : o) === value)) {
    s.insertBefore(h('option', { value, selected: true }, value), s.firstChild);
  }
  return s;
}

/** 下拉 + 可自定义（自定义项持久化到 meta store）*/
export async function selectCustom(key, presets, value = '', opts = {}) {
  const custom = await getCustomOptions(key);
  const all = [...presets, ...custom.filter(c => !presets.includes(c))];
  const s = select([...all, ['__new__', '＋ 自定义…']], value);
  const row = h('div', { class: 'custom-row', style: { display: 'none' } });
  const txt = input({ placeholder: '', maxlength: 12 });
  const ok = h('button', {
    type: 'button', class: 'btn-soft',
    onclick: async () => {
      const v = txt.value.trim();
      if (!v) return;
      await addCustomOption(key, v);
      s.insertBefore(h('option', { value: v }, v), s.lastChild);
      s.value = v; row.style.display = 'none'; txt.value = '';
      toast('已添加选项 ✨');
    }
  }, '添加');
  row.append(txt, ok);
  s.addEventListener('change', () => {
    if (s.value === '__new__') { row.style.display = 'flex'; s.value = value || presets[0]; txt.focus(); }
  });
  const el = h('div', {}, s, row);
  if (opts.store) {
    const refreshSelect = async () => {
      const c2 = await getCustomOptions(key);
      const a2 = [...presets, ...c2.filter(c => !presets.includes(c))];
      const cur = s.value === '__new__' ? (value || presets[0]) : s.value;
      s.innerHTML = '';
      [...a2, ['__new__', '＋ 自定义…']].forEach(([v, t]) => {
        const o = h('option', { value: v }, t);
        if (v === cur) o.selected = true;
        s.appendChild(o);
      });
    };
    el.appendChild(h('button', {
      type: 'button', class: 'link-btn',
      style: { fontSize: '.78rem', color: 'var(--text)', marginTop: '.4rem', display: 'block', textDecoration: 'underline', textUnderlineOffset: '2px' },
      onclick: () => manageOptions(key, presets, { ...opts, onChange: refreshSelect })
    }, '管理自定义项'));
  }
  return { el, get: () => (s.value === '__new__' ? '' : s.value) };
}

/** 多选（类型 / 标签等）：预设 + 自定义持久化，可多选切换。get() 返回数组 */
export async function multiSelectCustom(key, presets, values = []) {
  const init = Array.isArray(values) ? values : (values ? [values] : []);
  const sel = new Set(init.filter(Boolean));
  const custom = await getCustomOptions(key);
  const box = h('div', { class: 'radio-group' });
  const renderChips = () => {
    box.innerHTML = '';
    const cur = [...presets, ...custom.filter(c => !presets.includes(c))];
    cur.forEach(o => {
      const b = h('div', {
        class: 'radio-opt' + (sel.has(o) ? ' on' : ''),
        onclick: () => { sel.has(o) ? sel.delete(o) : sel.add(o); b.classList.toggle('on'); }
      }, o);
      box.appendChild(b);
    });
    box.appendChild(h('div', { class: 'radio-opt add-opt', onclick: showAdd }, '＋ 自定义…'));
  };
  const showAdd = () => {
    const row = h('div', { class: 'custom-row' });
    const txt = input({ placeholder: '输入新类型', maxlength: 12 });
    const ok = h('button', {
      type: 'button', class: 'btn-soft',
      onclick: async () => {
        const v = txt.value.trim();
        if (!v) return;
        await addCustomOption(key, v);
        if (!custom.includes(v)) custom.push(v);
        sel.add(v);
        renderChips();
        toast('已添加 ✨');
      }
    }, '添加');
    row.append(txt, ok);
    box.appendChild(row);
    txt.focus();
  };
  renderChips();
  const el = h('div', {}, box);
  return { el, get: () => [...sel] };
}

/** 自定义选项管理弹窗：列出全部自定义项，支持重命名 / 删除。
   opts.store + opts.field 提供时，会联动把使用该选项的记录改回默认 / 重命名。 */
export function manageOptions(key, presets, opts = {}) {
  const { store, field, onChange } = opts || {};
  const host = document.getElementById('sheet-host');
  const close = () => { host.classList.remove('on'); host.innerHTML = ''; };

  const doDelete = async (name) => {
    const ok = await confirmSheet({
      title: '删除这个选项？',
      message: store ? `使用「${name}」的记录会改回默认分类` : '删除后无法恢复',
      confirmText: '删除', danger: true
    });
    if (!ok) return;
    await deleteCustomOption(key, name);
    if (store) await updateRecordsField(store, field, name, presets[0] || '');
    toast('已删除');
    if (onChange) await onChange();
    render();
  };

  const startRename = (row, old) => {
    const inp = input({
      value: old, maxlength: 12,
      style: { flex: '1', padding: '.4rem .5rem', fontSize: '.95rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--card)', color: 'var(--text)' }
    });
    const commit = async () => {
      const nv = inp.value.trim();
      if (!nv || nv === old) { render(); return; }
      await renameCustomOption(key, old, nv);
      if (store) await updateRecordsField(store, field, old, nv);
      toast('已重命名');
      if (onChange) await onChange();
      render();
    };
    row.replaceChildren(
      inp,
      h('button', { class: 'sheet-btn', style: { padding: '.3rem .7rem' }, onclick: commit }, '确定'),
      h('button', { class: 'sheet-btn cancel', style: { padding: '.3rem .7rem' }, onclick: render }, '取消')
    );
    setTimeout(() => inp.focus(), 30);
  };

  const render = async () => {
    const custom = await getCustomOptions(key);
    const list = custom.filter(c => !presets.includes(c));
    const body = h('div', { style: { maxHeight: '52vh', overflowY: 'auto', marginTop: '.3rem' } });
    if (!list.length) {
      body.appendChild(h('p', { style: { color: 'var(--muted)', fontSize: '.82rem', textAlign: 'center', padding: '.9rem 0' } }, '还没有自定义选项'));
    }
    list.forEach(name => {
      const row = h('div', { style: { display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.6rem 0', borderBottom: '1px solid var(--border)' } },
        h('span', { style: { flex: '1', fontSize: '.95rem', color: 'var(--text)' } }, name),
        h('button', { class: 'icon-btn', onclick: () => startRename(row, name) }, icon('pencil')),
        h('button', { class: 'icon-btn', onclick: () => doDelete(name) }, icon('delete'))
      );
      body.appendChild(row);
    });
    sheet.replaceChildren(
      h('h3', {}, '管理分类'),
      body,
      h('div', { class: 'sheet-btns' }, h('button', { class: 'sheet-btn cancel', onclick: close }, '完成'))
    );
  };

  const sheet = h('div', { class: 'sheet' });
  host.innerHTML = '';
  host.appendChild(h('div', { class: 'sheet-mask', onclick: close }));
  host.appendChild(sheet);
  host.classList.add('on');
  render();
}

/** 单选按钮组 */
export function radioGroup(options, value = '') {
  let v = value || options[0];
  const box = h('div', { class: 'radio-group' });
  const opts = options.map(o => {
    const b = h('div', { class: 'radio-opt' + (o === v ? ' on' : ''), onclick: () => { v = o; opts.forEach(x => x.classList.toggle('on', x.textContent === v)); } }, o);
    box.appendChild(b); return b;
  });
  return { el: box, get: () => v };
}

/** Emoji 心情选择器 */
export function emojiPicker(list, value) {
  let v = value || list[0];
  const box = h('div', { class: 'emoji-grid' });
  const opts = list.map(e => {
    const b = h('div', { class: 'emoji-opt' + (e === v ? ' on' : ''), onclick: () => { v = e; opts.forEach((x, i) => x.classList.toggle('on', list[i] === v)); } }, e);
    box.appendChild(b); return b;
  });
  return { el: box, get: () => v };
}

/* ---------- 页面骨架 ---------- */
export function pageShell({ title, sub = '', actions = [], toolbar = null, stats = null, content }) {
  return h('div', { class: 'page' },
    h('header', { class: 'appbar' },
      h('h1', {}, sub ? h('span', { class: 'sub' }, sub) : null, title),
      ...actions
    ),
    stats,
    toolbar,
    h('div', { class: 'scroll' }, content)
  );
}

export function editorShell({ title, onBack, form, onSave, saveText = '保存' }) {
  return h('div', { class: 'page' },
    h('header', { class: 'appbar' },
      h('button', { class: 'icon-btn', onclick: onBack, 'aria-label': '返回' }, '‹'),
      h('h1', { style: { fontSize: '1.15rem' } }, title)
    ),
    h('div', { class: 'scroll' }, h('div', { class: 'form' }, form)),
    h('div', { class: 'savebar' }, h('button', { class: 'btn-primary', onclick: onSave }, saveText))
  );
}

/** 彩色图标：返回引用 #tw-<name> 的 <svg> 节点（Twemoji CC-BY 4.0，保留原始 fill 色） */
export function icon(name, cls = '') {
  const tmp = document.createElement('div');
  tmp.innerHTML = `<svg class="tw-icon${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#tw-${name}"></use></svg>`;
  return tmp.firstElementChild;
}

export function emptyState(iconArg, title, desc) {
  let emo;
  if (typeof iconArg === 'string' && document.getElementById('tw-' + iconArg)) emo = icon(iconArg);
  else if (typeof iconArg === 'string') emo = document.createTextNode(iconArg);
  else emo = iconArg;
  return h('div', { class: 'empty' },
    h('span', { class: 'emo' }, emo),
    h('p', { style: { fontWeight: '600', color: 'var(--text)' } }, title),
    h('p', {}, desc)
  );
}

/** 模块内搜索 → 升级为全局搜索的入口行 */
export function globalSearchRow(q, nav) {
  const kw = (q || '').trim();
  return h('div', {
    class: 'go-global',
    onclick: () => nav('#/search?q=' + encodeURIComponent(kw))
  },
    h('span', { class: 'gg-ico' }, icon('globe')),
    h('span', { class: 'gg-text' }, `在全部内容中搜索「${truncate(kw, 12)}」`),
    h('span', { class: 'gg-arrow' }, '›')
  );
}
