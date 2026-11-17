-- The writer's profile (ADR 0011): a name for each account, the name Vlo greets them by, a pen name, a short
-- bio and a small photo. One row for each account, which goes with the account. The photo is a square
-- JPEG or WebP of at most 256 pixels that the browser makes, in a data URL of at most 60,000 characters,
-- so 10,000 accounts with a photo take less than 600 MB. As in the migrations before, the table has row
-- level security with no policies, and only the functions below reach it.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  called text not null default '',
  pen_name text not null default '',
  bio text not null default '',
  photo text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
-- No policies: the anon and authenticated roles cannot read or write the table directly.

-- The profile of the signed-in account, or no row.
create or replace function public.profile_get()
returns table (name text, called text, pen_name text, bio text, photo text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := vlo_account();
begin
  return query
  select p.name, p.called, p.pen_name, p.bio, p.photo, p.updated_at from profiles p where p.user_id = v_uid;
end $$;

-- A text of at most p_max characters with no control character. A bio can hold line breaks.
create or replace function public.vlo_check_text(p_text text, p_max int, p_lines boolean, p_what text)
returns text language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_text text := btrim(coalesce(p_text, ''));
  v_bad text := case when p_lines then '[\x01-\x09\x0b-\x1f\x7f]' else '[[:cntrl:]]' end;
begin
  if length(v_text) > p_max or v_text ~ v_bad then raise exception 'bad %', p_what; end if;
  return v_text;
end $$;

-- Saves the profile of the signed-in account. Each call sends the whole profile, so a null photo removes it.
create or replace function public.profile_put(
  p_name text, p_called text, p_pen_name text, p_bio text, p_photo text
) returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := vlo_account();
  v_name text := vlo_check_text(p_name, 80, false, 'name');
  v_at timestamptz := now();
begin
  if v_name = '' then raise exception 'bad name'; end if;
  if p_photo is not null and (length(p_photo) > 60000
     or p_photo !~ '^data:image/(jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$') then
    raise exception 'bad photo';
  end if;
  insert into profiles (user_id, name, called, pen_name, bio, photo, updated_at)
  values (v_uid, v_name, vlo_check_text(p_called, 40, false, 'called'),
    vlo_check_text(p_pen_name, 80, false, 'pen name'), vlo_check_text(p_bio, 1000, true, 'bio'), p_photo, v_at)
  on conflict (user_id) do update
    set name = excluded.name, called = excluded.called, pen_name = excluded.pen_name, bio = excluded.bio,
      photo = excluded.photo, updated_at = excluded.updated_at;
  return v_at;
end $$;

-- The owner page shows the name of each account next to its email. The rest is as in migration 0009.
drop function public.owner_accounts(date);
create function public.owner_accounts(p_today date default null)
returns table (
  id uuid, email text, name text, provider text, created_at timestamptz, last_sign_in_at timestamptz,
  last_active date, devices int, syncing boolean, feedback int, days_30d int, words_30d int,
  words_total int, projects int
)
language plpgsql stable security definer set search_path = public, auth, pg_temp as $$
declare v_today date := vlo_check_day(p_today);
begin
  perform vlo_owner();
  return query
  with mine as (
    select p.user_id, p.day, max(p.words) as words, max(p.words_total) as total, max(p.projects) as projects
    from app_pings p where p.user_id is not null and p.day > v_today - 30 group by 1, 2
  ),
  latest as (
    select distinct on (m.user_id) m.user_id, m.total, m.projects
    from mine m where m.total is not null order by m.user_id, m.day desc
  )
  select u.id, u.email::text, pr.name, coalesce(u.raw_app_meta_data->>'provider', 'email'), u.created_at,
    u.last_sign_in_at,
    (select max(p.day) from app_pings p where p.user_id = u.id),
    (select count(distinct p.install)::int from app_pings p where p.user_id = u.id and p.day > v_today - 30),
    exists (select 1 from sync_vaults v where v.user_id = u.id),
    (select count(*)::int from app_feedback f where f.user_id = u.id),
    (select count(*)::int from mine m where m.user_id = u.id),
    (select coalesce(sum(m.words), 0)::int from mine m where m.user_id = u.id),
    l.total, l.projects
  from auth.users u left join latest l on l.user_id = u.id left join profiles pr on pr.user_id = u.id
  order by 7 desc nulls last, u.created_at desc
  limit 2000;
end $$;

revoke all on function public.profile_get, public.vlo_check_text, public.profile_put, public.owner_accounts
  from public, anon, authenticated;
grant execute on function public.profile_get, public.profile_put, public.owner_accounts to authenticated;
