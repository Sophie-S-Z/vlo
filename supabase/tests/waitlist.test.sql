-- Waitlist SQL tests (spec section 19, US16, US17). Run with scripts/test-sql.sh.
-- Every test runs as the anon role, like a browser with the public anon key.
\set ON_ERROR_STOP on
set role anon;

-- The anon role cannot read or write the table directly.
do $$ begin
  perform 1 from public.waitlist;
  raise exception 'FAIL: anon can select from waitlist';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  insert into public.waitlist (email, ref_code) values ('x@y.zz', 'abc');
  raise exception 'FAIL: anon can insert into waitlist';
exception when insufficient_privilege then null;
end $$;

-- First and second sign-ups get places 1 and 2 (US16).
do $$
declare r record;
begin
  select * into r from public.join_waitlist('first@example.com', 'poetry', 'Indents vanish.', null);
  if r.out_place <> 1 or length(r.out_ref_code) <> 10 then
    raise exception 'FAIL: first sign-up got %', r;
  end if;
  select * into r from public.join_waitlist('second@example.com');
  if r.out_place <> 2 then raise exception 'FAIL: second sign-up got place %', r.out_place; end if;
end $$;

-- The same email in another case keeps its place and code, with no new row (US17).
do $$
declare a record; b record; n bigint;
begin
  select * into a from public.join_waitlist('first@example.com');
  select * into b from public.join_waitlist('FIRST@Example.COM', 'novels');
  if a.out_place <> 1 or b.out_place <> 1 or a.out_ref_code <> b.out_ref_code then
    raise exception 'FAIL: duplicate sign-up changed place or code: % %', a, b;
  end if;
  select public.waitlist_count() into n;
  if n <> 2 then raise exception 'FAIL: expected 2 rows, found %', n; end if;
end $$;

-- Invalid email raises invalid_email.
do $$ begin
  perform public.join_waitlist('not-an-email');
  raise exception 'FAIL: invalid email accepted';
exception when others then
  if sqlerrm <> 'invalid_email' then raise; end if;
end $$;

do $$ begin
  perform public.join_waitlist(null);
  raise exception 'FAIL: null email accepted';
exception when others then
  if sqlerrm <> 'invalid_email' then raise; end if;
end $$;

-- Unknown writer type raises invalid_writer_type and adds no row.
do $$ begin
  perform public.join_waitlist('third@example.com', 'screenplays');
  raise exception 'FAIL: unknown writer type accepted';
exception when others then
  if sqlerrm <> 'invalid_writer_type' then raise; end if;
end $$;

-- A pain point over 280 characters is cut to 280; referred_by is cut to 20.
do $$
declare r record;
begin
  select * into r from public.join_waitlist('long@example.com', 'mixed', repeat('a', 400), repeat('r', 50));
  if r.out_place <> 3 then raise exception 'FAIL: long sign-up got place %', r.out_place; end if;
end $$;

reset role;
do $$
declare p int; f int;
begin
  select char_length(pain_point), char_length(referred_by) into p, f
  from public.waitlist where email = 'long@example.com';
  if p <> 280 or f <> 20 then raise exception 'FAIL: lengths % %', p, f; end if;
end $$;

\echo 'waitlist SQL tests passed'
