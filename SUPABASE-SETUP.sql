-- Volako Sync — exécuter ce fichier dans Supabase > SQL Editor.
-- Les données ne sont accessibles qu'aux membres du même foyer.

create extension if not exists pgcrypto;

create table if not exists public.volako_households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.volako_members (
  household_id uuid not null references public.volako_households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (household_id,user_id)
);

create table if not exists public.volako_wallets (
  household_id uuid primary key references public.volako_households(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.volako_households enable row level security;
alter table public.volako_members enable row level security;
alter table public.volako_wallets enable row level security;

create or replace function public.volako_is_member(p_household uuid)
returns boolean language sql stable security definer
set search_path=public
as $$ select exists(select 1 from public.volako_members where household_id=p_household and user_id=auth.uid()) $$;

drop policy if exists "volako households readable by members" on public.volako_households;
create policy "volako households readable by members" on public.volako_households
for select to authenticated using (public.volako_is_member(id));

drop policy if exists "volako members readable by members" on public.volako_members;
create policy "volako members readable by members" on public.volako_members
for select to authenticated using (public.volako_is_member(household_id));

drop policy if exists "volako wallets readable by members" on public.volako_wallets;
create policy "volako wallets readable by members" on public.volako_wallets
for select to authenticated using (public.volako_is_member(household_id));

create or replace function public.volako_create_household(p_name text)
returns table(id uuid,name text,invite_code text,version bigint)
language plpgsql security definer set search_path=public
as $$
declare v_id uuid; v_code text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  loop
    v_code := upper(substr(encode(gen_random_bytes(8),'hex'),1,8));
    exit when not exists(select 1 from public.volako_households h where h.invite_code=v_code);
  end loop;
  insert into public.volako_households(name,invite_code,created_by)
  values(trim(p_name),v_code,auth.uid()) returning volako_households.id into v_id;
  insert into public.volako_members(household_id,user_id,role) values(v_id,auth.uid(),'owner');
  insert into public.volako_wallets(household_id,data,version,updated_by) values(v_id,'{}'::jsonb,0,auth.uid());
  return query select h.id,h.name,h.invite_code,w.version from public.volako_households h join public.volako_wallets w on w.household_id=h.id where h.id=v_id;
end $$;

create or replace function public.volako_join_household(p_code text)
returns table(id uuid,name text,invite_code text,version bigint)
language plpgsql security definer set search_path=public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select h.id into v_id from public.volako_households h where h.invite_code=upper(trim(p_code));
  if v_id is null then raise exception 'Code de foyer invalide'; end if;
  insert into public.volako_members(household_id,user_id,role) values(v_id,auth.uid(),'member') on conflict do nothing;
  return query select h.id,h.name,h.invite_code,w.version from public.volako_households h join public.volako_wallets w on w.household_id=h.id where h.id=v_id;
end $$;

create or replace function public.volako_save_wallet(p_household uuid,p_data jsonb,p_expected_version bigint)
returns bigint language plpgsql security definer set search_path=public
as $$
declare v_version bigint;
begin
  if not public.volako_is_member(p_household) then raise exception 'Accès refusé'; end if;
  update public.volako_wallets set data=p_data,version=version+1,updated_at=now(),updated_by=auth.uid()
  where household_id=p_household and version=p_expected_version returning version into v_version;
  if v_version is null then return -1; end if;
  return v_version;
end $$;

grant usage on schema public to authenticated;
grant select on public.volako_households,public.volako_members,public.volako_wallets to authenticated;
grant execute on function public.volako_is_member(uuid) to authenticated;
grant execute on function public.volako_create_household(text) to authenticated;
grant execute on function public.volako_join_household(text) to authenticated;
grant execute on function public.volako_save_wallet(uuid,jsonb,bigint) to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='volako_wallets') then
    alter publication supabase_realtime add table public.volako_wallets;
  end if;
end $$;
