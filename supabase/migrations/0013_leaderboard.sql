-- The writing leaderboard (ADR 0012). Each signed-in writer sees the writers who added the most words today,
-- this week, this month and this year. The words come from the daily count (migrations 0008 and 0009), which
-- is always on. A writer shows by the pen name, or else the name of the greeting, with the photo, and can
-- leave the board. As before, the tables stay closed, and only these functions reach them, for a signed-in
-- account.

alter table public.profiles add column on_leaderboard boolean not null default true;

-- The places of a period, from the first: at most 50 writers, and the signed-in writer at its own place.
-- The words of a writer on a day are the most that any of its devices counted, as on the owner page. Only
-- the first 10 and the signed-in writer carry a photo, so a call stays small. A week starts on Monday.
create or replace function public.leaderboard(p_period text, p_today date default null)
returns table (place int, name text, photo text, words int, me boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := vlo_account();
  v_today date := vlo_check_day(p_today);
  v_from date := case p_period
    when 'day' then v_today
    when 'week' then date_trunc('week', v_today)::date
    when 'month' then date_trunc('month', v_today)::date
    when 'year' then date_trunc('year', v_today)::date
  end;
begin
  if v_from is null then raise exception 'bad period'; end if;
  return query
  with days as (
    select p.user_id, p.day, max(p.words) as words
    from app_pings p
    where p.user_id is not null and p.day between v_from and v_today
    group by 1, 2
  ),
  totals as (
    select d.user_id, sum(d.words)::int as words from days d group by 1 having sum(d.words) > 0
  ),
  ranked as (
    select t.user_id, t.words, pr.name, pr.called, pr.pen_name, pr.photo,
      rank() over (order by t.words desc)::int as place,
      row_number() over (order by t.words desc, pr.updated_at) as n
    from totals t join profiles pr on pr.user_id = t.user_id and pr.on_leaderboard
  )
  select r.place,
    coalesce(nullif(r.pen_name, ''), nullif(r.called, ''), split_part(r.name, ' ', 1)),
    case when r.n <= 10 or r.user_id = v_uid then r.photo end,
    r.words,
    r.user_id = v_uid
  from ranked r
  where r.n <= 50 or r.user_id = v_uid
  order by r.n;
end $$;

-- Puts the signed-in writer on the board or takes it off, and gives the choice. Null only reads it. An
-- account with no profile is never on the board, and gets false.
create or replace function public.leaderboard_show(p_on boolean default null) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := vlo_account();
  v_on boolean;
begin
  if p_on is not null then
    update profiles set on_leaderboard = p_on where user_id = v_uid;
  end if;
  select pr.on_leaderboard into v_on from profiles pr where pr.user_id = v_uid;
  return coalesce(v_on, false);
end $$;

revoke all on function public.leaderboard, public.leaderboard_show from public, anon, authenticated;
grant execute on function public.leaderboard, public.leaderboard_show to authenticated;
