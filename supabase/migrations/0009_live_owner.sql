-- The live owner page (the product owner chose word counts from every device). The daily count also
-- carries the words that the device added on its local day, the words on the device and its count of
-- projects. Numbers only: never text, a title or a name. A device sends a new count when its numbers
-- change, at most about once in 5 minutes, so each install keeps one row for each day as before.
--
-- The day of a row is now the local day of the device, so a writer's evening words stay on their own day.
-- An app from before this migration sends no day, and its row takes the UTC day as before.

alter table public.app_pings
  add column words int not null default 0,
  add column words_total int,
  add column projects int,
  add column seen_at timestamptz not null default now();

-- One writer: an account, or an install with no account. The devices of one account share their projects
-- through sync, so the words of a writer on a day are the most that any of its devices counted.
create or replace function public.vlo_writer(p_user uuid, p_install text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(p_user::text, p_install)
$$;

-- A local day is at most one day from the UTC day, in every time zone.
create or replace function public.vlo_check_day(p_day date) returns date
language plpgsql stable set search_path = public, pg_temp as $$
declare v_day date := coalesce(p_day, vlo_today());
begin
  if v_day not between vlo_today() - 1 and vlo_today() + 1 then raise exception 'bad day'; end if;
  return v_day;
end $$;

drop function public.daily_count(text, text, text, boolean);
create function public.daily_count(
  p_install text, p_version text, p_device text, p_installed boolean,
  p_day date default null, p_words int default null, p_total int default null, p_projects int default null
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_day date := vlo_check_day(p_day);
begin
  perform vlo_check_client(p_install, p_version, p_device);
  if p_words is not null and (p_words < 0 or p_words > 1000000) then raise exception 'bad words'; end if;
  if p_total is not null and (p_total < 0 or p_total > 100000000) then raise exception 'bad words'; end if;
  if p_projects is not null and (p_projects < 0 or p_projects > 100000) then raise exception 'bad projects'; end if;
  -- At most 50,000 installs in a day, for the whole project.
  if not exists (select 1 from app_pings where install = p_install and day = v_day)
     and (select count(*) from app_pings where day = v_day) >= 50000 then
    raise exception 'server busy';
  end if;
  insert into app_pings (install, day, user_id, app_version, device, installed, words, words_total, projects)
  values (p_install, v_day, auth.uid(), p_version, p_device, coalesce(p_installed, false),
          coalesce(p_words, 0), p_total, p_projects)
  on conflict (install, day) do update
    set user_id = coalesce(excluded.user_id, app_pings.user_id), app_version = excluded.app_version,
        device = excluded.device, installed = excluded.installed,
        words = coalesce(p_words, app_pings.words),
        words_total = coalesce(p_total, app_pings.words_total),
        projects = coalesce(p_projects, app_pings.projects),
        seen_at = now();
  return true;
end $$;

------------------------------------------------------------------------------------------------------------
-- The owner page. `p_today` is the local day of the owner, so "today" on the page is the owner's today.
------------------------------------------------------------------------------------------------------------

drop function public.owner_summary();
create function public.owner_summary(p_today date default null) returns jsonb
language plpgsql stable security definer set search_path = public, auth, pg_temp as $$
declare
  v_today date := vlo_check_day(p_today);
  v_out jsonb;
begin
  perform vlo_owner();
  with recent as (
    -- The newest row of each install in the last 30 days.
    select distinct on (install) install, user_id, device, app_version, installed, words_total, projects
    from app_pings where day > v_today - 30 order by install, day desc, seen_at desc
  ),
  writers as (
    -- The newest totals of each writer.
    select vlo_writer(user_id, install) as writer, max(words_total) as words_total, max(projects) as projects
    from recent where words_total is not null group by 1
  ),
  reports as (
    select report from usage_reports where created_at > now() - interval '56 days'
  )
  select jsonb_build_object(
    'accounts', (select count(*) from auth.users),
    'accounts_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'accounts_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'now', (select count(distinct vlo_writer(user_id, install)) from app_pings
      where day >= v_today - 1 and seen_at > now() - interval '15 minutes'),
    'active_1d', (select count(*) from app_pings where day = v_today),
    'active_7d', (select count(distinct install) from app_pings where day > v_today - 7),
    'active_30d', (select count(*) from recent),
    'active_prev_7d', (select count(distinct install) from app_pings
      where day between v_today - 13 and v_today - 7),
    'returning_7d', (select count(distinct install) from app_pings
      where day > v_today - 7 and install in
        (select install from app_pings where day between v_today - 13 and v_today - 7)),
    'accounts_active_7d',
      (select count(distinct user_id) from app_pings where day > v_today - 7 and user_id is not null),
    'accounts_active_30d',
      (select count(distinct user_id) from app_pings where day > v_today - 30 and user_id is not null),
    'words_total', (select coalesce(sum(words_total), 0) from writers),
    'projects', (select coalesce(sum(projects), 0) from writers),
    'syncing', (select count(*) from sync_vaults),
    'spaces', (select count(*) from sync_spaces),
    'sync_bytes', (select coalesce(sum(size), 0) from sync_blobs),
    'synced_at', (select max(updated_at) from sync_blobs),
    'shares', (select count(*) from shares where not revoked and expires_at > now()),
    'comments', (select count(*) from share_comments),
    'rooms', (select count(*) from sprint_rooms where expires_at > now()),
    'db_bytes', pg_database_size(current_database()),
    'installed', (select count(*) from recent where installed),
    'devices', coalesce((select jsonb_object_agg(device, n) from
      (select device, count(*) as n from recent group by device) d), '{}'::jsonb),
    'versions', coalesce((select jsonb_object_agg(app_version, n) from
      (select app_version, count(*) as n from recent group by app_version) v), '{}'::jsonb),
    'feedback', coalesce((select jsonb_object_agg(status, n) from
      (select status, count(*) as n from app_feedback group by status) f), '{}'::jsonb),
    'feedback_kinds', coalesce((select jsonb_object_agg(kind, n) from
      (select kind, count(*) as n from app_feedback group by kind) k), '{}'::jsonb),
    'rating', (select round(avg(rating)::numeric, 2) from app_feedback where rating is not null),
    'ratings', (select count(rating) from app_feedback),
    'reports', (select count(*) from reports),
    'features', coalesce((select jsonb_object_agg(name, n) from
      (select name, count(*) as n from reports, jsonb_array_elements_text(
        case when jsonb_typeof(report->'features_used') = 'array' then report->'features_used' else '[]' end
      ) as name group by name) x), '{}'::jsonb),
    'templates', coalesce((select jsonb_object_agg(name, n) from
      (select name, count(*) as n from reports, jsonb_array_elements_text(
        case when jsonb_typeof(report->'templates_used') = 'array' then report->'templates_used' else '[]' end
      ) as name group by name) x), '{}'::jsonb),
    -- The owner page from before this migration reads the bands of the weekly reports.
    'words', coalesce((select jsonb_object_agg(band, n) from
      (select report->>'words_added_band' as band, count(*) as n from reports
       where report ? 'words_added_band' group by 1) x), '{}'::jsonb)
  ) into v_out;
  return v_out;
end $$;

-- Each day of the last p_days days up to the owner's today, oldest first. One grouped pass over each
-- table, so a year of days costs about the same as a week.
drop function public.owner_daily(int);
create function public.owner_daily(p_days int, p_today date default null)
returns table (
  day date, devices int, accounts int, writers int, words int, new_devices int, new_accounts int,
  feedback int
)
language plpgsql stable security definer set search_path = public, auth, pg_temp as $$
#variable_conflict use_column
declare v_today date := vlo_check_day(p_today);
begin
  perform vlo_owner();
  if p_days is null or p_days < 1 or p_days > 400 then raise exception 'bad days'; end if;
  return query
  with p as (
    select * from app_pings where day > v_today - p_days and day <= v_today
  ),
  w as (
    select day, vlo_writer(user_id, install) as writer, max(words) as words from p group by 1, 2
  )
  select d.day::date,
    coalesce(a.devices, 0), coalesce(a.accounts, 0), coalesce(ws.writers, 0), coalesce(ws.words, 0),
    coalesce(nd.n, 0), coalesce(na.n, 0), coalesce(fb.n, 0)
  from generate_series(v_today - (p_days - 1), v_today, interval '1 day') as d (day)
  left join (select day, count(*)::int as devices, count(distinct user_id)::int as accounts
             from p group by day) a on a.day = d.day::date
  left join (select day, (count(*) filter (where words > 0))::int as writers, sum(words)::int as words
             from w group by day) ws on ws.day = d.day::date
  left join (select first as day, count(*)::int as n
             from (select min(day) as first from app_pings group by install) f group by 1) nd
    on nd.day = d.day::date
  left join (select (created_at at time zone 'utc')::date as day, count(*)::int as n
             from auth.users group by 1) na on na.day = d.day::date
  left join (select (created_at at time zone 'utc')::date as day, count(*)::int as n
             from app_feedback group by 1) fb on fb.day = d.day::date
  order by 1;
end $$;

-- Each account, the most recently active first, with its words. No project, title or word of text.
drop function public.owner_accounts();
create function public.owner_accounts(p_today date default null)
returns table (
  id uuid, email text, provider text, created_at timestamptz, last_sign_in_at timestamptz,
  last_active date, devices int, syncing boolean, feedback int, days_30d int, words_30d int,
  words_total int, projects int
)
language plpgsql stable security definer set search_path = public, auth, pg_temp as $$
declare v_today date := vlo_check_day(p_today);
begin
  perform vlo_owner();
  return query
  with mine as (
    select p.user_id, p.day, max(p.words) as words, max(p.words_total) as total, max(p.projects) as projects
    from app_pings p where p.user_id is not null and p.day > v_today - 30 group by 1, 2
  ),
  latest as (
    select distinct on (m.user_id) m.user_id, m.total, m.projects
    from mine m where m.total is not null order by m.user_id, m.day desc
  )
  select u.id, u.email::text, coalesce(u.raw_app_meta_data->>'provider', 'email'), u.created_at,
    u.last_sign_in_at,
    (select max(p.day) from app_pings p where p.user_id = u.id),
    (select count(distinct p.install)::int from app_pings p where p.user_id = u.id and p.day > v_today - 30),
    exists (select 1 from sync_vaults v where v.user_id = u.id),
    (select count(*)::int from app_feedback f where f.user_id = u.id),
    (select count(*)::int from mine m where m.user_id = u.id),
    (select coalesce(sum(m.words), 0)::int from mine m where m.user_id = u.id),
    l.total, l.projects
  from auth.users u left join latest l on l.user_id = u.id
  order by 6 desc nulls last, u.created_at desc
  limit 2000;
end $$;

revoke all on function public.vlo_writer, public.vlo_check_day, public.daily_count, public.owner_summary,
  public.owner_daily, public.owner_accounts
  from public, anon, authenticated;
grant execute on function public.daily_count to anon, authenticated;
grant execute on function public.owner_summary, public.owner_daily, public.owner_accounts to authenticated;
