-- The owner page adds, changes and deletes accounts. Each function runs in the database as its owner and
-- first checks that the caller is in app_owners, so the browser needs no service key. An account that the
-- owner adds signs in with its email and a 6-digit code, as a writer who signs up does. Vlo sends no email.

-- A lower-case email address of at most 254 characters, or an error.
create or replace function public.vlo_check_email(p_email text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if length(v_email) > 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'bad email'; end if;
  return v_email;
end $$;

-- Adds an account with a confirmed email and its email sign-in, as Supabase Auth makes them, and a profile
-- when the owner gives a name. Gives the id of the new account.
create or replace function public.owner_add_account(p_email text, p_name text default '') returns uuid
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare
  v_email text := vlo_check_email(p_email);
  v_name text := vlo_check_text(p_name, 80, false, 'name');
  v_id uuid := gen_random_uuid();
  v_data jsonb := jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true,
    'phone_verified', false);
begin
  perform vlo_owner();
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then raise exception 'email taken'; end if;
  -- Supabase Auth reads the token columns as text, so they get '' and not null.
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data,
    raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new,
    email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email, now(),
    '{"provider":"email","providers":["email"]}', v_data, now(), now(), '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (v_id::text, v_id, v_data, 'email', now(), now());
  if v_name <> '' then insert into profiles (user_id, name) values (v_id, v_name); end if;
  return v_id;
end $$;

-- Changes the email and the profile name of an account. Only an account with an email sign-in can get a
-- new email: Google gives the email of a Google account. An account with a profile keeps a name. False
-- when the account is not there.
create or replace function public.owner_edit_account(p_id uuid, p_email text, p_name text) returns boolean
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare
  v_email text := vlo_check_email(p_email);
  v_name text := vlo_check_text(p_name, 80, false, 'name');
  v_old text;
begin
  perform vlo_owner();
  select lower(u.email) into v_old from auth.users u where u.id = p_id;
  if not found then return false; end if;
  if v_email is distinct from v_old then
    if not exists (select 1 from auth.identities i where i.user_id = p_id and i.provider = 'email') then
      raise exception 'email locked';
    end if;
    if exists (select 1 from auth.users u where lower(u.email) = v_email) then raise exception 'email taken'; end if;
    update auth.users
      set email = v_email, email_change = '', email_change_token_new = '', email_change_token_current = '',
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}') || jsonb_build_object('email', v_email),
        updated_at = now()
      where id = p_id;
    update auth.identities
      set identity_data = identity_data || jsonb_build_object('email', v_email), updated_at = now()
      where user_id = p_id and provider = 'email';
  end if;
  if v_name <> '' then
    insert into profiles (user_id, name) values (p_id, v_name)
    on conflict (user_id) do update set name = excluded.name, updated_at = now();
  elsif exists (select 1 from profiles p where p.user_id = p_id) then
    raise exception 'bad name';
  end if;
  return true;
end $$;

-- Deletes an account as delete_my_account does: its sync space with every sealed copy, then the account.
-- The tables that point at the account delete its sign-ins, profile, vault and settings with it. The daily
-- count and feedback keep their rows with no account. The owner deletes the own account on the account page.
create or replace function public.owner_delete_account(p_id uuid) returns boolean
language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  perform vlo_owner();
  if p_id = auth.uid() then raise exception 'own account'; end if;
  delete from sync_spaces where id in (select v.space_id from sync_vaults v where v.user_id = p_id);
  delete from auth.users where id = p_id;
  return found;
end $$;

revoke all on function public.vlo_check_email, public.owner_add_account, public.owner_edit_account,
  public.owner_delete_account from public, anon, authenticated;
grant execute on function public.owner_add_account, public.owner_edit_account, public.owner_delete_account
  to authenticated;
