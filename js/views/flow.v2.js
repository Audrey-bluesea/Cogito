/* ═══════════ 首页：🌳 时光流 Flow（日签卡片 · 最近 7 天） ═══════════ */
import { db } from '../db.v2.js';
import { h, icon, stripBody, truncate, weekdayCN, toast } from '../ui.v2.js';

const MOD_ICO = { journals: '📖', memos: '📕', books: '📚', movies: '🎬' };
const MOD_BAR = { journals: '#DBC4B0', memos: '#EDE0C8', books: '#C6D0C0', movies: '#88B5C6' };

/* 模块级：记录哪些天处于"展开"状态（跨重绘保持） */
const EXPANDED = new Set();

function greeting() {
  const hr = new Date().getHours();
  if (hr < 11) return { hi: 'Good morning ☀️', sub: '早安，新的一天' };
  if (hr < 18) return { hi: 'Good afternoon 🌤️', sub: '午后好时光' };
  return { hi: 'Good evening 🌙', sub: '夜色温柔' };
}

/** 本地日期转 YYYY-MM-DD（避免 toISOString 的 UTC 偏移）*/
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** 从 ISO 日期/时间提取 HH:mm */
function timeStr(iso) {
  if (!iso || iso.length < 16) return '';
  return iso.slice(11, 16);
}

/* ═══ 日签卡片标签（时间 + 内容，算法自动，卡片顶部统一展示） ═══
   时间：7 时段全覆盖（00:00 未知不打标）
   内容：感叹号/问号/长文/书名号/emoji 密度 */
function dayTags(items) {
  const tags = new Map();

  /* ── 时间标签（每条记录的时段）── */
  items.forEach(it => {
    if (!it.ts || it.ts.length < 16) return;
    const hr = +it.ts.slice(11, 13);
    if (hr === 0 && +it.ts.slice(14, 16) === 0) return; // legacy date-only

    let t;
    if (hr >= 0 && hr <= 5)       t = { ico: '🌙', label: '深夜呢喃' };
    else if (hr >= 6 && hr <= 9)  t = { ico: '🌅', label: '晨间思绪' };
    else if (hr >= 10 && hr <= 11) t = { ico: '🌤', label: '上午时光' };
    else if (hr >= 12 && hr <= 13) t = { ico: '🍱', label: '午间缝隙' };
    else if (hr >= 14 && hr <= 17) t = { ico: '🌿', label: '午后漫游' };
    else if (hr >= 18 && hr <= 21) t = { ico: '🌆', label: '入夜时分' };
    else if (hr >= 22 && hr <= 23) t = { ico: '🌌', label: '深夜独处' };

    if (t) tags.set(t.label, t);

    /* 影视深夜额外打标 */
    if (it.store === 'movies' && (hr >= 22 || hr <= 5)) {
      tags.set('夜间影院', { ico: '🎬', label: '夜间影院' });
    }
  });

  /* ── 内容标签（聚合全天所有记录）── */
  let excl = 0, qm = 0, chars = 0, bookMark = false, emojiCnt = 0, textLen = 0;
  items.forEach(it => {
    const text = stripBody(it.rec.content) || '';
    const title = it.rec.title || '';
    const c = text + ' ' + title;

    excl += (c.match(/[!\uff01]/g) || []).length;
    qm += (c.match(/[\?\uff1f]/g) || []).length;
    chars += text.length;
    if (/《[^》]+》/.test(c)) bookMark = true;

    const em = c.match(/[\p{Emoji_Presentation}\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || [];
    emojiCnt += em.length;
    textLen += (c.replace(/[\s\p{P}]/gu, '')).length;
  });

  if (excl >= 3) tags.set('能量爆发', { ico: '⚡', label: '能量爆发' });
  if (qm >= 3)   tags.set('疑惑时刻', { ico: '❓', label: '疑惑时刻' });
  if (chars > 200) tags.set('沉思录', { ico: '📖', label: '沉思录' });
  if (bookMark)   tags.set('提及书籍', { ico: '📚', label: '提及书籍' });
  if (textLen > 10 && emojiCnt / textLen > 0.15)
    tags.set('表情丰富', { ico: '😊', label: '表情丰富' });

  return [...tags.values()];
}

/* ═══ 今日关键词：仅在具备准确来源（当天读完的书 / 看完的影视）时显示，不做猜测 ═══ */
function dayKeyword(items) {
  const marked = [];
  items.forEach(it => {
    if (it.store === 'books' && it.rec.finishDate) marked.push(it.rec.title);
    if (it.store === 'movies' && it.rec.watchDate) marked.push(it.rec.title);
  });
  return marked.length ? marked[marked.length - 1] : '';
}

/* ═══ 日签卡片 ═══ */
function dayLabel(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cmp = new Date(d); cmp.setHours(0, 0, 0, 0);
  const diff = Math.round((today - cmp) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekdayCN(ymd(d))}`;
}

/* ═══ 时段氛围色（三维度：卡片背景 bg / 左侧色条 bar / 文字 text）═══ */
const TIME_SLOTS = [
  /* 🌙 深夜呢喃 */ { start: 0,  end: 6,  bg: '#D8D8E0', bar: '#B0B0C0', text: '#4A4A55' },
  /* 🌅 晨间思绪 */ { start: 6,  end: 10, bg: '#F5E8F0', bar: '#D4C0D4', text: '#5A4A5A' },
  /* 🌤 上午时光 */ { start: 10, end: 12, bg: '#FDF2E3', bar: '#C8D4B8', text: '#5A5A4A' },
  /* 🍱 午间缝隙 */ { start: 12, end: 14, bg: '#E8F5F0', bar: '#A8C8C0', text: '#4A5A55' },
  /* 🌿 午后漫游 */ { start: 14, end: 18, bg: '#F5EDE0', bar: '#D4C8B8', text: '#5A554A' },
  /* 🌆 入夜时分 */ { start: 18, end: 22, bg: '#F5E0D8', bar: '#D4B8B8', text: '#5A4A4A' },
  /* 🌌 深夜独处 */ { start: 22, end: 24, bg: '#E8E8F0', bar: '#B8B8D4', text: '#4A4A5A' }
];

/** 按时间戳返回所属时段的氛围色（无效时间返回 null） */
function timeSlot(iso) {
  if (!iso || iso.length < 16) return null;
  const hr = +iso.slice(11, 13);
  const min = +iso.slice(14, 16);
  if (hr === 0 && min === 0) return null; // legacy date-only
  return TIME_SLOTS.find(s => hr >= s.start && hr < s.end) || null;
}

/** 单条记录行（展开态） */
function dayRow(it, nav) {
  let summary;
  if (it.store === 'journals')      summary = stripBody(it.rec.content) || '（空白日记）';
  else if (it.store === 'memos')     summary = it.rec.title || stripBody(it.rec.content) || '（空白备忘）';
  else                               summary = it.rec.title || '（未命名）';
  const ico = it.store === 'journals' ? (it.rec.mood || '😊') : MOD_ICO[it.store];

  const inner = [
    h('span', { class: 'mom-ico' }, ico),
    h('span', { class: 'mom-summary' }, truncate(summary, 24))
  ];
  if ((it.store === 'books' || it.store === 'movies') && it.rec.rating) {
    inner.push(h('span', { class: 'mom-rating' }, '⭐ ' + Number(it.rec.rating).toFixed(1)));
  }
  inner.push(h('span', { class: 'mom-time' }, timeStr(it.ts)));

  const slot = timeSlot(it.ts);

  return h('div', {
    class: 'mom-card',
    style: {
      borderLeftColor: slot ? slot.bar : (MOD_BAR[it.store] || 'var(--border)'),
      ...(slot ? { background: slot.bg, color: slot.text } : {})
    },
    onclick: () => nav(`#/${it.store}/d/${it.rec.id}`)
  }, h('div', { class: 'mom-card-inner' }, ...inner));
}

/** 折叠态：摘要预览（点击展开当天） */
function previewLines(items, toggleDay) {
  const lines = items.slice(0, 3).map(it => {
    let s;
    if (it.store === 'journals') s = '📖 ' + truncate(stripBody(it.rec.content) || '空白日记', 20);
    else if (it.store === 'memos') s = '📕 ' + (it.rec.title || truncate(stripBody(it.rec.content) || '空白备忘', 20));
    else if (it.store === 'books') s = '📚 读完《' + (it.rec.title || '未命名') + '》';
    else                           s = '🎬 看完《' + (it.rec.title || '未命名') + '》';
    return h('div', { class: 'day-prev-line' }, h('span', {}, s));
  });
  return h('div', { class: 'day-preview', onclick: () => toggleDay(items[0].date) }, ...lines);
}

function dayCard(day, nav, toggleDay) {
  const isOpen = EXPANDED.has(day.ds);
  const kw = dayKeyword(day.items);
  const tags = dayTags(day.items);

  const tagRow = tags.length
    ? h('div', { class: 'day-tags' }, ...tags.map(t => h('span', {}, t.ico + ' ' + t.label)))
    : null;

  const head = h('div', { class: 'day-head', onclick: () => toggleDay(day.ds) },
    h('div', { class: 'day-head-l' },
      h('span', { class: 'day-title' }, dayLabel(day.date)),
      kw ? h('span', { class: 'day-kw' }, kw) : null
    ),
    h('span', { class: 'day-count' }, day.items.length + ' 条'),
    h('span', { class: 'day-chevron' }, isOpen ? '▴' : '▾')
  );
  /* 始终渲染 preview 和 body，用 .open + CSS 控制显隐，避免全量重绘闪白 */
  const preview = previewLines(day.items, toggleDay);
  const body = h('div', { class: 'day-body' }, ...day.items.map(it => dayRow(it, nav)));
  return h('div', { class: 'day-card' + (isOpen ? ' open' : ''), 'data-ds': day.ds },
    tagRow, head, preview, body
  );
}

/** 留白：无记录的某天（文字在左，虚线填充右侧） */
function blankDay(day) {
  return h('div', { class: 'blank-day' },
    h('span', { class: 'blank-text' }, `${day.date.getMonth() + 1}月${day.date.getDate()}日 留白`),
    h('div', { class: 'blank-line' })
  );
}

/* ═══ 体重趋势 sparkline：从标题为「体重记录」的备忘解析 ═══ */
/* 每行格式 YYYYMMDD XX.XXkg，取最新 7 条画纯折线 + 各点小数值 */
function parseWeight(content) {
  const html = content || '';
  // 归一化：去掉所有HTML标签，统一所有空白字符（含&nbsp;和\u00a0不换行空格）
  const text = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ');
  // 全局正则匹配（不依赖换行分割，避免编辑器漏写尾换行导致末条丢失）
  const re = /(\d{8})\s+([\d.]+)\s*kg/gi;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ date: m[1], val: parseFloat(m[2]) });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

function buildSparkline(vals) {
  const W = 240, H = 44, pad = 7;
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = (max - min) || 1;
  const n = vals.length;
  const stepX = n > 1 ? (W - pad * 2) / (n - 1) : 0;
  const coords = vals.map((v, i) => {
    const x = pad + stepX * i;
    const y = pad + (H - pad * 2) * (1 - (v - min) / range);
    return { x, y, val: v };
  });
  const pts = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">`
    + `<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
  return { svg, coords, W, H };
}

function weightCard(memos, nav) {
  const memo = memos.find(r => (r.title || '').trim() === '体重记录');
  if (!memo) return null;
  const allPts = parseWeight(memo.content);
  const pts = allPts.slice(-7);
  if (pts.length < 2) return null;
  const { svg, coords, W, H } = buildSparkline(pts.map(p => p.val));
  const spark = h('div', { class: 'wc-spark' });
  spark.innerHTML = svg;
  coords.forEach(c => {
    const el = h('span', { class: 'wc-pt', style: { left: (c.x / W * 100) + '%', top: (c.y / H * 100) + '%' } },
      String(c.val));
    spark.appendChild(el);
  });
  return h('div', { class: 'card weight-card', onclick: () => nav('#/memos/d/' + memo.id) },
    h('div', { class: 'wc-inner' },
      spark,
      h('div', { class: 'wc-head' }, 'Weight Trend')
    )
  );
}

/** 本周一 00:00（本地时间，避免 toISOString 的 UTC 偏移） */
function weekStartLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const wd = d.getDay();                 // 0=周日
  const back = wd === 0 ? 6 : wd - 1;    // 回退到周一
  d.setDate(d.getDate() - back);
  return d;
}

/** 当前连续阅读天数：从今天往回数连续打卡的天数。
 *  今天未打但昨天打了 → 仍算连续（streak 活着）；遇到断天则当前段从最后一个打卡日重新计第一天。 */
function readingStreak(set) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (!set.has(ymd(d))) {            // 今天还没打
    d.setDate(d.getDate() - 1);      // 退到昨天
    if (!set.has(ymd(d))) return 0;  // 昨天也没打 → 断了
  }
  let n = 0;
  while (set.has(ymd(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/** 📋 本周回顾：统计本周一至今的变化，仅显示有变化的项 */
function weekReview(journals, memos, books, movies, checkins) {
  const ws = weekStartLocal();
  const wsTs = ws.getTime();
  const nowTs = Date.now();
  const inWeek = (iso) => {
    if (!iso) return false;
    const t = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).getTime();
    return t >= wsTs && t <= nowTs;
  };

  const nJournal = journals.filter(r => inWeek(r.date)).length;
  const nMemo = memos.filter(r => inWeek(r.time)).length;

  let wantRead = 0, reading = 0, finished = 0;
  let wantWatch = 0, watching = 0, watched = 0;
  books.forEach(r => {
    if (!inWeek(r.updatedAt)) return;
    if (r.status === '在读') reading++;
    else if (r.status === '读完') finished++;
    else if (r.status === '想读') wantRead++;
  });
  movies.forEach(r => {
    if (!inWeek(r.updatedAt)) return;
    if (r.status === '在看') watching++;
    else if (r.status === '看完') watched++;
    else if (r.status === '想看') wantWatch++;
  });

  const streak = readingStreak(new Set((checkins || []).map(r => r.id)));

  const parts = [];
  if (streak >= 1) parts.push(`已连续阅读${streak}天`);
  if (nJournal) parts.push(`写了${nJournal}篇日记`);
  if (nMemo) parts.push(`${nMemo}条备忘`);
  if (wantRead) parts.push(`新增了${wantRead}本书想读`);
  if (reading) parts.push(`在读${reading}本书`);
  if (finished) parts.push(`读完${finished}本书`);
  if (wantWatch) parts.push(`新增了${wantWatch}部影视想看`);
  if (watching) parts.push(`在看${watching}部影视`);
  if (watched) parts.push(`看完${watched}部影视`);

  if (!parts.length) return null;

  return h('div', { class: 'flow-widget flow-week' },
    h('div', { class: 'fw-ico' }, '📋'),
    h('div', { class: 'fw-body' },
      h('div', { class: 'fw-title' }, 'This week'),
      h('div', { class: 'fw-text' }, parts.join(' · '))
    )
  );
}

/** 🟦 首页今日打卡方块：纯图形、无文字、方块+勾，点击 toggle 当天 */
function todayCheckinBox(checkins) {
  const todayDs = ymd(new Date());
  const box = h('div', {
    class: 'fc-box' + (new Set((checkins || []).map(r => r.id)).has(todayDs) ? ' checked' : ''),
    onclick: async () => {
      if (box.classList.contains('checked')) {
        await db.remove('checkins', todayDs);
        box.classList.remove('checked');
        toast('已取消今日打卡');
      } else {
        await db.save('checkins', { id: todayDs, checkedAt: new Date().toISOString() });
        box.classList.add('checked');
        toast('✅ 今日已打卡');
      }
    }
  });
  return box;
}

/** 💫 时间回声：往年今日有记录则显示，无任何则返回 null */
function timeEcho(journals, books, movies) {
  const now = new Date();
  const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const thisYear = now.getFullYear();

  const lines = [];

  // 日记：往年今日写下
  const jr = journals.find(r => {
    if (!r.date) return false;
    const y = parseInt(r.date.slice(0, 4), 10);
    return r.date.slice(5, 10) === mmdd && y !== thisYear;
  });
  if (jr) {
    const y = jr.date.slice(0, 4);
    const txt = (stripBody(jr.content || '')).replace(/\s+/g, ' ').trim();
    const m = txt.match(/《([^》]+)》/);
    const title = m ? m[1] : (txt.slice(0, 16) || '一篇日记');
    lines.push(h('div', { class: 'fe-line' }, `📜 ${y}年的今天：你写下了《${title}》`));
  }

  // 书：往年今日读完
  books.forEach(r => {
    if (r.status !== '读完' || !r.finishDate) return;
    const y = parseInt(r.finishDate.slice(0, 4), 10);
    if (r.finishDate.slice(5, 10) === mmdd && y !== thisYear) {
      lines.push(h('div', { class: 'fe-line' }, `📚 ${y}年的今天：你读完了《${r.title || '某书'}》`));
    }
  });

  // 影视：往年今日看完
  movies.forEach(r => {
    if (r.status !== '看完' || !r.watchDate) return;
    const y = parseInt(r.watchDate.slice(0, 4), 10);
    if (r.watchDate.slice(5, 10) === mmdd && y !== thisYear) {
      lines.push(h('div', { class: 'fe-line' }, `🎬 ${y}年的今天：你看完了《${r.title || '某影视'}》`));
    }
  });

  if (!lines.length) return null;
  return h('div', { class: 'flow-widget flow-echo' },
    h('div', { class: 'fw-ico' }, '💫'),
    h('div', { class: 'fw-body' }, ...lines)
  );
}

/** 🍀 偶然重逢：从往年（非今年）记录随机抽一条，点击跳回那天 */
function randomEcho(journals, books, movies, nav) {
  const thisYear = new Date().getFullYear();
  const pool = [];

  journals.forEach(r => {
    if (!r.date) return;
    const y = parseInt(r.date.slice(0, 4), 10);
    if (y >= thisYear) return;
    const txt = stripBody(r.content || '').replace(/\s+/g, ' ').trim();
    const m = txt.match(/《([^》]+)》/);
    const title = m ? m[1] : (txt.slice(0, 16) || '一篇日记');
    pool.push({ y, md: r.date.slice(5, 10), text: `你写下了《${title}》`, link: '#/journals/d/' + r.id });
  });
  books.forEach(r => {
    if (r.status !== '读完' || !r.finishDate) return;
    const y = parseInt(r.finishDate.slice(0, 4), 10);
    if (y >= thisYear) return;
    pool.push({ y, md: r.finishDate.slice(5, 10), text: `你读完了《${r.title || '某书'}》`, link: '#/books/d/' + r.id });
  });
  movies.forEach(r => {
    if (r.status !== '看完' || !r.watchDate) return;
    const y = parseInt(r.watchDate.slice(0, 4), 10);
    if (y >= thisYear) return;
    pool.push({ y, md: r.watchDate.slice(5, 10), text: `你看完了《${r.title || '某影视'}》`, link: '#/movies/d/' + r.id });
  });

  if (!pool.length) return null;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const [mm, dd] = pick.md.split('-');
  const line = `${pick.y}年${parseInt(mm, 10)}月${parseInt(dd, 10)}日 · ${pick.text}`;
  return h('div', { class: 'flow-widget flow-rediscover', onclick: () => nav(pick.link) },
    h('div', { class: 'fw-ico' }, '🍀'),
    h('div', { class: 'fw-body' },
      h('div', { class: 'fw-title' }, '偶然重逢'),
      h('div', { class: 'fw-text' }, line)
    )
  );
}

export async function list(nav) {
  const [journals, memos, books, movies, checkins] = await Promise.all([
    db.all('journals'), db.all('memos'), db.all('books'), db.all('movies'), db.all('checkins')
  ]);

  const toggleDay = (ds) => {
    const opening = !EXPANDED.has(ds);
    if (opening) EXPANDED.add(ds); else EXPANDED.delete(ds);
    /* 原地切换 .open 类，不触发全量重绘 */
    const el = document.querySelector('.day-card[data-ds="' + ds + '"]');
    if (el) {
      el.classList.toggle('open', opening);
      const chev = el.querySelector('.day-chevron');
      if (chev) chev.textContent = opening ? '▴' : '▾';
    }
  };

  /* 收集所有记录（用日期部分分组，用完整 ts 排序） */
  const recs = [];
  journals.forEach(r => { if (r.date)      recs.push({ store: 'journals', rec: r, ts: r.date,      date: r.date.slice(0, 10) }); });
  memos.forEach(r =>    { if (r.time)      recs.push({ store: 'memos',    rec: r, ts: r.time,      date: r.time.slice(0, 10) }); });
  books.forEach(r =>    { if (r.finishDate) recs.push({ store: 'books',  rec: r, ts: r.finishDate, date: r.finishDate.slice(0, 10) }); });
  movies.forEach(r =>   { if (r.watchDate)  recs.push({ store: 'movies', rec: r, ts: r.watchDate,  date: r.watchDate.slice(0, 10) }); });

  /* 最近 7 天（含今天），倒序：今天在最上方；空天显示留白 */
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i <= 6; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const ds = ymd(d);
    const items = recs.filter(r => r.date === ds).sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    days.push({ date: d, ds, items });
  }

  const timeline = days.map(day =>
    day.items.length ? dayCard(day, nav, toggleDay) : blankDay(day)
  );

  const allBlank = days.every(d => d.items.length === 0);

  const g = greeting();
  return h('div', { class: 'page' },
    h('header', { class: 'appbar flow-appbar' },
      h('div', { class: 'flow-greet' },
        h('div', { class: 'flow-hi' }, g.hi),
        h('div', { class: 'flow-sub' }, g.sub)
      ),
      h('button', { class: 'icon-btn', onclick: () => nav('#/search'), 'aria-label': '全局搜索' }, icon('search')),
      h('button', { class: 'icon-btn', onclick: () => nav('#/settings'), 'aria-label': '设置' }, '⚙️')
    ),
    h('div', { class: 'scroll' },
      h('div', { class: 'flow' },
        weightCard(memos, nav),
        randomEcho(journals, books, movies, nav),
        todayCheckinBox(checkins),
        weekReview(journals, memos, books, movies, checkins),
        timeEcho(journals, books, movies),
        allBlank
          ? h('div', { class: 'flow-empty' },
              h('div', { class: 'flow-empty-emoji' }, '🌱'),
              h('div', { class: 'flow-empty-text' }, '还没有记录'),
              h('div', { class: 'flow-empty-sub' }, '写下今天的第一笔，时光流会在这里生长 →'),
              h('button', { class: 'btn-soft', onclick: () => nav('#/journals/new') }, '✍️ 写日记')
            )
          : h('div', {},
              h('div', { class: 'flow-tl-head' }, 'timeline'),
              h('div', { class: 'day-timeline' }, ...timeline)
            )
      )
    )
  );
}
