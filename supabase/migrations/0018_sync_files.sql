-- Sync files in Cloudflare R2 (scaling fix 5, ADR 0014). The images, research files and saved versions of
-- sync go to an R2 bucket through a Cloudflare Worker (workers/files). R2 gives 10 GB free and charges
-- nothing for downloads, so these files no longer use the 500 MB and the 5 GB of egress of the free plan.
--
-- 1. A file row keeps the key, the IV and the size of its blob, and its payload is the id of the file in R2
--    (a UUID). A UUID has "-", which base64 never has, so a device can tell the two rows apart. An older
--    Vlo cannot open such a row, and skips it.
-- 2. sync_put_file registers a file that the Worker stored. Each space gets 200 MB of files, and all files
--    stop at 9 GB, under the 10 GB free tier.
-- 3. sync_put and sync_list count only the rows in Postgres for their limits.
-- 4. sync_check lets the Worker check a token before a download, and sync_files_known lets it find the
--    files that no row uses any more.

alter table public.sync_blobs add column file boolean not null default false;

create or replace function public.sync_list(
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
    -- A file row sends only its id, so its size does not count for the 8 MB of a read.
    select s.*, sum(case when s.file then 0 else s.size end) over (order by s.updated_at, s.device, s.key)
      - case when s.file then 0 else s.size end as prior
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

-- The checks of a put, for both kinds of row. Raises 'device limit' when a sixth device starts to put.
create or replace function public.sync_put_checks(p_space uuid, p_device text, p_key text, p_iv text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- A device id is 16 to 64 base64url characters, and a key is an HMAC-SHA256 in base64url.
  if p_device is null or p_device !~ '^[A-Za-z0-9_-]{16,64}$' then raise exception 'bad device'; end if;
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'bad key'; end if;
  if p_iv is null or p_iv !~ '^[A-Za-z0-9+/]{16}$' then raise exception 'bad iv'; end if;
  -- One space at a time, so two puts cannot both pass the limits of the caller.
  perform 1 from sync_spaces where id = p_space for update;
  if not exists (select 1 from sync_blobs where space_id = p_space and device = p_device)
     and (select count(distinct device) from sync_blobs where space_id = p_space) >= 5 then
    raise exception 'device limit';
  end if;
end $$;

create or replace function public.sync_put(
  p_space uuid, p_token text, p_device text, p_key text, p_payload text, p_iv text
) returns timestamptz language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old int;
  v_at timestamptz;
begin
  if not sync_open(p_space, p_token) then raise exception 'unknown space'; end if;
  perform sync_put_checks(p_space, p_device, p_key, p_iv);
  if p_payload is null or length(p_payload) = 0 then raise exception 'bad payload'; end if;
  if length(p_payload) > 2800000 then raise exception 'blob too large'; end if;
  select size into v_old from sync_blobs
  where space_id = p_space and device = p_device and key = p_key and not file;
  if (select coalesce(sum(size), 0) from sync_blobs where space_id = p_space and not file)
     - coalesce(v_old, 0) + length(p_payload) > 50000000 then
    raise exception 'space full';
  end if;
  if length(p_payload) > coalesce(v_old, 0) and sync_server_full(length(p_payload) - coalesce(v_old, 0)) then
    raise exception 'server full';
  end if;
  insert into sync_blobs (space_id, device, key, payload, iv, size, updated_at, file)
  values (p_space, p_device, p_key, p_payload, p_iv, length(p_payload), now(), false)
  on conflict (space_id, device, key) do update
    set payload = excluded.payload, iv = excluded.iv, size = excluded.size, updated_at = excluded.updated_at,
      file = false
  returning updated_at into v_at;
  return v_at;
end $$;

-- The Worker calls this after it stored a file in R2, with the true size of the file. 'files full' means
-- that the space has 200 MB of files, or that all files together near the 10 GB of the free tier.
create or replace function public.sync_put_file(
  p_space uuid, p_token text, p_device text, p_key text, p_iv text, p_file uuid, p_size int
) returns timestamptz language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_old int;
  v_at timestamptz;
begin
  if not sync_open(p_space, p_token) then raise exception 'unknown space'; end if;
  perform sync_put_checks(p_space, p_device, p_key, p_iv);
  if p_file is null then raise exception 'bad file'; end if;
  if p_size is null or p_size < 1 or p_size > 3000000 then raise exception 'blob too large'; end if;
  select size into v_old from sync_blobs
  where space_id = p_space and device = p_device and key = p_key and file;
  if (select coalesce(sum(size), 0) from sync_blobs where space_id = p_space and file)
     - coalesce(v_old, 0) + p_size > 200000000 then
    raise exception 'files full';
  end if;
  if (select coalesce(sum(size), 0) from sync_blobs where file) - coalesce(v_old, 0) + p_size > 9000000000 then
    raise exception 'files full';
  end if;
  insert into sync_blobs (space_id, device, key, payload, iv, size, updated_at, file)
  values (p_space, p_device, p_key, p_file::text, p_iv, p_size, now(), true)
  on conflict (space_id, device, key) do update
    set payload = excluded.payload, iv = excluded.iv, size = excluded.size, updated_at = excluded.updated_at,
      file = true
  returning updated_at into v_at;
  return v_at;
end $$;

-- True when the token opens the space. The Worker asks this before it gives a file.
create or replace function public.sync_check(p_space uuid, p_token text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return sync_open(p_space, p_token);
end $$;

-- The files of p_files, an array of at most 1,000 objects {space, id, size}, that a row uses with that size.
-- The Worker deletes the other files of its list. A row that names a wrong size keeps no file, so a device
-- cannot hide the size of a file from the limits above.
create or replace function public.sync_files_known(p_files jsonb)
returns table (space uuid, id uuid) language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_files is null or jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) > 1000 then
    raise exception 'bad files';
  end if;
  return query
  select distinct x.space, x.id
  from jsonb_to_recordset(p_files) as x(space uuid, id uuid, size int)
  join sync_blobs s on s.space_id = x.space and s.file and s.payload = x.id::text and s.size = x.size;
end $$;

-- Supabase gives new functions to anon and authenticated by default. Only the put functions call
-- sync_put_checks, and only the app's anon role and the Worker call the rest.
revoke all on function public.sync_put_checks from public, anon, authenticated;
revoke all on function public.sync_put_file, public.sync_check, public.sync_files_known
  from public, authenticated;
grant execute on function public.sync_put_file, public.sync_check, public.sync_files_known to anon;
