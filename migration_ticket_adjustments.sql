-- ============================================================
-- X FITNESS 9.01 · Ticket adjustment (manual correction)
-- ============================================================
-- Purpose: let staff fix real data errors — missed scans, double
-- imports, renewal records that landed late — without touching SQL.
--
-- Every adjustment is logged with a reason, shown to the member on
-- their own tickets page, and frozen once the pool locks.
-- ============================================================

-- 1. Append-only adjustment log -------------------------------
create table if not exists ticket_adjustments (
  id             bigserial primary key,
  participant_id bigint      not null references participants(id) on delete cascade,
  delta          integer     not null,
  reason         text        not null,
  created_at     timestamptz not null default now(),
  constraint adj_delta_nonzero check (delta <> 0),
  constraint adj_delta_range   check (delta between -21 and 21),
  constraint adj_reason_len    check (length(btrim(reason)) >= 4)
);

create index if not exists ticket_adjustments_pid_idx
  on ticket_adjustments (participant_id);

alter table ticket_adjustments enable row level security;

-- 2. Fold adjustments into the ticket view --------------------
create or replace view xf_tickets as
with cfg as (
  select (select value::date    from app_config where key='checkin_start')       as c_start,
         (select value::date    from app_config where key='checkin_end')         as c_end,
         (select value::integer from app_config where key='checkin_pts_per_day') as c_pts,
         (select value::integer from app_config where key='checkin_max_days')    as c_maxd,
         (select value::integer from app_config where key='social_points')       as s_pts,
         (select value::integer from app_config where key='repost_points')       as r_pts
), ci as (
  select c.participant_id,
         least(count(*), ((select cfg.c_maxd from cfg))::bigint) * ((select cfg.c_pts from cfg)) as pts
  from check_ins c
  where c.visit_date >= ((select cfg.c_start from cfg))
    and c.visit_date <= ((select cfg.c_end from cfg))
  group by c.participant_id
), rn as (
  select renewals.participant_id, renewals.months as pts from renewals
), sc as (
  select social_claims.participant_id, count(*) * ((select cfg.s_pts from cfg)) as pts
  from social_claims group by social_claims.participant_id
), rp as (
  select story_reposts.participant_id, (select cfg.r_pts from cfg) as pts
  from story_reposts where story_reposts.status = 'approved'
), aj as (
  select participant_id, sum(delta)::integer as pts
  from ticket_adjustments group by participant_id
)
select p.id as participant_id,
       coalesce(ci.pts, 0::bigint) as t_checkin,
       coalesce(rn.pts, 0)         as t_renewal,
       coalesce(sc.pts, 0::bigint) as t_social,
       coalesce(rp.pts, 0)         as t_repost,
       greatest(0,
         coalesce(ci.pts, 0::bigint) + coalesce(rn.pts, 0)
       + coalesce(sc.pts, 0::bigint) + coalesce(rp.pts, 0)
       + coalesce(aj.pts, 0))      as total,
       -- appended last: CREATE OR REPLACE VIEW cannot reorder existing columns
       coalesce(aj.pts, 0)         as t_adjust
from participants p
  left join ci on ci.participant_id = p.id
  left join rn on rn.participant_id = p.id
  left join sc on sc.participant_id = p.id
  left join rp on rp.participant_id = p.id
  left join aj on aj.participant_id = p.id
where p.disqualified = false;

-- 3. Apply an adjustment --------------------------------------
create or replace function public.xf_admin_adjust_tickets(
  p_secret text, p_participant_id bigint, p_delta integer, p_reason text)
returns jsonb
language plpgsql security definer
set search_path to 'public','extensions'
as $function$
declare
  v_earned int; v_adj int; v_new int; v_name text;
  -- Honest ceiling: 21 check-in + 12 renewal + 5 social + 1 repost
  c_max_total constant int := 39;
begin
  if not xf_admin_ok(p_secret) then
    return jsonb_build_object('ok',false,'error','auth');
  end if;

  -- the pool is frozen once the draw locks
  if now() >= (timestamptz '2026-09-01 09:59:00+08') then
    return jsonb_build_object('ok',false,'error','pool_locked');
  end if;

  select full_name into v_name from participants where id = p_participant_id;
  if v_name is null then
    return jsonb_build_object('ok',false,'error','no_such_participant');
  end if;

  if p_delta = 0 or p_delta < -21 or p_delta > 21 then
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

  -- A correction fixes a real error, so it never needs to push anyone
  -- past what an honest maximum participant could earn.
  if v_new > c_max_total then
    return jsonb_build_object('ok',false,'error','over_ceiling',
      'ceiling', c_max_total, 'would_be', v_new);
  end if;

  insert into ticket_adjustments (participant_id, delta, reason)
  values (p_participant_id, p_delta, btrim(p_reason));

  return jsonb_build_object('ok',true,'name',v_name,'delta',p_delta,'new_total',v_new);
end;
$function$;

-- 4. Read the adjustment history ------------------------------
create or replace function public.xf_admin_adjustments(
  p_secret text, p_participant_id bigint default null)
returns jsonb
language plpgsql security definer
set search_path to 'public','extensions'
as $function$
begin
  if not xf_admin_ok(p_secret) then
    return jsonb_build_object('ok',false,'error','auth');
  end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'participant_id', a.participant_id,
      'name', p.full_name, 'ic_last4', p.ic_last4,
      'delta', a.delta, 'reason', a.reason,
      'at', to_char(a.created_at at time zone 'Asia/Kuala_Lumpur','YYYY-MM-DD HH24:MI')
    ) order by a.created_at desc)
    from ticket_adjustments a
    join participants p on p.id = a.participant_id
    where p_participant_id is null or a.participant_id = p_participant_id
  ), '[]'::jsonb));
end;
$function$;

-- 5. Show the member their own adjustments --------------------
create or replace function public.xf_me(p_ic text)
returns jsonb
language plpgsql security definer
set search_path to 'public','extensions'
as $function$
declare v_p participants%rowtype; v_t xf_tickets%rowtype; v_days int; v_res jsonb;
begin
  select * into v_p from participants where ic_hash = xf_hash_ic(p_ic);
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  select * into v_t from xf_tickets where participant_id = v_p.id;

  select count(*) into v_days from check_ins
  where participant_id = v_p.id
    and visit_date between (select value::date from app_config where key='checkin_start')
                       and (select value::date from app_config where key='checkin_end');

  select jsonb_build_object(
    'ok', true,
    'name', v_p.full_name, 'ic_last4', v_p.ic_last4,
    'platform', v_p.platform, 'handle', v_p.handle,
    'disqualified', v_p.disqualified,
    'tickets', jsonb_build_object(
      'checkin', coalesce(v_t.t_checkin,0),
      'renewal', coalesce(v_t.t_renewal,0),
      'social',  coalesce(v_t.t_social,0),
      'repost',  coalesce(v_t.t_repost,0),
      'adjust',  coalesce(v_t.t_adjust,0),
      'total',   coalesce(v_t.total,0)
    ),
    'adjustments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'delta', a.delta, 'reason', a.reason,
        'at', to_char(a.created_at at time zone 'Asia/Kuala_Lumpur','YYYY-MM-DD')
      ) order by a.created_at desc)
      from ticket_adjustments a where a.participant_id = v_p.id
    ), '[]'::jsonb),
    'checkin_days', v_days,
    'social', coalesce((
      select jsonb_object_agg(platform, true) from social_claims where participant_id = v_p.id
    ), '{}'::jsonb),
    'repost', coalesce((
      select status from story_reposts where participant_id = v_p.id
    ), 'none')
  ) into v_res;

  return v_res;
end;
$function$;

-- 6. Grants ---------------------------------------------------
grant execute on function public.xf_admin_adjust_tickets(text,bigint,integer,text) to anon, authenticated;
grant execute on function public.xf_admin_adjustments(text,bigint)                 to anon, authenticated;
grant execute on function public.xf_me(text)                                       to anon, authenticated;

notify pgrst, 'reload schema';
