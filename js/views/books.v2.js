/* ═══════════ 模块 3：书籍收藏 Books ═══════════ */
import { db, getCustomOptions } from '../db.v2.js';
import {
  h, icon, pageShell, editorShell, detailShell, emptyState, field, input, textarea, select, selectCustom,
  multiSelectCustom,
  radioGroup, starRating, starsStatic, imagePicker, swipeRow, confirmSheet, toast, todayISO, fmtDate,
  findMentions, stripBody, truncate
} from '../ui.v2.js';

const STORE = 'books';
const GENRES = ['小说', '非虚构', '科幻', '奇幻', '历史', '传记', '诗歌', '商业', '科技', '艺术', '其他'];
const STATUS = ['想读', '在读', '读完'];
const STATUS_ORDER = ['在读', '想读', '读完'];
const STATUS_COLOR = { 在读: 'mint', 想读: 'peach', 读完: 'accent' };
const METHODS = ['纸质书', '电子书阅读器', 'iBooks'];

let filterStatus = '全部';
let filterGenre = '全部';
let viewMode = 'grid';

export async function list(nav) {
  viewMode = (await db.metaGet('books:view', 'grid')) || 'grid';
  const rows = (await db.all(STORE))
    .map(r => r.status === '弃读' ? { ...r, status: '想读' } : r)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const custom = await getCustomOptions('bookGenre');
  const allGenres = [...GENRES, ...custom.filter(c => !GENRES.includes(c))];

  let shown = rows;
  if (filterStatus !== '全部') shown = shown.filter(r => r.status === filterStatus);
  if (filterGenre !== '全部') shown = shown.filter(r => { const g = r.genre; return Array.isArray(g) ? g.includes(filterGenre) : g === filterGenre; });

  const chips = ['全部', ...STATUS].map(s =>
    h('button', {
      class: 'chip' + (filterStatus === s ? ' on' : ''),
      onclick: () => { filterStatus = s; nav('#/books', true); }
    }, s)
  );
  const gsel = select(['全部', ...allGenres], filterGenre, { class: 'mini-select' });
  gsel.addEventListener('change', () => { filterGenre = gsel.value; nav('#/books', true); });

  const toolbar = h('div', { class: 'toolbar' }, ...chips, gsel,
    h('button', {
      class: 'chip', style: { marginLeft: 'auto' },
      onclick: async () => { await db.metaSet('books:view', viewMode === 'grid' ? 'list' : 'grid'); nav('#/books', true); }
    }, viewMode === 'grid' ? '▤ 列表' : '▦ 网格')
  );

  let content;
  if (!shown.length) {
    content = emptyState('bookmark', rows.length ? '没有符合条件的书' : '书架还是空的', '点击右上角 ＋ 添加一本书');
  } else {
    const groups = STATUS_ORDER.filter(s => shown.some(r => r.status === s));
    content = h('div', {}, ...groups.map(g => {
      const items = shown.filter(r => r.status === g);
      return h('div', {},
        h('div', { class: 'group-title' }, `${g} · ${items.length}`),
        viewMode === 'grid'
          ? h('div', { class: 'grid' }, ...items.map(r => gridCard(r, nav)))
          : h('div', {}, ...items.map(r => listCard(r, nav)))
      );
    }));
  }

  return pageShell({
    title: '书籍', sub: 'Books', toolbar,
    actions: [
      h('button', { class: 'chip rc-entry', onclick: () => nav('#/books/checkin') }, '✅ 阅读打卡'),
      h('button', { class: 'icon-btn plus', onclick: () => nav('#/books/new'), 'aria-label': '添加书籍' }, '＋'),
      h('button', { class: 'icon-btn', onclick: () => nav('#/search'), 'aria-label': '全局搜索' }, icon('search'))
    ],
    content
  });
}

function coverEl(r, cls = 'cover') {
  return r.cover
    ? h('img', { class: cls, src: r.cover, alt: r.title })
    : h('div', { class: cls + ' cover-ph' }, icon('bookmark'));
}

/* 阅读进度：细线进度条 + 小字页数。仅「在读」且填了当前页时显示 */
function progressEl(r) {
  if (r.status !== '在读' || !r.progressCur) return null;
  if (!r.progressTotal) {
    return h('div', { class: 'pb' }, h('div', { class: 'pb-label' }, `${r.progressCur} 页`));
  }
  const pct = Math.max(0, Math.min(100, Math.round(r.progressCur / r.progressTotal * 100)));
  return h('div', { class: 'pb' },
    h('div', { class: 'pb-row' },
      h('div', { class: 'pb-track' }, h('div', { class: 'pb-fill', style: { width: pct + '%' } })),
      h('span', { class: 'pb-pct' }, pct + '%')
    ),
    h('div', { class: 'pb-label' }, `${r.progressCur} / ${r.progressTotal} 页`)
  );
}

function gridCard(r, nav) {
  const c = h('div', { class: 'gcard' },
    coverEl(r),
    h('div', { class: 'gcard-body' },
      h('div', { class: 'gcard-title' }, r.title),
      h('div', { class: 'gcard-sub ellipsis' }, r.author || ''),
      h('div', { class: 'row between', style: { marginTop: '.3rem' } },
        starsStatic(r.rating || 0),
        h('span', { class: 'badge ' + (STATUS_COLOR[r.status] || '') }, r.status || '')
      ),
      progressEl(r)
    )
  );
  return swipeRow(c, {
    onTap: () => nav('#/books/d/' + r.id),
    onEdit: () => nav('#/books/' + r.id),
    onDelete: async () => {
      if (await confirmSheet({ title: '删除这本书？', message: '删除后无法恢复', confirmText: '删除' })) {
        await db.remove(STORE, r.id); toast('已删除'); nav('#/books', true);
      }
    }
  });
}

function listCard(r, nav) {
  const c = h('div', { class: 'card lcard blcard' },
    coverEl(r),
    h('div', { class: 'grow' },
      h('h3', { class: 'card-title ellipsis' }, r.title),
      h('p', { class: 'card-sub ellipsis' }, (() => { const t = []; if (r.author) t.push(r.author); if (r.genre) t.push(Array.isArray(r.genre) ? r.genre.join(' / ') : r.genre); return t.join(' · '); })()),
      h('div', { style: { marginTop: '.3rem' } }, starsStatic(r.rating || 0)),
      h('div', { class: 'row', style: { marginTop: '.35rem', gap: '.3rem' } },
        h('span', { class: 'badge ' + (STATUS_COLOR[r.status] || '') }, r.status || ''),
        r.method ? h('span', { class: 'tag' }, r.method.split('（')[0]) : null,
        r.finishDate ? h('span', { class: 'tag' }, fmtDate(r.finishDate)) : null
      ),
      progressEl(r)
    )
  );
  return swipeRow(c, {
    onTap: () => nav('#/books/d/' + r.id),
    onEdit: () => nav('#/books/' + r.id),
    onDelete: async () => {
      if (await confirmSheet({ title: '删除这本书？', message: '删除后无法恢复', confirmText: '删除' })) {
        await db.remove(STORE, r.id); toast('已删除'); nav('#/books', true);
      }
    }
  });
}

/* ---------- 只读详情页 ---------- */
export async function detail(id, nav, query) {
  const r = await db.get(STORE, id);
  if (!r) return emptyState('bookmark', '书不见了', '它可能已经被删除');
  const from = (query && query.get) ? (query.get('from') || '') : '';
  const back = () => nav(from || '#/books', true);
  const content = h('div', {},
    h('div', { class: 'd-top' },
      r.cover ? h('img', { class: 'd-cover', src: r.cover, alt: r.title }) : null,
      h('div', { class: 'd-info-col' },
        h('div', { class: 'd-title' }, r.title || ''),
        h('div', { class: 'd-meta' }, (() => { const t = []; if (r.author) t.push(r.author); if (r.genre) t.push(Array.isArray(r.genre) ? r.genre.join(' / ') : r.genre); return t.join(' · '); })()),
        h('div', { class: 'd-section row', style: { gap: '.5rem', alignItems: 'center' } },
          starsStatic(r.rating || 0),
          h('span', { class: 'badge ' + (STATUS_COLOR[r.status] || '') }, r.status || '')
        ),
        h('div', { class: 'd-info' },
          r.method ? h('div', { class: 'd-meta' }, '阅读方式：' + r.method) : null,
          r.finishDate ? h('div', { class: 'd-meta' }, '完成于 ' + fmtDate(r.finishDate)) : null,
          (r.status === '在读' && r.progressCur) ? h('div', { class: 'd-meta' }, `进度：${r.progressCur}${r.progressTotal ? '/' + r.progressTotal : ''} 页`) : null
        )
      )
    ),
    (r.reason || '').trim() ? h('div', { class: 'd-section' }, h('div', { class: 'd-label', 'data-en': 'REVIEW' }, '短评'), h('div', { class: 'd-content' }, (r.reason || '').trim())) : null,
    (r.excerpt || '').trim() ? h('div', { class: 'd-section' }, h('div', { class: 'd-label', 'data-en': 'QUOTE' }, '摘抄'), h('div', { class: 'd-content' }, (r.excerpt || '').trim())) : null
  );

  const backlinks = await findMentions('book', r.id);
  if (backlinks.length) {
    content.appendChild(h('div', { class: 'd-section' },
      h('div', { class: 'd-label' }, [icon('paperclip'), ' 提及此作品的日记与备忘（' + backlinks.length + '）']),
      h('div', { class: 'backlinks' }, ...backlinks.map(({ store, rec }) => {
        const body = stripBody(rec.content);
        const label = store === 'journals'
          ? (rec.date ? `${rec.date} 日记` : '日记') + (body ? '：' + truncate(body, 18) : '')
          : (rec.title ? '备忘：' + rec.title : '备忘') + (body && !rec.title ? '：' + truncate(body, 18) : '');
        return h('div', { class: 'backlink', onclick: () => nav('#/' + store + '/d/' + rec.id) }, label);
      }))
    ));
  }

  return detailShell({
    title: '书籍', onBack: back,
    actions: [
      h('button', { class: 'icon-btn', onclick: () => nav('#/books/' + id), 'aria-label': '编辑' }, icon('pencil'))
    ],
    content: h('div', { class: 'detail-card' }, content)
  });
}

export async function edit(id, nav) {
  const rec = id ? await db.get(STORE, id) : null;
  const isNew = !rec;

  const title = input({ placeholder: '', value: rec?.title || '' });
  const author = input({ placeholder: '', value: rec?.author || '' });
  const genre = await multiSelectCustom('bookGenre', GENRES, rec?.genre || []);
  const publisher = input({ placeholder: '', value: rec?.publisher || '' });
  const status = select(STATUS, (rec?.status && STATUS.includes(rec.status)) ? rec.status : '想读');
  /* 完成日期升级为日期+时间（历史仅日期数据补 T00:00） */
  const finish = input({ type: 'datetime-local', value: rec?.finishDate ? (rec.finishDate.length === 10 ? rec.finishDate + 'T00:00' : rec.finishDate) : '' });
  /* 阅读进度（仅"在读"状态显示）*/
  const progressCur = input({ placeholder: '', value: rec?.progressCur || '', type: 'number', inputmode: 'numeric' });
  const progressTotal = input({ placeholder: '', value: rec?.progressTotal || '', type: 'number', inputmode: 'numeric' });
  const progressRow = h('div', { class: 'progress-row' },
    progressCur,
    h('span', { style: { color: 'var(--muted)', fontWeight: 700, fontSize: '1rem', alignSelf: 'center' } }, '/'),
    progressTotal,
    h('span', { style: { color: 'var(--muted)', fontSize: '.7rem', alignSelf: 'center', marginLeft: '.25rem' } }, '页')
  );
  const progressField = field('阅读进度', progressRow);
  const syncFinish = () => {
    const dis = status.value === '在读' || status.value === '想读';
    finish.disabled = dis;
    if (dis) finish.value = '';
  };
  const syncProgress = () => {
    progressField.style.display = status.value === '在读' ? '' : 'none';
    if (status.value !== '在读') { progressCur.value = ''; progressTotal.value = ''; }
  };
  status.addEventListener('change', () => { syncFinish(); syncProgress(); }); syncFinish(); syncProgress();

  const cover = imagePicker(rec?.cover || '', 'bookmark');
  const method = radioGroup(METHODS, rec?.method || METHODS[0]);
  const rating = starRating(rec?.rating || 0);
  const reason = textarea({ value: rec?.reason || '', maxlength: 200, small: true });
  const excerpt = textarea({ value: rec?.excerpt || '', maxlength: 500, small: true });

  const form = [
    field('封面图片', cover.el),
    field('书名', title, { required: true }),
    field('作者', author, { required: true }),
    h('div', { class: 'two' },
      field('阅读状态', status, { required: true }),
      field('完成日期', finish)
    ),
    progressField,
    field('类型', genre.el, { required: true }),
    field('出版社', publisher),
    field('阅读方式', method.el, { required: true }),
    field('评分', rating.el),
    field('短评', reason.el),
    field('摘抄', excerpt.el)
  ];

  const save = async () => {
    if (!title.value.trim()) return toast('请填写书名');
    if (!author.value.trim()) return toast('请填写作者');
    if (!genre.get().length) return toast('请至少选择一个类型');
    const saved = await db.save(STORE, {
      id: rec?.id, createdAt: rec?.createdAt,
      title: title.value.trim(), author: author.value.trim(),
      genre: genre.get(), publisher: publisher.value.trim(),
      status: status.value, finishDate: finish.value || '',
      progressCur: progressCur.value || '', progressTotal: progressTotal.value || '',
      cover: cover.get(), method: method.get(),
      rating: rating.get(), reason: reason.get(), excerpt: excerpt.get()
    });
    toast('已保存 ✨');
    nav('#/books/d/' + saved.id, true);
  };

  const page = editorShell({
    title: isNew ? '添加书籍' : '编辑书籍',
    onBack: isNew ? () => nav('#/books', true) : () => nav('#/books/d/' + id, true),
    form, onSave: save
  });

  if (!isNew) {
    page.querySelector('.appbar').appendChild(
      h('button', {
        class: 'icon-btn', 'aria-label': '删除',
        onclick: async () => {
          if (await confirmSheet({ title: '删除这本书？', message: rec.title, confirmText: '删除' })) {
            await db.remove(STORE, rec.id); toast('已删除'); nav('#/books', true);
          }
        }
      }, icon('delete'))
    );
  }
  return page;
}

/* ---------- 阅读打卡（年视图热力日历）---------- */
export async function checkin(nav) {
  const todayStr = todayISO();
  const all = await db.all('checkins');           // 每条 {id:'YYYY-MM-DD', checkedAt}
  const checked = new Set(all.map(r => r.id));     // 累计打卡日期（跨年）

  let year = new Date().getFullYear();
  const wkDays = ['一', '二', '三', '四', '五', '六', '日'];

  const totalNum = h('span', { class: 'rc-total-num' }, String(checked.size));
  const yearSel = h('select', { class: 'rc-year' });
  for (let y = new Date().getFullYear(); y >= 2023; y--) {
    yearSel.appendChild(h('option', { value: y, selected: y === year }, String(y)));
  }
  yearSel.addEventListener('change', () => { year = Number(yearSel.value); renderYear(); });

  const monthsWrap = h('div', { class: 'rc-months' });

  function buildMonth(mon) {
    const firstDay = new Date(year, mon - 1, 1);
    const daysInMonth = new Date(year, mon, 0).getDate();
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    // 固定 42 格（6 行 × 7 列）：前置 offset 空格 + 日期 + 尾部补 null
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length < 42) cells.push(null);

    const grid = h('div', { class: 'rc-grid' });
    cells.forEach(d => {
      if (d === null) {
        grid.appendChild(h('div', { class: 'rc-cell empty' })); // 永远渲染占位 div，绝不跳过/null
        return;
      }
      const ds = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = ds === todayStr;
      const isChecked = checked.has(ds);
      const cell = h('div', {
        class: 'rc-cell' + (isChecked ? ' checked' : '') + (isToday ? ' today' : '') + (isToday ? ' can-check' : ''),
        onclick: isToday ? async () => {
          if (checked.has(ds)) {
            await db.remove('checkins', ds);
            checked.delete(ds);
          } else {
            await db.save('checkins', { id: ds, checkedAt: new Date().toISOString() });
            checked.add(ds);
          }
          totalNum.textContent = String(checked.size);
          cell.classList.toggle('checked');
          toast(checked.has(ds) ? '✅ 今日已打卡' : '已取消今日打卡');
        } : null
      }, h('span', { class: 'rc-d' }, String(d)));
      grid.appendChild(cell);
    });
    return h('div', { class: 'rc-month' },
      h('div', { class: 'rc-mtitle' }, `${mon} 月`),
      grid
    );
  }

  function renderYear() {
    monthsWrap.innerHTML = '';
    for (let m = 1; m <= 12; m++) monthsWrap.appendChild(buildMonth(m));
  }
  renderYear();

  return h('div', { class: 'page' },
    h('header', { class: 'appbar' },
      h('h1', { class: 'rc-title' },
        h('span', {}, '📅 坚持阅读'),
        totalNum,
        h('span', {}, '天')
      ),
      yearSel
    ),
    h('div', { class: 'scroll' },
      monthsWrap,
      h('div', { class: 'rc-tip' }, '点击今天的日期即可打卡 · 累计打卡天数')
    )
  );
}
