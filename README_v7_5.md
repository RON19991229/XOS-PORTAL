# X FITNESS 9.01 · v7.5

## What changed

### 1. No ticket ceiling
Renewal months are uncapped. The old `xf_admin_adjust_tickets` refused any
adjustment pushing a member past **39 tickets** — a number derived from
"21 check-in + 12 renewal + 5 social + 1 repost". Both halves were wrong:

* renewal is uncapped (members with two 12-month signings hold 18–26+ months)
* check-in runs **8 days** (25 Aug – 1 Sept), not 7 → 24 tickets, not 21

A long-tenure member can now legitimately hold **60+ tickets**. There is no
total ceiling any more. A single correction is still capped at ±60 as a typo
guard, and the reason field is still mandatory.

**Also fixed a separate bug:** the adjustment freeze was hardcoded to
`09:59+08` instead of reading `pool_locks_at` (19:59). Adjustments would have
frozen **ten hours early** on draw day. It now calls `xf_pool_locked()`.

### 2. Social & repost ticket values raised
| Source | Was | Now |
|---|---|---|
| Social follow (×5 platforms) | +1 each = 5 | **+3 each = 15** |
| Repost mission | +1, overnight | **+6, instant** |

Applied retroactively — everyone who already claimed gets the new value.

The repost mission (tag 3 friends + story repost, Instagram or Facebook only)
now credits **instantly**. Verification moved to prize claim, where the handle
is checked against the registered account. This removes the daily review task.

New honest maximum for a long-tenure member:
`24 check-in + 26 renewal + 15 social + 6 repost = 71`

### 3. Redraw a specific prize
New admin button on every un-collected winner row: **Redraw**.

* Requires a written reason (min 4 chars)
* Voided winner is **archived, never deleted**, in the new `draw_voids` table
* The archive doubles as an exclusion list — a forfeited winner can never be
  drawn again, for that prize or any other
* The replacement fills the **same slot number**, so the live board updates
  one line rather than reshuffling
* If the tier was already closed, it is reopened and re-closed automatically
* A forfeited-and-redrawn log appears under the winner board

`xf_admin_reset_draw` now clears `draw_voids` too.

### 4. Winner social handle on `/#live`
The reveal card and the winner board now show the winner's social identity
under their name:

* Instagram → `@handle`
* Facebook → profile name, uppercase, no `@`

Full name and IC last-4 unchanged.

### 5. Ticket values now live in one place
`config.js` gained a `PTS` block (`checkin:3, social:3, repost:6`). The task
rows and the check-in dots read from it instead of carrying frozen numbers.

The social rows were showing a hardcoded **+1** in their done state — that is
fixed, and each row now carries a gold **+3** pill matching the +6 mission badge.

> If you ever change a value, change it in **three** places or the page will
> promise a number the server will not pay:
> 1. `app_config` in Supabase (authoritative)
> 2. `XF.PTS` in `config.js`
> 3. the i18n strings `quickWs`, `bonusS`, `r1b`, `r3b`, `r4b`, `tPlus`
>    in all three languages in `index.html`

### 6. Check-in strip was missing draw day
`CAMPAIGN_DAYS` listed 7 dates but `checkin_end` is 1 Sept and
`checkin_max_days` is 8. Someone training on draw day earned 3 tickets
server-side with no dot for it, and the counter could never reach the
`/ 8 days` printed beside it. Now 8 dates.

## Deploy

1. Run `migration_v7_5.sql` — **already applied to production**
2. Commit and push `index.html`, `admin.html`
3. Hard-refresh `/admin` and `/`

## Verify after deploy

* [ ] A member with social + repost shows **21 tickets** (15 + 6)
* [ ] Rules modal shows `+3 each` and `+6`, no "next morning" copy
* [ ] Adjust a member by +30 → accepted (would have failed before)
* [ ] Rehearse tab → draw a winner → **Redraw** → replacement appears,
      voided name shown struck through in the log below
* [ ] `/#rehearsal` on a second screen shows the handle under the name
* [ ] Reset the rehearsal afterwards

> The `safeupdate` extension blocks `DELETE` without `WHERE`. Every delete in
> this migration carries `where true`. This cannot be tested in the SQL Editor
> — it must be tested by clicking in the deployed app.
