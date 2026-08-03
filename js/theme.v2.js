/* ═══════════════════════════════════════════════════
   theme.js — 主题切换（多套色系，本地持久化）
   配合 index.html 的 CSS 变量与 [data-theme] 使用
   ═══════════════════════════════════════════════════ */

const KEY = 'memo-theme';

export const THEMES = [
  {
    id: 'vintage',
    name: '法式复古',
    desc: '暖调米灰 · 脏橘 + 深海蓝灰',
    meta: '#D9B8A4',
    sw: ['#E9E2D6', '#D9B8A4', '#9AABBF']
  },
  {
    id: 'oat',
    name: '韩系ins',
    desc: '燕麦底 · 干燥玫瑰粉 + 鼠尾草灰绿',
    meta: '#D9B0AA',
    sw: ['#FDFBF7', '#D9B0AA', '#A9B6A5']
  },
  {
    id: 'aqua',
    name: '日系透明',
    desc: '薄荷奶绿 · 灰紫 + 杏色',
    meta: '#C9C3D6',
    sw: ['#EBF0EA', '#C9C3D6', '#F6E8DD']
  },
  {
    id: 'linen',
    name: '海风亚麻',
    desc: '石灰白 · 浅海蓝 + 陶土粉 + 柠檬黄',
    meta: '#88B5C6',
    sw: ['#F9F6F0', '#88B5C6', '#D9A99A']
  },
  {
    id: 'mist',
    name: '晨雾暮光',
    desc: '石灰白 · 晨雾蓝→淡紫灰→暖杏 渐变柔光',
    meta: '#C9BFD8',
    sw: ['#D4DCE8', '#DFD8E0', '#F5E6D3']
  },
  {
    id: 'mint',
    name: '冰泉薄荷',
    desc: '青蓝透亮 · 薄荷绿→天青 渐变清新',
    meta: '#B8E8E0',
    sw: ['#C6E9E9', '#5FBAA3', '#D1EBDB']
  }
];

const VALID = THEMES.map(t => t.id);

export function getTheme() {
  const v = localStorage.getItem(KEY);
  return VALID.includes(v) ? v : 'vintage';
}

export function applyTheme(id) {
  if (!VALID.includes(id)) id = 'vintage';
  document.documentElement.setAttribute('data-theme', id);
  // 同步浏览器状态栏颜色
  const meta = document.querySelector('meta[name="theme-color"]');
  const t = THEMES.find(x => x.id === id);
  if (meta && t) meta.setAttribute('content', t.meta);
  try { localStorage.setItem(KEY, id); } catch { /* 隐私模式忽略 */ }
}

// 模块加载即应用已保存主题（先于首屏渲染）
applyTheme(getTheme());
