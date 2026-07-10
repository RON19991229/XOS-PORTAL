# X FITNESS Walk-in 系统 v2.7

> 替代 Google Form 的健身房 walk-in 入场系统  
> Next.js 14 + Supabase + Tailwind + Vercel

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
