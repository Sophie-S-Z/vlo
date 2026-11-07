-- Free plan care (spec section 11, plan decision S7). Shares go away 30 days after they expire, with
-- their comments. pg_cron runs the cleanup each day, so no service key is needed outside Supabase.

create or replace function public.cleanup_shares() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  delete from shares where expires_at < now() - interval '30 days';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Only the database owner runs the cleanup.
revoke all on function public.cleanup_shares from public;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('vlo-cleanup-shares', '17 3 * * *', 'select public.cleanup_shares()');
  end if;
end $$;
