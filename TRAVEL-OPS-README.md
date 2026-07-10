# X FITNESS v2.7.2 — 旅行期间运维手册

> 给你旅行时单手翻手机用的简明文档。出问题先看这里。

---

## ✅ 这个版本到底改了什么 / 不会动什么

### 改了 4 个文件
| 文件 | 改动 | 影响范围 |
|------|------|----------|
| `app/checkin/id-input/page.tsx` | customer 查询从直接 `.from('customers').select('*')` → `.rpc('lookup_customer_for_checkin')` | 顾客端 — 修复 bug |
| `app/checkin/register/page.tsx` | 3 处：phone 重复检查用 RPC、banned 详情用 RPC、INSERT 后用 RPC 重读 | 顾客端 — 修复 bug |
| `app/checkin/reminders/page.tsx` | visit-stats 查询 `customer_id` → `ic` | 顾客端 — 修复 bug |
| `package.json` | `2.6.1` → `2.7.2` | 仅版本号 |

### 完全没动
- ❌ 数据库 schema、所有 SQL migration、所有 trigger、所有 RPC 函数 — 一行 SQL 没动
- ❌ Admin 页面（admin/customers, admin/history, admin/reports, admin/import, admin/audit）
- ❌ Staff 页面（staff/customers, staff/history）
- ❌ 任何 component（CustomerList, TodayList, CustomerDetail, ImportClient...）
- ❌ Login 页、layout、CSS、字体、配色

**风险面积仅限于 `/checkin/*` 顾客端 3 个页面。Admin 和 Staff 完全不受影响。**

---

## ✅ 我做了哪些验证

1. **TypeScript 类型检查通过**（`npx tsc --noEmit`，0 errors）
2. **Production build 成功**（`npm run build`，所有路由编译通过）
3. **真实 PostgreSQL 16 端到端测试通过**（在本地建了一个 1:1 模拟你 production hardened DB 的环境）：

| 测试场景 | 结果 |
|----------|------|
| 老顾客 check-in → reminders → 入场 → visit_count 自动 +1 | ✅ |
| Banned 顾客 check-in → 显示 banned 页面 | ✅ |
| Under-age 顾客 check-in → 显示 under-age 页面 | ✅ |
| 新顾客注册 → INSERT → RPC 重读 → 进 reminders 页 | ✅ |
| 注册时撞已有 phone (active) → 显示重复电话错误 | ✅ |
| 注册时撞 banned phone → 进 banned 页面 | ✅ |
| 30 分钟冷却 trigger 仍然有效 | ✅ |
| 安全：anon 试图 dump customers → permission denied | ✅ |

---

## 🚀 部署步骤（你今天做）

1. 解压 `xfitness-walkin-v2_7_2.zip`
2. 把文件 push 到 GitHub repo
3. Vercel 会自动 deploy（约 1-2 分钟）
4. 拿一个测试 IC 用手机 scan QR code 走一遍：
   - 选语言 → 选国籍 → 输入 IC → 按 CONTINUE
   - 应该正常进入 reminders 或 register 页（不再有 "Something went wrong"）
5. **不需要跑任何 SQL migration** — 你 DB 已经是新方案了

---

## 🆘 如果旅行中出问题怎么办

### 方案 A（强烈推荐）— Vercel 一键回滚前端

这是**最快、最安全**的回退方式。完全不动 DB。

1. 用手机打开 Vercel dashboard https://vercel.com/dashboard
2. 找到你的 X FITNESS project
3. 点 **Deployments** tab
4. 找到上一个稳定的 deployment（v2.6.1 或 v2.7.0）
5. 点右边的 ⋯ → **Promote to Production**
6. **30 秒内**前端就回滚完成

> ⚠️ 注意：因为你的 DB 是加固版的，回滚前端到 v2.6.1/v2.7.1 后，**老 bug 会重新出现**（"Something went wrong"）。这只解决"v2.7.2 引入新 bug"的情况，不解决"想用旧前端"的情况。

### 方案 B — 紧急 DB 回滚（让旧前端能 work）

仅在方案 A 不够、且你 v2.7.2 真的 broken、必须用旧前端时使用。

1. 打开 Supabase SQL Editor: https://app.supabase.com/project/_/sql
2. 复制 `EMERGENCY-ROLLBACK.sql` 全部内容贴进去
3. 点 RUN
4. 然后用方案 A 把 Vercel 回滚到 v2.6.1

**⚠️ 警告**：这会**重新打开 PII 泄漏**（v2.7 加固关闭的那个）。anon key 持有者可以再次 dump 全部顾客资料。所以：
- 仅作临时止血
- 旅行回来第一时间重新部署 v2.7.2 / v2.7.3
- 一键操作，跑完即生效

---

## 📞 旅行中诊断 checklist

如果有员工/顾客投诉系统出问题，按这个顺序排查：

1. **打开顾客端 URL** （`xos-walkin.vercel.app/checkin`）
   - 看得到首页吗？
     - ❌ 看不到 → Vercel 服务挂了/网络问题，等 2 分钟刷新
     - ✅ 看得到 → 继续
2. **走一遍 check-in 流程**（用一个测试 IC）
   - 输入 IC 后看到 "Something went wrong"？
     - 这正是你之前的 bug — 说明 v2.7.2 部署还没生效，去 Vercel 看 Deployments
   - 看到别的英文 error？
     - 截图/让员工拍照发给你
3. **打开 Admin 后台** 看 Today 页面
   - 看不到任何数据 → admin 登入有问题
   - 看得到老数据但顾客的最新 visits 没出现 → 顾客端写入有问题
4. **如果以上都查不出**，方案 A 一键回滚 Vercel

---

## 📋 给员工的应急话术

如果系统真的暂时坏了，员工可以这样接待顾客：

> "不好意思系统暂时维护，请您留下手机号 + IC 号 + 紧急联络人电话，
> 我们用纸登记，等下系统恢复会补录。"

回头你可以用 Admin → Import Excel 把纸质登记的资料补进去。

---

## 🎯 信心评估

| 项目 | 评分 |
|------|------|
| TypeScript 编译 | ✅ 100% 干净 |
| Production build | ✅ 100% 成功 |
| 8 个端到端流程模拟测试 | ✅ 全过 |
| 改动范围 | ⚠️ 限于 3 个顾客端页面 |
| Admin/Staff 风险 | ✅ 0 — 没动这些路径 |
| DB 改动 | ✅ 0 — 没跑任何 SQL |
| 回滚方案 | ✅ Vercel 一键 + DB rollback SQL 备好 |

**总体评估**：这个 fix 是**对症的、最小侵入的**。它就是把前端代码对齐你 production DB 已有的状态，没有引入任何新的功能或新的逻辑。出意外的概率不高。即使真出意外，方案 A 30 秒回滚。

放心去旅行 — 这个系统能稳稳运行。
