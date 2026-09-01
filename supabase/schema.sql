-- Macronaut database schema.
-- Paste this into the Supabase SQL editor and run it once.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  email text not null,
  avatar_url text,
  bio text,
  age int,
  sex text,
  height_cm numeric,
  weight_kg numeric,
  activity numeric,
  goal text,
  pace_kg numeric,
  target_kg numeric,
  unit text default 'metric',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create table if not exists public.progress_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  logged_on date not null default current_date,
  weight_kg numeric,
  calories int,
  protein_g int,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, logged_on)
);

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.progress_entries enable row level security;

-- Profiles: everyone signed in can look people up (needed to add friends),
-- but you can only write your own row.
drop policy if exists "profiles are readable by authenticated users" on public.profiles;
create policy "profiles are readable by authenticated users"
  on public.profiles for select to authenticated using (true);

drop policy if exists "users insert their own profile" on public.profiles;
create policy "users insert their own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "users update their own profile" on public.profiles;
create policy "users update their own profile"
  on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Friendships: visible to both sides, created by the requester, accepted by the addressee.
drop policy if exists "friendships visible to both sides" on public.friendships;
create policy "friendships visible to both sides"
  on public.friendships for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "users send friend requests" on public.friendships;
create policy "users send friend requests"
  on public.friendships for insert to authenticated with check (auth.uid() = requester_id);

drop policy if exists "addressee accepts friend requests" on public.friendships;
create policy "addressee accepts friend requests"
  on public.friendships for update to authenticated
  using (auth.uid() = addressee_id) with check (auth.uid() = addressee_id);

drop policy if exists "either side removes a friendship" on public.friendships;
create policy "either side removes a friendship"
  on public.friendships for delete to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Progress: private to the owner and to accepted friends.
drop policy if exists "progress visible to owner and friends" on public.progress_entries;
create policy "progress visible to owner and friends"
  on public.progress_entries for select to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = progress_entries.user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = progress_entries.user_id)
        )
    )
  );

drop policy if exists "users write their own progress" on public.progress_entries;
create policy "users write their own progress"
  on public.progress_entries for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "users update their own progress" on public.progress_entries;
create policy "users update their own progress"
  on public.progress_entries for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users delete their own progress" on public.progress_entries;
create policy "users delete their own progress"
  on public.progress_entries for delete to authenticated
  using (auth.uid() = user_id);

-- Signing in with a username: resolve it to the account email before calling
-- signInWithPassword. Security definer so it works for anonymous visitors,
-- and it only ever returns the one email that matches an exact username.
create or replace function public.email_for_username(lookup_username text)
returns text
language sql
security definer
set search_path = public
as $$
  select email from public.profiles where lower(username) = lower(lookup_username) limit 1;
$$;

grant execute on function public.email_for_username(text) to anon, authenticated;

create or replace function public.username_available(lookup_username text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(lookup_username));
$$;

grant execute on function public.username_available(text) to anon, authenticated;

-- Avatars bucket.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars are public" on storage.objects;
create policy "avatars are public"
  on storage.objects for select using (bucket_id = 'avatars');

drop policy if exists "users upload their own avatar" on storage.objects;
create policy "users upload their own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users replace their own avatar" on storage.objects;
create policy "users replace their own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
