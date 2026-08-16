# 彩排流程 · X FITNESS 9.01

## 沙盒是什么

彩排跑在自己的表上：`rehearsal_results` / `rehearsal_log`。
真实抽奖跑在 `draw_results` / `draw_log`。两边完全不相通。

- 彩排**读**真实数据（真名字、真票数、真权重）
- 彩排**写**只写沙盒表
- `/#live` 永远看不到彩排结果
- Export winners CSV 永远不含彩排结果
- 抽奖算法**完全相同**，所以彩排是真正的 dry run

## 建议流程（8 月底，正式前一周）

1. 打开 admin → **Rehearsal** 分页
2. 从 6th Prize 按到 Grand Prize，一层一层跑完
3. 另一台机（或手机）开 `/#rehearsal`，确认观众画面同步
4. 检查：动画时间、名字遮罩、大奖 confetti、投影可读性
5. 按 **Reset rehearsal** 清空
6. 想跑几次跑几次

## 9 月 1 日当天

- 投影只开 `/#live`
- Admin 用 **Live Draw** 分页，不是 Rehearsal
- Rehearsal 分页在真实抽奖开始后会显示红字警告
- **正式抽完后永远不要碰 "Wipe real draw results"**

## 视觉区分

彩排模式整站配色由金转蓝，底部固定 REHEARSAL 字样，顶部横幅三语标示。
从会场后排也一眼分得出来，不可能误投。

---

## 已知陷阱：safeupdate

Supabase 的 `authenticator` role 预载了 `safeupdate` 扩展，
会挡掉所有**没有 WHERE 的 DELETE / UPDATE**。

这是 statement-level hook，`SECURITY DEFINER` **绕不过**。

所以以后任何要清空整张表的函数，一定要写：

```sql
delete from some_table where true;   -- ✅
delete from some_table;              -- ❌ 会回 400
```

在 Supabase SQL Editor 里测不会重现这个错误，
因为那边走的是 postgres 连线，没载入 safeupdate。
一定要从网页实际按一次才算测过。

## v6 rehearsal notes

The rehearsal now mirrors the **one press = one winner** flow, so a full dry run is
**21 presses**, not 6. Budget about 5 minutes.

1. Admin console → **Rehearsal** tab.
2. Open `/#rehearsal` on the projector / second screen. Everything turns blue and is
   labelled REHEARSAL — it can never be mistaken for the real draw.
3. Press `TEST DRAW NEXT WINNER` 21 times, at the pace you'd use on stage.
   Watch: does the audience reveal land a beat after your press? Is the name readable
   from the back of the room? Does the grand-prize reveal feel big enough?
4. **Reset rehearsal** when done. The real draw is untouched either way.

Also worth rehearsing: the **Scan** tab. Open your own member page, show its QR to the
console camera in `VERIFY / CLAIM` mode, and confirm the card renders. The camera needs
HTTPS (Vercel is fine) and a one-time camera permission — it works in a normal phone
browser, no app needed.
