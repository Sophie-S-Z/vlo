-- Limits for a public anon key (Gate 5 security review, plan Task E6). Anyone can read the anon key from
-- the app, so each function checks the shape of its input, and the whole project has caps that keep the
-- free database under its 500 MB. A share that gets refused says "server busy" or "server full", and
-- the app asks the writer to try again later.

-- The counts below look at recent rows only.
create index if not exists shares_created_at on public.shares (created_at);
create index if not exists share_comments_created_at on public.share_comments (created_at);

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
  -- At most 300 MB of sealed text in all, so comments and usage reports keep room.
  if (select coalesce(sum(length(payload)), 0) from shares) + length(p_payload) > 300000000 then
    raise exception 'server full';
  end if;
  insert into shares (owner_token_hash, payload, iv, expires_at)
  values (encode(extensions.digest(p_owner_token, 'sha256'), 'hex'), p_payload, p_iv, now() + make_interval(days => p_days))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.revoke_share(p_id uuid, p_owner_token text)
returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if p_owner_token is null or p_owner_token !~ '^[A-Za-z0-9_-]{43}$' then return false; end if;
  update shares set revoked = true
  where id = p_id and owner_token_hash = encode(extensions.digest(p_owner_token, 'sha256'), 'hex');
  return found;
end $$;

create or replace function public.add_comment(p_share_id uuid, p_payload text, p_iv text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if length(p_payload) > 20000 then raise exception 'comment too large'; end if;
  if p_payload is null or length(p_payload) = 0 then raise exception 'bad payload'; end if;
  if p_iv is null or p_iv !~ '^[A-Za-z0-9+/]{16}$' then raise exception 'bad iv'; end if;
  if not exists (select 1 from shares where id = p_share_id and not revoked and expires_at > now()) then
    raise exception 'share unavailable';
  end if;
  if (select count(*) from share_comments where share_id = p_share_id) >= 500 then
    raise exception 'comment limit reached';
  end if;
  -- At most 600 new comments in an hour, for the whole project.
  if (select count(*) from share_comments where created_at > now() - interval '1 hour') >= 600 then
    raise exception 'server busy';
  end if;
  insert into share_comments (share_id, payload, iv) values (p_share_id, p_payload, p_iv) returning id into v_id;
  return v_id;
end $$;

alter function public.get_share(uuid) set search_path = public, pg_temp;
alter function public.list_comments(uuid) set search_path = public, pg_temp;
alter function public.submit_usage(text, text, jsonb) set search_path = public, pg_temp;
alter function public.cleanup_shares() set search_path = public, pg_temp;
alter function public.ping() set search_path = public, pg_temp;

-- At most 2,000 usage reports in a week, for the whole project. A trigger checks it, so submit_usage
-- stays as 0002 wrote it.
create or replace function public.usage_cap() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (select count(*) from usage_reports where created_at > now() - interval '7 days') >= 2000 then
    raise exception 'server busy';
  end if;
  return new;
end $$;
revoke all on function public.usage_cap from public;

drop trigger if exists usage_cap on public.usage_reports;
create trigger usage_cap before insert on public.usage_reports
  for each row execute function public.usage_cap();
create index if not exists usage_reports_created_at on public.usage_reports (created_at);

-- Supabase gives new functions to anon and authenticated by default. Only the database owner and
-- pg_cron run the cleanup, and only the app's anon role calls the others.
revoke execute on function public.cleanup_shares from anon, authenticated;
revoke execute on function public.usage_cap from anon, authenticated;
revoke execute on function public.create_share, public.get_share, public.revoke_share,
  public.add_comment, public.list_comments, public.submit_usage from authenticated;
