/* ═══════════════════════════════════════════════════
   settings.js — 设置页（数据备份 / 恢复）
   数据保存在本机 IndexedDB，无云端，提供导出/导入保险
   ═══════════════════════════════════════════════════ */

import { db, getCustomOptions } from '../db.v2.js';
import { h, icon, pageShell, toast, confirmSheet, select } from '../ui.v2.js';
import { THEMES, applyTheme, getTheme } from '../theme.v2.js';
import { CATS as MEMO_CATS } from './memo.v3.js';

export async function list(nav) {
  /* ---------- 导入：从文本 / 文件内容恢复 ---------- */
  const doImport = async (text) => {
    if (!text || !text.trim()) { toast('请先选择备份文件'); return; }
    let payload;
    try { payload = JSON.parse(text); }
    catch { toast('内容不是有效的备份文本'); return; }
    const ok = await confirmSheet({
      title: '导入将覆盖同名数据',
      message: '导入会以相同的 id 覆盖现有记录。建议先导出当前数据做备份。',
      confirmText: '导入'
    });
    if (!ok) return;
    try {
      const n = await db.importAll(payload);
      if (payload && typeof payload.theme === 'string' && payload.theme) {
        try { applyTheme(payload.theme); } catch (e) {}
      }
      toast(`已恢复 ${n} 条数据`);
      setTimeout(() => location.reload(), 900);   /* 重载以刷新内存态，杜绝任何渲染不一致 */
    } catch (e) {
      toast('导入失败：' + (e.message || e));
    }
  };

  /* ---------- 导出：下载 JSON 文件 ---------- */
  const exportFile = async () => {
    const data = await db.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Cogito-备份-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('已导出备份文件');
  };


  /* ---------- 文件选择 ---------- */
  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', style: { display: 'none' },
    onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const t = await f.text();
      await doImport(t);
      e.target.value = '';
    }
  });


  /* ---------- 主题选择 ---------- */
  const themeCard = (() => {
    const opts = THEMES.map(t => {
      const sw = h('div', { class: 'theme-sw' },
        ...t.sw.map(c => h('i', { style: { background: c } }))
      );
      const check = h('span', { class: 'theme-check' }, icon('check'));
      const opt = h('div', {
        class: 'theme-opt' + (t.id === getTheme() ? ' on' : ''),
        onclick: () => {
          applyTheme(t.id);
          opts.forEach(o => o.classList.remove('on'));
          opt.classList.add('on');
          toast(`已切换为「${t.name}」`);
        }
      },
        sw,
        h('div', { class: 'theme-meta' },
          h('b', {}, t.name),
          h('span', {}, t.desc)
        ),
        check
      );
      return opt;
    });
    return h('div', { class: 'card', style: { marginBottom: '.75rem' } },
      h('h3', { class: 'card-title', style: { marginBottom: '.45rem' } }, '外观主题'),
      h('p', { class: 'card-sub', style: { marginBottom: '.6rem', lineHeight: 1.5 } }, '选择喜欢的配色风格，立即生效并自动保存。'),
      h('div', { class: 'theme-list' }, ...opts)
    );
  })();

  const memoDefaultCard = await (async () => {
    const custom = await getCustomOptions('memoCat');
    const allCats = [...MEMO_CATS, ...custom.filter(c => !MEMO_CATS.includes(c))];
    const cur = await db.metaGet('memo:defaultCat', 'Memo');
    const sel = select(allCats, cur, { class: 'select' });
    sel.addEventListener('change', async () => {
      await db.metaSet('memo:defaultCat', sel.value);
      toast('默认分类已设为「' + sel.value + '」');
    });
    return h('div', { class: 'card', style: { marginBottom: '.75rem' } },
      h('h3', { class: 'card-title', style: { marginBottom: '.4rem' } }, '备忘录默认分类'),
      h('p', { class: 'card-sub', style: { marginBottom: '.6rem', lineHeight: 1.5 } }, '新建备忘时默认选中的分类，可随时修改；未设置过则默认 Memo。'),
      sel
    );
  })();

  const content = h('div', { style: { padding: '.25rem' } },
    themeCard,
    memoDefaultCard,
    h('div', { class: 'card', style: { marginBottom: '.75rem' } },
      h('h3', { class: 'card-title', style: { marginBottom: '.55rem' } }, '数据备份'),
      h('div', { class: 'row', style: { gap: '.55rem' } },
        h('button', { class: 'btn-soft', style: { display: 'flex', alignItems: 'center', gap: '.35rem', flex: 1, justifyContent: 'center' }, onclick: exportFile }, [
          h('span', {}, '⬇️'),
          '导出备份'
        ]),
        h('button', { class: 'btn-soft', style: { display: 'flex', alignItems: 'center', gap: '.35rem', flex: 1, justifyContent: 'center' }, onclick: () => fileInput.click() }, [
          h('span', {}, '⬆️'),
          '导入备份'
        ])
      ),
      fileInput,
      h('p', { class: 'card-sub', style: { marginTop: '.55rem', fontSize: '.7rem', lineHeight: 1.45 } }, '数据保存在本机 IndexedDB · 离线可用')
    ),
    h('div', { class: 'card' },
      h('h3', { class: 'card-title', style: { marginBottom: '.45rem' } }, '关于与鸣谢'),
      h('p', { class: 'card-sub', style: { lineHeight: 1.55 } },
        'Cogito · 我思故我在 — 个人生活记录中心。' +
        '图标采用 Twemoji（CC-BY 4.0，twitter/twemoji）。')
    )
  );

  return pageShell({ title: '设置', content });
}
