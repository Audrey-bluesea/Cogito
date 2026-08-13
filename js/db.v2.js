/* ═══════════════════════════════════════════════════
   db.js — 轻量 IndexedDB 封装（零依赖，替代 localforage）
   Store: journals / memos / books / movies / meta
   每条记录: { id(uuid), createdAt, updatedAt, ...fields }
   ═══════════════════════════════════════════════════ */

const DB_NAME = 'cozymemo';
const DB_VERSION = 2;
export const STORES = ['journals', 'memos', 'books', 'movies', 'meta', 'checkins'];

let _dbp = null;

/** 数据写入后广播，供视图层做"当前页即时刷新"（双保险，覆盖 iOS 左滑等导航事件未触发的场景） */
function notifyDbChange(store, id) {
  try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cogito:dbchange', { detail: { store, id } })); } catch (e) {}
}

function openDB() {
  if (_dbp) return _dbp;
  _dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      STORES.forEach(name => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbp;
}

function tx(store, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    try { result = fn(s); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export const db = {
  async all(store) {
    const res = await tx(store, 'readonly', s => s.getAll());
    return res || [];
  },
  async get(store, id) {
    if (!id) return null;
    const res = await tx(store, 'readonly', s => s.get(id));
    return res || null;
  },
  /** 新增或更新；自动补 id / createdAt / updatedAt */
  async save(store, record) {
    const now = new Date().toISOString();
    const rec = { ...record };
    if (!rec.id) { rec.id = uuid(); rec.createdAt = now; }
    if (!rec.createdAt) rec.createdAt = now;
    rec.updatedAt = now;
    await tx(store, 'readwrite', s => s.put(rec));
    notifyDbChange(store, rec.id);
    return rec;
  },
  async remove(store, id) {
    await tx(store, 'readwrite', s => s.delete(id));
    notifyDbChange(store, id);
  },
  async clear(store) {
    await tx(store, 'readwrite', s => s.clear());
  },
  /** meta store 简易 KV（用于天气缓存、自定义分类等）*/
  async metaGet(key, fallback = null) {
    const r = await this.get('meta', key);
    return r ? r.value : fallback;
  },
  async metaSet(key, value) {
    await tx('meta', 'readwrite', s => s.put({ id: key, value, updatedAt: new Date().toISOString() }));
    return value;
  },
  /** 导出全部数据（备份用，覆盖所有表 + 主题偏好）*/
  async exportAll() {
    const out = {};
    for (const s of STORES) out[s] = await this.all(s);
    let theme = null;
    try { theme = localStorage.getItem('memo-theme'); } catch (e) {}
    return { app: 'Cogito · 我思故我在', version: 1, exportedAt: new Date().toISOString(), theme, data: out };
  },
  /** 从备份导入全部数据（覆盖所有表 + 恢复主题偏好，按 id 覆盖同名记录）*/
  async importAll(payload) {
    const data = payload && payload.data ? payload.data : payload;
    if (!data || typeof data !== 'object') throw new Error('备份文件格式不正确');
    let count = 0;
    // 全量还原：对备份中包含的每个 store，先清空再写入，移除备份里不存在的残留记录
    for (const s of STORES) {
      const arr = data[s];
      if (!Array.isArray(arr)) continue;            // 备份未包含此表 → 不动，避免误清空现有数据
      await tx(s, 'readwrite', st => st.clear());
      for (const rec of arr) {
        if (rec && rec.id) { await tx(s, 'readwrite', st => st.put(rec)); count++; }
      }
    }
    if (typeof payload.theme === 'string' && payload.theme) {
      try { localStorage.setItem('memo-theme', payload.theme); } catch (e) {}
    }
    return count;
  }
};

/** 自定义选项（分类 / 类型 / 地区）持久化 */
export async function getCustomOptions(key) {
  return (await db.metaGet('opts:' + key, [])) || [];
}
export async function addCustomOption(key, value) {
  const list = await getCustomOptions(key);
  if (value && !list.includes(value)) {
    list.push(value);
    await db.metaSet('opts:' + key, list);
  }
  return list;
}
export async function renameCustomOption(key, oldVal, newVal) {
  const list = await getCustomOptions(key);
  const idx = list.indexOf(oldVal);
  if (idx === -1) return list;
  newVal = (newVal || '').trim();
  if (!newVal || newVal === oldVal) return list;
  if (list.includes(newVal)) list.splice(idx, 1);
  else list[idx] = newVal;
  await db.metaSet('opts:' + key, list);
  return list;
}
export async function deleteCustomOption(key, val) {
  const list = await getCustomOptions(key);
  const next = list.filter(v => v !== val);
  await db.metaSet('opts:' + key, next);
  return next;
}
/** 把某个 store 里字段 field 等于 oldVal 的记录批量改为 newVal（newVal 为 null 时删除该字段） */
export async function updateRecordsField(store, field, oldVal, newVal) {
  const rows = await db.all(store);
  for (const r of rows) {
    if (r[field] === oldVal) {
      if (newVal == null) delete r[field];
      else r[field] = newVal;
      await db.save(store, r);
    }
  }
}
