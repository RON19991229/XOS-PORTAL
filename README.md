# X FITNESS · 9.01 Grand Lucky Draw

周年庆抽奖系统。前端是纯静态 HTML（无需 build），后端是 Supabase。

---

## 一、文件说明

| 文件 | 用途 |
|---|---|
| `index.html` | 顾客端。首页 / 注册 / 登录 / 我的票数 / 现场开奖直播 |
| `admin.html` | 后台控制台。数据总览 / CSV 导入 / Story Repost 审核 / 参与者管理 / **开奖控制** |
| `config.js` | Supabase 连线设定 + 五个社媒链接。**要改链接只改这一个档** |
| `assets/` | Logo、iPhone、Apple Watch 图片 |
| `vercel.json` | 快取与安全 header 设定 |
| `robots.txt` | 阻止 Google 收录 admin 页 |

---

## 二、部署到 Vercel

### 方法 A：GitHub（推荐，改一次自动更新一次）

1. 到 https://github.com/new 开一个新 repo，例如 `xfitness-lucky-draw`，设为 **Private**
2. 把这个资料夹里**全部档案**上传进去（可以直接拖拉到 GitHub 网页上的 "uploading an existing file"）
   - 记得连 `assets` 资料夹一起
3. 到 https://vercel.com → **Add New** → **Project** → 选刚才那个 repo
4. Framework Preset 选 **Other**，Build Command 留空，Output Directory 留空 → **Deploy**
5. 一分钟内会给你一个网址，例如 `https://xfitness-lucky-draw.vercel.app`

以后要改东西，直接在 GitHub 编辑档案，Vercel 会自动重新部署。

### 方法 B：直接拖拉（最快，但之后更新要重拖）

1. 把整个资料夹压缩成 zip
2. 到 https://vercel.com/new → 把 zip 拖进去 → Deploy

### 绑定自己的域名

Vercel 专案 → **Settings** → **Domains** → 输入例如 `draw.xfitness.my` → 照它给的指示到你的 DNS 加一笔 CNAME 记录。

---

## 三、两个网址

| 用途 | 网址 |
|---|---|
| 顾客用（放 IG bio、海报 QR code） | `https://你的网址/` |
| 开奖直播（可直接投影） | `https://你的网址/#live` |
| 你的后台 | `https://你的网址/admin` |

**后台密码：`XF901-Draw-Kx7mQ2`**

⚠️ 请**现在就改掉**这个密码。到 Supabase → SQL Editor 贴上这段并执行（把 `你的新密码` 换成你要的）：

```sql
update app_config
set value = encode(extensions.digest('你的新密码','sha256'),'hex')
where key = 'admin_secret_sha256';
```

密码只以 SHA-256 形式储存，资料库里看不到明文，所以**忘记了只能重设，不能查回**。

---

## 四、活动前要做的事

### 1. 汇入过去 12 个月的续费记录

准备一个 CSV，两栏：

```
ic,months
990101-01-1234,6
880202-02-5678,12
```

到后台 **Import** 页 → 右边「Import membership renewals」→ 拖档案进去 → 按 Import。

⚠️ 只有**已经注册抽奖**的人才会被配对，没注册的会被跳过并回报数量。所以这个动作建议在活动开始后**每几天重跑一次**，把新注册的人也补上。重跑不会重复加分，同一个人以最新数值为准。

### 2. 准备 9.01 海报贴文

发在 IG 和 FB，文案要写清楚：留言 tag 3 位朋友 **＋** 转发到 story = +1 票。

---

## 五、活动期间的日常操作（8月25–31日）

### 每晚做一次：汇入当天打卡

从门禁系统汇出当天的进场记录，整理成两栏 CSV：

```
ic,date
990101-01-1234,2026-08-25
880202-02-5678,2026-08-25
```

后台 **Import** 页 → 左边「Import daily check-ins」→ 拖档案 → Import。

- 同一人同一天重复的记录会自动忽略，不用先去重
- 每天算 **3 票**，最多算 7 天（上限 21 票）
- 这就是顾客端写的「每晚更新」

### 每天做一次：审核 Story Repost

后台 **Story Reposts** 页 → 预设显示 Pending。每一列都有对方的 handle 可以直接点开：

1. 点开他的 IG/FB
2. 确认他在海报贴文下 tag 了 3 位朋友
3. 确认他 story 转发了（或截图为凭）
4. 按 **Approve**（+1 票）或 **Reject**

### 随时可查：Participants 页

用姓名、电话、handle、或 IC 后四码搜寻。可以汇出 CSV。发现造假可以按 **Disqualify** 踢出奖池。

---

## 六、9月1日开奖当天流程

### 09:59 — 锁池

不用按任何按钮，时间到就停止汇入任何资料即可。这时把后台 **Overview** 页投出来给大家看参与人数和总票数，这是公平性的关键一步。

### 10:00 — 开奖

**准备两个画面：**

- **大萤幕（观众看）**：开 `https://你的网址/#live`
  这一页每 8 秒自动更新一次，你后台抽一档，观众这边就跟着出现一档。
- **你的笔电（你自己操作）**：开 `https://你的网址/admin` → **Live Draw** 页

**操作方式：**

后台会看到六颗按钮，由六奖排到头奖。只有当前那一颗是金色可按，后面的都锁住：

1. 按 **6th Prize** → 跳确认视窗 → 确认 → 名字滚动后逐个定格（10位）
2. 抽完自动解锁 **5th Prize** → 按下去 → 5位
3. 依序 4th（3位）→ 3rd（1位）→ 2nd（1位）
4. 最后 **Grand Prize** → 悬念拉长 2.6 秒 → 出头奖 + 金色彩带

每一档只能抽一次，抽完永久锁定，**没有重抽按钮**。你的后台看得到中奖者全名、电话、handle 和票数；观众那一页只显示遮罩后的名字（例如 `L** W** M***`）和 IC 后四码，保护隐私。

**抽完后**：按 **Export winners CSV** 下载完整名单，用来联络得奖者。

### ⚠️ 关于 Reset 按钮

后台有一颗红色 **Reset draw (rehearsal)**，会删掉所有中奖记录。这是给你**开奖前彩排**用的。正式开奖后千万不要按。

**强烈建议 8月底先彩排一次**：随便注册几个测试帐号 → 汇入假打卡 → 走一次完整六档流程 → 确认投影没问题 → 按 Reset 清干净。

---

## 七、领奖时的核对流程

得奖者来店时：

1. **看实体 IC / 护照** — 姓名和号码要跟系统里的完全一致，不符合就取消资格重抽
2. **看手机** — 打开他的 IG/FB/TikTok/小红书，确认还在 follow；Google Review 确认评论还在
3. 若他有拿 Story Repost 的票，确认那则 story 或 tag 记录还在

任何一项不符 → 后台 **Participants** 页按 **Disqualify** → 该奖项重抽。

---

## 八、常见状况

**顾客说票数没更新** — 打卡和 story repost 是每晚更新的，社媒 follow 才是即时的。顾客端已经写明，可以直接指给他看。

**顾客换手机、清了浏览器** — 用首页的 **Log in**，输入同一个 IC 就能看回票数。系统用 IC 认人，不用密码。

**顾客 IC 打错了** — 目前无法自助修改。到 Supabase → Table Editor → `participants` 表直接改 `full_name`。若是 IC 本身打错，因为存的是加密雜湊，最干净的做法是把那笔删掉让他重新注册（票数会重算，社媒的要重领）。

**有人重复注册** — 系统会挡，同一个 IC 只能注册一次，第二次会提示他去登入。

**开奖当天网路断了** — 后台抽奖是伺服器端完成的，结果已经写进资料库。网路恢复后重新整理页面，已抽的档位会显示 DRAWN ✓，接着抽下一档就好，不会重复也不会遗失。

---

## 九、要改设定的话

全部在 Supabase → SQL Editor。

```sql
-- 看目前所有设定
select * from app_config order by key;

-- 改打卡分数（例如改成每天 5 票）
update app_config set value = '5' where key = 'checkin_pts_per_day';

-- 改打卡天数上限
update app_config set value = '7' where key = 'checkin_max_days';

-- 活动结束后关闭注册
update app_config set value = 'false' where key = 'registration_open';
```

改完顾客端**立刻生效**，票数会自动重算，不用重新部署网站。

奖品要改就编辑 `prizes` 表（`tier` 是奖别，`draw_seq` 是开奖顺序，1 最先开）。**开奖前改，开奖后不要动。**

---

## 十、安全性说明

- `config.js` 里的金钥是 Supabase 的公开金钥，设计上就是要放在浏览器的，公开没关系
- 所有资料表都开了 Row Level Security，浏览器**不能**直接读写任何一张表
- 顾客端只能呼叫指定的几个函式，只能拿到自己的资料
- 后台函式每一个都会先验证密码雜湊才动作，密码错就直接回绝
- IC 号码以 SHA-256 雜湊储存，资料库里查不到原始号码，画面上只显示后四码

## v6 — what changed (Aug 2026)

**Customer page (`index.html`)**
- Prize showcase with real product photos: iPhone on a lit stage, Apple Watch second, the four gift cards in a 2×2 grid.
- Dashboard now shows a **check-in QR** on the golden ticket. Tap it to enlarge at the front desk. The QR payload is `XF901:` + the SHA-256 of the IC — never the IC itself.
- **7-day check-in streak** dots (25–31 Aug), driven by the member's real check-in dates.
- Ticket rules moved into a bottom-sheet ("How to earn tickets") so the page stays short.
- **"YOU WON" card**: the moment a member's name is drawn, their own dashboard shows the prize, with instructions to bring their physical IC to collect. Once staff mark it collected it flips to a "COLLECTED" pill.
- Live page rebuilt for **one press, one winner**: prize spotlight with progress dots, name-scramble suspense, flash + reveal, confetti, tier-complete banner, finale overlay. Polls every 3 seconds.
- **Full winner names are shown** on the live page (IC still masked to the last 4 digits).
- Trilingual EN / 中文 / BM throughout.

**Admin console (`admin.html`)**
- New **Scan** tab. Camera QR scanner with two modes:
  - `CHECK-IN · +3` — 25–31 Aug, instant credit, same person same day cannot double-count.
  - `VERIFY / CLAIM` — read-only lookup on prize day: identity, tickets, prize, and a **Mark collected** button.
  - No camera? Paste the code, or use the **Check-in** button on any row in Participants.
- **Live Draw** tab is now one button: `DRAW NEXT WINNER`. Each press draws a single winner for the current tier and locks it. Tiers open in order, 6th → Grand.
- Winner board shows full contact details and collection status; winners CSV now includes `claimed` / `claimed_at`.
- Rehearsal tab uses the identical engine against the sandbox tables.

**Database**
- `draw_results.claimed_at`, `xf_pool_locked()`, `xf_admin_verify_scan`, `xf_admin_mark_claimed`, `xf_admin_winners`.
- Registration, social claims and repost claims are now hard-blocked once the pool locks at 09:59 on 1 Sept.

### Product images (v6.1)

The six product cut-outs are **WebP with alpha**, generated from Ron's own transparent PNGs —
no palette quantisation, so the metallic sleeves and the matte-black card stay smooth.

| file | size | used by |
|---|---|---|
| `assets/prize-iphone.webp` | 740×950 · 61 KB | grand-prize stage, live spotlight, winner card |
| `assets/prize-watch.webp` | 620×735 · 51 KB | 2nd-prize stage, live spotlight, winner card |
| `assets/gc-12.webp` `gc-6.webp` `gc-3.webp` `gc-1.webp` | 760×~341 · ~25 KB each | gift-card grid, live spotlight, winner card |

Total ≈ 210 KB for all six. If a file is ever replaced, keep the same aspect ratio
(cards 2.23:1, iPhone 0.78:1, watch 0.84:1) — the layout is sized around it.
WebP with alpha needs iOS 14+ / any current Android browser.

## v6.1 (Aug 2026)

- **Registration**: document-type toggle — Malaysian IC (exactly 12 digits, dashes stripped as you type) or foreign passport (letters+numbers). Existing members are unaffected: the server always normalised ICs before hashing, so dash / no-dash logins both work.
- Name field accepts English letters and the symbols that appear on real MyKads (`/ @ ' - .` for A/L, A/P, aliases) — nothing else can be typed.
- Phone gains a **country-code selector** (63 codes, 🇲🇾 +60 default); leading trunk zeros are stripped automatically.
- Instagram handles get a fixed **@** prefix; Facebook asks for the profile name instead.
- **In-site back navigation**: every page push is a real history entry, so the phone's back-swipe steps back inside the site instead of closing it. Back buttons restyled as gold pills.
- Hero rebuilt: prominent 1ST ANNIVERSARY, the anniversary-tee slogan lockup (**This is just the ℬeginning**, extracted pixel-perfect from the shirt artwork as `assets/slogan.webp`), and "LET'S CELEBRATE TOGETHER." The slogan also appears in the live-draw finale.
- 2nd prize goes **silver**: silver-foil badge + "Apple Watch Series 11" title on the landing page, and a silver prize name on its live-draw slide.
- Live page spotlight is now a **swipeable carousel** of all six prizes (dots + hint). It locks and auto-follows the moment the draw is running, and unlocks again after the finale.
- iPhone / Watch hero images re-balanced so they sit visually centred (`assets/hero-iphone.webp`, `assets/hero-watch.webp` replace the prize-*.webp pair).

## v7 (Aug 2026)

**Customer page**
- Hero simplified: the tee slogan moved out of the hero (it was crowding 9.01).
- New homepage **outro** (Option A): gold hairline + the official "This is just the ℬeginning" lockup
  (`assets/slogan-x.webp` — white text, script B, yellow X FITNESS · EST. 2025) + "FOR OUR COMMUNITY ·
  MADE TO BE REMEMBERED". The same artwork now closes the live-draw finale.
- Fixed: 2nd-prize silver title on the live carousel rendered as a solid silver bar
  (a `background` shorthand was resetting `background-clip:text`). Now `background-image` only.

**Admin console — full redesign**
- Bottom tab bar on phones (left rail ≥900px): OVERVIEW · SCAN · DRAW · PEOPLE · DATA · REHEARSE.
- **Overview** is the daily cockpit: 4 live tiles, quick actions, a real **Today's activity** feed
  (new DB function `xf_admin_today` — read-only), and the **story-repost review** moved here so the
  nightly routine is one screen.
- **Scan**: mode cards with descriptions, camera frame with corner brackets, big result cards. Same engine.
- **Draw**: one mega button, winner board, and the wipe button now lives inside a collapsed **Danger zone**.
- **People**: search + tappable member cards — big ticket count, expand for breakdown chips and
  Check-in today / Adjust / Disqualify.
- **Data**: renewal CSV + check-in CSV (backup) imports, exports, and a **launch check** that turns
  green once the 9.01 poster links are filled in `config.js`.
- **Rehearse**: same sandbox, blue everything.
- All previous logic (imports, adjust with reasons, DQ, claim tracking, draw engines, safeupdate-safe
  resets) is transplanted unchanged — only the shell is new.

---

# v7.1 — 安全加固 + 效能修正（2026年8月6日）

针对「不要被人 hack 进来改数据」和「手机浏览卡顿」做的全面检查与修正。

## A. 前端已修（改档案，需重新部署）

| # | 问题 | 修正 |
|---|---|---|
| 1 | **admin People 分页可被注入代码** — 会员姓名被塞进 `onclick="ciNow(1,'名字')"`，`esc()` 把 `'` 变成 `&#39;`，HTML 解析时又变回 `'`，等于跳脱失效。配合下面 B-1 的后端漏洞，有人可以用特制姓名注册，你在后台一点「Disqualify」就会把 admin 密码送到外部网站 | 三颗按钮改用 `data-act` / `data-id` + 事件委派，姓名永远不进 HTML 或 JS 字串。顺带修好 **NUR'AIN、SO'OD** 这类带撇号的大马名字按钮失灵的问题 |
| 2 | admin 登入后永不过期 | 30 分钟无操作自动上锁 |
| 3 | 缺少 CSP 等安全 header | `vercel.json` 加上 CSP（`connect-src` 只允许连你的 Supabase，就算被注入也送不出资料）、`X-Frame-Options: DENY`、HSTS、Permissions-Policy |
| 4 | 手机卡顿 | 见下方 C |

## B. 后端待修（`migration_v7_1_hardening.sql`，请先在 Supabase SQL Editor 跑）

| # | 问题 | 修正 |
|---|---|---|
| 0 | **假 IC 可以随便乱填注册** | 移植 walk-in 系统的 `my-ic.ts` 三层检查（见下方 E） |
| 1 | **`xf_register` 完全不验证姓名字符**，只检查长度 ≥3。anon key 是公开的，任何人可直接 POST 到 REST endpoint 存任意字串 | 数据库端强制与表单相同的字符集 `A-Z 空格 / @ ' . -`，另加 table constraint 双重保险 |
| 2 | **admin 密码可无限次暴力破解** — `xf_admin_check` 秒回、无次数限制 | 密码错误延迟 0.7 秒；同一 IP 15 分钟内错 12 次即封锁 15 分钟。密码正确永不延迟、永不封锁，**不会在开奖当天把你自己锁在门外** |
| 3 | **11 个 v1 旧 function 仍挂在公开 API**（`admin_run_draw` / `admin_reset_draw` / `admin_overview` 等）。目前是死的（读的表已删、验证用的 config key 已不存在），但不该留着 | 全部 DROP |
| 4 | anon 对 `draw_log` / `rehearsal_*` / `ticket_adjustments` 有 INSERT/DELETE/TRUNCATE 权限，目前只靠 RLS 挡住 | REVOKE，让 RLS 不再是唯一一道墙 |
| 5 | 3 个 helper function 的 `search_path` 未锁定（Supabase linter 警告） | 全部锁定 |

## C. 效能：为什么会卡

首页同时在跑 **4 个旋转的 conic-gradient 光晕**（`.halo` 660px blur42 + 3 个 `.shalo` 430px blur30）、3 个 blur(80px) 光斑、16 颗金尘。在 DPR≈3 的 120Hz 手机上，每个光晕的 GPU 材质接近 2000×2000px，**「旋转 + 模糊的锥形渐变」是手机浏览器最贵的效果之一**。

修正：
- 模糊半径下调（80→56、42→30、30→22），视觉几乎无差别，填充率省很多
- 加 `will-change:transform`，让光晕只栅格化一次、之后纯 GPU 旋转
- `.bg` 加 `contain:strict`
- 切到其他分页时暂停所有背景动画
- **自动 LITE 模式**：载入后实测 2.5 秒的帧时间，跟不上就自动关掉光晕与金尘、停掉光斑动画，只保留金色渐层。判断结果会记住，慢的手机第二次进来直接是 LITE

### 自己测帧率

| 网址 | 作用 |
|---|---|
| `/#fps` | 右上角显示实时 fps、最差帧毫秒数、目前是 FULL 还是 LITE |
| `/#lite` | 强制 LITE |
| `/#full` | 强制完整效果（也用来取消已记住的 LITE） |

## D. 仍未决定 / 未做

- **假帐号灌票**：`xf_claim_social` 零验证即送 5 票，脚本可量产假帐号入池。之前提过的两个方案（① 至少实体 check-in 一次才入池 ② 另外公布一个公开由管理层挑选的「感谢奖」）都还没决定，也都还没做
- admin 密码建议换成 16 字以上随机字串（手机存起来即可）
- QR 码内容是 `XF901:` + SHA-256(IC)。12 位数字的 SHA-256 可以暴力反推，**别把它当成隐私保护**
- 直播当天备援：若有人狂打 `xf_live_results` 拖垮投影画面，后台 Draw 分页的得奖名单仍可正常使用

---

## E. 大马 IC 格式验证（移植自 walk-in 系统 `my-ic.ts` v2.18.0）

三层检查，**前端和后端各做一次**。后端那层才是真正有用的 —— anon key 本来就是公开的，只做表单验证等于没做，任何人可以直接 POST 到 `/rest/v1/rpc/xf_register` 绕过。

| 层 | 检查 | 挡掉什么 |
|---|---|---|
| 1 | 12 位纯数字（自动 strip 掉 `-` 和空格） | 长度错、夹杂字母 |
| 2 | 前 6 位 YYMMDD 是真实的过去日期，round-trip 检查 | 2月31、非闰年2月29、13月、00月/00日、未来日期 |
| 3 | 第 7-8 位 PB 码必须是 JPN 真的有发的 | **00、17-20、69、70、73、80、81、94-97 全是空号** — 100 个码里有 14 个从来没发过 |

世纪判断：YY 00-29 → 2000 年代，30-99 → 1900 年代（这个 pivot 用到大约 2030 年）。

**实测**：20 万组随机 12 位数字，**97.06% 被挡掉** — 跟 `my-ic.ts` 注释里写的 97% 完全吻合。18 个人工测试案例（闰年、Sarawak、新加坡出生、带 dash 输入等）全部正确。

### 它挡不住什么（要诚实面对）

JPN **从来没有公开过最后 4 位的 checksum 演算法**，所以离线不可能证明一个 IC 是真的存在。任何懂格式的人都能生成通过检查的号码 —— 例如 `900101-01-1234` 完全合法但可能不属于任何人。

所以这是**第一层，不是全部**：
- **第一层**（这个）：挡掉乱填和手误
- **第二层**（已有）：`ic_hash` UNIQUE，一个 IC 只能注册一次
- **第三层**（唯一真正的验证）：领奖时必须出示与注册号码相符的实体 MyKad，否则奖品作废重抽 —— 这条已经写在 T&C 里了

### 错误讯息故意含糊

日期错和 PB 码错**共用同一句「这个IC号码无效」**。绝对不要告诉用户是哪一条规则不过，否则想作弊的人马上知道下次该改哪一位数字。精确的失败原因只留给你自己看。

### 一个已知的取舍

后端判断「是不是大马 IC」是**从格式推断**，不是靠参数：**只要是 12 位纯数字，就一定要通过 IC 检查**。这样的好处是没办法用 `p_id_type='passport'` 之类的参数骗过去。代价是：如果有外国会员的护照号刚好是 12 位纯数字，会被误判成无效 IC。以 Pasir Gudang 的会员组成来说（新加坡、印尼、孟加拉、缅甸的护照都带字母），风险很低，但真的遇到就要人工处理。


---

# v7.2 / v7.3 — 奖品重组、会员、删除、时间更动（2026年8月8日）

## 重要：renewal CSV 是「覆盖」不是「累加」

```sql
on conflict (participant_id) do update set months = excluded.months
```

**每次导出都必须是「过去 12 个月的累计总数」，不是上次之后的新增。**

例：WONG AH MING 在 8/25 import 了 12。9/1 他又续了 3 个月 —— 那天的档案里他应该写 **15**，不是 3。写 3 的话他的票会从 12 掉到 3。

设计成覆盖是故意的：同一个档案 import 十次结果都一样，不会翻倍。

**防呆**：任何一行如果会让某人的月数**变少**，服务器会跳过那些行、把名字列出来给你看，不会动到资料。确认真的要降才勾「allow reductions」重跑一次。

## CSV 格式

`ic,months,member`（第三栏 optional）
- 两栏 → 出现在档案里 = 标记为会员
- 第三栏 `0` / `no` → 给票，但**不**算会员（已失效的会员用这个）
- 没出现在档案里的人完全不会被动到

## 时间表（全部改了）

| | 旧 | 新 |
|---|---|---|
| Check-in 窗口 | 8月25–31日（7天，上限21票） | **8月25日–9月1日（8天，上限24票）** |
| Check-in 截止 | — | **9月1日 19:30**（server 强制，扫不进去） |
| Pool lock | 9月1日 09:59 | **9月1日 19:59** |
| 开奖 | 9月1日 10:00 | **9月1日 20:00** |

**19:30–19:59 是你 import 当天 sign up / renewal 的窗口（29分钟）。** 19:59 之后两个 CSV import 都会被拒绝。不够的话告诉我，可以把 lock 往后挪。

## 奖品：7档 22份

| 档 | 奖品 | 数量 | 抽奖顺序 |
|---|---|---|---|
| 1 | iPhone 17 Pro Max **256GB** Cosmic Orange 🔒**限会员** | 1 | 第7（最后） |
| 2 | Apple Watch Series 11 46mm Silver | 1 | 第6 |
| 3 | **AirPods Pro 3** | 1 | 第5 |
| 4 | 12个月会员礼卡 | 1 | 第4 |
| 5 | 6个月会员礼卡 | 3 | 第3 |
| 6 | 3个月会员礼卡 | 5 | 第2 |
| 7 | 1个月会员礼卡 | 10 | 第1 |

直播 = **22 次按键**（原本21次）。

## 新增功能

- **删除参与者**：要重打 admin 密码。已中奖 / pool lock 后 / 理由少于4字 → 拒绝。删除存根写进 `deleted_participants`
- **Member 标记**：`is_member` + `member_source`(csv/manual) + 时间戳。People 分页有筛选和数量，Overview 有 tile。顾客端无入口
- **大奖限会员**：DB 层过滤，rehearsal 同规则。抽奖页显示会员池数字，池空会红字警告

## 这次修掉的两个 bug

1. **`xf_admin_adjust_tickets` 把 09:59 写死在代码里** — 开奖改晚上后，所有手动调整会从**早上**9:59 就被冻结，你整个白天都改不了票数
2. **票数上限写死 39** — 假设 7 天 check-in（21）+ 12 个月 renewal。现在 check-in 变 8 天（24），而且 renewal 可能超过 12（像 WONG AH MING 的 15），上限已改成按每个人实际情况动态计算
3. **扫码没有时间截止** — `checkin_end` 只是日期，没有这道锁的话柜台可以在 19:55 继续扫，离锁池只剩 4 分钟

---

## v7.4 — 版面修正（8月8日）

| 修正 | 说明 |
|---|---|
| **奖牌 pill 没有置中**（真 bug） | `.prod` 是 `<img>`（inline），`.ptag` 是 `inline-block` —— 两个都是 inline 级，短文字的 pill（"2ND"）会跟图片挤在**同一个 line box**，整组一起置中。大奖那颗因为文字长撑爆一行才被挤下去，看起来才是对的。已把 `.prod` 改成 `display:block; margin:0 auto` |
| **`.twoup` 的覆盖有一半没生效**（真 bug） | `.twoup .prod` (0,2,0) 输给 `.stage.second .prod` (0,3,0)，所以图片一直是 **50%** 不是我以为的 74%，标题是 **22px** 不是 15px。已改成 `.twoup .stage.second .prod`。**图片实测从 85px 变 156px** |
| 副标对齐 | 卡片改 flex column、`.spec` 用 `margin-top:auto` 顶到底、预留两行高度（`box-sizing:content-box`，否则 padding 会被算进 min-height 造成 7px 偏差）。实测两张卡副标 `top` 都是 767.3px |
| pill 被拉成整条 | flex 子元素预设 stretch，`.ptag` 加 `align-self:center` |
| 三奖用铜色 | 新增 `--copper-foil`，`.stage.third` 套用在标题和 pill 上（金→银→铜）。直播页 `.spName.copper` 同步。rehearsal 蓝色主题也一并覆写，否则彩排会漏出铜色 |
| AirPods 副标 | `LATEST GENERATION | NOISE CANCELLATION`（三语）。用 `\u00A0` 硬空格让断行发生在「|」而不是把词拆开 |
| 大奖容量 | 256GB → **512GB**（前端 + DB `prizes.subtitle`） |
| 图片去边 | `hero-watch.webp` 左边有 12% 透明空白（所以看起来比 AirPods 小）、`hero-iphone.webp` 有 4%。都已 trim，三张现在都填满画框 |

**这次的教训**：`.twoup` 那种「用祖先 class 加前缀来覆盖」的写法，只要原规则用了两个以上的 class 就会失效，而且是静默失效 —— 页面看起来「差不多」，不会报错。以后加 override 要先确认 specificity 赢得过。
