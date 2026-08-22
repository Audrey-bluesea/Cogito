/* ═══════════ 模块 2：备忘录 Memo ═══════════ */
import { db, getCustomOptions } from '../db.v2.js';
import {
  h, icon, pageShell, editorShell, detailShell, emptyState, field, input, select, selectCustom,
  swipeRow, confirmSheet, toast, nowLocalDT, fmtDateTime, richBody, mentionSource, renderBody,
  globalSearchRow
} from '../ui.v2.js';

const STORE = 'memos';
const CATS = ['Collection', 'Memo', 'Record', 'Common Sense', 'Note', 'Misc'];
const CAT_COLOR = { Collection: 'mint', Memo: 'peach', Record: 'lav', 'Common Sense': 'accent', Note: '', Misc: '' };

let filterCat = '全部';

export async function list(nav, query) {
  const rows = (await db.all(STORE)).sort((a, b) => (b.time || '').localeCompare(a.time || ''));
  const custom = await getCustomOptions('memoCat');
  const allCats = [...CATS, ...custom.filter(c => !CATS.includes(c))];
  if (filterCat !== '全部' && !allCats.includes(filterCat)) filterCat = '全部';

  const base = filterCat === '全部' ? rows : rows.filter(r => r.category === filterCat);

  const sel = select(['全部', ...allCats], filterCat, { class: 'mini-select' });
  sel.addEventListener('change', () => { filterCat = sel.value; nav('#/memos', true); });

  const countEl = h('span', { style: { fontSize: '.75rem', color: 'var(--muted)', marginLeft: 'auto' } }, `${base.length} 条`);
  const toolbar = h('div', { class: 'toolbar' },
    h('span', { style: { fontSize: '.78rem', color: 'var(--muted)' } }, '分类'),
    sel,
    countEl
  );

  let searchBtn;
  const searchInput = h('input', { class: 'search-in', type: 'text', placeholder: '' });
  const searchBar = h('div', { class: 'search-sticky', style: { display: 'none' } },
    h('div', { class: 'search' },
      searchInput,
      h('button', { class: 'x', onclick: () => { searchInput.value = ''; renderList(''); toggleSearch(false); updateUrlQ(''); } }, icon('close'))
    )
  );
  const listWrap = h('div', {});
  const toggleSearch = (show) => {
    searchBar.style.display = show ? '' : 'none';
    if (show) { setTimeout(() => searchInput.focus(), 80); }
  };
  const updateUrlQ = (q) => {
    const clean = (q || '').trim();
    const hash = clean ? '#/memos?q=' + encodeURIComponent(clean) : '#/memos';
    history.replaceState(null, '', hash);
  };
  const initQ = (query && query.get) ? (query.get('q') || '') : '';
  searchBtn = h('button', { class: 'icon-btn', onclick: () => { const on = searchBar.style.display === 'none'; toggleSearch(on); }, 'aria-label': '搜索' }, icon('search'));
  const renderList = (q) => {
    const kw = (q || '').trim().toLowerCase();
    const rawQ = (q || '').trim();
    const filtered = kw
      ? base.filter(r => [r.title, stripHtml(r.content), r.source, r.category].filter(Boolean).join(' ').toLowerCase().includes(kw))
      : base;
    countEl.textContent = kw ? `${filtered.length} / ${base.length}` : `${base.length} 条`;
    listWrap.innerHTML = '';
    /* 搜索态下始终提供「升级为全局搜索」入口 */
    if (kw) listWrap.appendChild(globalSearchRow(rawQ, nav));
    if (!filtered.length) {
      const searching = !!kw;
      const emptyTitle = (!kw && filterCat !== '全部') ? `「${filterCat}」还是空的` : '还没有备忘';
      listWrap.appendChild(emptyState(
        searching ? 'search' : 'tree',
        searching ? '备忘里没有匹配的结果' : emptyTitle,
        searching ? '试试上面的全局搜索，或换个关键词' : '点击右上角 ＋ 记一笔'
      ));
      return;
    }
    filtered.forEach(r => listWrap.appendChild(card(r, nav, rawQ)));
  };
  searchInput.addEventListener('input', () => { updateUrlQ(searchInput.value); renderList(searchInput.value); });
  if (initQ) { searchInput.value = initQ; searchBar.style.display = ''; renderList(initQ); }
  else renderList('');

  const content = h('div', {}, searchBar, listWrap);

  return pageShell({
    title: '备忘录', sub: 'Notes', toolbar,
    actions: [
      h('button', { class: 'icon-btn plus', onclick: () => nav('#/memos/new'), 'aria-label': '新建备忘' }, '＋'),
      searchBtn
    ],
    content
  });
}

function firstSentence(text) {
  const t = (text || '').trim();
  if (!t) return '';
  const idx = t.search(/[。！？!?\n]/);
  return idx === -1 ? t : t.slice(0, idx + 1).trim();
}

/* 去掉 HTML 标签，用于列表预览 / 搜索（正文可能是富文本） */
function stripHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  return (d.textContent || '').replace(/​/g, '').replace(/\s+/g, ' ').trim();
}

function card(r, nav, q) {
  const qx = q ? '?q=' + encodeURIComponent(q) : '';
  const title = (r.title || '').trim();
  const plain = stripHtml(r.content);
  const fs = firstSentence(plain);
  const heading = title || fs;
  let bodyText = '';
  if (!title) {
    if (fs) {
      const idx = plain.search(/[。！？!?\n]/);
      bodyText = idx === -1 ? '' : plain.slice(idx + 1).trim();
    } else {
      bodyText = plain || '';
    }
  }
  const c = h('div', { class: 'card mcard' },
    h('div', { class: 'row between' },
      h('span', { class: 'badge ' + (CAT_COLOR[r.category] || '') }, r.category || 'Misc'),
      h('span', { style: { fontSize: '.72rem', color: 'var(--muted)' } }, fmtDateTime(r.time))
    ),
    heading ? h('div', { class: 'card-title' }, heading) : null,
    bodyText ? h('p', { class: 'card-body' }, bodyText) : null,
    r.source ? h('p', { class: 'card-sub', style: { marginTop: '.35rem' } }, r.source) : null
  );
  return swipeRow(c, {
    onTap: () => nav('#/memos/d/' + r.id + qx),
    onEdit: () => nav('#/memos/' + r.id + qx),
    onDelete: async () => {
      if (await confirmSheet({ title: '删除这条备忘？', message: '删除后无法恢复', confirmText: '删除' })) {
        await db.remove(STORE, r.id); toast('已删除'); nav('#/memos' + qx, true);
      }
    }
  });
}

/* ---------- 只读详情页 ---------- */
export async function detail(id, nav, query) {
  const r = await db.get(STORE, id);
  if (!r) return emptyState('tree', '备忘不见了', '它可能已经被删除');
  const q = (query && query.get) ? (query.get('q') || '') : '';
  const from = (query && query.get) ? (query.get('from') || '') : '';
  const back = () => nav(from || (q ? '#/memos?q=' + encodeURIComponent(q) : '#/memos'), true);
  const title = (r.title || '').trim();
  const contentEl = h('div', { class: 'd-content', style: { marginTop: '.5rem' } });
  await renderBody(contentEl, r.content, nav);
  const content = h('div', { class: 'detail-card' },
    h('div', { class: 'd-head' },
      h('span', { class: 'badge ' + (CAT_COLOR[r.category] || '') }, r.category || 'Misc'),
      h('span', { class: 'd-meta' }, fmtDateTime(r.time))
    ),
    title ? h('div', { class: 'd-title', style: { marginTop: '.6rem' } }, title) : null,
    contentEl,
    r.source ? h('div', { class: 'd-section' }, h('div', { class: 'd-label', 'data-en': 'SOURCE' }, '来源'), h('div', {}, r.source)) : null
  );
  return detailShell({
    title: '备忘录', onBack: back,
    actions: [
      h('button', { class: 'icon-btn', onclick: () => nav('#/memos/' + id), 'aria-label': '编辑' }, icon('pencil'))
    ],
    content
  });
}

export async function edit(id, nav, query) {
  const rec = id ? await db.get(STORE, id) : null;
  const isNew = !rec;

  const cat = await selectCustom('memoCat', CATS, rec?.category || 'Memo', { store: STORE, field: 'category' });
  const titleIn = input({ placeholder: '', value: rec?.title || '' });
  const src = input({ placeholder: '', value: rec?.source || '' });
  const time = input({ type: 'datetime-local', value: rec?.time ? rec.time.slice(0, 16) : nowLocalDT() });
  const mentionList = await mentionSource();
  const body = richBody(rec?.content || '', { withImage: true, mention: mentionList });

  const form = [
    field('标题', titleIn),
    // 正文置顶 + 打开即聚焦，先写再补属性
    field('内容', body.el),
    // 分类是备忘的核心归类，留在可见区；来源/时间收进「更多」
    field('分类', cat.el, { required: true }),
    h('details', { class: 'more' },
      h('summary', {}, '更多选项'),
      field('来源', src),
      field('记录时间', time, { required: true })
    )
  ];

  const isEmpty = (html) => {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return !(d.textContent || '').replace(/​/g, '').trim();
  };

  const save = async () => {
    if (!cat.get()) return toast('请选择分类');
    if (!time.value) return toast('请选择记录时间');
    const html = body.get();
    if (isEmpty(html)) return toast('内容不能为空 ✏️');
    const saved = await db.save(STORE, {
      id: rec?.id, createdAt: rec?.createdAt,
      title: titleIn.value.trim(),
      category: cat.get(), source: src.value.trim(),
      time: time.value.length === 16 ? time.value + ':00' : time.value,
      content: html
    });
    toast('已保存 ✨');
    nav('#/memos/d/' + saved.id, true);
  };

  const q = (query && query.get) ? (query.get('q') || '') : '';
  const shell = editorShell({
    title: isNew ? '新建备忘' : '编辑备忘',
    onBack: isNew ? () => nav(q ? '#/memos?q=' + encodeURIComponent(q) : '#/memos', true)
                  : () => nav('#/memos/d/' + id, true),
    form, onSave: save
  });
  // 打开即聚焦正文：等编辑框挂载到 DOM 后再 focus（richBody.el 是外层 wrap，需聚焦内部 .rte）
  let _tries = 0;
  const _focus = () => {
    const ed = body.el.querySelector('.rte');
    if (ed && body.el.isConnected) { try { ed.focus(); } catch (e) {} return; }
    if (++_tries > 120) return;
    requestAnimationFrame(_focus);
  };
  requestAnimationFrame(_focus);
  return shell;
}
