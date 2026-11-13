-- Accounts, sync with an account, the daily count, feedback and the owner page (Phase 18, ADR 0009).
--
-- Supabase Auth keeps the accounts in auth.users. Each table below has row level security with no
-- policies, as in the migrations before, so only the functions of this file reach the tables. A function
-- for a signed-in writer reads the account from auth.uid(), never from an argument. The server never gets a
-- word of text: the sync key in a vault is wrapped with a key that comes from the writer's passphrase on
-- the device.

-- The accounts that can open the owner page. The product owner adds a row in the SQL editor
-- (docs/accounts-setup.md). No function adds one.
create table public.app_owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- The sync space of an account, and its sync key wrapped with AES-GCM under a key from the passphrase
-- (PBKDF2-SHA256). The space token opens the relay, which holds cipher text only.
create table public.sync_vaults (
  user_id uuid primary key references auth.users (id) on delete cascade,
  space_id uuid not null references public.sync_spaces (id) on delete cascade,
  token text not null,
  wrapped text not null,
  iv text not null,
  salt text not null,
  rounds int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row for each install and UTC day: the daily count (decision A3). The install id is random and
-- stays on the device. A signed-in device adds its account.
create table public.app_pings (
  install text not null,
  day date not null,
  user_id uuid references auth.users (id) on delete set null,
  app_version text not null,
  device text not null,
  installed boolean not null default false,
  primary key (install, day)
);

-- What writers say about Vlo (decision A5).
create table public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  install text not null,
  kind text not null,
  message text not null,
  rating smallint,
  contact text,
  app_version text not null,
  device text not null,
  place text not null default '',
  status text not null default 'new',
  note text not null default ''
);

create index app_pings_day on public.app_pings (day);
create index app_pings_user on public.app_pings (user_id) where user_id is not null;
create index app_feedback_created_at on public.app_feedback (created_at);
create index app_feedback_install on public.app_feedback (install, created_at);
create index sync_vaults_space on public.sync_vaults (space_id);

alter table public.app_owners enable row level security;
alter table public.sync_vaults enable row level security;
alter table public.app_pings enable row level security;
alter table public.app_feedback enable row level security;
-- No policies: the anon and authenticated roles cannot read or write the tables directly.

-- The UTC day of now.
create or replace function public.vlo_today() returns date
language sql stable set search_path = public, pg_temp as $$
  select (now() at time zone 'utc')::date
$$;

-- The account of the request, or an error for a request with no account.
create or replace function public.vlo_account() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  return v_uid;
end $$;

------------------------------------------------------------------------------------------------------------
-- Sync with an account (decision A1)
------------------------------------------------------------------------------------------------------------

create or replace function public.vault_get()
returns table (space_id uuid, token text, wrapped text, iv text, salt text, rounds int, updated_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := vlo_account();
begin
  return query
  select v.space_id, v.token, v.wrapped, v.iv, v.salt, v.rounds, v.updated_at
  from sync_vaults v where v.user_id = v_uid;
end $$;

-- Saves the account's sync space and wrapped key. The caller must hold the space token, so an account
-- cannot point at a space of another writer.
create or replace function public.vault_put(
  p_space uuid, p_token text, p_wrapped text, p_iv text, p_salt text, p_rounds int
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := vlo_account();
begin
  -- A 32-byte key with its 16-byte tag in base64 is 64 characters. A 16-byte salt is 24.
  if p_wrapped is null or p_wrapped !~ '^[A-Za-z0-9+/]{64}$' then raise exception 'bad wrapped key'; end if;
  if p_iv is null or p_iv !~ '^[A-Za-z0-9+/]{16}$' then raise exception 'bad iv'; end if;
  if p_salt is null or p_salt !~ '^[A-Za-z0-9+/]{22}==$' then raise exception 'bad salt'; end if;
  if p_rounds is null or p_rounds < 100000 or p_rounds > 10000000 then raise exception 'bad rounds'; end if;
  if not sync_open(p_space, p_token) then raise exception 'unknown space'; end if;
  insert into sync_vaults (user_id, space_id, token, wrapped, iv, salt, rounds)
  values (v_uid, p_space, p_token, p_wrapped, p_iv, p_salt, p_rounds)
  on conflict (user_id) do update
    set space_id = excluded.space_id, token = excluded.token, wrapped = excluded.wrapped,
        iv = excluded.iv, salt = excluded.salt, rounds = excluded.rounds, updated_at = now();
  return true;
end $$;

-- Removes the account's vault. The sync space stays, so the devices in it go on syncing.
create or replace function public.vault_delete() returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := vlo_account();
begin
  delete from sync_vaults where user_id = v_uid;
  return found;
end $$;

-- Deletes the account (decision A7): its sync space with every sealed copy, its vault, and its account.
-- The daily count and feedback keep their rows with no account. The projects stay on each device.
create or replace function public.delete_my_account() returns boolean
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_uid uuid := vlo_account();
begin
  delete from sync_spaces where id in (select v.space_id from sync_vaults v where v.user_id = v_uid);
  delete from auth.users where id = v_uid;
  return found;
end $$;

------------------------------------------------------------------------------------------------------------
-- The daily count and feedback (decisions A3 and A5)
------------------------------------------------------------------------------------------------------------

create or replace function public.vlo_check_client(p_install text, p_version text, p_device text)
returns void language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if p_install is null or p_install !~ '^[A-Za-z0-9_-]{16,64}$' then raise exception 'bad install'; end if;
  if p_version is null or p_version !~ '^[0-9A-Za-z.+-]{1,32}$' then raise exception 'bad version'; end if;
  if p_device is null or p_device not in ('phone', 'tablet', 'computer') then raise exception 'bad device'; end if;
end $$;

-- One count for each install and day. A second call on the same day changes nothing but the account,
-- the version and the kind of device.
create or replace function public.daily_count(p_install text, p_version text, p_device text, p_installed boolean)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_today date := vlo_today();
begin
  perform vlo_check_client(p_install, p_version, p_device);
  -- At most 50,000 installs in a day, for the whole project.
  if not exists (select 1 from app_pings where install = p_install and day = v_today)
     and (select count(*) from app_pings where day = v_today) >= 50000 then
    raise exception 'server busy';
  end if;
  insert into app_pings (install, day, user_id, app_version, device, installed)
  values (p_install, v_today, auth.uid(), p_version, p_device, coalesce(p_installed, false))
  on conflict (install, day) do update
    set user_id = coalesce(excluded.user_id, app_pings.user_id), app_version = excluded.app_version,
        device = excluded.device, installed = excluded.installed;
  return true;
end $$;

create or replace function public.send_feedback(
  p_install text, p_kind text, p_message text, p_rating int, p_contact text,
  p_version text, p_device text, p_place text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_message text := btrim(coalesce(p_message, ''));
  v_contact text := nullif(btrim(coalesce(p_contact, '')), '');
begin
  perform vlo_check_client(p_install, p_version, p_device);
  if p_kind is null or p_kind not in ('idea', 'problem', 'praise', 'question') then raise exception 'bad kind'; end if;
  if length(v_message) = 0 then raise exception 'empty message'; end if;
  if length(v_message) > 4000 then raise exception 'message too large'; end if;
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then raise exception 'bad rating'; end if;
  if v_contact is not null and length(v_contact) > 200 then raise exception 'contact too large'; end if;
  if p_place is null or p_place !~ '^[a-z0-9-]{0,40}$' then raise exception 'bad place'; end if;
  -- At most 10 messages from an install in a day, and 500 for the whole project.
  if (select count(*) from app_feedback
      where install = p_install and created_at > now() - interval '1 day') >= 10 then
    raise exception 'feedback limit';
  end if;
  if (select count(*) from app_feedback where created_at > now() - interval '1 day') >= 500 then
    raise exception 'server busy';
  end if;
  insert into app_feedback (user_id, install, kind, message, rating, contact, app_version, device, place)
  values (auth.uid(), p_install, p_kind, v_message, p_rating, v_contact, p_version, p_device, p_place)
  returning id into v_id;
  return v_id;
end $$;

------------------------------------------------------------------------------------------------------------
-- The owner page (decision A6). Counts, dates and feedback only: no function reads a sync blob, a share or
-- a vault's key.
------------------------------------------------------------------------------------------------------------

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from app_owners where user_id = auth.uid())
$$;

create or replace function public.vlo_owner() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_owner() then raise exception 'not owner'; end if;
end $$;

create or replace function public.owner_summary() returns jsonb
language plpgsql stable security definer set search_path = public, auth, pg_temp as $$
declare
  v_today date := vlo_today();
  v_out jsonb;
begin
  perform vlo_owner();
  with recent as (
    -- The newest row of each install in the last 30 days.
    select distinct on (install) install, device, app_version, installed
    from app_pings where day > v_today - 30 order by install, day desc
  ),
  reports as (
    select report from usage_reports where created_at > now() - interval '56 days'
  )
  select jsonb_build_object(
    'accounts', (select count(*) from auth.users),
    'accounts_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'accounts_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'active_1d', (select count(*) from app_pings where day = v_today),
    'active_7d', (select count(distinct install) from app_pings where day > v_today - 7),
    'active_30d', (select count(*) from recent),
    'accounts_active_7d',
      (select count(distinct user_id) from app_pings where day > v_today - 7 and user_id is not null),
    'accounts_active_30d',
      (select count(distinct user_id) from app_pings where day > v_today - 30 and user_id is not null),
    'syncing', (select count(*) from sync_vaults),
    'spaces', (select count(*) from sync_spaces),
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
    'words', coalesce((select jsonb_object_agg(band, n) from
      (select report->>'words_added_band' as band, count(*) as n from reports
       where report ? 'words_added_band' group by 1) x), '{}'::jsonb)
  ) into v_out;
  return v_out;
end $$;

-- Each UTC day of the last p_days days, oldest first: active installs, active accounts, new accounts and
-- feedback messages.
create or replace function public.owner_daily(p_days int)
returns table (day date, devices int, accounts int, new_accounts int, feedback int)
language plpgsql stable security definer set search_path = public, auth, pg_temp as $$
declare v_today date := vlo_today();
begin
  perform vlo_owner();
  if p_days is null or p_days < 1 or p_days > 400 then raise exception 'bad days'; end if;
  return query
  select d::date,
    (select count(*)::int from app_pings p where p.day = d::date),
    (select count(distinct p.user_id)::int from app_pings p where p.day = d::date and p.user_id is not null),
    (select count(*)::int from auth.users u where (u.created_at at time zone 'utc')::date = d::date),
    (select count(*)::int from app_feedback f where (f.created_at at time zone 'utc')::date = d::date)
  from generate_series(v_today - (p_days - 1), v_today, interval '1 day') as d
  order by 1;
end $$;

-- Each account, the most recently active first. No project, title or word: the server has none.
create or replace function public.owner_accounts()
returns table (
  id uuid, email text, provider text, created_at timestamptz, last_sign_in_at timestamptz,
  last_active date, devices int, syncing boolean, feedback int
)
language plpgsql stable security definer set search_path = public, auth, pg_temp as $$
declare v_today date := vlo_today();
begin
  perform vlo_owner();
  return query
  select u.id, u.email::text, coalesce(u.raw_app_meta_data->>'provider', 'email'), u.created_at,
    u.last_sign_in_at,
    (select max(p.day) from app_pings p where p.user_id = u.id),
    (select count(distinct p.install)::int from app_pings p where p.user_id = u.id and p.day > v_today - 30),
    exists (select 1 from sync_vaults v where v.user_id = u.id),
    (select count(*)::int from app_feedback f where f.user_id = u.id)
  from auth.users u
  order by 6 desc nulls last, u.created_at desc
  limit 2000;
end $$;

-- The feedback, newest first, with the email of a signed-in sender.
create or replace function public.owner_feedback()
returns table (
  id uuid, created_at timestamptz, kind text, message text, rating smallint, contact text, email text,
  app_version text, device text, place text, status text, note text
)
language plpgsql stable security definer set search_path = public, auth, pg_temp as $$
begin
  perform vlo_owner();
  return query
  select f.id, f.created_at, f.kind, f.message, f.rating, f.contact, u.email::text, f.app_version, f.device,
    f.place, f.status, f.note
  from app_feedback f left join auth.users u on u.id = f.user_id
  order by f.created_at desc
  limit 2000;
end $$;

create or replace function public.owner_set_feedback(p_id uuid, p_status text, p_note text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform vlo_owner();
  if p_status is null or p_status not in ('new', 'read', 'planned', 'done') then raise exception 'bad status'; end if;
  if p_note is not null and length(p_note) > 2000 then raise exception 'note too large'; end if;
  update app_feedback set status = p_status, note = coalesce(p_note, note) where id = p_id;
  return found;
end $$;

------------------------------------------------------------------------------------------------------------
-- Free plan care: the daily count keeps 400 days.
------------------------------------------------------------------------------------------------------------

create or replace function public.cleanup_pings() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count int;
begin
  delete from app_pings where day < vlo_today() - 400;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('vlo-cleanup-pings', '47 3 * * *', 'select public.cleanup_pings()');
  end if;
end $$;

-- Supabase gives new functions to anon and authenticated by default. Each function gets only the role
-- that calls it from the app.
revoke all on function public.vlo_today, public.vlo_account, public.vlo_check_client, public.vlo_owner,
  public.cleanup_pings, public.vault_get, public.vault_put, public.vault_delete, public.delete_my_account,
  public.daily_count, public.send_feedback, public.is_owner, public.owner_summary, public.owner_daily,
  public.owner_accounts, public.owner_feedback, public.owner_set_feedback
  from public, anon, authenticated;
grant execute on function public.daily_count, public.send_feedback to anon, authenticated;
grant execute on function public.vault_get, public.vault_put, public.vault_delete, public.delete_my_account,
  public.is_owner, public.owner_summary, public.owner_daily, public.owner_accounts, public.owner_feedback,
  public.owner_set_feedback to authenticated;
