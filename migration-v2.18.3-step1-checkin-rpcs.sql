-- =====================================================================
-- migration-v2.18.3-step1-checkin-rpcs.sql
-- X FITNESS · XOS Portal · v2.18.3 — STEP 1 of 2 (run BEFORE frontend)
--
-- WHY
--   anon has a column-level SELECT grant on visits(ic, status, visited_at)
--   plus policy "Public can read own ic visits" USING (true). Despite the
--   name, that lets anyone with the public key list EVERY visitor's IC and
--   visit time (select ic, visited_at from visits).
--
--   /checkin only ever needs two answers about ONE IC it already knows:
--     • id-input  → last visit time (client-side 30-min cooldown message)
--     • reminders → approved visit count + last approved visit
--   These RPCs answer exactly that and nothing else — an exact-IC lookup
--   can't enumerate, same model as lookup_customer_for_checkin.
--
-- This step only ADDS functions. Nothing is revoked yet, so it is safe to
-- run while the old frontend is live. Step 2 revokes the table read after
-- the v2.18.3 frontend is deployed.
--
-- Idempotent — safe to re-run.
-- =====================================================================

create or replace function public.checkin_last_visit(p_ic text)
returns table (visited_at timestamptz, status text)
language sql
stable
security definer
set search_path = public
as $$
  select v.visited_at, v.status
  from visits v
  where v.ic = p_ic
  order by v.visited_at desc
  limit 1;
$$;

create or replace function public.checkin_visit_stats(p_ic text)
returns table (total_visits integer, last_visit_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int, max(v.visited_at)
  from visits v
  where v.ic = p_ic
    and v.status = 'approved';
$$;

revoke execute on function public.checkin_last_visit(text)  from public;
revoke execute on function public.checkin_visit_stats(text) from public;
grant  execute on function public.checkin_last_visit(text)  to anon, authenticated;
grant  execute on function public.checkin_visit_stats(text) to anon, authenticated;
