-- Apply after schema.sql. Existing groups, members, and operations are preserved.
begin;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.username_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.competition_groups(id) on delete cascade,
  invited_user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_id, invited_user_id)
);

alter table public.user_profiles enable row level security;
alter table public.username_invites enable row level security;
revoke all on public.user_profiles, public.username_invites from public, anon, authenticated;
grant select on public.user_profiles to authenticated;
drop policy if exists "users see their own profile" on public.user_profiles;
create policy "users see their own profile" on public.user_profiles for select to authenticated
  using (user_id = auth.uid());

create or replace function public.create_username_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare normalized text := lower(trim(new.raw_user_meta_data->>'username'));
begin
  if normalized is null or normalized !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Username must be 3-24 letters, numbers, or underscores';
  end if;
  insert into public.user_profiles(user_id, username) values (new.id, normalized);
  return new;
end $$;

drop trigger if exists create_username_profile on auth.users;
create trigger create_username_profile after insert on auth.users
  for each row execute function public.create_username_profile();
revoke all on function public.create_username_profile() from public, anon, authenticated;

create or replace function public.claim_username(desired_username text)
returns text language plpgsql security definer set search_path = ''
as $$
declare normalized text := lower(trim(desired_username)); existing text;
begin
  if auth.uid() is null or normalized is null or normalized !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Username must be 3-24 letters, numbers, or underscores';
  end if;
  select username into existing from public.user_profiles where user_id = auth.uid();
  if existing is not null then return existing; end if;
  insert into public.user_profiles(user_id, username) values (auth.uid(), normalized);
  return normalized;
end $$;

create or replace function public.search_usernames(search_text text)
returns table(username text) language plpgsql stable security definer set search_path = ''
as $$
declare term text := lower(trim(search_text));
begin
  if not exists (select 1 from public.user_profiles where user_id = auth.uid()) then
    raise exception 'Choose a username first';
  end if;
  if term is null or term !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Search with 3-24 letters, numbers, or underscores';
  end if;
  return query select p.username from public.user_profiles p
    where p.user_id <> auth.uid() and strpos(p.username, term) > 0
    order by p.username limit 20;
end $$;

create or replace function public.invite_group_username(target_group uuid, target_username text)
returns text language plpgsql security definer set search_path = ''
as $$
declare target_user uuid; inserted integer;
begin
  if not exists (select 1 from public.competition_groups where id = target_group and owner_id = auth.uid()) then
    raise exception 'Only the group owner can invite members';
  end if;
  if not exists (select 1 from public.user_profiles where user_id = auth.uid()) then
    raise exception 'Choose a username first';
  end if;
  select user_id into target_user from public.user_profiles where username = lower(trim(target_username));
  if target_user is null then raise exception 'Username not found'; end if;
  if exists (select 1 from public.group_members where group_id = target_group and user_id = target_user) then
    raise exception 'This user is already a member';
  end if;
  insert into public.username_invites(group_id, invited_user_id, invited_by)
    values (target_group, target_user, auth.uid()) on conflict (group_id, invited_user_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return 'pending'; end if;
  return 'sent';
end $$;

create or replace function public.list_my_group_invites()
returns table(invite_id uuid, group_name text, inviter_username text)
language sql stable security definer set search_path = ''
as $$
  select i.id, g.name, coalesce(p.username, 'group owner')
  from public.username_invites i
  join public.competition_groups g on g.id = i.group_id
  left join public.user_profiles p on p.user_id = i.invited_by
  where i.invited_user_id = auth.uid()
  order by i.created_at, i.id
$$;

create or replace function public.respond_group_invite(invite_id uuid, accept_invite boolean)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare invited_group uuid;
begin
  if auth.uid() is null or accept_invite is null then raise exception 'Invalid invitation response'; end if;
  delete from public.username_invites i where i.id = invite_id and i.invited_user_id = auth.uid()
    returning i.group_id into invited_group;
  if invited_group is null then raise exception 'Invitation not found'; end if;
  if accept_invite then
    insert into public.group_members(group_id, user_id) values (invited_group, auth.uid()) on conflict do nothing;
  end if;
  return invited_group;
end $$;

-- Convert old email invitations to invitations requiring explicit acceptance.
create or replace function public.claim_group_invites()
returns integer language plpgsql security definer set search_path = ''
as $$
declare account_email text; claimed integer;
begin
  select lower(email) into account_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if account_email is null then return 0; end if;
  insert into public.username_invites(group_id, invited_user_id, invited_by)
    select i.group_id, auth.uid(), g.owner_id from public.group_invites i
    join public.competition_groups g on g.id = i.group_id
    where i.email = account_email and not exists (
      select 1 from public.group_members m where m.group_id = i.group_id and m.user_id = auth.uid()
    ) on conflict (group_id, invited_user_id) do nothing;
  get diagnostics claimed = row_count;
  delete from public.group_invites where email = account_email;
  return claimed;
end $$;

drop function if exists public.group_roster(uuid);
create function public.group_roster(target_group uuid)
returns table(user_id uuid, username text, is_owner boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_group_member(target_group) then raise exception 'Group access denied'; end if;
  return query select m.user_id, p.username, g.owner_id = m.user_id
    from public.group_members m join public.competition_groups g on g.id = m.group_id
    left join public.user_profiles p on p.user_id = m.user_id
    where m.group_id = target_group order by p.username nulls last, m.user_id;
end $$;

revoke execute on function public.invite_group_member(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_username(text), public.search_usernames(text),
  public.invite_group_username(uuid, text), public.list_my_group_invites(),
  public.respond_group_invite(uuid, boolean), public.claim_group_invites(),
  public.group_roster(uuid) from public, anon;
grant execute on function public.claim_username(text), public.search_usernames(text),
  public.invite_group_username(uuid, text), public.list_my_group_invites(),
  public.respond_group_invite(uuid, boolean), public.claim_group_invites(),
  public.group_roster(uuid) to authenticated;

commit;
