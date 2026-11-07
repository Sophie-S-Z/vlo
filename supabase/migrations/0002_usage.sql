-- Vlo opt-in usage counts (spec section 11, F30, plan Task E5). A report holds counts and bands only,
-- never text, titles or names. The function refuses any key outside the allowlist.

create table public.usage_reports (
  id uuid primary key default gen_random_uuid(),
  week text not null,
  app_version text not null,
  report jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.usage_reports enable row level security;
-- No policies: the anon role cannot read or write the table directly.

create or replace function public.submit_usage(p_week text, p_app_version text, p_report jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_key text;
  v_bands constant text[] := array['0', '1-249', '250-999', '1000-4999', '5000+'];
begin
  if p_report is null or jsonb_typeof(p_report) <> 'object' then raise exception 'bad report'; end if;
  if octet_length(p_report::text) > 4096 then raise exception 'report too large'; end if;
  if p_week !~ '^[0-9]{4}-W[0-9]{2}$' then raise exception 'bad week'; end if;
  if p_app_version !~ '^[0-9A-Za-z.+-]{1,32}$' then raise exception 'bad version'; end if;
  for v_key in select jsonb_object_keys(p_report) loop
    if v_key not in ('templates_used', 'words_added_band', 'poems_added_band', 'features_used',
                     'ai_mode_counts', 'error_codes') then
      raise exception 'key not allowed';
    end if;
  end loop;
  if p_report ? 'words_added_band' and not (p_report->>'words_added_band' = any (v_bands)) then
    raise exception 'bad band';
  end if;
  if p_report ? 'poems_added_band' and not (p_report->>'poems_added_band' = any (v_bands)) then
    raise exception 'bad band';
  end if;
  insert into usage_reports (week, app_version, report) values (p_week, p_app_version, p_report)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.submit_usage from public;
grant execute on function public.submit_usage to anon;
