-- Vlo share links (spec section 11, plan Task E1). The text of spec section 11, word for word.
-- The server stores only ciphertext, the IV and a SHA-256 of the owner token.

create extension if not exists pgcrypto with schema extensions;

create table public.shares (
  id uuid primary key default gen_random_uuid(),
  owner_token_hash text not null,
  payload text not null,
  iv text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked boolean not null default false
);

create table public.share_comments (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.shares(id) on delete cascade,
  payload text not null,
  iv text not null,
  created_at timestamptz not null default now()
);

alter table public.shares enable row level security;
alter table public.share_comments enable row level security;
-- No policies: the anon role cannot read or write tables directly.

create or replace function public.create_share(p_payload text, p_iv text, p_owner_token text, p_days int)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if length(p_payload) > 2800000 then raise exception 'payload too large'; end if;
  if p_days not in (1, 7, 14, 30) then raise exception 'bad expiry'; end if;
  insert into shares (owner_token_hash, payload, iv, expires_at)
  values (encode(extensions.digest(p_owner_token, 'sha256'), 'hex'), p_payload, p_iv, now() + make_interval(days => p_days))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.get_share(p_id uuid)
returns table (payload text, iv text, expires_at timestamptz, status text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  select case when s.revoked or s.expires_at < now() then null else s.payload end,
         case when s.revoked or s.expires_at < now() then null else s.iv end,
         s.expires_at,
         case when s.revoked then 'revoked' when s.expires_at < now() then 'expired' else 'ok' end
  from shares s where s.id = p_id;
end $$;

create or replace function public.revoke_share(p_id uuid, p_owner_token text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  update shares set revoked = true
  where id = p_id and owner_token_hash = encode(extensions.digest(p_owner_token, 'sha256'), 'hex');
  return found;
end $$;

create or replace function public.add_comment(p_share_id uuid, p_payload text, p_iv text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if length(p_payload) > 20000 then raise exception 'comment too large'; end if;
  if not exists (select 1 from shares where id = p_share_id and not revoked and expires_at > now()) then
    raise exception 'share unavailable';
  end if;
  if (select count(*) from share_comments where share_id = p_share_id) >= 500 then
    raise exception 'comment limit reached';
  end if;
  insert into share_comments (share_id, payload, iv) values (p_share_id, p_payload, p_iv) returning id into v_id;
  return v_id;
end $$;

create or replace function public.list_comments(p_share_id uuid)
returns table (id uuid, payload text, iv text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select c.id, c.payload, c.iv, c.created_at from share_comments c
  join shares s on s.id = c.share_id
  where c.share_id = p_share_id and not s.revoked
  order by c.created_at;
$$;

create or replace function public.ping() returns int language sql as $$ select 1 $$;

revoke all on function public.create_share, public.get_share, public.revoke_share,
  public.add_comment, public.list_comments from public;
grant execute on function public.create_share, public.get_share, public.revoke_share,
  public.add_comment, public.list_comments, public.ping to anon;
