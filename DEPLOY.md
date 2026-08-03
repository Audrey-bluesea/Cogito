# Cogito 部署指南（Cloudflare Pages · 固定域名）

目标：把 Cogito 部署到 Cloudflare Pages，拿到一个**永远不变**的地址
（如 `cogito.pages.dev`），以后改代码 `git push` 即自动更新，
手机刷新就是新版，**再也不用迁移数据**。

当前本地仓库状态：已 `git init` 并提交 v54（含手撕卡修复、做旧牛皮纸噪点、
各主题彩色底恢复）。`sw.js` 缓存版本 `cogito-v54`。
**✅ 初始推送已完成**：`main` 分支已上线 GitHub（remote = `Audrey-bluesea/Cogito`，
本地 remote 已指向规范名 `Cogito`）。下面的第 2 步可跳过，直接从第 3 步连 Cloudflare 开始。

---

## 你需要做的（约 10 分钟）

### 第 1 步 · 在 GitHub 建一个仓库
- 打开 https://github.com/new
- Repository name 填 `Cogito`，选 **Public**（私有也行，但 Pages 免费需 public 或 Pro）
- **不要**勾选 "Add a README"（本地已有内容）
- 点 Create repository

### 第 2 步 · 把本地仓库推上去
建完仓库后，GitHub 会显示推送命令。在本机执行：

```bash
cd /Users/leeshukyuen/WorkBuddy/2026-07-31-23-01-57/cogito
git remote add origin https://github.com/<你的用户名>/Cogito.git
git branch -M main
git push -u origin main
```

> 如果装了 GitHub CLI（`gh`），也可：`gh repo create Cogito --public --source=. --push`

### 第 3 步 · Cloudflare Pages 关联部署
- 打开 https://dash.cloudflare.com/ → 左侧 **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
- 授权并选择刚才的 `Cogito` 仓库
- 构建设置：
  - Framework preset：**None**
  - Build command：**留空**
  - Build output directory：**`/`（仓库根目录，index.html 在这）**
- 点 **Save and Deploy**
- 约 1 分钟后得到固定地址，形如 `https://cogito.pages.dev`

### 第 4 步 · 最后一次数据迁移（一次性）
新地址是**新 origin**，旧数据在 `868d63f3…bj3`，需搬过来：
1. 打开旧地址 `https://868d63f37fd24c55b0ae1abdb629b9e3.bj3.agentos-app.net`
   → 设置 → 导出备份 → **复制文本**
2. 打开新地址 `https://cogito.pages.dev`
   → 设置 → 导入恢复 → 粘贴 → **从文本导入** → 确认
3. 主题会一并还原。旧地址数据原样保留，可随时回退。

### 第 5 步 · 重新装到主屏
新地址数据齐全后，从 `cogito.pages.dev` **添加到主屏幕**。
以后这个图标 = 固定地址 + 永远最新版。旧的两个 CloudStudio 链接可舍弃。

---

## 以后怎么更新（一劳永逸）
改完代码后，只需：
```bash
cd /Users/leeshukyuen/WorkBuddy/2026-07-31-23-01-57/cogito
# 改完后别忘了给 sw.js 的 CACHE 升一位版本号（如 v54 → v55）
git add .
git commit -m "描述改动"
git push
```
Cloudflare 自动重新部署，手机刷新即新版。**地址永不变，数据永不丢。**

---

## 备注
- 纯静态站点，无构建、无后端、无数据库。Cloudflare Pages 免费额度足够个人使用。
- 若想要自己的域名（如 `memo.你的域名.com`），在 Cloudflare Pages 的
  Custom domains 里加一条 CNAME 即可（域名本身约 ¥60/年）。
- 海外可用：当前所有资源（含 Caveat 字体）均内嵌，零外部依赖。
- 内部 IndexedDB 库名仍为 `cozymemo`（历史数据标识，改它会导致旧数据丢失），
  对外展示名已统一为 Cogito。
