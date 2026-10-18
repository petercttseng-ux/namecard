-- Execute once in the SQL Editor of the intended Supabase project.
-- Shared workspace: only users explicitly added to namecard_members can read/write.
begin;
create table if not exists public.namecard_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.namecard_members enable row level security;
drop policy if exists namecard_member_self on public.namecard_members;
create policy namecard_member_self on public.namecard_members for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.namecard_members from anon, authenticated;
grant select on public.namecard_members to authenticated;

create table if not exists public.namecard_contacts (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) between 1 and 240),
 title text not null default '' check(length(title)<=240),
 company text not null default '' check(length(company)<=240),
 phone text not null default '' check(length(phone)<=240),
 email text not null default '' check(length(email)<=240),
 address text not null default '' check(length(address)<=240),
 notes text not null default '' check(length(notes)<=3000),
 category text not null default '其他聯絡' check(category in ('政府機關','學術研究','產業夥伴','專業服務','其他聯絡')),
 starred boolean not null default false,
 photo text not null default '' check (photo='' or (length(photo)<4200000 and photo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 version bigint not null default 1
);
alter table public.namecard_contacts add column if not exists has_photo boolean generated always as (photo <> '') stored;
alter table public.namecard_contacts enable row level security;
revoke all on public.namecard_contacts from anon, authenticated;
grant select, insert, update, delete on public.namecard_contacts to authenticated;
drop policy if exists namecard_shared_members on public.namecard_contacts;
create policy namecard_shared_members on public.namecard_contacts for all to authenticated
using (exists(select 1 from public.namecard_members where user_id=(select auth.uid())))
with check (exists(select 1 from public.namecard_members where user_id=(select auth.uid())));
create or replace function public.namecard_bump_version() returns trigger language plpgsql set search_path=public as $$
begin new.version=old.version+1;new.updated_at=now();new.created_at=old.created_at;new.id=old.id;return new;end;
$$;
drop trigger if exists namecard_version on public.namecard_contacts;
create trigger namecard_version before update on public.namecard_contacts for each row execute function public.namecard_bump_version();
create or replace function public.namecard_import(items jsonb) returns integer language plpgsql security invoker set search_path=public as $$
declare inserted integer;
begin
 if not exists(select 1 from public.namecard_members where user_id=(select auth.uid())) then raise exception 'Not authorized' using errcode='42501';end if;
 if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items)>5000 then raise exception 'Invalid import';end if;
 insert into public.namecard_contacts(id,name,title,company,phone,email,address,notes,category,starred,photo,created_at)
 select r.id,r.name,coalesce(r.title,''),coalesce(r.company,''),coalesce(r.phone,''),coalesce(r.email,''),coalesce(r.address,''),coalesce(r.notes,''),coalesce(r.category,'其他聯絡'),coalesce(r.starred,false),coalesce(r.photo,''),coalesce(r.created_at,now())
 from jsonb_to_recordset(items) as r(id uuid,name text,title text,company text,phone text,email text,address text,notes text,category text,starred boolean,photo text,created_at timestamptz)
 on conflict(id) do nothing;
 get diagnostics inserted = row_count;
 return inserted;
end;
$$;
revoke all on function public.namecard_import(jsonb) from public, anon;
grant execute on function public.namecard_import(jsonb) to authenticated;
commit;
-- After creating/inviting a user in Authentication > Users, authorize that user:
-- insert into public.namecard_members(user_id) values ('THE-AUTH-USER-UUID') on conflict do nothing;
