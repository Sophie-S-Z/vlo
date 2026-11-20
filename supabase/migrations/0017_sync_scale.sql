-- Sync at scale on the free plan. The free plan gives 5 GB of egress each month, and a sync check runs each
-- minute on each open device, so a check with nothing new must bring no payload.
--
-- 1. sync_list skips the blobs that the device names in p_seen. A device reads 30 seconds before its cursor,
--    so that a put that commits late still arrives, and it names the blobs of that window that it has.
--    Without p_seen, a device of an older Vlo reads as before.
-- 2. sync_put gives each space 50 MB, and refuses new data for all spaces only when the whole database
--    nears the 500 MB of the free plan. Before, a fixed 150 MB for all sync let two large spaces stop sync
--    for every writer.

drop function public.sync_list(uuid, text, text, timestamptz);

create function public.sync_list(
  p_space uuid, p_token text, p_device text, p_since timestamptz, p_seen jsonb default null
) returns table (device text, key text, payload text, iv text, updated_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not sync_open(p_space, p_token) then raise exception 'unknown space'; end if;
  -- An array of at most 1,000 objects {device, key, at}.
  if p_seen is not null and (jsonb_typeof(p_seen) <> 'array' or jsonb_array_length(p_seen) > 1000) then
    raise exception 'bad seen';
  end if;
  return query
  select b.device, b.key, b.payload, b.iv, b.updated_at
  from (
    select s.*, sum(s.size) over (order by s.updated_at, s.device, s.key) - s.size as prior
    from sync_blobs s
    where s.space_id = p_space and s.device is distinct from p_device
      and s.updated_at >= coalesce(p_since, '-infinity'::timestamptz)
      and not exists (
        select 1 from jsonb_to_recordset(coalesce(p_seen, '[]'::jsonb)) as x(device text, key text, at timestamptz)
        where x.device = s.device and x.key = s.key and x.at = s.updated_at
      )
  ) b
  where b.prior < 8000000
  order by b.updated_at, b.device, b.key;
end $$;

-- True when p_more bytes would take the database past 450 MB, which keeps room under the 500 MB of the free
-- plan for accounts, shares and the system tables.
create or replace function public.sync_server_full(p_more bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select pg_database_size(current_database()) + p_more > 450000000;
$$;

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
  if (select coalesce(sum(size), 0) from sync_blobs where space_id = p_space)
     - coalesce(v_old, 0) + length(p_payload) > 50000000 then
    raise exception 'space full';
  end if;
  if length(p_payload) > coalesce(v_old, 0) and sync_server_full(length(p_payload) - coalesce(v_old, 0)) then
    raise exception 'server full';
  end if;
  insert into sync_blobs (space_id, device, key, payload, iv, size, updated_at)
  values (p_space, p_device, p_key, p_payload, p_iv, length(p_payload), now())
  on conflict (space_id, device, key) do update
    set payload = excluded.payload, iv = excluded.iv, size = excluded.size, updated_at = excluded.updated_at
  returning updated_at into v_at;
  return v_at;
end $$;

-- Supabase gives new functions to anon and authenticated by default. Only sync_put calls the size check, and
-- only the app's anon role calls sync_list.
revoke all on function public.sync_server_full from public, anon, authenticated;
revoke all on function public.sync_list from public, authenticated;
grant execute on function public.sync_list to anon;
