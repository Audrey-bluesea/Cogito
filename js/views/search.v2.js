/* ═══════════ 全局搜索 🔍 —— 跨日记 / 备忘 / 藏书 / 影库 ═══════════ */
import { db } from '../db.v2.js';
import { h, icon, emptyState, stripBody, fmtDate } from '../ui.v2.js';

const MOD = {
  journals: { ico: '📖', name: '日记', bar: '#DBC4B0' },
  memos:    { ico: '📕', name: '备忘', bar: '#EDE0C8' },
  books:    { ico: '📚', name: '藏书', bar: '#C6D0C0' },
  movies:   { ico: '🎬', name: '影库', bar: '#88B5C6' }
};
const ORDER = ['journals', 'memos', 'books', 'movies'];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ESC[c]); }

/** 命中片段（关键词居中）+ 高亮 */
function snippet(text, kw, len = 46) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const i = kw ? t.toLowerCase().indexOf(kw) : -1;
  if (i < 0) return esc(t.slice(0, len)) + (t.length > len ? '…' : '');
  const start = Math.max(0, i - 14);
  const end = Math.min(t.length, start + len);
  const seg = t.slice(start, end);
  const rel = i - start;
  return (start > 0 ? '…' : '')
    + esc(seg.slice(0, rel))
    + '<mark class="sr-hl">' + esc(seg.slice(rel, rel + kw.length)) + '</mark>'
    + esc(seg.slice(rel + kw.length))
    + (end < t.length ? '…' : '');
}

/** 把一条原始记录转成统一的可检索条目 */
function toItem(store, r) {
  if (store === 'journals') {
    const body = stripBody(r.content);
    return {
      store, rec: r,
      ico: r.mood || '📖',
      title: r.date ? fmtDate(r.date) : '未标日期',
      body,
      fields: [body, (r.keywords || []).join(' '), r.breakfast, r.lunch, r.dinner],
      ts: r.date || ''
    };
  }
  if (store === 'memos') {
    const body = stripBody(r.content);
    return {
      store, rec: r,
      ico: MOD.memos.ico,
      title: r.title || body.slice(0, 20) || '（无标题备忘）',
      body,
      fields: [r.title, body, r.source, r.category],
      ts: r.time || ''
    };
  }
  if (store === 'books') {
    const body = [r.reason, r.excerpt].filter(Boolean).join(' ');
    return {
      store, rec: r,
      ico: MOD.books.ico,
      title: r.title || '（未命名）',
      body: body || [r.author, r.genre].filter(Boolean).join(' · '),
      fields: [r.title, r.author, r.genre, r.publisher, r.status, r.reason, r.excerpt],
      ts: r.finishDate || r.updatedAt || ''
    };
  }
  const body = [r.review, r.excerpt].filter(Boolean).join(' ');
  return {
    store, rec: r,
    ico: MOD.movies.ico,
    title: r.title || '（未命名）',
    body: body || [r.director, r.genre].filter(Boolean).join(' · '),
    fields: [r.title, r.director, r.cast, r.genre, r.region, r.status, r.review, r.excerpt],
    ts: r.watchDate || r.updatedAt || ''
  };
}

/** 单条结果卡片 */
function resultCard(it, kw, nav, backTo) {
  const m = MOD[it.store];
  /* 优先展示命中片段：标题命中就高亮标题，否则从正文/字段里取片段 */
  const titleHit = it.title.toLowerCase().includes(kw);
  const hay = [it.body, ...it.fields].filter(Boolean).find(f => String(f).toLowerCase().includes(kw));
  const snipHtml = titleHit && !hay ? '' : snippet(hay || it.body, kw);

  const titleEl = h('div', { class: 'sr-title' });
  titleEl.innerHTML = titleHit ? snippet(it.title, kw, 60) : esc(it.title);

  const kids = [
    h('div', { class: 'sr-head' },
      h('span', { class: 'sr-ico' }, it.ico),
      titleEl,
      it.ts ? h('span', { class: 'sr-date' }, it.ts.slice(0, 10)) : null
    )
  ];
  if (snipHtml) {
    const sn = h('div', { class: 'sr-snip' });
    sn.innerHTML = snipHtml;
    kids.push(sn);
  }

  return h('div', {
    class: 'sr-card',
    style: { borderLeftColor: m.bar },
    onclick: () => nav(`#/${it.store}/d/${it.rec.id}?from=${encodeURIComponent(backTo())}`)
  }, ...kids);
}

export async function list(nav, query) {
  const initQ = (query?.get('q') || '').trim();
  let curScope = 'all';
  let curQ = initQ;

  const [journals, memos, books, movies] = await Promise.all([
    db.all('journals'), db.all('memos'), db.all('books'), db.all('movies')
  ]);

  /* 全量条目池，只建一次 */
  const pool = [
    ...journals.map(r => toItem('journals', r)),
    ...memos.map(r => toItem('memos', r)),
    ...books.map(r => toItem('books', r)),
    ...movies.map(r => toItem('movies', r))
  ];
  pool.forEach(it => { it._hay = [it.title, ...it.fields].filter(Boolean).join(' ').toLowerCase(); });

  /* 当前搜索态写回 URL，便于从详情页返回时恢复 */
  const backTo = () => curQ ? '#/search?q=' + encodeURIComponent(curQ) : '#/search';
  const syncUrl = () => {
    const hash = backTo();
    if (location.hash !== hash) history.replaceState(null, '', hash);
  };

  const input = h('input', {
    class: 'search-in', type: 'text', placeholder: '搜索全部内容…',
    value: initQ, autocomplete: 'off'
  });
  const clearBtn = h('button', {
    class: 'x', 'aria-label': '清空',
    onclick: () => { input.value = ''; curQ = ''; syncUrl(); paint(); input.focus(); }
  }, icon('close'));

  const chipsWrap = h('div', { class: 'sr-chips' });
  const resWrap = h('div', { class: 'sr-results' });

  function paint() {
    const kw = curQ.trim().toLowerCase();
    chipsWrap.innerHTML = '';
    resWrap.innerHTML = '';

    if (!kw) {
      resWrap.appendChild(emptyState('🔍', '搜索你的全部记忆', '日记 · 备忘 · 藏书 · 影库，一次搜完'));
      return;
    }

    const hits = pool.filter(it => it._hay.includes(kw));
    if (!hits.length) {
      resWrap.appendChild(emptyState('🌾', '没有找到相关内容', `换个关键词试试「${curQ}」`));
      return;
    }

    /* 分模块统计 + 筛选 chips */
    const cnt = { journals: 0, memos: 0, books: 0, movies: 0 };
    hits.forEach(it => cnt[it.store]++);
    const mkChip = (key, label, n) => h('button', {
      class: 'chip' + (curScope === key ? ' on' : ''),
      onclick: () => { curScope = key; paint(); }
    }, `${label} ${n}`);
    chipsWrap.appendChild(mkChip('all', '全部', hits.length));
    ORDER.forEach(s => { if (cnt[s]) chipsWrap.appendChild(mkChip(s, MOD[s].ico + ' ' + MOD[s].name, cnt[s])); });

    /* 作用域失效（切关键词后该模块没结果）时自动回退到全部 */
    if (curScope !== 'all' && !cnt[curScope]) curScope = 'all';

    const shown = curScope === 'all' ? hits : hits.filter(it => it.store === curScope);
    const groups = new Map();
    shown.forEach(it => {
      if (!groups.has(it.store)) groups.set(it.store, []);
      groups.get(it.store).push(it);
    });

    ORDER.forEach(s => {
      const items = groups.get(s);
      if (!items || !items.length) return;
      items.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
      resWrap.appendChild(h('div', { class: 'sr-group' },
        h('div', { class: 'sr-group-head' },
          h('span', {}, MOD[s].ico + ' ' + MOD[s].name),
          h('span', { class: 'sr-group-n' }, String(items.length))
        ),
        h('div', { class: 'sr-list' }, ...items.map(it => resultCard(it, kw, nav, backTo)))
      ));
    });
  }

  let timer = null;
  input.addEventListener('input', () => {
    curQ = input.value;
    clearTimeout(timer);
    timer = setTimeout(() => { syncUrl(); paint(); }, 120);
  });

  const page = h('div', { class: 'page' },
    h('header', { class: 'appbar sr-appbar' },
      h('button', { class: 'icon-btn', onclick: () => nav('#/flow'), 'aria-label': '返回' }, '‹'),
      h('div', { class: 'search sr-search' }, input, clearBtn)
    ),
    h('div', { class: 'scroll' }, h('div', { class: 'sr-body' }, chipsWrap, resWrap))
  );

  paint();
  if (!initQ) setTimeout(() => input.focus(), 120);
  return page;
}
