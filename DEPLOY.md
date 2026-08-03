# Cogito 部署指南（GitHub Pages · 固定地址）

Cogito 是纯前端 PWA（日记 / 备忘 / 书籍 / 影视 / 打卡），数据存浏览器 IndexedDB，
**无后端、无数据库、无构建步骤**。本指南用 **GitHub Pages** 拿到一个**永远不变**的地址，
彻底告别"换地址 + 迁移数据"的破事。

> 内部 IndexedDB 库名仍为 `cozymemo`（为兼容旧数据，不可改）。对外展示名已统一为 Cogito。

## 已完成
- 本地 `cogito/` 已 `git init`，提交 v54（手撕卡修复 + 做旧牛皮纸噪点 + 各主题彩色底恢复）。
- 已推送到 GitHub：**Audrey-bluesea/Cogito**（main 分支）。
- 代码全用相对路径（`./`），子路径 `/Cogito/` 部署无需改任何代码。

## 第 1 步 · GitHub Pages 部署（网页操作，无需终端）
1. 打开 https://github.com/Audrey-bluesea/Cogito
2. 点仓库顶部 **Settings**
3. 左侧 **Pages**（或直开 `.../settings/pages`）
4. **Build and deployment → Source** = **Deploy from a branch**
5. **Branch** = **main**，文件夹 = **/(root)**（index.html 就在仓库根）
6. 点 **Save**
7. 等 1–10 分钟，仓库顶部出现绿条 *"Your site is live at https://audrey-bluesea.github.io/Cogito/"*
8. 浏览器打开 **https://audrey-bluesea.github.io/Cogito/** （C 大写，URL 大小写敏感）

## 第 2 步 · 最后一次数据迁移（一次性）
新地址是全新 origin，IndexedDB 不共享，需手动搬一次：
1. 旧地址 `868d63f3…bj3`（v53，有数据）→ 设置 → 导出备份 → 复制文本
2. 新地址 `audrey-bluesea.github.io/Cogito/` → 设置 → 导入恢复 → 粘贴 → 从文本导入
3. 主题一并还原；旧数据原样保留

## 第 3 步 · 加到主屏
新地址数据与 v54 视觉齐了 → 浏览器"添加到主屏幕"。旧的两个 CloudStudio 链接可丢弃。

## 日后更新代码（一劳永逸）
本地改 `cogito/` 内文件 → 提交并推送（`git push` 用 Personal Access Token 或 SSH）：
```bash
cd /Users/leeshukyuen/WorkBuddy/2026-07-31-23-01-57/cogito
git add -A
git commit -m "改了什么"
git push
```
GitHub Pages 自动重新部署（约 1 分钟），手机刷新即新版，**地址永不变、数据永不迁**。

## 安全收尾
GitHub → Settings → Developer settings → Personal access tokens：
把之前生成的 fine-grained（`github_pat_…`）和 classic（`ghp_…`）都撤销。代码已上线，留着有风险。
