/* ═══════════════════════════════════════════════════
   settings.js — 设置页（数据备份 / 恢复）
   数据保存在本机 IndexedDB，无云端，提供导出/导入保险
   ═══════════════════════════════════════════════════ */

import { db } from '../db.v2.js';
import { h, pageShell, toast, confirmSheet } from '../ui.v2.js';
import { THEMES, applyTheme, getTheme } from '../theme.v2.js';

export async function list(nav) {
  /* ---------- 导入：从文本 / 文件内容恢复 ---------- */
  const doImport = async (text) => {
    if (!text || !text.trim()) { toast('请先选择文件或粘贴备份文本'); return; }
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

  /* ---------- 导出：复制为文本（iOS 万能备份）---------- */
  const copyText = async () => {
    const data = await db.exportAll();
    const text = JSON.stringify(data);
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制全部数据，可粘贴到备忘录/微信保存');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-9999px';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('已复制，请粘贴到备忘录保存'); }
      catch { toast('复制失败，请手动长按选择'); }
      ta.remove();
    }
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

  /* ---------- 粘贴文本 ---------- */
  const pasteArea = h('textarea', {
    class: 'textarea',
    placeholder: '',
    style: { minHeight: '4.5rem', marginTop: '.6rem' }
  });

  /* ---------- 主题选择 ---------- */
  const themeCard = (() => {
    const opts = THEMES.map(t => {
      const sw = h('div', { class: 'theme-sw' },
        ...t.sw.map(c => h('i', { style: { background: c } }))
      );
      const check = h('span', { class: 'theme-check' }, '✓');
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

  const content = h('div', { style: { padding: '.25rem' } },
    themeCard,
    h('div', { class: 'card', style: { marginBottom: '.75rem' } },
      h('h3', { class: 'card-title', style: { marginBottom: '.4rem' } }, '关于数据存储'),
      h('p', { class: 'card-sub', style: { lineHeight: 1.55 } },
        '你的所有数据都保存在当前设备的浏览器本地（IndexedDB），没有上传到任何云端。' +
        '同一台设备、同一个浏览器会一直保留；但换设备、清除网站数据或删除本应用会丢失数据。建议定期导出备份。')
    ),
    h('div', { class: 'card', style: { marginBottom: '.75rem' } },
      h('h3', { class: 'card-title', style: { marginBottom: '.45rem' } }, '导出备份'),
      h('p', { class: 'card-sub', style: { marginBottom: '.6rem', lineHeight: 1.5 } }, '把全部数据导出保存，以防意外丢失。'),
      h('div', { class: 'row', style: { gap: '.5rem' } },
        h('button', { class: 'btn-soft', onclick: exportFile }, '导出文件'),
        h('button', { class: 'btn-soft', onclick: copyText }, '复制文本')
      )
    ),
    h('div', { class: 'card' },
      h('h3', { class: 'card-title', style: { marginBottom: '.45rem' } }, '导入恢复'),
      h('p', { class: 'card-sub', style: { marginBottom: '.6rem', lineHeight: 1.5 } }, '从备份文件或文本恢复数据（按 id 覆盖）。'),
      h('div', { class: 'row', style: { gap: '.5rem', marginBottom: '.2rem' } },
        h('button', { class: 'btn-soft', onclick: () => fileInput.click() }, '选择文件'),
        h('button', { class: 'btn-soft', onclick: () => doImport(pasteArea.value) }, '从文本导入')
      ),
      pasteArea,
      fileInput
    )
  );

  return pageShell({ title: '设置', content });
}
