-- Sealed data as bytes (ADR 0016). Sync blobs, share links and their images arrive as base64 text, which
-- is a third larger than the bytes that it holds. Postgres cannot compress cipher text, so the tables kept
-- that third. Now they keep the bytes, and the functions give base64 again, so the app does not change and
-- an older Vlo keeps working. The limits still count base64 characters, as the app does.
--
-- Share links also stop when the whole database nears the 500 MB of the free plan, as sync does since
-- migration 0017. Before, shares had only their own 300 MB, which sync data did not count.
--
-- Share comments stay text: each is at most 20,000 characters.

-- The base64 of bytes, on one line. encode() breaks its output every 76 characters.
create or replace function public.vlo_b64(p_bytes bytea) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select translate(encode(p_bytes, 'base64'), E'\n', '');
$$;

-- The count of base64 characters that a length in bytes needs, for the limits.
create or replace function public.vlo_b64_length(p_bytes bigint) returns bigint
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select (p_bytes + 2) / 3 * 4;
$$;

-- For the change of the rows below only. A row that is no base64 keeps its characters as bytes.
create function pg_temp.unbase64(p_text text) returns bytea language plpgsql as $$
begin
  return decode(p_text, 'base64');
exception when others then
  return convert_to(p_text, 'UTF8');
end $$;

-- A file row of migration 0018 keeps its file id as the 16 bytes of the UUID.
alter table public.sync_blobs alter column payload type bytea
  using case when file then uuid_send(payload::uuid) else pg_temp.unbase64(payload) end;
alter table public.shares alter column payload type bytea using pg_temp.unbase64(payload);
alter table public.share_images alter column payload type bytea using pg_temp.unbase64(payload);

-- Sync (migrations 0005, 0017 and 0018).

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
  select b.device, b.key,
    case when b.file then encode(b.payload, 'hex')::uuid::text else vlo_b64(b.payload) end,
    b.iv, b.updated_at
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

-- As in migration 0018. The size stays the count of base64 characters that the device sent.
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
  values (p_space, p_device, p_key, decode(p_payload, 'base64'), p_iv, length(p_payload), now(), false)
  on conflict (space_id, device, key) do update
    set payload = excluded.payload, iv = excluded.iv, size = excluded.size, updated_at = excluded.updated_at,
      file = false
  returning updated_at into v_at;
  return v_at;
end $$;

-- As in migration 0018.
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
  values (p_space, p_device, p_key, uuid_send(p_file), p_iv, p_size, now(), true)
  on conflict (space_id, device, key) do update
    set payload = excluded.payload, iv = excluded.iv, size = excluded.size, updated_at = excluded.updated_at,
      file = true
  returning updated_at into v_at;
  return v_at;
end $$;

-- As in migration 0018.
create or replace function public.sync_files_known(p_files jsonb)
returns table (space uuid, id uuid) language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_files is null or jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) > 1000 then
    raise exception 'bad files';
  end if;
  return query
  select distinct x.space, x.id
  from jsonb_to_recordset(p_files) as x(space uuid, id uuid, size int)
  join sync_blobs s on s.space_id = x.space and s.file and s.payload = uuid_send(x.id) and s.size = x.size;
end $$;

-- Share links (migrations 0001, 0004 and 0007).

create or replace function public.create_share(p_payload text, p_iv text, p_owner_token text, p_days int)
returns uuid language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_id uuid;
begin
  if length(p_payload) > 2800000 then raise exception 'payload too large'; end if;
  if p_days not in (1, 7, 14, 30) then raise exception 'bad expiry'; end if;
  -- A 12-byte IV in base64 is 16 characters. A 32-byte owner token in base64url is 43.
  if p_iv is null or p_iv !~ '^[A-Za-z0-9+/]{16}$' then raise exception 'bad iv'; end if;
  if p_owner_token is null or p_owner_token !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'bad owner token'; end if;
  if p_payload is null or length(p_payload) = 0 then raise exception 'bad payload'; end if;
  -- At most 120 new links in an hour, for the whole project.
  if (select count(*) from shares where created_at > now() - interval '1 hour') >= 120 then
    raise exception 'server busy';
  end if;
  -- At most 300 MB of sealed text and images in all, in base64 characters, and room in the database.
  if (select coalesce(sum(vlo_b64_length(octet_length(payload))), 0) from shares)
     + (select coalesce(sum(vlo_b64_length(octet_length(payload))), 0) from share_images)
     + length(p_payload) > 300000000
     or sync_server_full(length(p_payload)) then
    raise exception 'server full';
  end if;
  insert into shares (owner_token_hash, payload, iv, expires_at)
  values (encode(extensions.digest(p_owner_token, 'sha256'), 'hex'), decode(p_payload, 'base64'), p_iv,
    now() + make_interval(days => p_days))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.get_share(p_id uuid)
returns table (payload text, iv text, expires_at timestamptz, status text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  select case when s.revoked or s.expires_at < now() then null else vlo_b64(s.payload) end,
         case when s.revoked or s.expires_at < now() then null else s.iv end,
         s.expires_at,
         case when s.revoked then 'revoked' when s.expires_at < now() then 'expired' else 'ok' end
  from shares s where s.id = p_id;
end $$;

create or replace function public.add_share_image(
  p_id uuid, p_owner_token text, p_n int, p_payload text, p_iv text
) returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_text bigint;
begin
  if p_owner_token is null or p_owner_token !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'bad owner token'; end if;
  if p_iv is null or p_iv !~ '^[A-Za-z0-9+/]{16}$' then raise exception 'bad iv'; end if;
  if p_n is null or p_n < 0 or p_n >= 200 then raise exception 'bad image number'; end if;
  if p_payload is null or length(p_payload) = 0 then raise exception 'bad payload'; end if;
  if length(p_payload) > 2800000 then raise exception 'image too large'; end if;
  -- One link at a time, so two calls cannot both pass the limits below.
  select vlo_b64_length(octet_length(payload)) into v_text from shares
  where id = p_id and not revoked and expires_at > now()
    and owner_token_hash = encode(extensions.digest(p_owner_token, 'sha256'), 'hex')
  for update;
  if v_text is null then raise exception 'share unavailable'; end if;
  if v_text + length(p_payload)
     + (select coalesce(sum(vlo_b64_length(octet_length(payload))), 0) from share_images
        where share_id = p_id and n <> p_n)
     > 27000000 then
    raise exception 'share too large';
  end if;
  if (select coalesce(sum(vlo_b64_length(octet_length(payload))), 0) from shares)
     + (select coalesce(sum(vlo_b64_length(octet_length(payload))), 0) from share_images
        where not (share_id = p_id and n = p_n))
     + length(p_payload) > 300000000
     or sync_server_full(length(p_payload)) then
    raise exception 'server full';
  end if;
  insert into share_images (share_id, n, payload, iv) values (p_id, p_n, decode(p_payload, 'base64'), p_iv)
  on conflict (share_id, n) do update set payload = excluded.payload, iv = excluded.iv;
  return true;
end $$;

create or replace function public.get_share_image(p_id uuid, p_n int)
returns table (payload text, iv text)
language sql security definer set search_path = public, pg_temp as $$
  select vlo_b64(i.payload), i.iv from share_images i
  join shares s on s.id = i.share_id
  where i.share_id = p_id and i.n = p_n and not s.revoked and s.expires_at > now();
$$;

-- Supabase gives new functions to anon and authenticated by default. Only the functions above call the
-- two helpers. create or replace keeps the grants of the other functions.
revoke all on function public.vlo_b64, public.vlo_b64_length from public, anon, authenticated;
