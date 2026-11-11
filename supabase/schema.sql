-- Run once in the Supabase SQL editor for a new project.
create extension if not exists pgcrypto;

create table public.competition_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.competition_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.group_invites (
  group_id uuid not null references public.competition_groups(id) on delete cascade,
  email text not null check (length(email) between 3 and 320),
  created_at timestamptz not null default now(),
  primary key (group_id, email)
);

create table public.operations (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid references public.competition_groups(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'id' = id::text),
  updated_at timestamptz not null default now()
);

create index operations_group_id_idx on public.operations(group_id);
create index operations_owner_id_idx on public.operations(owner_id);

alter table public.competition_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.operations enable row level security;

create function public.is_group_member(target_group uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (
  select 1 from public.group_members where group_id = target_group and user_id = auth.uid()
) $$;

create policy "members see groups" on public.competition_groups for select to authenticated
  using (public.is_group_member(id));
create policy "users see their membership" on public.group_members for select to authenticated
  using (user_id = auth.uid());
create policy "owners see pending invites" on public.group_invites for select to authenticated
  using (exists (select 1 from public.competition_groups g where g.id = group_id and g.owner_id = auth.uid()));
create policy "read accessible operations" on public.operations for select to authenticated
  using ((group_id is null and owner_id = auth.uid()) or public.is_group_member(group_id));
create policy "create accessible operations" on public.operations for insert to authenticated
  with check (owner_id = auth.uid() and (group_id is null or public.is_group_member(group_id)));
create policy "edit accessible operations" on public.operations for update to authenticated
  using ((group_id is null and owner_id = auth.uid()) or public.is_group_member(group_id))
  with check ((group_id is null and owner_id = auth.uid()) or public.is_group_member(group_id));
create policy "delete accessible operations" on public.operations for delete to authenticated
  using ((group_id is null and owner_id = auth.uid()) or public.is_group_member(group_id));

revoke all on public.competition_groups, public.group_members, public.group_invites, public.operations from anon, authenticated;
grant select on public.competition_groups, public.group_members, public.group_invites to authenticated;
grant select, insert, delete on public.operations to authenticated;
grant update (payload, updated_at) on public.operations to authenticated;

create function public.create_competition_group(group_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  if auth.uid() is null or length(trim(group_name)) not between 1 and 100 then
    raise exception 'A valid group name and signed-in account are required';
  end if;
  insert into public.competition_groups(name, owner_id) values (trim(group_name), auth.uid()) returning id into new_id;
  insert into public.group_members(group_id, user_id) values (new_id, auth.uid());
  return new_id;
end $$;

create function public.invite_group_member(target_group uuid, member_email text)
returns text language plpgsql security definer set search_path = ''
as $$
declare member_id uuid; normalized_email text := lower(trim(member_email));
begin
  if not exists (select 1 from public.competition_groups where id = target_group and owner_id = auth.uid()) then
    raise exception 'Only the group owner can add members';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(normalized_email) > 320 then
    raise exception 'Enter a valid email address';
  end if;
  select id into member_id from auth.users where lower(email) = normalized_email and email_confirmed_at is not null;
  if member_id is not null then
    insert into public.group_members(group_id, user_id) values (target_group, member_id) on conflict do nothing;
    delete from public.group_invites where group_id = target_group and email = normalized_email;
    return 'added';
  end if;
  insert into public.group_invites(group_id, email) values (target_group, normalized_email) on conflict do nothing;
  return 'pending';
end $$;

create function public.claim_group_invites()
returns integer language plpgsql security definer set search_path = ''
as $$
declare account_email text; claimed integer;
begin
  select lower(email) into account_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if account_email is null then return 0; end if;
  insert into public.group_members(group_id, user_id)
    select group_id, auth.uid() from public.group_invites where email = account_email
    on conflict do nothing;
  get diagnostics claimed = row_count;
  delete from public.group_invites where email = account_email;
  return claimed;
end $$;

create function public.group_roster(target_group uuid)
returns table(email text, is_owner boolean) language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_group_member(target_group) then raise exception 'Group access denied'; end if;
  return query select u.email::text, g.owner_id = m.user_id
    from public.group_members m join public.competition_groups g on g.id = m.group_id
    join auth.users u on u.id = m.user_id where m.group_id = target_group order by u.email;
end $$;

revoke all on function public.is_group_member(uuid), public.create_competition_group(text), public.invite_group_member(uuid, text), public.claim_group_invites(), public.group_roster(uuid) from public;
grant execute on function public.is_group_member(uuid), public.create_competition_group(text), public.invite_group_member(uuid, text), public.claim_group_invites(), public.group_roster(uuid) to authenticated;
