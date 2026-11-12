-- The images of a share link (Phase 16, decision G6). Each image is a row of its own, sealed with the
-- share key in the browser, so the server stores only ciphertext and an IV, as for the text. A link's text
-- and its images come to at most 27,000,000 base64 characters, which is 20 MB of sealed bytes. A row goes
-- with its share: a stop hides it at once, and the cleanup of an old share deletes it.

create table if not exists public.share_images (
  share_id uuid not null references public.shares(id) on delete cascade,
  n int not null,
  payload text not null,
  iv text not null,
  created_at timestamptz not null default now(),
  primary key (share_id, n)
);

alter table public.share_images enable row level security;
-- No policies: the anon role cannot read or write the table directly.

-- Only the link's owner adds an image, while the link is open. A second call for the same number
-- replaces the image, so a lost answer can be sent again.
create or replace function public.add_share_image(
  p_id uuid, p_owner_token text, p_n int, p_payload text, p_iv text
) returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_text int;
begin
  if p_owner_token is null or p_owner_token !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'bad owner token'; end if;
  if p_iv is null or p_iv !~ '^[A-Za-z0-9+/]{16}$' then raise exception 'bad iv'; end if;
  if p_n is null or p_n < 0 or p_n >= 200 then raise exception 'bad image number'; end if;
  if p_payload is null or length(p_payload) = 0 then raise exception 'bad payload'; end if;
  if length(p_payload) > 2800000 then raise exception 'image too large'; end if;
  -- One link at a time, so two calls cannot both pass the limits below.
  select length(payload) into v_text from shares
  where id = p_id and not revoked and expires_at > now()
    and owner_token_hash = encode(extensions.digest(p_owner_token, 'sha256'), 'hex')
  for update;
  if v_text is null then raise exception 'share unavailable'; end if;
  if v_text + length(p_payload)
     + (select coalesce(sum(length(payload)), 0) from share_images where share_id = p_id and n <> p_n)
     > 27000000 then
    raise exception 'share too large';
  end if;
  -- The 300 MB for all shares (migration 0004) counts their images too.
  if (select coalesce(sum(length(payload)), 0) from shares)
     + (select coalesce(sum(length(payload)), 0) from share_images where not (share_id = p_id and n = p_n))
     + length(p_payload) > 300000000 then
    raise exception 'server full';
  end if;
  insert into share_images (share_id, n, payload, iv) values (p_id, p_n, p_payload, p_iv)
  on conflict (share_id, n) do update set payload = excluded.payload, iv = excluded.iv;
  return true;
end $$;

-- An image of an open link. A stopped or expired link gives no row.
create or replace function public.get_share_image(p_id uuid, p_n int)
returns table (payload text, iv text)
language sql security definer set search_path = public, pg_temp as $$
  select i.payload, i.iv from share_images i
  join shares s on s.id = i.share_id
  where i.share_id = p_id and i.n = p_n and not s.revoked and s.expires_at > now();
$$;

-- The 300 MB for all shares counts the images too, so a new link cannot take the room that images use.
-- The rest of create_share stays as in migration 0004.
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
  -- At most 300 MB of sealed text and images in all, so comments and usage reports keep room.
  if (select coalesce(sum(length(payload)), 0) from shares)
     + (select coalesce(sum(length(payload)), 0) from share_images)
     + length(p_payload) > 300000000 then
    raise exception 'server full';
  end if;
  insert into shares (owner_token_hash, payload, iv, expires_at)
  values (encode(extensions.digest(p_owner_token, 'sha256'), 'hex'), p_payload, p_iv, now() + make_interval(days => p_days))
  returning id into v_id;
  return v_id;
end $$;

-- Supabase gives new functions to anon and authenticated by default. Only the app's anon role calls them.
revoke all on function public.add_share_image, public.get_share_image from public, authenticated;
revoke all on function public.create_share from public, authenticated;
grant execute on function public.add_share_image, public.get_share_image, public.create_share to anon;
