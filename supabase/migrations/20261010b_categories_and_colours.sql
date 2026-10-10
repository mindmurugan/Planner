-- Editable categories and colours (applied to project letpyzescnhicrhmlgkv)
create table public.categories (
  key      text primary key check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  label    text not null check (char_length(label) between 1 and 40),
  color    text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  deducts  text check (deducts in ('al','remote')),
  everyone boolean not null default false,
  sort     int not null default 100,
  system   boolean not null default false
);
insert into public.categories (key,label,color,deducts,everyone,sort,system) values
  ('travel','Travel','#F5D04A',null,false,10,true),
  ('al','Annual leave','#F0943A','al',false,20,true),
  ('remote','Work remote','#97CBA2','remote',false,30,true),
  ('dubai','In Dubai','#C8CBD2',null,false,40,false),
  ('event','Event','#D24BE8',null,false,50,false),
  ('ph','Public holiday','#5B8DB8',null,true,60,true);

create table public.colours (
  key   text primary key check (key in ('Muru','Saral','together')),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$')
);
insert into public.colours values ('Muru','#F5D04A'),('Saral','#F1B4C3'),('together','#7DBBC3');

alter table public.entries drop constraint entries_type_check;
alter table public.entries add constraint entries_type_fkey
  foreign key (type) references public.categories(key) on update cascade on delete restrict;

alter table public.categories enable row level security;
alter table public.colours    enable row level security;
create policy "members read categories"   on public.categories for select to authenticated using ((select private.is_member()));
create policy "members add categories"    on public.categories for insert to authenticated with check ((select private.is_member()) and system = false);
create policy "members edit categories"   on public.categories for update to authenticated using ((select private.is_member())) with check ((select private.is_member()));
create policy "members delete categories" on public.categories for delete to authenticated using ((select private.is_member()) and system = false);
create policy "members read colours" on public.colours for select to authenticated using ((select private.is_member()));
create policy "members edit colours" on public.colours for update to authenticated using ((select private.is_member())) with check ((select private.is_member()));

create function private.guard_system_category() returns trigger language plpgsql set search_path = ''
as $$ begin
  if old.system then new.key := old.key; new.deducts := old.deducts; new.everyone := old.everyone; end if;
  new.system := old.system; return new;
end $$;
create trigger categories_guard before update on public.categories
  for each row execute function private.guard_system_category();

revoke all on public.categories, public.colours from anon;
grant select, insert, update, delete on public.categories to authenticated;
grant select, update on public.colours to authenticated;
alter publication supabase_realtime add table public.categories, public.colours;
