-- =====================================================================
-- migration-v2.18.3-step2-revoke-anon-visits-read.sql
-- X FITNESS · XOS Portal · v2.18.3 — STEP 2 of 2 (run AFTER frontend)
--
-- Only run once the v2.18.3 frontend is live (id-input + reminders call
-- checkin_last_visit / checkin_visit_stats instead of reading visits).
--
-- WHAT
--   • Revoke anon's column SELECT on visits + drop "Public can read own ic
--     visits" (USING true) → anon can no longer list visitor ICs.
--   • Drop stale "Public can read customer for check-in" on customers
--     (anon has no SELECT grant since v2.7 — dead policy, but it would
--     silently re-open a full PII dump if anyone ever re-granted SELECT).
--   • Revoke anon's leftover column SELECT grants on the todays_visits /
--     visits_history views (security_invoker, so already unusable — hygiene).
--
-- NOT TOUCHED: anon INSERT on customers/visits (check-in still works).
-- Cooldown / daily-limit / visit-stats triggers are SECURITY DEFINER and
-- don't need anon's SELECT. sanitize_anon_visit_insert doesn't read tables.
--
-- Rollback (only if check-in breaks): grant select (ic, status, visited_at)
-- on public.visits to anon; + recreate the policy.
--
-- Idempotent — safe to re-run.
-- =====================================================================

begin;

revoke select on public.visits from anon;
revoke select on public.todays_visits from anon;
revoke select on public.visits_history from anon;

drop policy if exists "Public can read own ic visits" on public.visits;
drop policy if exists "Public can read customer for check-in" on public.customers;

commit;

-- ---------------------------------------------------------------------
-- VERIFY — every row should say ok = true
-- ---------------------------------------------------------------------
select 'anon has no column SELECT on visits' as check,
       not exists (select 1 from information_schema.column_privileges
                   where table_schema = 'public' and table_name = 'visits'
                     and grantee = 'anon' and privilege_type = 'SELECT') as ok
union all
select 'anon can still INSERT visits',
       has_table_privilege('anon', 'public.visits', 'INSERT')
union all
select 'anon can still INSERT customers',
       has_table_privilege('anon', 'public.customers', 'INSERT')
union all
select 'anon can run checkin_last_visit',
       has_function_privilege('anon', 'public.checkin_last_visit(text)', 'EXECUTE')
union all
select 'anon can run checkin_visit_stats',
       has_function_privilege('anon', 'public.checkin_visit_stats(text)', 'EXECUTE');
