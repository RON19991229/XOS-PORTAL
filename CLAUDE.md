# CLAUDE.md — XOS Portal (X FITNESS Walk-in Check-in)

Walk-in check-in + real-time entry-control system for **X FITNESS CENTRE** (Iskandar Puteri, Johor, Malaysia · SSM 202503023755).
Replaces the old Google Form. Core job: recognise returning walk-ins, and **stop banned customers from entering**.
~80 walk-ins/day, ~4,200 customers (Sept 2026). Owner/product lead: **Ron** (solo owner-operator, not a full-time dev).

---

## Stack

- **Next.js 14 App Router** (14.2.35) + **TypeScript** + **Tailwind CSS**
- **Supabase**: PostgreSQL 17 + Auth + Storage — project `ugfwxftzhxnukcmbaztm`, region ap-southeast-1 (Singapore), free tier
- **Vercel** hosting, auto-deploy from GitHub `RON19991229/XOS-PORTAL` (renamed from XOS-WALKIN) branch `main`
  - Vercel project is named `xos-walkin` (id `prj_XrHkP6nLpwgDq6L9UmBGaX94eW3B`), only domain `xos-portal.vercel.app`
  - **Printed QR codes point to `xos-portal.vercel.app`** — that domain must stay alive. (`xos-walkin.vercel.app` is no longer attached; Ron confirmed it's not needed.)
  - Functions pinned to **`sin1`** via `vercel.json` (same region as Supabase). Default `iad1` added ~0.5–1s per page navigation — don't remove.
  - No domain is hardcoded; all routes are relative. Keep it that way.
- Fonts self-hosted via `@fontsource`: Archivo Black (display), Inter (body), JetBrains Mono (labels/codes), Noto Sans SC (Chinese, `/report` pages)
- Fonts: `@fontsource/archivo` (800, `/report` headlines) is also used
- `xlsx` (SheetJS) for Excel import
- `netlify.toml` is legacy — deploy target is Vercel

Env vars (`.env.local`, never commit): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
For local builds without real creds, a placeholder `.env.local` with dummy values is fine.

## Commands

```bash
npm install
npm run dev              # local dev
npx tsc --noEmit         # MUST be 0 errors before any delivery
npm run build            # MUST pass before any delivery
```

---

## Architecture

Three frontends:

| Path | Who | Notes |
|---|---|---|
| `/checkin/*` | Customer (phone, via QR) | Mobile-first, **trilingual EN / 中文 / BM** via `lib/i18n.ts` |
| `/staff/*` | Front desk (Windows PC) | **Read-only** everywhere |
| `/admin/*` | Ron | Full control |
| `/report`, `/report/form` | Public (members) | Complaint / harassment report form (v2.10+), trilingual, warm-white theme |

**Customer flow:** language → nationality (Malaysian IC / Foreigner passport) → `/checkin/id-input` → 30-min cooldown check → branch to `register` / `reminders` / `banned` / `under-age` → `approved` (full-screen green `#16c75b`) or `banned` (full-screen red).

- Anon lookups go through RPCs (`lookup_customer_for_checkin`, `lookup_customer_by_phone`), **not** direct `select` on `customers`.
- Admin nav: TODAY · HISTORY · CUSTOMERS · ATTENTION · COMPLAINT · REPORTS · IMPORT · AUDIT · EXIT
- Staff nav: TODAY · HISTORY · CUSTOMERS · ATTENTION · COMPLAINT
- Dashboards (`/staff`, `/admin`) are **English-only hardcoded**; `lib/i18n.ts` (`Lang` = en/zh/ms) is used by `/checkin/*` and `/report/*`.
- **`lib/report-config.ts`** drives the whole `/report/form`: questions live in `reportFields`; answers are stored self-describing in `incident_reports.answers` JSONB (`{qid,label,type,value}`). Adding/removing a question = edit this file only, **no SQL, no dashboard change**. Option `value` is canonical English. Location labels deliberately stay English for `en` and `ms`.
- **`lib/complaint-print.ts`** builds the printable A4 bilingual (EN/BM) incident report (admin COMPLAINT → 🖨 PRINT). It is an *internal record, not a police report*; section 4 is "AS ALLEGED BY REPORTING PARTY"; case log is OFF by default; reporter can be redacted; all user content is escaped. Keep these legal safeguards.

**Auth:** Supabase Auth; roles in `app_users` table; `lib/auth.ts → requireAuth(['admin'|'staff'])`. "Confirm email" is OFF. Admin login uses a `window.location.href` hard redirect (intentional — fixed a bug).

**Key tables:** `customers` (`visit_count`, `last_visit_at`, `photo_path`), `visits`, `app_users`, `audit_log`, `warnings`, `customer_notes`, `incident_reports` (complaints), `incident_notes` (complaint case log). Views: `todays_visits`, `visits_history`.
**Storage buckets (both private, read via signed URLs, 6h TTL):** `attention-photos` (admin-only uploads, Attention List), `incident-photos` (public uploads from `/report/form`).
**Key triggers:** `visits_cooldown_check` → `enforce_visit_cooldown`, `customers_autofill_gender`, `trg_maintain_customer_visit_stats`, `incident_reports_rate_limit` → `enforce_complaint_rate_limit`.
**Key RPCs:** `get_dashboard_stats`, `get_history_visits`, `get_visit_trends`, `lookup_customer_for_checkin`, `lookup_customer_by_phone`.

### Migrations (run order — manual, in Supabase SQL Editor)

```
supabase-schema.sql
migration-v1-to-v2.sql
migration-v2.1-cooldown-trigger.sql
migration-v2.1-performance.sql
migration-v2.2-features.sql
migration-v2.2.1-hotfix-todays-visits-tz.sql
migration-v2.3-gender.sql
migration-v2.5-visit-stats.sql
migration-v2.6.1-visit-stats-rls-hotfix.sql
(v2.7 security hardening — was run directly in Supabase, no file in repo)
migration-v2.8-history-filters.sql
migration-v2.9-attention-list.sql              (attention list + attention-photos bucket)
migration-v2.10-complaint-reports.sql          (incident_reports + incident-photos bucket)
migration-v2.10.1-complaint-rls-hotfix.sql
migration-v2.10.2-complaint-insert-anyone.sql
migration-v2.11-complaint-notes-refcode.sql    (incident_notes + ref code)
migration-v2.17.2-incident-photos-rls-hotfix.sql
migration-v2.18.2-security-lockdown.sql         (is_app_user() RLS + lock dashboard RPCs)
migration-v2.18.3-step1-checkin-rpcs.sql        (checkin_last_visit / checkin_visit_stats — before frontend)
migration-v2.18.3-step2-revoke-anon-visits-read.sql (revoke anon SELECT on visits — after frontend)
migration-v2.20.0-popup-fields.sql              (todays_visits + photo_path, visit_count, banned_at, last_warning_*, visit_ic)
```
`EMERGENCY-ROLLBACK.sql` was **deleted in v2.18.4** (still in git history) — it re-granted anon SELECT on `customers`/`visits` and only served pre-v2.7.2 frontends. Never recreate anon SELECT grants on PII tables; anon reads go through exact-match RPCs (`lookup_customer_for_checkin`, `lookup_customer_by_phone`, `checkin_last_visit`, `checkin_visit_stats`).
Frontend rollback = Vercel → Deployments → Promote/Instant Rollback. **After an Instant Rollback, Vercel stops auto-assigning the production domain to new pushes until someone Promotes a deployment again** (this froze prod on v2.17.2 from Aug–Sept 2026).
`supabase-schema.sql` is the v1 base and is **not** the current live schema — the live DB = base + all migrations + v2.7 hardening. When unsure, inspect the live DB (Supabase MCP / SQL Editor) rather than trusting the file. New migrations: `migration-vX.Y.Z-<topic>.sql`, idempotent, re-runnable.

---

## Hard rules (learned the hard way — do not break)

### RLS / security
- Public-facing INSERT policies and storage upload policies must be **`TO PUBLIC`**, never `TO anon`. `TO anon` silently blocks authenticated sessions (staff/admin device testing the public form) — this broke complaints and incident-photos before.
- Sanitisation triggers must **NOT** be `SECURITY DEFINER` (they rely on `current_user = 'anon'`). Rate-limit triggers use `session_user`.
- `trg_maintain_customer_visit_stats` **must** be `SECURITY DEFINER` + `SET search_path = public`; otherwise anon has no UPDATE on `customers` and Postgres silently updates 0 rows.
- Supabase "Security Definer view" CRITICAL lint → rebuild view as `SECURITY INVOKER` + explicit `GRANT SELECT TO authenticated`.
- Postgres RLS failures are often **silent** (0 rows, no error). Always verify row counts, not just absence of errors.

### PostgREST / data
- Project has a hidden **1,000-row max** that overrides `.limit()`. Any query that could exceed 1,000 rows needs a paginated loop: `PAGE_SIZE = 1000`, stable `.order()` + `id` tie-breaker, `.range()`, safety cap.
- Always `.order()` paginated queries — otherwise newest rows get silently dropped.

### Deploy order
- **SQL migration first, frontend second. Always.** Skipping this causes silent failures (e.g. Age filter reading null DOB → everything "unknown").
- Supabase "destructive operation" popup on `DROP VIEW` is a false alarm (views hold no data).

### i18n
- `t()` only type-checks keys against `translations.en`. Missing `zh` / `ms` keys fail **silently** at runtime (empty string). **Always update all three language blocks together.**

### Malaysian IC validation
- 3 layers: 12-digit format → valid past DOB (YYMMDD, round-trip check) → valid JPN place-of-birth (BP) code in digits 7–8.
- `bad_dob` and `bad_pb` errors intentionally show the **same** public message — do not make them distinguishable (anti reverse-engineering).
- There is no public checksum for the trailing digits; format validation can't prove an IC is real. Uniqueness is enforced by a DB UNIQUE constraint on normalised IC.

---

## Design rules

- **Mockup first.** Any UI/visual change → standalone interactive HTML mockup for Ron's approval **before** touching production code. Once Ron says "可以 / OK", implement with no further back-and-forth.
- Brand colours: accent `#FFD60A`, ink `#0a0a0a`, ink-soft `#161616`, ink-line `#2a2a2a`, bone `#f5f5f5`, danger `#ff3b30`, success-green `#16c75b`. `/report` pages use gold `#C99700` (not yellow, not coral).
- Status must be unmistakable: green = allowed in, red = banned. Check-in ≤ 3 steps.
- `/report` pages: the warm radial glow background (coral→yellow + shield halo) and shield halo breathing animation are **hard requirements** — v2.17.0 was rejected for removing them.
- Preserve font weights exactly as designed. No unrequested bold/thin changes.
- Remove trailing punctuation on centred accent lines.
- Respect `prefers-reduced-motion` on all animations.

---

## Ways of working

- **Scoped, surgical changes.** Don't touch unrelated areas unless asked. Specifically leave alone unless in scope: landing-page language cards, `.btn-primary` styles, staff/admin paths when working on `/checkin`.
- **Zero-regression bar** before declaring done: `npx tsc --noEmit` (0 errors) + `npm run build` passes. Test SQL against a real PostgreSQL 17 before handing it over when possible.
- **Versioning:** strict semver, bump `version` in `package.json` every release (currently **2.20.1**). Also update the header comment version in any file you substantially change (files carry `// vX.Y` headers). Changelog entries go at the top of `README.md` in Chinese (what changed, files touched, deploy steps, whether SQL is needed).
- **Delivery (Claude Code):** work directly in the repo → commit → push to `main` → Vercel auto-deploys. If a release includes SQL, **tell Ron to run the migration in Supabase SQL Editor first and wait for his confirmation before pushing the frontend.** Never push frontend that depends on unrun SQL.
- Never do bulk web uploads to GitHub (flattens folders). Git / GitHub Desktop only.
- Staff access is read-only by design — never add write actions to `/staff/*`.
- Every admin write that changes customer data should write to `audit_log` (before/after values).

## Communication with Ron

- Ron writes casually in mixed Chinese + English ("老哥", "Buddy"). Reply in the same mix; Chinese for explanations is fine.
- Short replies like "可以", "对的", "OK" mean **approved — proceed fully**. Infer intent; don't re-ask.
- He wants autonomous execution and production-ready output, not drafts. Minimal check-ins.
- When something is off he says so directly — change direction, don't iterate on a rejected idea.
- Don't suggest he take a break / sleep on it — keep iterating until done.
- Explain deploy steps plainly (he's not a full-time engineer): numbered steps, which file to run where, how to verify.

---

## Known backlog

- Next.js is on 14.2.35 (last 14.x patch). Some advisories are only fixed in 15/16 — major upgrade deferred. `xlsx` 0.18.5 has unfixed advisories on npm (admin-only import).
- WhatsApp number for `/report` lives in `lib/report-config.ts` (`WHATSAPP_URL`).
- ~~Drop stale anon SELECT policy on `customers`~~ — done in v2.18.3 step 2.
- History page: apply v2.7.5 pagination pattern if a single day ever exceeds 1,000 visits.
- Google Wallet pass (Phase 1, JWT via Next.js API route) → Apple Wallet (Phase 2, `passkit-generator`). Wallet flips scan direction → needs a scanner mode in staff/admin. Avoid 3rd-party wallet SaaS (silos data away from Supabase).
- `my-ic.ts` standalone IC validator (from the lucky-draw project) could replace the inline IC logic.
