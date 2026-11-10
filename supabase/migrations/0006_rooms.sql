-- Sprint rooms (roadmap F60, plan Task K7, decision K7). Friends sprint together with a six-letter code.
-- A room holds at most 20 writers and ends 24 hours after someone makes it. The server keeps only a
-- nickname, a word count and a random member id for each writer: never a title, a word of text or an
-- account.

create table public.sprint_rooms (
  code text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

create table public.sprint_members (
  code text not null references public.sprint_rooms(code) on delete cascade,
  -- A 16-byte random id in base64url. No function gives it back, so no one can post for another writer.
  member text not null,
  nickname text not null,
  words int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (code, member)
);

create index sprint_rooms_created_at on public.sprint_rooms (created_at);
create index sprint_rooms_expires_at on public.sprint_rooms (expires_at);

alter table public.sprint_rooms enable row level security;
alter table public.sprint_members enable row level security;
-- No policies: the anon role cannot read or write the tables directly.

-- The writers of a room, most words first. `mine` marks the row of the writer who asks.
create or replace function public.room_standings(p_code text, p_member text)
returns table (nickname text, words int, mine boolean)
language sql security definer set search_path = public, pg_temp as $$
  select m.nickname, m.words, m.member = p_member from sprint_members m
  where m.code = p_code order by m.words desc, m.updated_at;
$$;

-- True when the room exists and has not ended. Only the functions below call it.
create or replace function public.room_open(p_code text)
returns boolean language sql security definer set search_path = public, pg_temp as $$
  select coalesce(p_code ~ '^[A-HJ-NP-Z]{6}$', false) and exists (
    select 1 from sprint_rooms where code = p_code and expires_at > now()
  );
$$;

-- A new room with a random code of six letters, with no I or O.
create or replace function public.room_create()
returns text language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_letters constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes bytea;
  v_code text;
begin
  -- At most 60 new rooms in an hour, for the whole project.
  if (select count(*) from sprint_rooms where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'server busy';
  end if;
  loop
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_letters, get_byte(v_bytes, i) % 24 + 1, 1);
    end loop;
    exit when not exists (select 1 from sprint_rooms where code = v_code);
  end loop;
  insert into sprint_rooms (code) values (v_code);
  return v_code;
end $$;

-- A writer joins a room, or changes their nickname in it.
create or replace function public.room_join(p_code text, p_member text, p_nickname text)
returns table (nickname text, words int, mine boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not room_open(p_code) then raise exception 'unknown room'; end if;
  if p_member is null or p_member !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'bad member'; end if;
  if p_nickname is null or p_nickname !~ '^[^[:cntrl:]]{1,24}$' or p_nickname <> btrim(p_nickname) then
    raise exception 'bad nickname';
  end if;
  -- One room at a time, so two joins cannot both pass the limit below.
  perform 1 from sprint_rooms where code = p_code for update;
  if not exists (select 1 from sprint_members m where m.code = p_code and m.member = p_member)
     and (select count(*) from sprint_members m where m.code = p_code) >= 20 then
    raise exception 'room full';
  end if;
  insert into sprint_members (code, member, nickname) values (p_code, p_member, p_nickname)
  on conflict (code, member) do update set nickname = excluded.nickname, updated_at = now();
  return query select * from room_standings(p_code, p_member);
end $$;

-- A writer posts the words of their sprint and gets the standings back.
create or replace function public.room_post(p_code text, p_member text, p_words int)
returns table (nickname text, words int, mine boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not room_open(p_code) then raise exception 'unknown room'; end if;
  if p_words is null or p_words < 0 or p_words > 1000000 then raise exception 'bad words'; end if;
  update sprint_members m set words = p_words, updated_at = now()
  where m.code = p_code and m.member = p_member;
  if not found then raise exception 'unknown room'; end if;
  return query select * from room_standings(p_code, p_member);
end $$;

-- Free plan care: a room goes with its writers once it ends.
create or replace function public.cleanup_rooms() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count int;
begin
  delete from sprint_rooms where expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('vlo-cleanup-rooms', '47 3 * * *', 'select public.cleanup_rooms()');
  end if;
end $$;

-- Supabase gives new functions to anon and authenticated by default. Only the functions call the helpers,
-- only the database owner and pg_cron run the cleanup, and only the app's anon role calls the rest.
revoke all on function public.room_standings, public.room_open, public.cleanup_rooms
  from public, anon, authenticated;
revoke all on function public.room_create, public.room_join, public.room_post from public, authenticated;
grant execute on function public.room_create, public.room_join, public.room_post to anon;
