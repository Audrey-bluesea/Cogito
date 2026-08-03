/* ═══════════ 模块 4：影视收藏 Movies ═══════════ */
import { db, getCustomOptions } from '../db.v2.js';
import {
  h, pageShell, editorShell, detailShell, emptyState, field, input, textarea, select, selectCustom,
  multiSelectCustom,
  starRating, starsStatic, imagePicker, swipeRow, confirmSheet, toast, todayISO, nowLocalDT, fmtDate, fmtMonth,
  findMentions, stripBody, truncate
} from '../ui.v2.js';

const STORE = 'movies';
const GENRES = ['剧情', '喜剧', '动作', '科幻', '爱情', '悬疑', '恐怖', '动画', '纪录片', '其它'];
const REGIONS = ['中国大陆', '中国香港', '中国台湾', '美国', '英国', '法国', '日本', '韩国', '其它'];
const STATUS = ['想看', '在看', '看完'];
const STATUS_ORDER = ['在看', '想看', '看完'];
const STATUS_COLOR = { 在看: 'mint', 想看: 'peach', 看完: 'accent' };

let filterGenre = '全部';
let filterRegion = '全部';
let filterStatus = '全部';
let viewMode = 'grid';

export async function list(nav) {
  viewMode = (await db.metaGet('movies:view', 'grid')) || 'grid';
  const rows = (await db.all(STORE)).sort((a, b) => (b.watchDate || '').localeCompare(a.watchDate || ''));
  const cg = await getCustomOptions('movieGenre');
  const cr = await getCustomOptions('movieRegion');
  const allG = [...GENRES, ...cg.filter(x => !GENRES.includes(x))];
  const allR = [...REGIONS, ...cr.filter(x => !REGIONS.includes(x))];

  let shown = rows;
  if (filterStatus !== '全部') shown = shown.filter(r => r.status === filterStatus);
  if (filterGenre !== '全部') shown = shown.filter(r => { const g = r.genre; return Array.isArray(g) ? g.includes(filterGenre) : g === filterGenre; });
  if (filterRegion !== '全部') shown = shown.filter(r => r.region === filterRegion);

  const statusChips = ['全部', ...STATUS].map(s =>
    h('button', {
      class: 'chip' + (filterStatus === s ? ' on' : ''),
      onclick: () => { filterStatus = s; nav('#/movies', true); }
    }, s)
  );
  const gs = select(['全部', ...allG], filterGenre, { class: 'mini-select' });
  gs.addEventListener('change', () => { filterGenre = gs.value; nav('#/movies', true); });
  const rs = select(['全部', ...allR], filterRegion, { class: 'mini-select' });
  rs.addEventListener('change', () => { filterRegion = rs.value; nav('#/movies', true); });

  const viewChip = h('button', {
    class: 'chip', style: { marginLeft: 'auto' },
    onclick: async () => { await db.metaSet('movies:view', viewMode === 'grid' ? 'list' : 'grid'); nav('#/movies', true); }
  }, viewMode === 'grid' ? '▤ 列表' : '▦ 网格');

  const toolbar = h('div', { class: 'toolbar' },
    ...statusChips, gs,
    h('span', { style: { fontSize: '.78rem', color: 'var(--muted)' } }, '地区'), rs,
    viewChip
  );

  let content;
  if (!shown.length) {
    content = emptyState('🎬', rows.length ? '没有符合条件的影片' : '片单还是空的', '点击右上角 ＋ 记录一部看过的片子');
  } else {
    const groups = STATUS_ORDER.filter(s => shown.some(r => r.status === s));
    content = h('div', {}, ...groups.map(g => {
      const items = shown.filter(r => r.status === g);
      return h('div', {},
        h('div', { class: 'group-title' }, `${g} · ${items.length}`),
        viewMode === 'grid'
          ? h('div', { class: 'grid', style: { marginTop: '.4rem' } }, ...items.map(r => gridCard(r, nav)))
          : h('div', {}, ...items.map(r => listCard(r, nav)))
      );
    }));
  }

  return pageShell({
    title: '影视', sub: 'Moives', toolbar,
    actions: [
      h('button', { class: 'icon-btn plus', onclick: () => nav('#/movies/new'), 'aria-label': '添加影视' }, '＋'),
      h('button', { class: 'icon-btn', onclick: () => nav('#/search'), 'aria-label': '全局搜索' }, '🔍')
    ],
    content
  });
}

function posterEl(r) {
  return r.poster
    ? h('img', { class: 'cover', src: r.poster, alt: r.title })
    : h('div', { class: 'cover cover-ph' }, '🎬');
}

function gridCard(r, nav) {
  const poster = posterEl(r);
  const c = h('div', { class: 'gcard' },
    poster,
    h('div', { class: 'gcard-body' },
      h('div', { class: 'gcard-title' }, r.title),
      h('div', { class: 'gcard-sub ellipsis' }, r.director || ''),
      h('div', { class: 'row between', style: { marginTop: '.3rem' } },
        starsStatic(r.rating || 0),
        h('span', { class: 'badge ' + (STATUS_COLOR[r.status] || '') }, r.status || '')
      ),
      r.watchDate ? h('div', { class: 'gcard-sub', style: { marginTop: '.25rem' } }, fmtDate(r.watchDate)) : null,
      (r.status === '在看' && r.progressCur) ? h('div', { class: 'gcard-sub', style: { marginTop: '.25rem', color: 'var(--accent)' } }, `🎬 ${r.progressCur}${r.progressTotal ? '/' + r.progressTotal : ''}集`) : null
    )
  );
  return swipeRow(c, {
    onTap: () => nav('#/movies/d/' + r.id),
    onEdit: () => nav('#/movies/' + r.id),
    onDelete: async () => {
      if (await confirmSheet({ title: '删除这部影片？', message: '删除后无法恢复', confirmText: '删除' })) {
        await db.remove(STORE, r.id); toast('已删除'); nav('#/movies', true);
      }
    }
  });
}

function listCard(r, nav) {
  const c = h('div', { class: 'card lcard mlcard' },
    posterEl(r),
    h('div', { class: 'grow' },
      h('h3', { class: 'card-title ellipsis' }, r.title),
      h('p', { class: 'card-sub ellipsis' }, [r.director, r.region].filter(Boolean).join(' · ')),
      h('div', { style: { marginTop: '.3rem' } }, starsStatic(r.rating || 0)),
      h('div', { class: 'row', style: { marginTop: '.35rem', gap: '.3rem' } },
        h('span', { class: 'badge ' + (STATUS_COLOR[r.status] || '') }, r.status || ''),
        r.watchDate ? h('span', { class: 'tag' }, fmtDate(r.watchDate)) : null,
        (r.status === '在看' && r.progressCur) ? h('span', { class: 'tag' }, `${r.progressCur}${r.progressTotal ? '/' + r.progressTotal : ''}集`) : null
      )
    )
  );
  return swipeRow(c, {
    onTap: () => nav('#/movies/d/' + r.id),
    onEdit: () => nav('#/movies/' + r.id),
    onDelete: async () => {
      if (await confirmSheet({ title: '删除这部影片？', message: '删除后无法恢复', confirmText: '删除' })) {
        await db.remove(STORE, r.id); toast('已删除'); nav('#/movies', true);
      }
    }
  });
}

/* ---------- 只读详情页 ---------- */
export async function detail(id, nav, query) {
  const r = await db.get(STORE, id);
  if (!r) return emptyState('🎬', '影片不见了', '它可能已经被删除');
  const from = (query && query.get) ? (query.get('from') || '') : '';
  const back = () => nav(from || '#/movies', true);
  const sub = [r.director, r.region].filter(Boolean).join(' · ');
  const content = h('div', {},
    h('div', { class: 'd-top' },
      r.poster ? h('img', { class: 'd-cover', src: r.poster, alt: r.title }) : null,
      h('div', { class: 'd-info-col' },
        h('div', { class: 'd-title' }, r.title || ''),
        sub ? h('div', { class: 'd-meta' }, sub) : null,
        h('div', { class: 'd-section row', style: { gap: '.5rem', alignItems: 'center' } },
          starsStatic(r.rating || 0),
          h('span', { class: 'badge ' + (STATUS_COLOR[r.status] || '') }, r.status || '')
        ),
        h('div', { class: 'd-info' },
          r.release ? h('div', { class: 'd-meta' }, '上映：' + fmtMonth(r.release)) : null,
          (r.genre && (Array.isArray(r.genre) ? r.genre.length : true)) ? h('div', { class: 'd-meta' }, '类型：' + (Array.isArray(r.genre) ? r.genre.join(' / ') : r.genre)) : null,
          (r.cast || '').trim() ? h('div', { class: 'd-meta' }, '主演：' + (r.cast || '')) : null,
          r.watchDate ? h('div', { class: 'd-meta' }, '观影日期：' + fmtDate(r.watchDate)) : null,
          (r.status === '在看' && r.progressCur) ? h('div', { class: 'd-meta' }, `进度：${r.progressCur}${r.progressTotal ? '/' + r.progressTotal : ''} 集`) : null
        )
      )
    ),
    (r.review || '').trim() ? h('div', { class: 'd-section' }, h('div', { class: 'd-label', 'data-en': 'REVIEW' }, '短评'), h('div', { class: 'd-content' }, (r.review || '').trim())) : null,
    (r.excerpt || '').trim() ? h('div', { class: 'd-section' }, h('div', { class: 'd-label', 'data-en': 'QUOTE' }, '摘抄'), h('div', { class: 'd-content' }, (r.excerpt || '').trim())) : null
  );

  const backlinks = await findMentions('movie', r.id);
  if (backlinks.length) {
    content.appendChild(h('div', { class: 'd-section' },
      h('div', { class: 'd-label' }, `📎 提及此作品的日记与备忘（${backlinks.length}）`),
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
    title: '影视', onBack: back,
    actions: [
      h('button', { class: 'icon-btn', onclick: () => nav('#/movies/' + id), 'aria-label': '编辑' }, '✏️')
    ],
    content: h('div', { class: 'detail-card' }, content)
  });
}

export async function edit(id, nav) {
  const rec = id ? await db.get(STORE, id) : null;
  const isNew = !rec;

  const title = input({ placeholder: '', value: rec?.title || '' });
  const director = input({ placeholder: '', value: rec?.director || '' });
  const cast = input({ placeholder: '', value: rec?.cast || '' });
  const release = input({ type: 'month', value: rec?.release || '' });
  const genre = await multiSelectCustom('movieGenre', GENRES, rec?.genre || []);
  const region = await selectCustom('movieRegion', REGIONS, rec?.region || '中国大陆');
  const status = select(STATUS, rec?.status || '想看');
  /* 观影日期升级为日期+时间：新影视默认当前时间；历史仅日期数据补 T00:00 */
  const watch = input({ type: 'datetime-local', value: rec?.watchDate ? (rec.watchDate.length === 10 ? rec.watchDate + 'T00:00' : rec.watchDate) : nowLocalDT() });
  /* 观影日期：仅"看完"状态可填；想看/在看置灰并清空 */
  const syncWatch = () => {
    const dis = status.value === '想看' || status.value === '在看';
    watch.disabled = dis;
    if (dis) watch.value = '';
  };
  status.addEventListener('change', syncWatch); syncWatch();
  /* 观看进度（仅"在看"状态显示）*/
  const progressCur = input({ placeholder: '', value: rec?.progressCur || '', type: 'number', inputmode: 'numeric' });
  const progressTotal = input({ placeholder: '', value: rec?.progressTotal || '', type: 'number', inputmode: 'numeric' });
  const progressRow = h('div', { class: 'progress-row' },
    progressCur,
    h('span', { style: { color: 'var(--muted)', fontWeight: 700, fontSize: '1rem', alignSelf: 'center' } }, '/'),
    progressTotal,
    h('span', { style: { color: 'var(--muted)', fontSize: '.7rem', alignSelf: 'center', marginLeft: '.25rem' } }, '集')
  );
  const progressField = field('观看进度', progressRow);
  const syncProgress = () => {
    progressField.style.display = status.value === '在看' ? '' : 'none';
    if (status.value !== '在看') { progressCur.value = ''; progressTotal.value = ''; }
  };
  status.addEventListener('change', syncProgress); syncProgress();

  const rating = starRating(rec?.rating || 0);
  const poster = imagePicker(rec?.poster || '', '🎬');
  const review = textarea({ value: rec?.review || '', maxlength: 300, small: true });
  const excerpt = textarea({ value: rec?.excerpt || '', maxlength: 500, small: true });

  const form = [
    field('海报图', poster.el),
    field('片名', title, { required: true }),
    field('导演', director, { required: true }),
    field('主演', cast),
    h('div', { class: 'two' },
      field('观影状态', status, { required: true }),
      field('观影日期', watch)
    ),
    progressField,
    h('div', { class: 'two' },
      field('类型', genre.el, { required: true }),
      field('地区', region.el, { required: true })
    ),
    field('评分', rating.el),
    field('短评', review.el),
    field('摘抄', excerpt.el)
  ];

  const save = async () => {
    if (!title.value.trim()) return toast('请填写片名');
    if (!director.value.trim()) return toast('请填写导演');
    if (!genre.get().length) return toast('请至少选择一个类型');
    if (status.value === '看完' && !watch.value) return toast('请选择观影日期');
    const saved = await db.save(STORE, {
      id: rec?.id, createdAt: rec?.createdAt,
      title: title.value.trim(), director: director.value.trim(), cast: cast.value.trim(),
      release: release.value, genre: genre.get(), region: region.get(),
      watchDate: watch.value, status: status.value,
      progressCur: progressCur.value || '', progressTotal: progressTotal.value || '',
      rating: rating.get(), poster: poster.get(), review: review.get(), excerpt: excerpt.get()
    });
    toast('已保存 ✨');
    nav('#/movies/d/' + saved.id, true);
  };

  const page = editorShell({
    title: isNew ? '添加影视' : '编辑影视',
    onBack: isNew ? () => nav('#/movies', true) : () => nav('#/movies/d/' + id, true),
    form, onSave: save
  });

  if (!isNew) {
    page.querySelector('.appbar').appendChild(
      h('button', {
        class: 'icon-btn', 'aria-label': '删除',
        onclick: async () => {
          if (await confirmSheet({ title: '删除这部影片？', message: rec.title, confirmText: '删除' })) {
            await db.remove(STORE, rec.id); toast('已删除'); nav('#/movies', true);
          }
        }
      }, '🗑')
    );
  }
  return page;
}
