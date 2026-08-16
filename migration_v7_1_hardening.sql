-- =====================================================================
-- X FITNESS 9.01 · v7.1 SECURITY HARDENING
-- Project: bkfbylntzmrjqgbrxgic   ·   Written 6 Aug 2026
--
-- APPLIED to production 8 Aug 2026, in four migrations, all verified.
-- Every UPDATE/DELETE below carries a WHERE clause (safeupdate rule).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. MALAYSIAN IC FORMAT VALIDATION
--
--    Ported from the walk-in system's my-ic.ts (v2.18.0). Three layers:
--      a) exactly 12 digits
--      b) YYMMDD is a real date in the past — the round-trip check kills
--         31 Feb, 29 Feb in a non-leap year, month 13, and future dates
--      c) digits 7-8 are a place-of-birth code JPN actually issues.
--         Never issued: 00, 17-20, 69, 70, 73, 80, 81, 94-97 — 14 of the
--         100 possible codes. This layer does most of the work.
--    Combined, roughly 97% of randomly mashed 12-digit strings are rejected.
--
--    It CANNOT prove the IC belongs to the person entering it. JPN has never
--    published a checksum for the last four digits, so anyone who knows the
--    format can mint a passing number. Real verification stays where it
--    already is: the physical MyKad at prize collection.
--
--    Note this runs in the DATABASE, not just the form. The anon key is
--    public by design, so form-only validation is decoration — anyone can
--    POST straight to /rest/v1/rpc/xf_register and skip it.
-- ---------------------------------------------------------------------
create or replace function public.xf_valid_my_ic(p_ic text)
returns boolean language plpgsql immutable
set search_path to 'public','extensions'
as $function$
declare v text; v_yy int; v_year int; v_ymd text; v_dob date; v_pb int;
begin
  v := regexp_replace(coalesce(p_ic,''), '[^0-9]', '', 'g');
  if length(v) <> 12 then return false; end if;

  -- (b) date of birth. Century pivot 29: 00-29 → 2000s, 30-99 → 1900s.
  --     Valid until roughly 2030, when JPN will have to deal with it.
  if substr(v,3,2)::int not between 1 and 12 then return false; end if;
  if substr(v,5,2)::int not between 1 and 31 then return false; end if;
  v_yy   := substr(v,1,2)::int;
  v_year := case when v_yy <= 29 then 2000 + v_yy else 1900 + v_yy end;
  v_ymd  := lpad(v_year::text, 4, '0') || substr(v,3,4);
  begin
    v_dob := to_date(v_ymd, 'YYYYMMDD');
  exception when others then
    return false;
  end;
  -- to_date is lenient (20260231 silently becomes 3 Mar). Round-trip to catch it.
  if to_char(v_dob, 'YYYYMMDD') <> v_ymd then return false; end if;
  if v_dob > (now() at time zone 'Asia/Kuala_Lumpur')::date then return false; end if;

  -- (c) place of birth
  v_pb := substr(v,7,2)::int;
  return v_pb in (
     1, 2, 3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,15,16,          -- states + KL, Labuan, Putrajaya
    21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39, -- second state range
    40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,
    60,61,62,63,64,65,66,67,68,                               -- ASEAN
    71,72,74,75,76,77,78,79,                                  -- born abroad
    82,83,84,85,86,87,88,89,90,91,92,93,98,99                 -- regions, stateless
  );
end;
$function$;


-- ---------------------------------------------------------------------
-- 2. SERVER-SIDE NAME VALIDATION  (fixes the injection vector)
--
--    The browser restricts the name field to A-Z, space, / @ ' . -
--    but the anon key is public, so anyone can POST straight to
--    /rest/v1/rpc/xf_register and store any string they like — including
--    one crafted to break out of the admin console's HTML.
--    From now on the database enforces the same rule the form does.
-- ---------------------------------------------------------------------
create or replace function public.xf_register(
  p_ic text, p_name text, p_phone text, p_platform text, p_handle text)
returns jsonb language plpgsql security definer
set search_path to 'public','extensions'
as $function$
declare v_hash text; v_id bigint; v_open text; v_name text;
begin
  select value into v_open from app_config where key='registration_open';
  if v_open is distinct from 'true' then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if xf_pool_locked() then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  if length(xf_norm_ic(p_ic)) < 6 or length(xf_norm_ic(p_ic)) > 20 then
    return jsonb_build_object('ok', false, 'error', 'bad_ic');
  end if;

  -- Document type is inferred from the value, not from a parameter the caller
  -- controls: 12 pure digits IS a Malaysian IC, so it must pass the format
  -- check. Passing p_id_type='passport' cannot be used to smuggle a fake IC
  -- through, because there is no such parameter to lie about.
  if regexp_replace(coalesce(p_ic,''), '[^0-9]', '', 'g') = xf_norm_ic(p_ic)
     and length(xf_norm_ic(p_ic)) = 12
     and not xf_valid_my_ic(p_ic) then
    return jsonb_build_object('ok', false, 'error', 'bad_ic');
  end if;

  v_name := upper(trim(coalesce(p_name,'')));
  if length(v_name) < 3 or length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'error', 'bad_name');
  end if;
  -- same character set the registration form allows, nothing else
  if v_name !~ '^[A-Z /@''.-]+$' then
    return jsonb_build_object('ok', false, 'error', 'bad_name');
  end if;
  if length(regexp_replace(v_name, '[^A-Z]', '', 'g')) < 3 then
    return jsonb_build_object('ok', false, 'error', 'bad_name');
  end if;

  if length(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')) < 9
  or length(coalesce(p_phone,'')) > 24 then
    return jsonb_build_object('ok', false, 'error', 'bad_phone');
  end if;
  if lower(coalesce(p_platform,'')) not in ('instagram','facebook') then
    return jsonb_build_object('ok', false, 'error', 'bad_platform');
  end if;
  if length(trim(coalesce(p_handle,''))) < 2
  or length(trim(coalesce(p_handle,''))) > 40
  or trim(coalesce(p_handle,'')) !~ '^@?[A-Za-z0-9._ -]+$' then
    return jsonb_build_object('ok', false, 'error', 'bad_handle');
  end if;

  v_hash := xf_hash_ic(p_ic);
  select id into v_id from participants where ic_hash = v_hash;
  if v_id is not null then
    return jsonb_build_object('ok', false, 'error', 'exists');
  end if;

  insert into participants (ic_hash, ic_last4, full_name, phone, platform, handle)
  values (v_hash, right(xf_norm_ic(p_ic), 4), v_name, trim(p_phone),
          lower(p_platform), lower(regexp_replace(trim(p_handle), '^@', '')));

  return xf_me(p_ic);
end;
$function$;

-- Belt and braces: the same rule as a table constraint, so nothing can
-- ever write a hostile name through any other path.
alter table public.participants drop constraint if exists participants_name_charset;
alter table public.participants add  constraint participants_name_charset
  check (full_name ~ '^[A-Z /@''.-]{3,80}$') not valid;


-- ---------------------------------------------------------------------
-- 3. DELETE THE DEAD v1 FUNCTIONS
--
--    Eleven functions from the first version of the project are still
--    published on the public API. They are already broken (they read
--    tables `winners` / `points_log` that no longer exist) and their
--    admin check reads a config key that no longer exists, so they
--    cannot currently do damage — but admin_run_draw, admin_reset_draw
--    and admin_overview should not be sitting on a public endpoint
--    three weeks before a live draw. Remove them.
-- ---------------------------------------------------------------------
drop function if exists public.activate_participant(text,text,text,text,text,text,text,boolean);
drop function if exists public.admin_add_bonus(text,text,integer,text);
drop function if exists public.admin_add_checkins(text,jsonb);
drop function if exists public.admin_add_social(text,text,date);
drop function if exists public.admin_overview(text);
drop function if exists public.admin_reset_draw(text);
drop function if exists public.admin_run_draw(text);
drop function if exists public.admin_set_renewals(text,jsonb);
drop function if exists public.get_my_status(text);
drop function if exists public.get_winners();
drop function if exists public.is_admin(text);
drop function if exists public.hash_ic(text);


-- ---------------------------------------------------------------------
-- 4. REVOKE LEFTOVER TABLE GRANTS
--
--    anon currently holds INSERT/UPDATE/DELETE/TRUNCATE on draw_log,
--    rehearsal_log, rehearsal_results and ticket_adjustments. Today RLS
--    blocks all of it (those tables have RLS on and no policies), so
--    nothing is exposed — but it means a single accidental "disable RLS"
--    click would hand the public the ability to wipe the draw log.
--    Remove the grants so RLS isn't the only thing standing there.
-- ---------------------------------------------------------------------
revoke all on public.draw_log          from anon, authenticated;
revoke all on public.rehearsal_log     from anon, authenticated;
revoke all on public.rehearsal_results from anon, authenticated;
revoke all on public.ticket_adjustments from anon, authenticated;
-- prizes stays readable: the customer page lists the prize tiers.
grant select on public.prizes to anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. THROTTLE THE ADMIN PASSWORD
--
--    The admin password is the single key to the whole console — import,
--    adjust, disqualify, draw, and wipe the results. It can currently be
--    guessed at machine speed: xf_admin_check answers instantly and
--    there is no limit on attempts.
--
--    After this: a wrong password costs the caller ~0.7s, and more than
--    12 failures from one IP inside 15 minutes blocks that IP for 15
--    minutes. Correct passwords are never delayed or blocked, so this
--    cannot lock you out of your own console on draw day.
-- ---------------------------------------------------------------------
create table if not exists public.admin_auth_fails(
  id  bigserial primary key,
  ip  text not null,
  at  timestamptz not null default now()
);
alter table public.admin_auth_fails enable row level security;
revoke all on public.admin_auth_fails from anon, authenticated;
create index if not exists admin_auth_fails_ip_at on public.admin_auth_fails (ip, at desc);

create or replace function public.xf_client_ip()
returns text language sql stable
set search_path to 'public','extensions'
as $function$
  select coalesce(nullif(split_part(
    coalesce(nullif(current_setting('request.headers', true),'')::json->>'x-forwarded-for',''),
    ',', 1), ''), 'unknown');
$function$;

-- NOTE: now VOLATILE (it records failures). Every caller is already
-- volatile, so nothing else needs to change.
create or replace function public.xf_admin_ok(p_secret text)
returns boolean language plpgsql volatile security definer
set search_path to 'public','extensions'
as $function$
declare v_ok boolean; v_ip text; v_fails int;
begin
  select exists (
    select 1 from app_config
    where key = 'admin_secret_sha256'
      and value = encode(extensions.digest(coalesce(p_secret,''), 'sha256'), 'hex')
  ) into v_ok;

  if v_ok then return true; end if;

  v_ip := xf_client_ip();
  select count(*) into v_fails from admin_auth_fails
   where ip = v_ip and at > now() - interval '15 minutes';

  -- Already blocked: refuse instantly. Deliberately NOT delayed, so an
  -- attacker can't use the delay itself to tie up database connections.
  -- Only ever block a REAL address — if the IP can't be read we still slow
  -- the attempt down, but we never blanket-block, so you can't be locked
  -- out of your own console on draw morning.
  if v_ip <> 'unknown' and v_fails >= 12 then return false; end if;

  insert into admin_auth_fails (ip) values (v_ip);
  perform pg_sleep(0.7);   -- first 12 guesses are slow, the rest are dead
  return false;
end;
$function$;

-- housekeeping so the table can't grow forever
-- The janitor MUST require the password. Without it, anyone could wipe the
-- failure log and reset every IP's counter, which would neuter the throttle.
create or replace function public.xf_admin_auth_gc(p_secret text)
returns jsonb language plpgsql volatile security definer
set search_path to 'public','extensions'
as $function$
declare v_n int;
begin
  if not xf_admin_ok(p_secret) then return jsonb_build_object('ok',false,'error','auth'); end if;
  delete from admin_auth_fails where at < now() - interval '1 day';
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'purged', v_n);
end;
$function$;

revoke all on function public.xf_client_ip() from anon, authenticated;


-- ---------------------------------------------------------------------
-- 6. PIN search_path ON THE THREE HELPERS THAT LACK IT
--    (Supabase security linter warnings)
-- ---------------------------------------------------------------------
alter function public.xf_norm_ic(text)  set search_path to 'public','extensions';
alter function public.xf_hash_ic(text)  set search_path to 'public','extensions';
alter function public.xf_mask_name(text) set search_path to 'public','extensions';


-- ---------------------------------------------------------------------
-- 7. AFTER RUNNING: verify
-- ---------------------------------------------------------------------
-- select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--  where n.nspname='public' and proname in
--    ('is_admin','admin_run_draw','admin_reset_draw','activate_participant');
--   -> should return zero rows
--
-- select xf_admin_ok('definitely-wrong');   -> false, after a ~0.7s pause
-- Then log into /admin with the real password and confirm it still works.


-- ---------------------------------------------------------------------
-- 8. Tell PostgREST about the new/changed functions immediately.
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
