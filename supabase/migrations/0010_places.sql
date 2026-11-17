-- Places and signed-out visitors on the owner page. The daily count can carry a rough place: the country,
-- the region and the city that Vercel reads from the IP address of the request to /api/geo. The server
-- keeps only those three, never an IP address or a position on a map, and the owner page shows them only
-- as counts of devices. A value of the wrong shape becomes null, so a strange city never loses a count.

alter table public.app_pings
  add column country text,
  add column region text,
  add column city text;

drop function public.daily_count(text, text, text, boolean, date, int, int, int);
create function public.daily_count(
  p_install text, p_version text, p_device text, p_installed boolean,
  p_day date default null, p_words int default null, p_total int default null, p_projects int default null,
  p_country text default null, p_region text default null, p_city text default null
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_day date := vlo_check_day(p_day);
  -- An ISO 3166 country code, the code of a region in it, and a city name of at most 80 characters.
  v_country text := case when p_country ~ '^[A-Z]{2}$' then p_country end;
  v_region text := case when v_country is not null and p_region ~ '^[A-Z0-9]{1,3}$' then p_region end;
  v_city text := case when v_country is not null and length(btrim(p_city)) between 1 and 80
                        and p_city !~ '[[:cntrl:]|]' then btrim(p_city) end;
begin
  perform vlo_check_client(p_install, p_version, p_device);
  if p_words is not null and (p_words < 0 or p_words > 1000000) then raise exception 'bad words'; end if;
  if p_total is not null and (p_total < 0 or p_total > 100000000) then raise exception 'bad words'; end if;
  if p_projects is not null and (p_projects < 0 or p_projects > 100000) then raise exception 'bad projects'; end if;
  -- At most 50,000 installs in a day, for the whole project.
  if not exists (select 1 from app_pings where install = p_install and day = v_day)
     and (select count(*) from app_pings where day = v_day) >= 50000 then
    raise exception 'server busy';
  end if;
  insert into app_pings (install, day, user_id, app_version, device, installed, words, words_total, projects,
                         country, region, city)
  values (p_install, v_day, auth.uid(), p_version, p_device, coalesce(p_installed, false),
          coalesce(p_words, 0), p_total, p_projects, v_country, v_region, v_city)
  on conflict (install, day) do update
    set user_id = coalesce(excluded.user_id, app_pings.user_id), app_version = excluded.app_version,
        device = excluded.device, installed = excluded.installed,
        words = coalesce(p_words, app_pings.words),
        words_total = coalesce(p_total, app_pings.words_total),
        projects = coalesce(p_projects, app_pings.projects),
        -- A count with no place keeps the place of the day. A new place replaces all three parts.
        country = coalesce(v_country, app_pings.country),
        region = case when v_country is null then app_pings.region else v_region end,
        city = case when v_country is null then app_pings.city else v_city end,
        seen_at = now();
  return true;
end $$;

-- Signed-out devices and the places of the devices of the last 30 days. A signed-out device had no account
-- on any count of the period. The place of a device is its newest place. Each list holds the 10 largest,
-- as the page shows.
create function public.owner_visitors(p_today date default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_today date := vlo_check_day(p_today);
  v_out jsonb;
begin
  perform vlo_owner();
  with recent as (
    select install, day, user_id, country, region, city from app_pings where day > v_today - 30
  ),
  places as (
    select distinct on (install) country, region, city
    from recent where country is not null order by install, day desc
  )
  select jsonb_build_object(
    'signed_out_1d', (select count(*) from recent where day = v_today and user_id is null),
    'signed_out_7d', (select count(*) from (select 1 from recent where day > v_today - 7
      group by install having bool_and(user_id is null)) s),
    'signed_out_30d', (select count(*) from (select 1 from recent
      group by install having bool_and(user_id is null)) s),
    'located', (select count(*) from places),
    'countries', coalesce((select jsonb_object_agg(k, n) from
      (select country as k, count(*) as n from places group by 1 order by 2 desc, 1 limit 10) x), '{}'::jsonb),
    'regions', coalesce((select jsonb_object_agg(k, n) from
      (select country || '-' || region as k, count(*) as n from places where region is not null
       group by 1 order by 2 desc, 1 limit 10) x), '{}'::jsonb),
    'cities', coalesce((select jsonb_object_agg(k, n) from
      (select country || '|' || coalesce(region, '') || '|' || city as k, count(*) as n from places
       where city is not null group by 1 order by 2 desc, 1 limit 10) x), '{}'::jsonb)
  ) into v_out;
  return v_out;
end $$;

revoke all on function public.daily_count, public.owner_visitors from public, anon, authenticated;
grant execute on function public.daily_count to anon, authenticated;
grant execute on function public.owner_visitors to authenticated;
