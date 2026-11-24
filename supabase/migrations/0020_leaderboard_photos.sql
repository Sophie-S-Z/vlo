-- Leaderboard photos once (ADR 0016). An open leaderboard loads again each minute, and each load carried up to
-- 11 profile photos of about 15 KB, so one open page took about 10 MB of egress an hour. Each row now
-- carries a photo_id, the MD5 of its photo, and a load sends a photo only when the device does not name
-- its id in p_have. A device of an older Vlo names none, and gets every photo, as before.
--
-- The return type changes, so the function goes and comes back with its grant.

drop function public.leaderboard(text, date);

create function public.leaderboard(p_period text, p_today date default null, p_have text[] default null)
returns table (place int, name text, photo text, photo_id text, words int, me boolean)
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
  -- At most one id for each row of a board.
  if cardinality(p_have) > 51 then raise exception 'bad photos'; end if;
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
  ),
  shown as (
    select r.*, case when r.n <= 10 or r.user_id = v_uid then r.photo end as face from ranked r
    where r.n <= 50 or r.user_id = v_uid
  )
  select s.place,
    coalesce(nullif(s.pen_name, ''), nullif(s.called, ''), split_part(s.name, ' ', 1)),
    case when md5(s.face) = any(coalesce(p_have, '{}')) then null else s.face end,
    md5(s.face),
    s.words,
    s.user_id = v_uid
  from shown s
  order by s.n;
end $$;

revoke all on function public.leaderboard from public, anon, authenticated;
grant execute on function public.leaderboard to authenticated;
