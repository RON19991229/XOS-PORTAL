-- =====================================================================
-- X FITNESS 9.01 · v7.5
--   1. No ticket ceiling on manual adjustments (+ fixes a 10-hour bug)
--   2. Social follow 1 → 3 tickets each;  repost mission 1 → 6, instant
--   3. Redraw a specific prize when a winner is not eligible to claim
--   4. Winner's IG/FB handle shown on /#live
-- Every UPDATE/DELETE carries a WHERE clause (safeupdate rule).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TICKET VALUES
--    social_points  1 → 3   (5 platforms = 15 tickets)
--    repost_points  1 → 6   (tag 3 friends + story repost)
--    Retroactive: everyone who already claimed gets the new value.
-- ---------------------------------------------------------------------
update app_config set value = '3' where key = 'social_points';
update app_config set value = '6' where key = 'repost_points';


-- ---------------------------------------------------------------------
-- 2. NO TICKET CEILING
--
--    The old function refused any adjustment that pushed a member past
--    39 tickets, a number derived from "21 check-in + 12 renewal +
--    5 social + 1 repost". Both halves of that were wrong:
--      · renewal months are UNCAPPED — members who signed two separate
--        12-month memberships hold 18 or 26+ months, one ticket each
--      · check-in runs 8 days (25 Aug–1 Sep), not 7, so 24 not 21
--    A long-tenure member can legitimately hold 60+ tickets. The ceiling
--    would have silently blocked real corrections during 25–31 Aug.
--
--    Also fixes a separate bug: the freeze time was hardcoded to
--    09:59+08 instead of reading pool_locks_at (19:59). Adjustments
--    would have frozen ten hours early on draw day.
-- ---------------------------------------------------------------------
alter table public.ticket_adjustments drop constraint if exists adj_delta_range;
alter table public.ticket_adjustments add  constraint adj_delta_range
  check (delta between -60 and 60);

create or replace function public.xf_admin_adjust_tickets(
  p_secret text, p_participant_id bigint, p_delta integer, p_reason text)
returns jsonb
language plpgsql security definer
set search_path to 'public','extensions'
as $function$
declare v_earned int; v_adj int; v_new int; v_name text;
begin
  if not xf_admin_ok(p_secret) then
    return jsonb_build_object('ok',false,'error','auth');
  end if;

  -- reads pool_locks_at from config instead of a hardcoded time
  if xf_pool_locked() then
    return jsonb_build_object('ok',false,'error','pool_locked');
  end if;

  select full_name into v_name from participants where id = p_participant_id;
  if v_name is null then
    return jsonb_build_object('ok',false,'error','no_such_participant');
  end if;

  -- ±60 is a typo guard on a SINGLE correction, not a cap on how many
  -- tickets a member may hold. There is no total ceiling any more.
  if p_delta = 0 or p_delta < -60 or p_delta > 60 then
    return jsonb_build_object('ok',false,'error','delta_out_of_range');
  end if;

  if p_reason is null or length(btrim(p_reason)) < 4 then
    return jsonb_build_object('ok',false,'error','reason_required');
  end if;

  select coalesce(t_checkin,0)+coalesce(t_renewal,0)+coalesce(t_social,0)+coalesce(t_repost,0),
         coalesce(t_adjust,0)
    into v_earned, v_adj
  from xf_tickets where participant_id = p_participant_id;

  v_new := coalesce(v_earned,0) + coalesce(v_adj,0) + p_delta;

  if v_new < 0 then
    return jsonb_build_object('ok',false,'error','would_go_negative');
  end if;

  insert into ticket_adjustments (participant_id, delta, reason)
  values (p_participant_id, p_delta, btrim(p_reason));

  return jsonb_build_object('ok',true,'name',v_name,'delta',p_delta,'new_total',v_new);
end;
$function$;


-- ---------------------------------------------------------------------
-- 3. REPOST MISSION IS NOW INSTANT
--
--    The mission (tag 3 friends under the 9.01 post + repost to story)
--    is checked against the member's registered handle at prize claim,
--    so there is nothing to review up front. Credit immediately —
--    this also removes the daily review task from the Overview tab.
--
--    Staff can still reject a claim via xf_admin_review_repost if they
--    spot an obvious abuse before the pool locks.
-- ---------------------------------------------------------------------
create or replace function public.xf_claim_repost(p_ic text)
returns jsonb language plpgsql security definer
set search_path to 'public','extensions'
as $function$
declare v_id bigint;
begin
  select id into v_id from participants where ic_hash = xf_hash_ic(p_ic);
  if v_id is null then return jsonb_build_object('ok', false, 'error','not_found'); end if;
  if xf_pool_locked() then return jsonb_build_object('ok', false, 'error','locked'); end if;
  insert into story_reposts (participant_id, status, reviewed_at)
  values (v_id, 'approved', now())
  on conflict (participant_id) do nothing;
  return xf_me(p_ic);
end;
$function$;

-- clear the existing review queue
update story_reposts set status = 'approved', reviewed_at = now()
where status = 'pending';


-- ---------------------------------------------------------------------
-- 4. REDRAW A SPECIFIC PRIZE
--
--    The published rule is that a winner who cannot produce a physical
--    IC/passport — or who did not actually complete the repost mission —
--    forfeits and the prize is redrawn. Until now there was no way to
--    do that without wiping the whole draw.
--
--    Design: voided winners are ARCHIVED, never deleted. The archive is
--    also the exclusion list, so a forfeited winner cannot be drawn
--    again for the same or any other prize. Every void needs a written
--    reason. The slot keeps its original seq, so the live board simply
--    updates that one line.
-- ---------------------------------------------------------------------
create table if not exists public.draw_voids (
  id             bigserial primary key,
  tier           integer     not null references prizes(tier),
  seq            integer     not null,
  participant_id bigint      not null references participants(id),
  ticket_count   integer,
  drawn_at       timestamptz,
  voided_at      timestamptz not null default now(),
  reason         text        not null,
  constraint void_reason_len check (length(btrim(reason)) >= 4)
);
alter table public.draw_voids enable row level security;
revoke all on public.draw_voids from anon, authenticated;
create index if not exists draw_voids_pid_idx on public.draw_voids (participant_id);


-- 4a. the main draw must skip voided winners too
create or replace function public.xf_admin_draw_next(p_secret text)
returns jsonb language plpgsql security definer
set search_path to 'public','extensions'
as $function$
declare
  v_tier int; v_qty int; v_name text; v_sub text;
  v_drawn int; v_pick bigint; v_tickets int; v_complete boolean := false;
  v_members_only boolean;
begin
  if not xf_admin_ok(p_secret) then return jsonb_build_object('ok',false,'error','auth'); end if;
  perform pg_advisory_xact_lock(901001);   -- one press at a time

  select pz.tier, pz.qty, pz.name, pz.subtitle into v_tier, v_qty, v_name, v_sub
  from prizes pz
  where not exists (select 1 from draw_log dl where dl.tier = pz.tier)
  order by pz.draw_seq limit 1;

  if v_tier is null then return jsonb_build_object('ok',true,'done',true); end if;

  v_members_only := (v_tier = 1)
    and coalesce((select value from app_config where key='grand_members_only'),'false') = 'true';

  select count(*) into v_drawn from draw_results where tier = v_tier;

  select t.participant_id, t.total into v_pick, v_tickets
  from xf_tickets t
  join participants p on p.id = t.participant_id
  where t.total > 0
    and t.participant_id not in (select participant_id from draw_results)
    and t.participant_id not in (select participant_id from draw_voids)
    and (not v_members_only or p.is_member)
  order by power(random(), 1.0 / t.total) desc
  limit 1;

  if v_pick is null then
    insert into draw_log (tier, awarded) values (v_tier, v_drawn);
    return jsonb_build_object('ok',true,'tier',v_tier,'tier_name',v_name,'subtitle',v_sub,
      'qty',v_qty,'seq',v_drawn,'exhausted',true,'tier_complete',true,
      'members_only',v_members_only);
  end if;

  v_drawn := v_drawn + 1;
  insert into draw_results (tier, seq, participant_id, ticket_count)
  values (v_tier, v_drawn, v_pick, v_tickets);

  if v_drawn >= v_qty then
    insert into draw_log (tier, awarded) values (v_tier, v_drawn);
    v_complete := true;
  end if;

  return jsonb_build_object('ok',true,
    'tier',v_tier,'tier_name',v_name,'subtitle',v_sub,'qty',v_qty,
    'seq',v_drawn,'tier_complete',v_complete,'exhausted',false,
    'members_only',v_members_only,
    'winner', jsonb_build_object(
      'name',    (select full_name from participants where id=v_pick),
      'ic_last4',(select ic_last4  from participants where id=v_pick),
      'phone',   (select phone     from participants where id=v_pick),
      'platform',(select platform  from participants where id=v_pick),
      'handle',  (select handle    from participants where id=v_pick),
      'is_member',(select is_member from participants where id=v_pick),
      'tickets', v_tickets));
end; $function$;


-- 4b. void one winner and immediately draw a replacement for that slot
create or replace function public.xf_admin_redraw(
  p_secret text, p_participant_id bigint, p_reason text)
returns jsonb language plpgsql security definer
set search_path to 'public','extensions'
as $function$
declare
  v_tier int; v_seq int; v_qty int; v_name text; v_sub text;
  v_old_tickets int; v_old_drawn timestamptz; v_old_name text;
  v_was_closed boolean; v_pick bigint; v_tickets int;
  v_members_only boolean; v_count int;
begin
  if not xf_admin_ok(p_secret) then
    return jsonb_build_object('ok',false,'error','auth');
  end if;
  if p_reason is null or length(btrim(p_reason)) < 4 then
    return jsonb_build_object('ok',false,'error','reason_required');
  end if;
  perform pg_advisory_xact_lock(901001);

  select dr.tier, dr.seq, dr.ticket_count, dr.drawn_at, pt.full_name
    into v_tier, v_seq, v_old_tickets, v_old_drawn, v_old_name
  from draw_results dr
  join participants pt on pt.id = dr.participant_id
  where dr.participant_id = p_participant_id;

  if v_tier is null then
    return jsonb_build_object('ok',false,'error','not_a_winner');
  end if;

  select pz.qty, pz.name, pz.subtitle into v_qty, v_name, v_sub
  from prizes pz where pz.tier = v_tier;

  v_was_closed := exists (select 1 from draw_log where tier = v_tier);

  -- archive first, then free the slot
  insert into draw_voids (tier, seq, participant_id, ticket_count, drawn_at, reason)
  values (v_tier, v_seq, p_participant_id, v_old_tickets, v_old_drawn, btrim(p_reason));

  delete from draw_results where participant_id = p_participant_id;
  delete from draw_log     where tier = v_tier;

  v_members_only := (v_tier = 1)
    and coalesce((select value from app_config where key='grand_members_only'),'false') = 'true';

  select t.participant_id, t.total into v_pick, v_tickets
  from xf_tickets t
  join participants p on p.id = t.participant_id
  where t.total > 0
    and t.participant_id not in (select participant_id from draw_results)
    and t.participant_id not in (select participant_id from draw_voids)
    and (not v_members_only or p.is_member)
  order by power(random(), 1.0 / t.total) desc
  limit 1;

  if v_pick is null then
    -- nobody eligible left. Restore the tier's closed state so the show
    -- does not loop back to a slot that can never be filled.
    if v_was_closed then
      select count(*) into v_count from draw_results where tier = v_tier;
      insert into draw_log (tier, awarded) values (v_tier, v_count);
    end if;
    return jsonb_build_object('ok',true,'voided',v_old_name,'tier',v_tier,
      'tier_name',v_name,'seq',v_seq,'exhausted',true);
  end if;

  insert into draw_results (tier, seq, participant_id, ticket_count)
  values (v_tier, v_seq, v_pick, v_tickets);

  select count(*) into v_count from draw_results where tier = v_tier;
  if v_was_closed or v_count >= v_qty then
    insert into draw_log (tier, awarded) values (v_tier, v_count);
  end if;

  return jsonb_build_object('ok',true,
    'voided',v_old_name,'tier',v_tier,'tier_name',v_name,'subtitle',v_sub,
    'seq',v_seq,'exhausted',false,'members_only',v_members_only,
    'winner', jsonb_build_object(
      'name',    (select full_name from participants where id=v_pick),
      'ic_last4',(select ic_last4  from participants where id=v_pick),
      'phone',   (select phone     from participants where id=v_pick),
      'platform',(select platform  from participants where id=v_pick),
      'handle',  (select handle    from participants where id=v_pick),
      'is_member',(select is_member from participants where id=v_pick),
      'tickets', v_tickets));
end; $function$;


-- 4c. read the void history (shown in the admin Draw tab)
create or replace function public.xf_admin_voids(p_secret text)
returns jsonb language plpgsql security definer
set search_path to 'public','extensions'
as $function$
begin
  if not xf_admin_ok(p_secret) then return jsonb_build_object('ok',false,'error','auth'); end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', v.id, 'tier', v.tier, 'prize', pz.name, 'seq', v.seq,
      'name', pt.full_name, 'ic_last4', pt.ic_last4,
      'platform', pt.platform, 'handle', pt.handle,
      'tickets', v.ticket_count, 'reason', v.reason,
      'at', to_char(v.voided_at at time zone 'Asia/Kuala_Lumpur','DD Mon · HH24:MI')
    ) order by v.voided_at desc)
    from draw_voids v
    join prizes pz on pz.tier = v.tier
    join participants pt on pt.id = v.participant_id
  ), '[]'::jsonb));
end; $function$;


-- 4d. the real reset must clear the void archive too
create or replace function public.xf_admin_reset_draw(p_secret text, p_confirm text)
returns jsonb language plpgsql security definer
set search_path to 'public','extensions'
as $function$
begin
  if not xf_admin_ok(p_secret) then return jsonb_build_object('ok',false,'error','auth'); end if;
  if p_confirm is distinct from 'RESET' then
    return jsonb_build_object('ok',false,'error','confirm');
  end if;
  -- `where true` is mandatory: the authenticator role preloads safeupdate,
  -- which blocks any DELETE without a WHERE clause. SECURITY DEFINER does
  -- NOT bypass it, and it cannot be reproduced in the SQL Editor.
  delete from draw_voids   where true;
  delete from draw_results where true;
  delete from draw_log     where true;
  return jsonb_build_object('ok',true);
end; $function$;


-- ---------------------------------------------------------------------
-- 5. WINNER HANDLE ON THE LIVE BOARD
--    Instagram → @handle   ·   Facebook → profile name, no @
-- ---------------------------------------------------------------------
create or replace function public.xf_live_results()
returns jsonb language sql security definer
set search_path to 'public','extensions'
as $function$
  select jsonb_build_object(
    'stats', xf_public_stats(),
    'tiers', coalesce((
      select jsonb_agg(t order by (t->>'draw_seq')::int)
      from (
        select jsonb_build_object(
          'tier', pz.tier, 'name', pz.name, 'subtitle', pz.subtitle,
          'qty', pz.qty, 'draw_seq', pz.draw_seq,
          'drawn',  (select count(*) from draw_results d where d.tier = pz.tier),
          'closed', exists (select 1 from draw_log dl where dl.tier = pz.tier),
          'winners', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'seq', dr.seq,
                     'name', pt.full_name,
                     'ic_last4', pt.ic_last4,
                     'platform', pt.platform,
                     'handle', pt.handle,
                     'tickets', dr.ticket_count
                   ) order by dr.seq)
            from draw_results dr
            join participants pt on pt.id = dr.participant_id
            where dr.tier = pz.tier
          ), '[]'::jsonb)
        ) as t
        from prizes pz
      ) s
    ), '[]'::jsonb)
  );
$function$;


-- ---------------------------------------------------------------------
-- 6. GRANTS + SCHEMA RELOAD
-- ---------------------------------------------------------------------
grant execute on function public.xf_admin_redraw(text,bigint,text) to anon, authenticated;
grant execute on function public.xf_admin_voids(text)              to anon, authenticated;

notify pgrst, 'reload schema';
