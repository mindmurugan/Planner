-- Planner schema (applied to Supabase project "Planner", ref letpyzescnhicrhmlgkv)
-- Two people only: access is limited to the emails in public.members.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, supabase_auth_admin;

create table public.members (
  email  text primary key check (email = lower(email)),
  person text not null unique check (person in ('Muru','Saral'))
);

create table public.entries (
  id            uuid primary key default gen_random_uuid(),
  type          text not null check (type in ('travel','al','remote','dubai','ph','event')),
  people        text[] not null default '{}' check (people <@ array['Muru','Saral']::text[]),
  start_date    date not null,
  end_date      date not null,
  location      text not null default '' check (char_length(location) <= 200),
  note          text not null default '' check (char_length(note) <= 500),
  days_override numeric(5,2) check (days_override is null or days_override between 0 and 366),
  updated_by    text,
  updated_at    timestamptz not null default now(),
  check (end_date >= start_date)
);
create index entries_start_idx on public.entries (start_date);

create table public.allowances (
  year   int  not null check (year between 2000 and 2100),
  person text not null check (person in ('Muru','Saral')),
  kind   text not null check (kind in ('al','remote')),
  days   numeric(5,2) not null check (days between 0 and 366),
  primary key (year, person, kind)
);

create function private.is_member() returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.members m where m.email = lower(coalesce(auth.jwt() ->> 'email', ''))) $$;

create function private.my_person() returns text language sql stable security definer set search_path = ''
as $$ select m.person from public.members m where m.email = lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create function private.stamp_entry() returns trigger language plpgsql security definer set search_path = ''
as $$ begin new.updated_by := private.my_person(); new.updated_at := now(); return new; end $$;
create trigger entries_stamp before insert or update on public.entries
  for each row execute function private.stamp_entry();

-- Only the two allowed emails can create an account
create function private.only_members_sign_up() returns trigger language plpgsql security definer set search_path = ''
as $$ begin
  if not exists (select 1 from public.members m where m.email = lower(new.email)) then
    raise exception 'This email is not allowed to use the planner';
  end if;
  return new;
end $$;
grant select on public.members to supabase_auth_admin;
grant execute on function private.only_members_sign_up() to supabase_auth_admin;
create trigger only_members_sign_up before insert on auth.users
  for each row execute function private.only_members_sign_up();

alter table public.members    enable row level security;
alter table public.entries    enable row level security;
alter table public.allowances enable row level security;

create policy "members read members" on public.members for select to authenticated using ((select private.is_member()));

create policy "members read entries"   on public.entries for select to authenticated using ((select private.is_member()));
create policy "members add entries"    on public.entries for insert to authenticated with check ((select private.is_member()));
create policy "members edit entries"   on public.entries for update to authenticated using ((select private.is_member())) with check ((select private.is_member()));
create policy "members delete entries" on public.entries for delete to authenticated using ((select private.is_member()));

create policy "members read allowances" on public.allowances for select to authenticated using ((select private.is_member()));
create policy "members add allowances"  on public.allowances for insert to authenticated with check ((select private.is_member()));
create policy "members edit allowances" on public.allowances for update to authenticated using ((select private.is_member())) with check ((select private.is_member()));

revoke all on public.members, public.entries, public.allowances from anon;

alter publication supabase_realtime add table public.entries, public.allowances;

-- Members and 2026 data are loaded separately (not committed: personal data).
