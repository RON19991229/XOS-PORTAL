# X FITNESS Walk-in 系统 v2.2

> 替代 Google Form 的健身房 walk-in 入场系统  
> Next.js 14 + Supabase + Tailwind + Vercel/Netlify

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
