-- Waitlist (spec section 19). The anon role reaches the data only through the two
-- security definer functions below. Row level security with no policies blocks direct access.

create extension if not exists citext with schema extensions;

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  -- Strict sign-up order. created_at can tie inside one transaction or a burst (ADR 0007).
  seq bigint generated always as identity unique,
  email extensions.citext unique not null,
  writer_type text check (writer_type in ('novels','memoir','poetry','mixed')),
  pain_point text check (char_length(pain_point) <= 280),
  ref_code text unique not null,
  referred_by text,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;
-- No policies: the anon role cannot read or write the table directly.
-- Supabase grants table privileges to anon and authenticated by default; remove them too.
revoke all on table public.waitlist from anon, authenticated;

create or replace function public.join_waitlist(
  p_email text,
  p_writer_type text default null,
  p_pain_point text default null,
  p_referred_by text default null
)
returns table (out_place bigint, out_ref_code text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(btrim(p_email));
  v_seq bigint;
  v_code text;
begin
  if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'invalid_email';
  end if;
  if p_writer_type is not null and p_writer_type not in ('novels','memoir','poetry','mixed') then
    raise exception 'invalid_writer_type';
  end if;

  insert into public.waitlist (email, writer_type, pain_point, ref_code, referred_by)
  values (
    v_email,
    p_writer_type,
    left(p_pain_point, 280),
    substr(md5(random()::text || clock_timestamp()::text), 1, 10),
    left(p_referred_by, 20)
  )
  on conflict (email) do nothing;

  select w.seq, w.ref_code into v_seq, v_code
  from public.waitlist w
  where w.email = v_email::citext;

  return query
    select (select count(*) from public.waitlist w2 where w2.seq <= v_seq),
           v_code;
end;
$$;

create or replace function public.waitlist_count()
returns bigint
language sql
security definer
set search_path = public
as $$ select count(*) from public.waitlist; $$;

revoke all on function public.join_waitlist(text, text, text, text) from public, anon, authenticated;
revoke all on function public.waitlist_count() from public, anon, authenticated;
grant execute on function public.join_waitlist(text, text, text, text) to anon;
grant execute on function public.waitlist_count() to anon;
