# X FITNESS Walk-in 系统 v2.18

> 替代 Google Form 的健身房 walk-in 入场系统  
> Next.js 14 + Supabase + Tailwind + Vercel

---

## 🖥 v2.22.0 (2026-10-01) — 后台改版：A · Control Room 浅色版

Ron 选定 mockup `mockups/dashboard-A-light.html`，Staff 和 Admin 都换成新外壳：

- **左侧图标导航栏**（手机上是横向标签）取代旧的黑色顶栏；顶栏有页面标题、时钟、**Ctrl+K 搜索顾客**（名字 / IC / 护照 / 电话，↑↓ + Enter）、SOUND、PRIVACY
- **Privacy 默认开启**（每次打开后台都是开的）：
  - 名字、IC、电话模糊，今天的 CHECK-INS / ALLOWED / DENIED、每小时图表、顾客总数、筛选按钮上的数字都变成 •••
  - **LAST CHECK-IN 卡不遮**，新 check-in 弹窗也照常显示
  - 员工关掉后，**2 分钟没操作会自动重新开启**
  - REPORTS 页在 privacy 开着时整页隐藏
- **TODAY**：上方 5 张数据卡；中间是 live feed；右边是 **NEEDS ATTENTION**（今天来过的被 ban、未满 12 岁、有警告的人，还有新投诉）。点任何一行，右边换成**客户摘要**（照片、到访次数、警告、ban 原因、最新备注 → OPEN FULL PROFILE）。屏幕较窄时摘要改成从右边滑出
- **CUSTOMERS**：同样的工具栏和筛选，点一下看右侧摘要，**双击直接打开完整资料**
- **HISTORY**：日期范围和筛选压缩成几排按钮，表头和日期条会固定在顶部
- **客户详情**：顶部彩色状态块（红 = ban、黄 = 警告、绿 = 正常），**显示 Attention 照片**，资料改成格子，警告和备注并排
- ATTENTION 页从深色改成浅色；其他页面（COMPLAINT / IMPORT / AUDIT / NEW CUSTOMER）去掉重复的大标题，内容不变
- 所有功能、权限不变（Staff 仍然只读，操作按钮跟以前一样）

**改动文件**：新增 `components/dashboard/DashboardShell.tsx`、`CommandPalette.tsx`、`CustomerPanel.tsx`、`lib/privacy.tsx`；重写 `components/TodayList.tsx`；改版 `CustomerList.tsx`、`HistoryClient.tsx`、`CustomerDetail.tsx`、`AttentionClient.tsx`、`SoundToggle.tsx`、`DashboardSkeleton.tsx`；`app/admin/layout.tsx`、`app/staff/layout.tsx`、`app/globals.css`、`tailwind.config.js`；小改 `ComplaintClient`、`ImportClient`、`ReportsClient`、`AuditClient`、`NewCustomerClient`；删除 `components/DashboardNav.tsx`。**无 SQL。**

---

## 📱 v2.21.0 (2026-10-01) — 顾客端「记住这部手机」

回头客入场成功后，绿色页面下方会问 **FASTER NEXT TIME? → REMEMBER THIS PHONE**（三语）。顾客点了之后，下次扫 QR：

1. 首页直接显示 **HELLO, TAN** + **CONTINUE →**，不用再选国籍、输入 IC
2. **规则页照常完整显示**（Ron 决定：re-rack、不准 vape 等每次都要看完，这是健身房文化）
3. 点 CHECK IN → 绿色页面

- **所有检查照旧**：30 分钟冷却、被 ban、未满 12 岁，都和手动输入 IC 走**同一段代码**（新文件 `lib/checkin-lookup.ts`）
- 只有顾客自己点了才会保存，**只存在这部手机上**（localStorage：IC + 名字第一个字），服务器端什么都不变
- 首页有 **NOT TAN? USE ANOTHER IC / PASSPORT**（朋友借手机，走正常流程，不会盖掉原本记住的人）和 **Forget me**（删除）
- 点「No thanks」后，这部手机不会再问
- 已经记住某人的手机，不会再询问其他人（防止被覆盖）
- 原本计划的「常客精简规则」**不做**

**改动文件**：`app/checkin/page.tsx`、`app/checkin/approved/page.tsx`、`app/checkin/id-input/page.tsx`（检查逻辑搬到共用文件，行为不变）、`lib/i18n.ts`（EN/中文/BM 都加了）、新增 `lib/remember-me.ts`、`lib/checkin-lookup.ts`。**无 SQL。**

---

## 🖼 v2.20.1 (2026-10-01) — 规则页图片压缩

顾客端 Reminders 页的 4 张规则图从 PNG 换成 WebP：**743 KB → 178 KB**（-76%），画面不变。回头客每次 check-in 都会加载这页，网络慢的时候差别很明显。

- `rerack` 108→64 KB、`no-slippers` 24→11 KB、`do` 284→48 KB、`dont` 327→55 KB（do/dont 从 1080 缩到 900px，页面最宽只显示约 450px，高清屏仍然清晰）
- 修正 `no-slippers` 的尺寸标注（690×260），加载时不再跳动
- 旧的 PNG 文件保留在 `public/`，没有页面再使用

**改动文件**：`app/checkin/reminders/page.tsx`、新增 4 个 `public/*.webp`。**无 SQL。**

---

## 🔔 v2.20.0 (2026-10-01) — Check-in 弹窗 v2

前台平时主要靠弹窗确认谁进来了，所以这版重做弹窗（`components/CheckinAlerts.tsx`，取代旧的 `CheckinToast`）：

| 谁来了 | 弹窗 | 停留 | 声音 |
|------|------|------|------|
| 普通 / 会员 | 右上角大卡片：名字、MEMBER、第几次到访 | 8 秒（进度条） | 叮 |
| 有警告 | 黄色卡片：**Attention 照片** + 最近一次警告原因 | 20 秒 | 两声短促提示 |
| **被 ban** | **全屏中间红框 DO NOT ADMIT**：大照片、ban 日期和原因、处理步骤 | **不会自动消失**，要按 I'VE HANDLED IT | **警报每 5 秒响一次**（可 MUTE）；分页标题闪烁；Windows 通知 |
| 未满 12 岁 | 中间红框：IC、年龄 | 15 秒或按 OK | 低音 |

- **所有 admin / staff 页面都会弹**（以前只有 TODAY 页面会弹）
- 导航栏新增 **SOUND** 按钮：浏览器还没允许声音时显示红色「SOUND OFF — CLICK」，点一下就开；也能静音。第一次点会询问是否允许 Windows 通知
- 同时来很多人：最多显示 3 张卡片，其余显示「+N MORE CHECK-INS」
- 「I'VE HANDLED IT」只是关弹窗，**不写入数据库**，staff 仍然只读
- 实时推送 + 每 20 秒轮询后备 + 切回分页时补查，不会漏掉

**SQL**：✅ `migration-v2.20.0-popup-fields.sql` — `todays_visits` 视图**在最后追加** 6 个字段（photo_path、visit_count、banned_at、last_warning_reason、last_warning_at、visit_ic），原字段不变。（2026-10-01 已在线上执行并验证）

**改动文件**：`components/CheckinAlerts.tsx`（新）、`components/SoundToggle.tsx`（新）、`lib/chime.ts`、`app/{admin,staff}/layout.tsx`、`components/DashboardNav.tsx`、`components/TodayList.tsx`（移除旧弹窗，保留新行黄色闪烁）、`app/globals.css`；删除 `components/CheckinToast.tsx`

---

## ⚡ v2.19.0 (2026-10-01) — 后台切页提速（外观不变）

| 改动 | 效果 |
|------|------|
| 🧭 **导航栏放进共享 layout** | `app/admin/layout.tsx`、`app/staff/layout.tsx`。切页时导航栏不再重新加载、不再重复查投诉数量 |
| 💀 **骨架屏 `loading.tsx`** | 点击导航后马上显示页面轮廓，不会卡在旧页面上等 |
| 🔑 **登录检查去重** | `lib/auth.ts` 用 React `cache()`，layout 和 page 共用同一次查询 |
| 💾 **页面缓存** | CUSTOMERS / TODAY / HISTORY 切回来时先显示上次的数据，后台再刷新（`lib/client-cache.ts`，只存在当前浏览器分页，登出即清空，不写入 localStorage） |
| ⚡ **CUSTOMERS 并行下载** | 4,200+ 顾客原本 5 个请求一个接一个，现在先拿总数再同时下载 |
| 👤 **客户详情** | 「紧急联络人是被 ban 的顾客」检查不再挡住页面显示；顺便修复同一电话有 2 个以上被 ban 顾客时警告不显示的 bug |

**改动文件**：`lib/auth.ts`、`lib/client-cache.ts`（新）、`components/DashboardSkeleton.tsx`（新）、`app/{admin,staff}/layout.tsx`（新）、`app/{admin,staff}/loading.tsx`（新）、16 个 admin/staff `page.tsx`（移除各自的导航栏）、`components/{CustomerList,TodayList,HistoryClient,CustomerDetail}.tsx`、`app/globals.css`（`.skeleton`，支持 reduced-motion）

**无 SQL。** Staff 仍然只读，顾客端 `/checkin` 与 `/report` 未改动。

---

## 🛡 v2.18.4 (2026-10-01) — Next.js 安全补丁

- `next` / `eslint-config-next` 14.2.15 → **14.2.35**（14.x 最后的安全补丁版本，包含 2025 年的 middleware 授权绕过漏洞修复）
- `npm audit fix`（非破坏性）：nanoid、ws、postcss 升级
- **仍未修（已知）**：部分 `next` 漏洞只在 15/16 修复（升大版本风险高，暂缓）；`xlsx` 0.18.5 有原型污染 / ReDoS 漏洞，npm 上没有修复版（SheetJS 只在官方 CDN 发布 0.20.x）。它只用在 admin IMPORT 页面，而且只处理你自己上传的文件，风险低。

**文档整理**：补写 v2.7.2 → v2.17.2 历史（见下方）；删除 `EMERGENCY-ROLLBACK.sql`（它会重新开放顾客资料外泄，只对 v2.7.1 以前的旧前端有用）；`TRAVEL-OPS-README.md` 标注为已过时。

**改动文件**：`package.json`、`package-lock.json`、文档。**无 SQL。**

---

## 🔒 v2.18.3 (2026-10-01) — 堵住「列出所有到访者 IC」漏洞

**漏洞**：anon 对 `visits` 表有 `ic, status, visited_at` 的读取权限，策略名叫 "Public can read own ic visits"，但写的是 `USING (true)` → 任何人用公开 key 就能列出**所有来过的人的 IC 号码 + 到访时间**。

**修复**：顾客端不再直接读 `visits` 表，改用 2 个只能按单一 IC 查询的 RPC：
- `checkin_last_visit(p_ic)` — id-input 页的 30 分钟冷却提示
- `checkin_visit_stats(p_ic)` — reminders 页的「上次到访 / 总次数」

然后收回 anon 对 `visits` 的读取权限，并删掉旧的 anon SELECT 策略（包括 backlog 里 customers 那条过期策略）。顾客看到的画面和流程**完全不变**。

**改动文件**：`app/checkin/id-input/page.tsx`、`app/checkin/reminders/page.tsx`、2 个 SQL 文件

**部署顺序（3 步，不能乱）**
1. SQL Editor 跑 `migration-v2.18.3-step1-checkin-rpcs.sql`（只新增函数，旧前端照常运作）
2. push 前端 → Vercel 自动部署
3. SQL Editor 跑 `migration-v2.18.3-step2-revoke-anon-visits-read.sql`，VERIFY 5 行都要 `true`

**测试**：PGlite Postgres 17 复刻线上 anon 权限 + 冷却 / sanitize trigger，26/26 通过（RPC 结果正确、通配符查不到、收回后 anon 读不到表、check-in INSERT 和 30 分钟冷却照常）。

---

## 🔒 v2.18.2 (2026-09-30) — 安全紧急修复（只有 SQL）

**修了什么漏洞**

| 漏洞 | 严重度 | 说明 |
|------|------|------|
| 开放注册 + `USING (true)` | 🔴 严重 | Supabase Auth 开着「任何人可注册 + 自动确认」。customers / visits / warnings / notes 的 RLS 只检查「有没有登录」，所以任何人用网页里公开的 key 注册一个账号，就能**读、改、删全部顾客资料**（包括解 ban）。/admin 页面拦得住，但直接调 API 拦不住。 |
| `get_history_visits` anon 可调用 | 🔴 严重 | SECURITY DEFINER + 没有登录检查 + anon 有 EXECUTE → 未登录的人可以拉出全部到访记录（名字 / IC / 电话 / 生日）。`get_dashboard_stats`、`get_visit_trends` 同样问题（只泄露统计数字）。 |

**修复**：新增 `is_app_user()`（只有 `app_users` 名单里的人算数）。所有 `USING (true)` 策略改成要求 `is_app_user()`；3 个 RPC 加登录检查 + 收回 anon 权限。**staff/admin 权限完全不变，顾客 check-in 流程不受影响。**

**测试**：在 Postgres 17（PGlite）复刻线上权限设置，先复现漏洞，再跑 migration 两次，32/32 项通过（admin 全部照常、陌生账号 0 行、anon 调不了 RPC、anon 注册 + check-in 照常）。

**部署步骤**
1. Supabase Dashboard → Authentication → Sign In / Providers → **关掉 "Allow new users to sign up"** → Save（之后加 staff 用 Authentication → Users → Add user）
2. Supabase SQL Editor → 贴上 `migration-v2.18.2-security-lockdown.sql` 全部内容 → RUN
3. 看最下面的 VERIFY 结果，4 行 `ok` 都应该是 `true`
4. 用 admin 登录 → TODAY / HISTORY / CUSTOMERS / REPORTS 都要正常显示
5. 前端没有改动（只 push SQL 文件 + README 存档）

---

## ⚡ v2.18.1 (2026-09-30)

**服务器搬到新加坡 — 前台切页变快**

| 改动 | 详情 |
|------|------|
| 🌏 **Vercel region `iad1` → `sin1`** | 之前服务器默认在美国华盛顿，数据库在新加坡。每次打开 admin/staff 页面都要跨太平洋来回好几趟（约 0.5–1 秒）。现在服务器和数据库都在新加坡。 |
| 🧹 **repo 卫生** | 新增 `.gitignore`（防止 `node_modules`、`.env.local` 被误传上 GitHub）；`CLAUDE.md` 入库 |

**改动文件**：新增 `vercel.json`、`.gitignore`、`CLAUDE.md`；`package.json` 版本号

**部署**：push → Vercel 自动 deploy。**无 SQL 改动。**

---

## 🖨 v2.18.0

**投诉正式打印版** — Admin COMPLAINT → 🖨 PRINT，生成 A4 双语（EN/BM）内部事件报告。可选：附证据照片、附 case log（默认关）、隐藏举报人资料。所有用户内容都有转义。

**改动文件**：新增 `lib/complaint-print.ts`、`public/print-logo.png`；`components/ComplaintClient.tsx`；图标压缩。**无 SQL 改动。**

---

## 📜 v2.7.2 → v2.17.2 简要历史（2026-10 补写）

> 这段时间的版本当时没写进 README，下面是根据 git 记录和代码注释整理的摘要。**SQL** = 该版本带 migration，要先在 SQL Editor 跑。

| 版本 | 日期 | 内容 | SQL |
|------|------|------|-----|
| v2.7.2 | 05-09 | 顾客端改用 `lookup_customer_for_checkin` / `lookup_customer_by_phone` RPC（配合 v2.7 安全加固，anon 不能再直接读 customers） | — |
| v2.7.3 | 05-23 | `lib/safe-storage.ts`：sessionStorage 在隐私模式 / 被禁用时不再崩溃；`EMERGENCY-ROLLBACK.sql`（已于 v2.18.4 删除）+ 旅行运维手册 | — |
| v2.7.4 | 05-31 | TODAY 新 check-in 弹出通知 + 提示音 + 黄色闪烁 | — |
| v2.7.5 | 06-01 | CUSTOMERS 分页读取（修复超过 1,000 人后新顾客不显示的问题） | — |
| v2.8 | 06-21 | HISTORY 筛选器（时段 / 年龄 / 状态等），`get_history_visits` 增加字段 | ✅ `migration-v2.8-history-filters.sql` |
| v2.8.1 | 06-22 | Reminders 页加入 DO / DON'T 图示（`do.png`、`dont.png`） | — |
| v2.9 | 06-25 | **ATTENTION 名单**：admin 上传照片标记需注意的顾客，staff 只读 | ✅ `migration-v2.9-attention-list.sql` |
| v2.10 – v2.10.3 | 07-09 | **COMPLAINT 投诉系统**：公开 `/report` 三语表单 + admin/staff 投诉后台；多次 RLS 热修（公开 INSERT 必须 `TO PUBLIC`） | ✅ v2.10 / v2.10.1 / v2.10.2 |
| v2.11 – v2.11.1 | 07-10 | 投诉 case log（`incident_notes`）+ 参考编号；导航栏 COMPLAINT 红点（未处理数量） | ✅ `migration-v2.11-complaint-notes-refcode.sql` |
| v2.12 – v2.12.1 | 07-10 | `/report` 页视觉改版（`ReportUI`、暖色 glow 背景、logo） | — |
| v2.13.0 | 07-10 | 顾客端 check-in 视觉 / 动效（`CheckinFX`） | — |
| v2.14.0 – v2.14.1 | 07-10 | 投诉表单加入 PDRM 报警指引；投诉后台卡片重做 | — |
| v2.15.0 | 07-10 | **性能**：TODAY 时钟独立（不再每秒重绘整个列表）、CUSTOMERS 分批渲染 + 客户端筛选、HISTORY 缓存日期格式化、签名 URL 缓存 | — |
| v2.16.0 – v2.17.1 | 07-11 | `/report` 扁平化重设计 + 呼吸光晕 halo（v2.17.0 因删掉 glow 背景被退回） | — |
| v2.17.2 | 07-11 | 投诉证据照片上传 RLS 热修；浏览器无法显示的图片格式有 fallback | ✅ `migration-v2.17.2-incident-photos-rls-hotfix.sql` |

> ⚠️ 2026-08-16：一个其他项目的 commit（"v7.6"）被误推进这个 repo，随后 revert，并在 Vercel 做了 rollback。rollback 让 Vercel 暂停了「push 自动上线」，导致正式站一直停在 v2.17.2，直到 2026-09-30 在 v2.18.1 重新 promote 才恢复。**以后如果在 Vercel 做 rollback，修好后记得 Promote 最新部署。**

---

## 🆕 v2.7.0 (2026-05-08)

**Reminders 页 CTA 按钮重新设计**

| 改动 | 详情 |
|------|------|
| 🟢 **按钮颜色** | 黄色 `#FFD60A` → 绿色 `#16c75b`（与 Approved 页同色，视觉上预告"按下去 = 通过"） |
| 📝 **按钮文字** | "I ACKNOWLEDGE — CHECK IN" → **"CLICK TO CHECK IN"**（中：点击入场 / 马来文：KLIK UNTUK DAFTAR MASUK） |
| ✨ **呼吸动画** | 按钮每 2 秒轻微缩放（1.0 → 1.03）+ glow 同步胀大，"breathing" 效果，吸引注意力但不烦人 |
| ♿ **无障碍** | `prefers-reduced-motion: reduce` 时自动关动画；按下时 `:active` 暂停动画 |

**只改了 2 个文件**：
- `app/globals.css` — `.btn-checkin-cta` 样式 + `@keyframes btn-checkin-breathe`
- `lib/i18n.ts` — `acknowledge` 翻译 key 三种语言全更新

**部署**: 只需 push → Vercel auto-deploy。无 SQL 改动。

---

## 🚨 v2.6.1 HOTFIX (2026-05-08)

**Bug**: v2.5.0 部署后，新顾客 walk in 在 Customers 列表显示 `0 visits`，即使 Today / History 页面正常显示这些 visits。

**根本原因**: `trg_maintain_customer_visit_stats` trigger 默认以 `SECURITY INVOKER` 运行，继承调用者权限。顾客 check-in 时以 `anon` 角色 INSERT 到 visits 表，trigger 接着尝试 UPDATE `customers.visit_count`，但 customers 表的 RLS 只给 anon 配了 INSERT + SELECT policy（没有 UPDATE）。**Postgres 不抛 error，静默把 UPDATE 影响的行数过滤为 0** — visits 累积成功但 visit_count 永远卡 0。

**修复**: trigger 函数改用 `SECURITY DEFINER` + `SET search_path = public`（防止 schema spoofing）。Migration 包含数据回填，把所有现存顾客的 visit_count 从 visits 表重新计算 — 已经被 bug 影响的顾客会立即获得正确的 count。

### 部署步骤

1. **Supabase SQL Editor** 跑 `migration-v2.6.1-visit-stats-rls-hotfix.sql`（idempotent，可重跑）
2. 推 GitHub → Vercel 自动部署 (前端没变化 — 只是版本号 bump)
3. 验证: 之前 `0 visits` 的顾客应立即显示正确次数

### 验证 SQL

```sql
-- 看看回填后的 top customers
select name, visit_count, last_visit_at
from customers
order by visit_count desc
limit 10;
```

---

## 🆕 v2.6.0 新功能 (2026-05-08)

| 项目 | 说明 |
|------|------|
| 🪪 **Admin 可修正 Nationality + IC/Passport** | EDIT CUSTOMER modal 不再锁定 IC。如果顾客注册时选错国籍（如马来西亚人选了 Foreigner），admin 现在可以一键修正。会自动重算 dob（马来西亚人 IC 解析），保留原本的 gender 设定。所有改动写入 audit_log，包含 before/after 值便于追踪。Staff 仍是只读权限不变。 |
| 🛡 **Malaysian IC 防伪验证** | id-input 页面现在会拒绝乱填的 IC：除了 12 位数字 + 有效出生日期 (YYMMDD) 之外，还会验证第 7-8 位的 BP code（出生地代码）。完整支持 JPN 官方所有州属代码（含 Sarawak 13/50–53、KL 14/54–57 等扩展范围）+ 国外出生代码（60–93、98、99）。**错误时只显示通用 "请输入有效的 IC" 信息，不告诉用户为什么 fail**，以防有心人故意 try-and-error 编出能通过验证的假 IC。 |
| 🎯 **Reminders 页 UI 精简 (Option C)** | 顾客最大反馈是「不知道 CHECK IN button 存在」。改动：(1) 删除 WELCOME BACK 大黄框 card（节省 ~110px），HELLO RON 改成紧凑文字栈 22px 大字仍醒目。(2) 删除 T&C 大黄色虚线卡片，移到 CTA **下面** 变成小 underlined link（顾客早已在注册时 agree 过，作 reference 即可）。(3) **Smart auto-scroll**：ScrollHint 自动测量 CTA 位置，scroll 到 CTA 在 viewport 65% 位置 — 不管屏幕多高，CHECK IN button 一进页面就直接看到。 |
| 📜 **ScrollHint 全顾客端 apply** | v2.5 在 reminders 页加的 "MORE BELOW" 滚动提示现在 apply 到所有有内容的顾客端页面（/checkin, /checkin/id-input, /checkin/register, /checkin/reminders）。组件智能检测页面是否真的溢出 viewport — 短页面（如错误页、approved/banned 全屏页）不会显示 hint 也不会 auto-scroll。支持 `data-scroll-target` 属性自定义 auto-scroll 目标位置；reminders 页的 CTA 加了这个标记，其他页保留 100px fallback 行为。 |

### v2.6.0 部署步骤

1. 推 GitHub → Vercel 自动部署
2. **不需要 SQL migration** — 这一版纯前端 + audit_log 字段都是已存在的 JSONB

### IC 验证规则细节

通过验证需满足全部 3 项：

1. **格式**：恰好 12 位数字
2. **出生日期**：第 1-6 位 YYMMDD 解析为合法过去日期（00-29 → 2000-2029，30-99 → 1930-1999；不允许未来日期）
3. **BP code（第 7-8 位）**：必须是 JPN 已发行的合法代码

**支持的州属代码**（86 个）：

| 州属 | BP 代码 |
|------|---------|
| Johor | 01, 21, 22, 23, 24 |
| Kedah | 02, 25, 26, 27 |
| Kelantan | 03, 28, 29 |
| Malacca | 04, 30 |
| Negeri Sembilan | 05, 31, 59 |
| Pahang | 06, 32, 33 |
| Penang | 07, 34, 35 |
| Perak | 08, 36, 37, 38, 39 |
| Perlis | 09, 40 |
| Selangor | 10, 41, 42, 43, 44 |
| Terengganu | 11, 45, 46 |
| Sabah | 12, 47, 48, 49 |
| Sarawak | 13, 50, 51, 52, 53 |
| Kuala Lumpur | 14, 54, 55, 56, 57 |
| Labuan | 15, 58 |
| Putrajaya | 16 |

**支持的国外出生代码**：60–68（东南亚）、71–72（2001 前出生于国外）、74–79（中印巴等）、82–93（其他地区）、98（无国籍）、99（难民/麦加/未指明）

**保留代码（拒绝）**：00、17–20、69–70、73、80–81、94–97 — JPN 标记为 N/A 的代码

> ⚠ 注意：故意没实作传闻中的 ISO 7064 Mod 11,2 checksum，因为 JPN 从未公开承认 IC 末 4 位有 checksum，硬套规则会误伤真实顾客。

---

## 🆕 v2.5.0 新功能 (2026-05-07)

| 项目 | 说明 |
|------|------|
| 📜 **Reminders 页 ScrollHint** | 顾客在 /checkin/reminders 页有时不会往下滑去看完整规则。现在会自动 scroll 100px 提示有更多内容，加上底部固定的渐变遮罩 + 跳动黄色 ▼ "MORE BELOW" 标签。一旦用户主动滚动 200px+ 或滚到底部 80px 内就自动消失 |
| 🔔 **Today dashboard 通知** | 新顾客 check-in 时 admin/staff 的 Today 页面会有右上角 toast 卡片（最多堆叠 4 张，6 秒自动消失）+ 黄色闪光高亮新行 + Web Audio API 生成的 "ding" 提示音（OK 升调 A5+E6，DENIED 降调 A4+E4）。0 KB asset，全部 prefers-reduced-motion 友好 |
| 🔍 **Customers 进阶筛选 + 排序** | 新增 4 行筛选：STATUS、TYPE（⭐MEMBER/WALK-IN/🇲🇾LOCAL/🌍FOREIGN）、ACTIVITY（🔥FREQUENT 10+/💤INACTIVE 30天+/✨NEW 一周内）、SORT 6 种（含 visits asc/desc, last_visit asc/desc）。新增 VISITS + LAST SEEN 列。Customer 表新增 visit_count 和 last_visit_at 字段，由 v2.5 trigger 自动维护 |

### v2.5.0 部署步骤

1. **Supabase SQL Editor** 跑 `migration-v2.5-visit-stats.sql` — 加 visit_count + last_visit_at 列、INSERT/UPDATE/DELETE trigger、回填现有数据、加索引（idempotent，可重跑）
2. 推 GitHub → Vercel 自动部署

---

## 🆕 v2.3 新功能 (2026-05-07)

| 项目 | 说明 |
|------|------|
| ♂♀ **性别自动辨识** | 根据马来西亚 IC 末位数字自动辨别（单数 = 男，双数 = 女）。数据库回填所有现有 Malaysian 顾客；新顾客插入时 trigger 自动填充。外国人默认为空，admin 可在 customer detail 页手动设置（蓝色 ♂ / 粉色 ♀ 切换按钮，跟 membership 一样的 UX） |
| 🎨 **性别徽章** | TodayList、CustomerList、HistoryClient、CustomerDetail、Import preview 都会显示 ♂ (sky-500) / ♀ (pink-500) 小图标 |
| 📥 **Excel 导入支持 gender** | 模板新增 `gender` 列。Malaysian 留空会自动从 IC 推断；foreigner 必须显式填写 |
| 📊 **History CSV 导出** | CSV 增加 Gender 列 |
| 🌟 **网站 favicon** | 用 X FITNESS logo 制作了完整图标套装：favicon.ico (16/32/48 多分辨率)、icon-32.png、icon-192.png (Android)、icon-512.png (PWA splash)、apple-icon.png (iOS 180×180)。同时加了 web manifest 让网站可"添加到主屏幕"作 PWA 使用 |

### v2.3 部署步骤

1. **Supabase SQL Editor** 跑 `migration-v2.3-gender.sql` — 加 gender 列、辅助函数、自动填充 trigger、回填现有 Malaysian 顾客的 gender、更新 views & RPC 包含 gender 字段
2. 推 GitHub → Vercel 自动部署

> v2.2.1 的 SQL 已被这次的 migration 覆盖更新（views 重新创建包含 gender），所以**只需**跑 v2.3 即可。如果 v2.2.1 没跑过，v2.3 也包含了相同的时区修复。

---

## 🆕 v2.2.1 修复 + 新功能 (2026-05-07)

| 项目 | 说明 |
|------|------|
| 🐛 **跨日数据 bug 修复** | 原 v1 schema 的 `todays_visits` view 用了 `date_trunc('day', now())`，`now()` 返回 UTC 而非 KL 时区，导致 KL 凌晨 0:00–7:59 时段还在显示昨天的数据。已用 KL 本地时区作切换点 |
| 🎬 **三语跑马灯标语** | `/checkin` 入口页改用垂直翻页 marquee：每 3 秒切换 EN → 中文 → BM。Archivo Black 38px 大字粗体（中文用 Inter 900 兜底，因 Archivo Black 不带 CJK） |
| 📐 **WELCOME 缩小** | 从 60px 缩小到 36px（mockup v3 选项 3），让标语成为视觉焦点 |
| 📄 **Reminders 页 T&C 入口** | 老顾客每次 check-in 都能看到「📄 VIEW TERMS & CONDITIONS」黄色虚线卡片，点击弹出可滚动 modal，三种语言都支持。不强制阅读，但永远可见 |

### v2.2.1 部署步骤

1. **Supabase SQL Editor** 跑 `migration-v2.2.1-hotfix-todays-visits-tz.sql`（修正时区 bug）
2. 推 GitHub → Vercel 自动部署

> 这一版只是修补 + 视觉优化，**不需要**重跑 v2.2 的 SQL。

---

## 🆕 v2.2 新功能 (2026-05-06)

| 功能 | 说明 |
|------|------|
| 🟢 **Approved 满屏绿色** | 改成 #16c75b 满屏绿，远处也能看见。BANNED 保持满屏红 |
| 👋 **Welcome / Welcome Back 标语** | 入口页 + 注册页 + 老顾客 reminders 页都加了 "Register once. Quick check-in next time. / 只需一次注册，下次快速 check-in" |
| 📊 **老顾客统计** | Reminders 页面显示 "Hello, [姓名]" + 上次入场时间 + 总入场次数 |
| 🚨 **Emergency 必填** | Emergency relationship + phone 现在是必填项（带红星*）。现有老顾客不受影响（admin 可后台补填） |
| ⭐ **Membership 标签** | 默认无标签。Admin 可在 customer detail 页一键标记/取消标记会员，TodayList / CustomerList / History 显示绿色 ⭐ MEMBER 徽章 |
| 📅 **History 页面（14 天）** | Admin 和 Staff 都能看。按日期分组（每天有总数 / 通过 / 拒绝），支持 7天 / 14天 / 30天 切换。**只 admin 能导出 CSV** |
| 📥 **Excel 批量导入** | Admin 端新增 IMPORT 页。下载模板 → 填写 → 上传 → 预览（NEW / EXISTS / INVALID 三色） → 确认导入。失败行可下载错误报告 CSV |

### v2.2 部署步骤

1. **Supabase SQL Editor** 跑 `migration-v2.2-features.sql`（加 membership 列、history view、todays_visits view 重建、history RPC）
2. 上传新代码到 GitHub
3. Vercel 自动部署

> v2.1 的两个 SQL（cooldown trigger + performance）必须先跑过。v2.2 是**增量**迁移。

---

## 🆕 v2.1 修复 (2026-05-06)

| Bug | 修复 |
|------|------|
| 🖼️ **Logo 周围有黑底** | 把 `public/logo.png` 从 JPEG 转成真正的 RGBA PNG 透明背景 |
| 🔁 **Banned/under-age 用户能反复刷** | **双层防护**：（1）前端 30 分钟冷却现在基于 **IC**（不是 customer_id），并且在所有判断前最先执行；（2）**数据库 PostgreSQL trigger 强制阻止 30 分钟内重复 INSERT**，即使前端被绕过也无效 |
| 📱 **BM "DIHARAMKAN" 字超出手机屏幕** | banned 和 under-age 页面的标题改用 `clamp(min, vw, max)` + `word-break`，确保在窄屏（~380px）也能完整显示 |
| 📞 **+other 没有国码输入栏** | 把电话国码下拉从 11 个扩展到 **173 个国家**（覆盖全世界），加了搜索功能。马来西亚、新加坡、印尼、泰国、中国、印度、菲律宾、越南、孟加拉、缅甸优先排前面，其他按字母顺序。`+1`（US/CA）和 `+7`（RU/KZ）共用号码用 ISO 区分 |
| ⚡ **Admin/Staff 端慢** | 5 项优化：(1) 字体改用 `@fontsource` 本地打包（删除 Google Fonts CDN `@import`，省去 200-500ms 阻塞）；(2) Reports 页面从 10 个并发 COUNT 查询改成 2 个 RPC 函数（约 10x 加速）；(3) 添加缺失的数据库索引；(4) TodayList realtime 加 debounce + 减少轮询频率；(5) CustomerList/TodayList 只 SELECT 需要的字段（payload 减少 ~60%） |

### v2.1 部署步骤（**重要 — 必须按顺序做完**）

**Step 1:** 在 Supabase SQL Editor 运行 **`migration-v2.1-cooldown-trigger.sql`**（安装数据库 trigger，强制 30 分钟冷却）

**Step 2:** 在 Supabase SQL Editor 运行 **`migration-v2.1-performance.sql`**（添加索引和聚合 RPC 函数 — admin 端速度大幅提升的关键）

**Step 3:** 把新代码（这个 zip）部署到 Netlify/Vercel/其他平台

> 两个 SQL 脚本都是**幂等的**，重复运行安全。

---

## 🆕 v2 主要改动

| 改动 | 说明 |
|------|------|
| 🎨 **新设计** | 纯黑黄配色（移除黑黄条纹），用真实 logo |
| 🇲🇾🌍 **国籍区分** | Malaysian (IC) / Foreigner (Passport) 分开流程 |
| 📞 **国码下拉** | 173 个国家全覆盖 + 搜索功能（v2.1） |
| 🔢 **强制数字栏位** | IC、电话、紧急联络人电话都强制只能输入数字 |
| 👶 **年龄自动判断** | 从 IC 解析生日，自动算年龄（考虑生日是否过了）：<br>• <12 岁 → 拒绝入场<br>• 12-15 岁 → 弹出监护人 IC + 电话栏位<br>• 16+ → 正常流程 |
| 📋 **关系下拉** | 紧急联络人改成关系选择（Friend/Partner/Father/Mother/Relative/Guardian/Sibling/Spouse/Other）|
| 🔒 **电话唯一** | 同一个电话号码只能注册一次（防钻空子）|
| 🚨 **Pre-ban 检查** | 注册前自动检查电话是否属于 banned 顾客，是的话直接 BANNED |
| ⚠ **可疑警告** | 紧急联络人电话出现在 banned 名单时，员工面板黄色警告 |
| ⏱️ **30 分钟冷却** | 同一个 IC 30 分钟内的所有尝试都被拒绝（v2.1 修复，覆盖 banned/age 用户）|
| 🖼️ **每次提醒** | RE-RACK + NO SLIPPERS 图片每次 check-in 都显示 |
| ⏱️ **精确到秒** | 时间格式 HH:MM:SS（Asia/Kuala_Lumpur）|
| 📊 **紧凑列表** | 员工面板一屏显示 12-20 行，列表式 |
| 🔧 **修复 Admin 登录** | 解决直接访问 /admin 跳回 /login 的 bug |
| 📜 **新版 T&C** | 10 条编号条款，完全内联展开 |

---

## 📦 部署步骤

### Step 1: 升级数据库（重要！）

如果你已经部署过 v1，**不要**运行 `supabase-schema.sql`（它会清空数据），而是运行 **`migration-v1-to-v2.sql`**。

**操作**：
1. 打开 Supabase Dashboard → SQL Editor
2. 复制 `migration-v1-to-v2.sql` 全部内容
3. 粘贴并 Run
4. 检查是否有 `Migration to v2 complete` 输出

> ⚠️ 如果脚本报告 "Duplicate phones found"，需要先到 Table Editor → customers 把重复电话清理掉再继续。

如果你是**全新部署**（没有 v1），则运行 `supabase-schema.sql`（会建表）。

---

### Step 2: 部署到 Netlify

```bash
# 进入项目目录
cd xfitness

# 安装依赖（仅本地测试需要）
npm install

# 提交代码到 GitHub
git add .
git commit -m "v2 release"
git push
```

Netlify 会自动重新部署。

**Netlify 设置确认**：
- Site Settings → Build & Deploy → Environment Variables：
  - `NEXT_PUBLIC_SUPABASE_URL` = `https://ugfwxftzhxnukcmbaztm.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = （从 Supabase → Settings → API → "Legacy anon, service_role API keys" 标签，复制 anon public key）
- Build Command: `npm run build`
- Publish directory: `.next`

---

### Step 3: 测试关键流程

**🇲🇾 测试 1：Malaysian 16+ 顾客（正常流程）**
1. 选 Malaysian
2. 输入有效的 12 位 IC（年龄 ≥16）
3. 注册 → 看到 RE-RACK + NO SLIPPERS → APPROVED

**🇲🇾 测试 2：Malaysian 12-15 岁（监护人）**
1. 选 Malaysian
2. 输入 12-15 岁的 IC（例如 `100501XXXXXX` 是 2010 年生）
3. 注册时应该弹出 "GUARDIAN REQUIRED" 黄色框
4. 必须填写 Guardian IC + Guardian Phone

**🇲🇾 测试 3：12 岁以下（拒绝）**
1. 选 Malaysian
2. 输入 <12 岁的 IC（例如 `150101XXXXXX`）
3. 应该立刻看到红色 "ENTRY DENIED" 屏幕

**🌍 测试 4：Foreigner**
1. 选 Foreigner
2. 输入护照号（例如 `A12345678`）
3. 注册时**没有**年龄检查（外国人不强制要求）
4. APPROVED

**🚨 测试 5：电话 unique**
1. 用电话 `0123456789` 注册顾客 A
2. 用同样电话注册顾客 B → 应该提示 "This phone is already registered"

**🚨 测试 6：Banned 顾客换 IC**
1. 在 Admin 面板把顾客 A 设为 banned（电话 `0123456789`）
2. 用一个**全新的 IC** 但是同一个电话 `0123456789` 注册
3. 应该直接显示 BANNED 屏幕

**🔧 测试 7：Admin 登录**
1. 直接访问 `https://xos-walkin.netlify.app/admin`
2. 应该跳到 `/login`
3. 用 `hian991229@gmail.com` 登录
4. 应该自动跳到 `/admin`（不是 `/staff`）

---

## 🗄️ 数据库表结构

| 表 | 说明 | v2 新栏位 |
|-----|------|----------|
| `customers` | 顾客主档 | `nationality`, `dob`, `emergency_relationship`, `emergency_phone`, `guardian_ic`, `guardian_phone` |
| `visits` | 访问记录 | status 多了 `denied_age` |
| `warnings` | 警告记录 | （无变化）|
| `customer_notes` | 员工备注 | （无变化）|
| `app_users` | 员工/管理员 | （无变化）|
| `audit_log` | 操作审计 | （无变化）|

**新 helper 函数**：
- `is_phone_banned(phone)` — 检查电话是否属于 banned 顾客
- `is_emergency_phone_suspicious(phone)` — 检查紧急联络人电话是否可疑

---

## 📞 国码列表

| 国家 | 代码 | 位数 |
|------|------|------|
| 🇲🇾 Malaysia | +60 | 9-11 |
| 🇸🇬 Singapore | +65 | 8 |
| 🇮🇩 Indonesia | +62 | 9-12 |
| 🇹🇭 Thailand | +66 | 9 |
| 🇨🇳 China | +86 | 11 |
| 🇮🇳 India | +91 | 10 |
| 🇵🇭 Philippines | +63 | 10 |
| 🇻🇳 Vietnam | +84 | 9-10 |
| 🇧🇩 Bangladesh | +880 | 10 |
| 🇲🇲 Myanmar | +95 | 8-10 |
| 🌍 Other | 自填 | 8-15 |

---

## 🔍 IC 年龄解析逻辑

马来西亚 IC 前 6 位 = `YYMMDD`：
- `YY` 00-29 → 视为 **2000-2029** 年
- `YY` 30-99 → 视为 **1930-1999** 年

**计算年龄时考虑生日是否已过**：
- 例如：今天是 2026-05-06，IC 是 `100815XXXXXX`（2010-08-15 生）
- 因为 8 月 15 日还没到，所以这人是 **15 岁**，不是 16 岁
- 系统会要求填写监护人资料

---

## 💡 容量分析（80 walk-in/天）

**Netlify Free Plan**：
- 100GB bandwidth/月 → 你只用 ~2GB（**只占 2%**）
- 300 build minutes/月 → 够改 100 次代码
- ✅ 绝对够用

**Supabase Free Plan**：
- 500MB DB → 你 80 人/天 × 365 天 ≈ **5MB/年**
- ✅ 至少 2-3 年免费够用

---

## 🚧 故障排查

### "Failed to fetch" / 网页空白
- 检查 Netlify env vars 是否正确（特别注意 `NEXT_PUBLIC_` 前缀，不要有拼写错误）
- 检查 anon key 是从 **"Legacy anon, service_role API keys"** 标签复制的，不是新版 publishable key

### Admin 登录后还是跳到 staff
- 检查 Supabase `app_users` 表里 admin 账号的 `role` 栏是不是 `admin`
- 跑这个 SQL 检查：
  ```sql
  select au.id, au.email, au.role from app_users au;
  ```

### "Duplicate phones found" 错误
- v1 时代电话没有 unique 约束，可能存在重复
- 跑 SQL 找出重复：
  ```sql
  select phone, count(*) from customers group by phone having count(*) > 1;
  ```
- 在 Table Editor 把重复的删掉/改掉再重新跑 migration

### Realtime 不工作（员工面板没有自动更新）
- 跑这个 SQL 启用：
  ```sql
  alter publication supabase_realtime add table customers;
  alter publication supabase_realtime add table visits;
  ```

---

## 📁 项目结构

```
xfitness/
├── app/
│   ├── checkin/              # 顾客 check-in 流程
│   │   ├── page.tsx          # 1. 选国籍
│   │   ├── id-input/         # 2. 输入 IC/Passport（含年龄判断）
│   │   ├── under-age/        # 12 岁以下拒绝
│   │   ├── register/         # 3. 注册（含监护人栏位）
│   │   ├── reminders/        # 4. RE-RACK + NO SLIPPERS
│   │   ├── approved/         # 5. 通过
│   │   └── banned/           # 5b. 拒绝
│   ├── login/                # 员工登录
│   ├── staff/                # 员工面板
│   └── admin/                # 管理员面板（含 reports & audit）
├── components/               # 共用组件
├── lib/                      # 工具函数 + 类型定义
├── public/                   # logo, rerack, no-slippers 图片
├── supabase-schema.sql       # 全新部署用
└── migration-v1-to-v2.sql    # v1 升级到 v2 用
```

---

## ⚙️ 本地开发

```bash
# 1. 复制 .env.example → .env.local 并填入 Supabase 凭据
cp .env.example .env.local

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev

# 4. 打开 http://localhost:3000
```
