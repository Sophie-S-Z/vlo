-- Sealed sync between a writer's devices (roadmap F49, plan Task I5, ADR 0008). A sync space is one
-- writer's set of devices. The server keeps the SHA-256 of the space token, and for each device the
-- newest sealed blob of each key. A key is an HMAC that only the devices can make, so the server sees
-- no project or item id, and a blob is cipher text only.

create table public.sync_spaces (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz not null default now()
);

create table public.sync_blobs (
  space_id uuid not null references public.sync_spaces(id) on delete cascade,
  device text not null,
  key text not null,
  payload text not null,
  iv text not null,
  size int not null,
  updated_at timestamptz not null default now(),
  primary key (space_id, device, key)
);

create index sync_spaces_created_at on public.sync_spaces (created_at);
create index sync_spaces_used_at on public.sync_spaces (used_at);
create index sync_blobs_space_updated on public.sync_blobs (space_id, updated_at);

alter table public.sync_spaces enable row level security;
alter table public.sync_blobs enable row level security;
-- No policies: the anon role cannot read or write the tables directly.

-- True when the token opens the space. A use marks the space as used, at most once an hour, so a space
-- in use never meets the 90-day cleanup. Only the functions below call it.
create or replace function public.sync_open(p_space uuid, p_token text)
returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  -- A 32-byte token in base64url is 43 characters.
  if p_space is null or p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return false; end if;
  if not exists (
    select 1 from sync_spaces
    where id = p_space and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  ) then
    return false;
  end if;
  update sync_spaces set used_at = now() where id = p_space and used_at < now() - interval '1 hour';
  return true;
end $$;

create or replace function public.create_sync_space(p_token text)
returns uuid language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_id uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'bad token'; end if;
  -- At most 20 new spaces in an hour, for the whole project.
  if (select count(*) from sync_spaces where created_at > now() - interval '1 hour') >= 20 then
    raise exception 'server busy';
  end if;
  insert into sync_spaces (token_hash) values (encode(extensions.digest(p_token, 'sha256'), 'hex'))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.sync_put(
  p_space uuid, p_token text, p_device text, p_key text, p_payload text, p_iv text
) returns timestamptz language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old int;
  v_at timestamptz;
begin
  if not sync_open(p_space, p_token) then raise exception 'unknown space'; end if;
  -- A device id is 16 to 64 base64url characters, and a key is an HMAC-SHA256 in base64url.
  if p_device is null or p_device !~ '^[A-Za-z0-9_-]{16,64}$' then raise exception 'bad device'; end if;
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'bad key'; end if;
  if p_iv is null or p_iv !~ '^[A-Za-z0-9+/]{16}$' then raise exception 'bad iv'; end if;
  if p_payload is null or length(p_payload) = 0 then raise exception 'bad payload'; end if;
  if length(p_payload) > 2800000 then raise exception 'blob too large'; end if;
  -- One space at a time, so two puts cannot both pass the limits below.
  perform 1 from sync_spaces where id = p_space for update;
  select size into v_old from sync_blobs where space_id = p_space and device = p_device and key = p_key;
  if v_old is null and not exists (select 1 from sync_blobs where space_id = p_space and device = p_device)
     and (select count(distinct device) from sync_blobs where space_id = p_space) >= 5 then
    raise exception 'device limit';
  end if;
  -- At most 100 MB for each space, and 150 MB of sync for the whole project, so shares keep room.
  if (select coalesce(sum(size), 0) from sync_blobs where space_id = p_space)
     - coalesce(v_old, 0) + length(p_payload) > 100000000 then
    raise exception 'space full';
  end if;
  if (select coalesce(sum(size), 0) from sync_blobs) - coalesce(v_old, 0) + length(p_payload) > 150000000 then
    raise exception 'server full';
  end if;
  insert into sync_blobs (space_id, device, key, payload, iv, size, updated_at)
  values (p_space, p_device, p_key, p_payload, p_iv, length(p_payload), now())
  on conflict (space_id, device, key) do update
    set payload = excluded.payload, iv = excluded.iv, size = excluded.size, updated_at = excluded.updated_at
  returning updated_at into v_at;
  return v_at;
end $$;

-- The blobs of the other devices that changed at or after p_since, oldest first. A read stops after
-- 8 MB, with at least one blob, and the device reads again from the last time that it got.
create or replace function public.sync_list(p_space uuid, p_token text, p_device text, p_since timestamptz)
returns table (device text, key text, payload text, iv text, updated_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not sync_open(p_space, p_token) then raise exception 'unknown space'; end if;
  return query
  select b.device, b.key, b.payload, b.iv, b.updated_at
  from (
    select s.*, sum(s.size) over (order by s.updated_at, s.device, s.key) - s.size as prior
    from sync_blobs s
    where s.space_id = p_space and s.device is distinct from p_device
      and s.updated_at >= coalesce(p_since, '-infinity'::timestamptz)
  ) b
  where b.prior < 8000000
  order by b.updated_at, b.device, b.key;
end $$;

-- Each device of the space and when it last changed a blob, for the Devices screen.
create or replace function public.sync_devices(p_space uuid, p_token text)
returns table (device text, updated_at timestamptz, size bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not sync_open(p_space, p_token) then raise exception 'unknown space'; end if;
  return query
  select s.device, max(s.updated_at), sum(s.size)::bigint from sync_blobs s
  where s.space_id = p_space group by s.device order by min(s.updated_at);
end $$;

create or replace function public.sync_drop(p_space uuid, p_token text, p_device text, p_key text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not sync_open(p_space, p_token) then raise exception 'unknown space'; end if;
  delete from sync_blobs where space_id = p_space and device = p_device and key = p_key;
  return found;
end $$;

-- A device leaves the space: its blobs go, and the other devices keep theirs.
create or replace function public.leave_sync(p_space uuid, p_token text, p_device text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not sync_open(p_space, p_token) then raise exception 'unknown space'; end if;
  delete from sync_blobs where space_id = p_space and device = p_device;
  return found;
end $$;

-- Sync stops on every device: the space and all its blobs go.
create or replace function public.delete_sync_space(p_space uuid, p_token text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not sync_open(p_space, p_token) then raise exception 'unknown space'; end if;
  delete from sync_spaces where id = p_space;
  return found;
end $$;

-- Free plan care (decision R8): a space with no use for 90 days goes, with its blobs.
create or replace function public.cleanup_sync() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count int;
begin
  delete from sync_spaces where used_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('vlo-cleanup-sync', '37 3 * * *', 'select public.cleanup_sync()');
  end if;
end $$;

-- Supabase gives new functions to anon and authenticated by default. Only the database owner and
-- pg_cron run the cleanup, only the functions call sync_open, and only the app's anon role calls the rest.
revoke all on function public.sync_open, public.cleanup_sync from public, anon, authenticated;
revoke all on function public.create_sync_space, public.sync_put, public.sync_list, public.sync_devices,
  public.sync_drop, public.leave_sync, public.delete_sync_space from public, authenticated;
grant execute on function public.create_sync_space, public.sync_put, public.sync_list, public.sync_devices,
  public.sync_drop, public.leave_sync, public.delete_sync_space to anon;
