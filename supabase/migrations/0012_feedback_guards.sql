-- Feedback guards and a note to Sophie. A writer can send a personal note to the owner as a new kind of
-- feedback. The server refuses spam: a pause of 30 seconds between messages, no message twice in a day, at
-- most 10 messages in a day from an install or an account, and at most 20 from an internet address. The
-- owner can block the sender of a message. The server keeps only an md5 key of the address, and the daily
-- clean-up removes that key after 2 days. A block keeps its key until the owner removes the block.

alter table public.app_feedback add column sender_key text;
create index app_feedback_user on public.app_feedback (user_id, created_at) where user_id is not null;
create index app_feedback_sender on public.app_feedback (sender_key, created_at) where sender_key is not null;

create table public.app_feedback_blocks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  install text,
  user_id uuid,
  sender_key text
);
alter table public.app_feedback_blocks enable row level security;
-- No policies: the anon and authenticated roles cannot read or write the table directly.

-- The key of the internet address of the request, or null when PostgREST gives no address.
create or replace function public.vlo_sender_key() returns text
language plpgsql stable set search_path = public, pg_temp as $$
declare v_ip text := btrim(split_part(
  coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json->>'x-forwarded-for', ',', 1));
begin
  return case when coalesce(v_ip, '') = '' then null else md5('vlo-feedback:' || v_ip) end;
end $$;

create or replace function public.send_feedback(
  p_install text, p_kind text, p_message text, p_rating int, p_contact text,
  p_version text, p_device text, p_place text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
  v_key text := vlo_sender_key();
  v_message text := btrim(coalesce(p_message, ''));
  v_contact text := nullif(btrim(coalesce(p_contact, '')), '');
  v_recent int;
  v_same int;
  v_mine int;
  v_all int;
begin
  perform vlo_check_client(p_install, p_version, p_device);
  if p_kind is null or p_kind not in ('idea', 'problem', 'praise', 'question', 'note') then
    raise exception 'bad kind';
  end if;
  if length(v_message) = 0 then raise exception 'empty message'; end if;
  if length(v_message) > 4000 then raise exception 'message too large'; end if;
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then raise exception 'bad rating'; end if;
  if v_contact is not null and length(v_contact) > 200 then raise exception 'contact too large'; end if;
  if p_place is null or p_place !~ '^[a-z0-9-]{0,40}$' then raise exception 'bad place'; end if;
  if exists (select 1 from app_feedback_blocks b
      where b.install = p_install or b.user_id = v_uid or b.sender_key = v_key) then
    raise exception 'feedback blocked';
  end if;
  -- The messages of this sender in the last day: the same install, account or internet address.
  select count(*) filter (where f.created_at > now() - interval '30 seconds'),
    count(*) filter (where f.message = v_message),
    count(*) filter (where f.install = p_install or f.user_id = v_uid),
    count(*)
  into v_recent, v_same, v_mine, v_all
  from app_feedback f
  where f.created_at > now() - interval '1 day'
    and (f.install = p_install or f.user_id = v_uid or f.sender_key = v_key);
  if v_recent > 0 then raise exception 'feedback too fast'; end if;
  if v_same > 0 then raise exception 'feedback duplicate'; end if;
  if v_mine >= 10 or v_all >= 20 then raise exception 'feedback limit'; end if;
  if (select count(*) from app_feedback where created_at > now() - interval '1 day') >= 500 then
    raise exception 'server busy';
  end if;
  insert into app_feedback (user_id, install, kind, message, rating, contact, app_version, device, place,
    sender_key)
  values (v_uid, p_install, p_kind, v_message, p_rating, v_contact, p_version, p_device, p_place, v_key)
  returning id into v_id;
  return v_id;
end $$;

-- The owner's inbox, with a flag for a message from a blocked sender.
drop function public.owner_feedback();
create function public.owner_feedback()
returns table (
  id uuid, created_at timestamptz, kind text, message text, rating smallint, contact text, email text,
  app_version text, device text, place text, status text, note text, blocked boolean
)
language plpgsql stable security definer set search_path = public, auth, pg_temp as $$
begin
  perform vlo_owner();
  return query
  select f.id, f.created_at, f.kind, f.message, f.rating, f.contact, u.email::text, f.app_version, f.device,
    f.place, f.status, f.note,
    exists (select 1 from app_feedback_blocks b
      where b.install = f.install or b.user_id = f.user_id or b.sender_key = f.sender_key)
  from app_feedback f left join auth.users u on u.id = f.user_id
  order by f.created_at desc
  limit 2000;
end $$;

-- Blocks or unblocks the sender of a message: its install, its account and its internet address.
create or replace function public.owner_block_sender(p_id uuid, p_blocked boolean)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare f app_feedback;
begin
  perform vlo_owner();
  select * into f from app_feedback where id = p_id;
  if not found then return false; end if;
  delete from app_feedback_blocks b
  where b.install = f.install or b.user_id = f.user_id or b.sender_key = f.sender_key;
  if p_blocked then
    insert into app_feedback_blocks (install, user_id, sender_key) values (f.install, f.user_id, f.sender_key);
  end if;
  return true;
end $$;

-- The daily clean-up of migration 0008 also removes the address keys that are older than 2 days.
create or replace function public.cleanup_pings() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count int;
begin
  delete from app_pings where day < vlo_today() - 400;
  get diagnostics v_count = row_count;
  update app_feedback set sender_key = null
  where sender_key is not null and created_at < now() - interval '2 days';
  return v_count;
end $$;

revoke all on function public.vlo_sender_key, public.send_feedback, public.owner_feedback,
  public.owner_block_sender, public.cleanup_pings from public, anon, authenticated;
grant execute on function public.send_feedback to anon, authenticated;
grant execute on function public.owner_feedback, public.owner_block_sender to authenticated;
