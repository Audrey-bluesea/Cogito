/* ═══════════ 模块 1：日记 Journal ═══════════ */
import { db } from '../db.v2.js';
import {
  h, icon, pageShell, editorShell, detailShell, emptyState, field, input, textarea, select,
  emojiPicker, imagePicker, swipeRow, confirmSheet, toast, todayISO, weekdayCN, dayOf, monOf, fmtDate,
  richBody, mentionSource, stripBody, renderBody, truncate, globalSearchRow, nowLocalDT, journalAmbiance
} from '../ui.v2.js';
import { WEATHER_OPTIONS, DEFAULT_WEATHER } from '../weather.v2.js';

const MOODS = ['😊', '🥰', '😌', '🤔', '😢', '😡', '😴', '🥳', '😭', '🫠'];
const STORE = 'journals';

let viewMode = 'list'; /* 'list' | 'month' */
let calYear, calMonth; /* 当前日历显示的年月 YYYY-MM */

/* ---------- 列表页 ---------- */
export async function list(nav, query) {
  const initQ = (query && query.get) ? (query.get('q') || '') : '';
  const rows = (await db.all(STORE)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  /* 初始化日历年月为当前月 */
  const now = todayISO();
  if (!calYear || !calMonth) { calYear = +now.slice(0, 4); calMonth = +now.slice(5, 7); }

  const thisMonth = now.slice(0, 7);
  const stats = h('div', { class: 'stats' },
    h('div', { class: 'stat' }, h('b', {}, rows.length), h('span', {}, '总篇数')),
    h('div', { class: 'stat' }, h('b', {}, rows.filter(r => (r.date || '').startsWith(thisMonth)).length), h('span', {}, '本月')),
    h('div', { class: 'stat' }, h('b', {}, rows[0] ? (rows[0].mood || '😊') : '🌙'), h('span', {}, '最近心情'))
  );

  /* 视图切换按钮 */
  const toggleBtn = h('button', {
    class: 'chip', style: { marginLeft: 'auto' },
    onclick: async () => {
      viewMode = viewMode === 'list' ? 'month' : 'list';
      nav('#/journals' + (initQ ? '?q=' + encodeURIComponent(initQ) : ''), true);
    }
  }, viewMode === 'list' ? '📅 月视图' : '📋 列表');

  let content;
  let searchBtn; /* 搜索按钮引用，用于切换状态 */
  if (viewMode === 'month') {
    content = await monthView(rows, nav);
  } else {
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
      const hash = clean ? '#/journals?q=' + encodeURIComponent(clean) : '#/journals';
      history.replaceState(null, '', hash);
    };
    searchBtn = h('button', { class: 'icon-btn', onclick: () => { const on = searchBar.style.display === 'none'; toggleSearch(on); }, 'aria-label': '搜索' }, icon('search'));
    const renderList = (q) => {
      const kw = (q || '').trim().toLowerCase();
      const rawQ = (q || '').trim();
      const filtered = kw
        ? rows.filter(r => [stripBody(r.content), (r.keywords || []).join(' '), r.breakfast, r.lunch, r.dinner]
            .filter(Boolean).join(' ').toLowerCase().includes(kw))
        : rows;
      listWrap.innerHTML = '';
      /* 搜索态下始终提供「升级为全局搜索」入口 */
      if (kw) listWrap.appendChild(globalSearchRow(rawQ, nav));
      if (!filtered.length) {
        const searching = !!kw;
        listWrap.appendChild(emptyState(
          searching ? 'search' : '🌙',
          searching ? '日记里没有匹配的结果' : '还没有日记',
          searching ? '试试上面的全局搜索，或换个关键词' : '点击右上角 ＋ 写下今天的心情吧'
        ));
        return;
      }
      /* 按月份分组，每组一个可折叠月份标题 */
      const groups = new Map();
      filtered.forEach(r => {
        const m = (r.date || '').slice(0, 7); // YYYY-MM
        if (!groups.has(m)) groups.set(m, []);
        groups.get(m).push(r);
      });
      const MON_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      for (const [monthKey, items] of groups) {
        const mIdx = +(monthKey.slice(5, 7)) - 1;
        const year = monthKey.slice(0, 4);
        const abbr = MON_ABBR[mIdx] || '';
        const listEl = h('div', { class: 'jr-month-list' });
        items.forEach(r => listEl.appendChild(card(r, nav, rawQ)));

        const hdr = h('div', { class: 'jr-month-header', onclick: () => {
          const collapsed = hdr.classList.toggle('collapsed');
          listEl.style.display = collapsed ? 'none' : '';
        }},
          h('span', { class: 'jr-mh-arrow' }, '▾'),
          h('span', { class: 'jr-mh-text' }, `${abbr} ${year}`),
          h('span', { class: 'jr-mh-count' }, String(items.length))
        );
        listWrap.appendChild(hdr);
        listWrap.appendChild(listEl);
      }
    };
    searchInput.addEventListener('input', () => { updateUrlQ(searchInput.value); renderList(searchInput.value); });
    if (initQ) { searchInput.value = initQ; searchBar.style.display = ''; renderList(initQ); }
    else renderList('');
    content = h('div', {}, searchBar, listWrap);
  }

  return pageShell({
    title: '日记', sub: 'Journals', stats,
    actions: [
      h('button', { class: 'icon-btn plus', onclick: () => nav('#/journals/new'), 'aria-label': '新建日记' }, '＋'),
      ...(searchBtn ? [searchBtn] : []),
      toggleBtn
    ],
    content
  });
}

/* ---------- 月视图（心情日历）---------- */
async function monthView(rows, nav) {
  /* 按 date 索引 */
  const map = {};
  rows.forEach(r => { if (r.date) map[r.date.slice(0, 10)] = r; });

  const container = h('div', { class: 'cal-wrap' });

  function renderCal() {
    container.innerHTML = '';

    /* 年月导航 */
    const hdr = h('div', { class: 'cal-header' },
      h('button', { class: 'cal-nav', onclick: () => { calMonth--; if (calMonth < 1) { calMonth = 12; calYear--; } renderCal(); } }, '‹'),
      h('span', { class: 'cal-title' }, `${calYear} 年 ${calMonth} 月`),
      h('button', { class: 'cal-nav', onclick: () => { calMonth++; if (calMonth > 12) { calMonth = 1; calYear++; } renderCal(); } }, '›')
    );
    container.appendChild(hdr);

    /* 星期头（独立于日历网格，保证 6 周行高完全相等）*/
    const wkDays = ['一', '二', '三', '四', '五', '六', '日'];
    const headRow = h('div', { class: 'cal-head-row' },
      ...wkDays.map(d => h('div', { class: 'cal-head' }, d))
    );
    const grid = h('div', { class: 'cal-grid' });
    container.appendChild(headRow);
    container.appendChild(grid);

    /* 计算本月天数和起始偏移 */
    const firstDay = new Date(calYear, calMonth - 1, 1);
    const daysInMonth = new Date(calYear, calMonth, 0).getDate();
    /* JS getDay(): 0=Sun, 需要转为 Mon=0 ... Sun=6 */
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    /* 按实际天数自适应行数（4~6 行），避免空白行撑高 */
    const totalCells = startOffset + daysInMonth;
    const actualRows = Math.ceil(totalCells / 7);
    grid.style.gridTemplateRows = `repeat(${actualRows}, 3.4rem)`;

    const todayStr = todayISO();

    for (let i = 0; i < startOffset; i++) {
      grid.appendChild(h('div', { class: 'cal-cell empty' }));
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const entry = map[ds];
      const isToday = ds === todayStr;
      const hasEntry = !!entry;

      const cell = h('div', {
        class: 'cal-cell' + (isToday ? ' today' : '') + (hasEntry ? ' has-entry' : ''),
        onclick: () => {
          if (entry) nav('#/journals/d/' + entry.id);
          else nav('#/journals/new?date=' + ds);
        }
      },
        h('span', { class: 'cal-day-num' }, String(d)),
        hasEntry
          ? h('div', { class: 'cal-info' },
              h('span', { class: 'cal-mood' }, entry.mood || '😊'),
              entry.weather ? h('span', { class: 'cal-wx' }, entry.weather) : null,
              tempLabel(entry) ? h('span', { class: 'cal-temp' }, tempLabel(entry)) : null
            )
          : null
      );
      grid.appendChild(cell);
    }

    /* 月统计 */
    const monthKey = `${calYear}-${String(calMonth).padStart(2, '0')}`;
    const monthEntries = rows.filter(r => (r.date || '').startsWith(monthKey));
    const moodCounts = {};
    monthEntries.forEach(r => { const m = r.mood || '😊'; moodCounts[m] = (moodCounts[m] || 0) + 1; });
    const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0];

    container.appendChild(h('div', { class: 'cal-footer' },
      h('span', {}, `本月 ${monthEntries.length} 篇`),
      topMood ? h('span', {}, `主调 ${topMood[0]} ×${topMood[1]}`) : null
    ));
  }

  renderCal();
  return container;
}

function tempLabel(r) {
  const mn = r.tempMin, mx = r.tempMax;
  if (mn && mx) return `${mn}～${mx}℃`;
  if (mn && !mx) return `最低${mn}℃`;
  if (!mn && mx) return `最高${mx}℃`;
  if (r.temp) return `${r.temp}℃`;
  return '';
}

function mealTags(r) {
  const meals = [['🌅', r.breakfast], ['☀️', r.lunch], ['🌙', r.dinner]].filter(m => m[1] && String(m[1]).trim());
  if (!meals.length) return null;
  return h('div', { class: 'meal-tags' }, ...meals.map(([ico, v]) =>
    h('span', { class: 'meal-tag' }, ico + ' ' + String(v).trim())));
}

function card(r, nav, q) {
  const qx = q ? '?q=' + encodeURIComponent(q) : '';
  const excerpt = stripBody(r.content);
  const dayNum = (r.date || '').slice(8, 10); // 只取日数字
  const c = h('div', { class: 'card jcard' },
    h('div', { class: 'row' },
      h('div', { class: 'jr-left' },
        h('div', { class: 'jr-date' }, dayNum)
      ),
      h('div', { class: 'grow' },
        h('div', { class: 'row between' },
          h('span', { class: 'jr-meta' }, `${weekdayCN(r.date)} · ${r.weather || ''} ${tempLabel(r)}`),
          h('span', { style: { fontSize: '1.15rem' } }, r.mood || '😊')
        ),
        h('p', { class: 'card-body' + (excerpt ? '' : ' ambiance-text'), style: { marginTop: '.3rem' } }, excerpt || journalAmbiance(r)),
        r.illustration
          ? h('img', { class: 'jr-illus', src: r.illustration, alt: '插图' })
          : null,
        mealTags(r)
      )
    ),
    (r.keywords && r.keywords.length)
      ? h('div', { class: 'tagline' }, ...r.keywords.slice(0, 5).map(k => h('span', { class: 'tag' }, '# ' + k)))
      : null
  );
  return swipeRow(c, {
    onTap: () => nav('#/journals/d/' + r.id + qx),
    onEdit: () => nav('#/journals/' + r.id + qx),
    onDelete: async () => {
      if (await confirmSheet({ title: '删除这篇日记？', message: '删除后无法恢复哦', confirmText: '删除' })) {
        await db.remove(STORE, r.id); toast('已删除'); nav('#/journals' + qx, true);
      }
    }
  });
}

/* ---------- 只读详情页 ---------- */
export async function detail(id, nav, query) {
  const r = await db.get(STORE, id);
  if (!r) return emptyState('🌙', '日记不见了', '它可能已经被删除');
  const q = (query && query.get) ? (query.get('q') || '') : '';
  const from = (query && query.get) ? (query.get('from') || '') : '';
  const back = () => nav(from || (q ? '#/journals?q=' + encodeURIComponent(q) : '#/journals'), true);
  const d = new Date(r.date.includes('T') ? r.date : r.date + 'T00:00:00');
  const dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  const meta = [weekdayCN(r.date), (r.weather || ''), tempLabel(r)].filter(Boolean).join(' · ');
  const contentEl = h('div', { class: 'd-content' });
  if (!r.content || !r.content.trim()) {
    contentEl.appendChild(h('p', { class: 'ambiance-text d-ambiance' }, journalAmbiance(r)));
  } else {
    await renderBody(contentEl, r.content, nav);
  }
  const content = h('div', { class: 'detail-card' },
    h('div', { class: 'd-head' },
      h('span', { class: 'd-emoji' }, r.mood || '😊'),
      h('div', {},
        h('div', { class: 'd-title d-subdate' }, fmtDate(r.date)),
        meta ? h('div', { class: 'd-meta' }, meta) : null
      )
    ),
    contentEl,
    r.illustration ? h('img', { class: 'd-illus', src: r.illustration, alt: '插图' }) : null,
    (r.breakfast || r.lunch || r.dinner)
      ? h('div', { class: 'd-section' },
          h('div', { class: 'd-label', 'data-en': 'MEALS' }, '今日三餐'),
          h('div', { class: 'd-meals' },
            r.breakfast ? h('div', { class: 'd-meal' }, h('span', { class: 'mi' }, '🌅'), h('span', {}, r.breakfast)) : null,
            r.lunch ? h('div', { class: 'd-meal' }, h('span', { class: 'mi' }, '☀️'), h('span', {}, r.lunch)) : null,
            r.dinner ? h('div', { class: 'd-meal' }, h('span', { class: 'mi' }, '🌙'), h('span', {}, r.dinner)) : null
          )
        )
      : null,
    (r.keywords && r.keywords.length)
      ? h('div', { class: 'd-section' },
          h('div', { class: 'd-label', 'data-en': 'KEY WORDS' }, '关键字'),
          h('div', { class: 'tagline' }, ...r.keywords.slice(0, 5).map(k => h('span', { class: 'tag' }, '# ' + k)))
        )
      : null
  );
  return detailShell({
    title: '日记', onBack: back,
    actions: [
      h('button', { class: 'icon-btn', onclick: () => nav('#/journals/' + id), 'aria-label': '编辑' }, icon('pencil'))
    ],
    content
  });
}

/* ---------- 编辑 / 新建页 ---------- */
function journalPrompt() {
  const hr = new Date().getHours();
  if (hr <= 5) return '此刻窗外的天，是什么颜色？';
  if (hr <= 9) return '今天醒来的第一个念头，是什么？';
  if (hr <= 11) return '这个上午，有什么在心里停留？';
  if (hr <= 13) return '午饭后的片刻，想记点什么？';
  if (hr <= 17) return '午后的光里，发生了什么？';
  if (hr <= 21) return '今天快要收尾了，还留着什么？';
  return '睡前，想和今天的自己说点什么？';
}

export async function edit(id, nav, query) {
  const rec = id ? await db.get(STORE, id) : null;
  const isNew = !rec;

  /* 日期升级为日期+时间：新日记默认当前时间；历史仅日期数据补 T00:00 */
  const dtVal = (d) => d ? (d.length === 10 ? d + 'T00:00' : d) : nowLocalDT();
  const dateIn = input({ type: 'datetime-local', value: dtVal(rec?.date) });
  /* 支持从月视图带 date 参数预填 */
  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  if (isNew && urlParams.get('date')) dateIn.value = urlParams.get('date') + 'T09:00';

  const weekIn = input({ readonly: true, value: weekdayCN(dateIn.value) });
  dateIn.addEventListener('change', () => { weekIn.value = weekdayCN(dateIn.value); });

  const wxSel = select(WEATHER_OPTIONS, rec?.weather || DEFAULT_WEATHER);
  const tempMinIn = input({ type: 'number', inputmode: 'decimal', class: 'input temp-input', value: rec?.tempMin ?? '' });
  const tempMaxIn = input({ type: 'number', inputmode: 'decimal', class: 'input temp-input', value: rec?.tempMax ?? '' });
  const mood = emojiPicker(MOODS, rec?.mood || '😊');
  const kwIn = input({ placeholder: '', value: (rec?.keywords || []).join('，') });
  const illus = imagePicker(rec?.illustration || '', 'image');
  const breakIn = input({ placeholder: '早餐', value: rec?.breakfast || '' });
  const lunchIn = input({ placeholder: '午餐', value: rec?.lunch || '' });
  const dinnerIn = input({ placeholder: '晚餐', value: rec?.dinner || '' });
  const src = await mentionSource();
  const body = richBody(rec?.content || '', { withImage: true, mention: src, placeholder: journalPrompt() });

  const form = [
    // 日期 + 星期
    field('日期', h('div', { class: 'two' }, dateIn, weekIn), { required: true }),
    // 心情
    field('心情', mood.el, { required: true }),
    // 天气 + 温度（每天要记）
    h('div', { class: 'field' },
      h('label', {}, '天气与温度'),
      h('div', { class: 'weather-box' },
        wxSel,
        h('div', { class: 'temp-range' },
          h('span', {}, '🌡️'),
          tempMinIn,
          h('span', { class: 'tild' }, '～'),
          tempMaxIn,
          h('span', { style: { color: 'var(--muted)' } }, '℃')
        )
      )
    ),
    // 正文置顶：打开即聚焦
    field('正文内容', body.el),
    // 今日三餐
    h('div', { class: 'field' },
      h('label', {}, '今日三餐'),
      h('div', { class: 'col-gap' },
        h('div', { class: 'meal-row' }, h('span', { class: 'meal-ico' }, '🌅'), breakIn),
        h('div', { class: 'meal-row' }, h('span', { class: 'meal-ico' }, '☀️'), lunchIn),
        h('div', { class: 'meal-row' }, h('span', { class: 'meal-ico' }, '🌙'), dinnerIn)
      )
    ),
    // 其余属性折叠进「更多」
    h('details', { class: 'more' },
      h('summary', {}, '更多选项'),
      field('关键字', kwIn),
      field('插图', illus.el)
    )
  ];

  const save = async () => {
    const html = body.get();
    if (!dateIn.value) return toast('请选择日期');
    const keywords = kwIn.value.split(/[,，\s、]+/).map(s => s.trim()).filter(Boolean).slice(0, 5);
    const saved = await db.save(STORE, {
      id: rec?.id, createdAt: rec?.createdAt,
      date: dateIn.value,
      weekday: weekdayCN(dateIn.value),
      weather: wxSel.value,
      tempMin: tempMinIn.value === '' ? '' : String(Math.round(Number(tempMinIn.value))),
      tempMax: tempMaxIn.value === '' ? '' : String(Math.round(Number(tempMaxIn.value))),
      mood: mood.get(),
      keywords,
      illustration: illus.get(),
      breakfast: breakIn.value.trim(),
      lunch: lunchIn.value.trim(),
      dinner: dinnerIn.value.trim(),
      content: html
    });
    toast('已保存 ✨');
    nav('#/journals/d/' + saved.id, true);
  };

  const q = (query && query.get) ? (query.get('q') || '') : '';
  const shell = editorShell({
    title: isNew ? '写日记' : '编辑日记',
    onBack: isNew ? () => nav(q ? '#/journals?q=' + encodeURIComponent(q) : '#/journals', true)
                  : () => nav('#/journals/d/' + id, true),
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
