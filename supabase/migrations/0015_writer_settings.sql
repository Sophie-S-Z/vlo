-- The writer's settings that go with the account (ADR 0013, Phase 19 Task E1): the pinned toolbar tools
-- and the writer's own keys, one row for each account. The browser checks each part. The server keeps a
-- JSON object of at most 16,000 characters and the time of the change on the device, so the newer copy
-- wins between devices. As in the migrations before, the table has row level security with no policies,
-- and only the functions below reach it.

create table public.writer_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null,
  changed_at bigint not null,
  updated_at timestamptz not null default now()
);

alter table public.writer_settings enable row level security;
-- No policies: the anon and authenticated roles cannot read or write the table directly.

-- The settings of the signed-in account, or no row.
create or replace function public.writer_settings_get()
returns table (settings jsonb, changed_at bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := vlo_account();
begin
  return query select w.settings, w.changed_at from writer_settings w where w.user_id = v_uid;
end $$;

-- Saves the settings of the signed-in account, unless the server has a copy from a later change. Returns
-- true when it saved them.
create or replace function public.writer_settings_put(p_settings jsonb, p_changed_at bigint)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := vlo_account();
begin
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' or length(p_settings::text) > 16000 then
    raise exception 'bad settings';
  end if;
  if p_changed_at is null or p_changed_at < 0 then raise exception 'bad time'; end if;
  insert into writer_settings (user_id, settings, changed_at) values (v_uid, p_settings, p_changed_at)
  on conflict (user_id) do update
    set settings = excluded.settings, changed_at = excluded.changed_at, updated_at = now()
    where writer_settings.changed_at < excluded.changed_at;
  return found;
end $$;

revoke all on function public.writer_settings_get, public.writer_settings_put from public, anon, authenticated;
grant execute on function public.writer_settings_get, public.writer_settings_put to authenticated;
