-- Civic Fortune: authoritative, realtime multiplayer game backend.
-- This migration deliberately keeps the canonical game/deck state inaccessible
-- to browser clients. Edge Functions authenticate the caller, run the game
-- engine, then use the service-only RPCs below to make one versioned commit.

create extension if not exists pgcrypto;

do $$ begin
  create type public.civic_game_visibility as enum ('public', 'private');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.civic_game_status as enum ('lobby', 'active', 'paused', 'finished', 'abandoned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.civic_member_role as enum ('host', 'player');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.civic_member_status as enum ('joined', 'left', 'eliminated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.civic_invite_status as enum ('active', 'revoked', 'expired');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 30),
  avatar_color text not null default '#4f8cff' check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_display_name_ci_idx
  on public.profiles (lower(display_name));

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 60),
  visibility public.civic_game_visibility not null default 'public',
  status public.civic_game_status not null default 'lobby',
  created_by uuid not null references auth.users(id) on delete restrict,
  host_user_id uuid not null references auth.users(id) on delete restrict,
  max_players smallint not null default 20 check (max_players between 2 and 20),
  settings jsonb not null default '{"turnSeconds":30,"auctionSeconds":20,"fastAnimation":false,"jackpotEnabled":false,"startBonus":200}'::jsonb,
  state_version bigint not null default 0 check (state_version >= 0),
  current_player_id uuid references auth.users(id) on delete set null,
  turn_deadline_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'lobby' or started_at is null),
  check (jsonb_typeof(settings) = 'object')
);

create index if not exists games_lobby_idx
  on public.games (visibility, created_at desc)
  where status = 'lobby';
create index if not exists games_deadline_idx
  on public.games (turn_deadline_at)
  where status = 'active' and turn_deadline_at is not null;

create table if not exists public.game_members (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat smallint not null check (seat between 0 and 19),
  role public.civic_member_role not null default 'player',
  status public.civic_member_status not null default 'joined',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (game_id, user_id),
  check ((status = 'left') = (left_at is not null))
);

create index if not exists game_members_user_idx
  on public.game_members (user_id, status, game_id);
create unique index if not exists game_members_active_seat_idx
  on public.game_members (game_id, seat)
  where status <> 'left';

create table if not exists public.game_public_snapshots (
  game_id uuid primary key references public.games(id) on delete cascade,
  version bigint not null check (version >= 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  updated_at timestamptz not null default now()
);

-- Never grant browser roles access to this table. It contains deck order,
-- pending private trade details, and all other canonical engine state.
create table if not exists public.game_private_states (
  game_id uuid primary key references public.games(id) on delete cascade,
  version bigint not null check (version >= 0),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_events (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  version bigint not null check (version >= 0),
  ordinal smallint not null check (ordinal >= 0),
  kind text not null check (kind ~ '^[a-z][a-z0-9_]{1,63}$'),
  actor_id uuid references auth.users(id) on delete set null,
  message text not null check (char_length(message) between 1 and 280),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  unique (game_id, version, ordinal)
);

create index if not exists game_events_feed_idx
  on public.game_events (game_id, id desc);

-- Idempotency receipts prevent retries from rolling twice or spending cash twice.
create table if not exists public.game_action_receipts (
  game_id uuid not null references public.games(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  client_action_id uuid not null,
  action_kind text not null,
  applied_version bigint not null check (applied_version >= 0),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  primary key (game_id, actor_id, client_action_id)
);

create table if not exists public.game_invites (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  invitee_user_id uuid references auth.users(id) on delete cascade,
  token_digest text not null unique check (char_length(token_digest) = 64),
  max_uses smallint not null default 1 check (max_uses between 1 and 20),
  uses_count smallint not null default 0 check (uses_count >= 0),
  status public.civic_invite_status not null default 'active',
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  check (uses_count <= max_uses)
);

create index if not exists game_invites_game_idx
  on public.game_invites (game_id, status, expires_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists games_set_updated_at on public.games;
create trigger games_set_updated_at before update on public.games
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_name text;
begin
  safe_name := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, 'player'), '@', 1), 'Player'), 30);
  if char_length(safe_name) < 2 then
    safe_name := 'Player';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, safe_name)
  on conflict do nothing;
  if not found then
    insert into public.profiles (id, display_name)
    values (new.id, left(safe_name, 20) || '-' || left(new.id::text, 8))
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS helper used by all player-visible game tables and private Realtime topics.
create or replace function public.is_civic_game_member(p_game_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.game_members m
    where m.game_id = p_game_id
      and m.user_id = p_user_id
      and m.status in ('joined', 'eliminated')
  );
$$;

create or replace function public.is_civic_game_host(p_game_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.games g
    where g.id = p_game_id and g.host_user_id = p_user_id
  );
$$;

-- Browser roles get read-only access; mutations are Edge Function only.
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_members enable row level security;
alter table public.game_public_snapshots enable row level security;
alter table public.game_private_states enable row level security;
alter table public.game_events enable row level security;
alter table public.game_action_receipts enable row level security;
alter table public.game_invites enable row level security;

drop policy if exists profiles_read_authenticated on public.profiles;
create policy profiles_read_authenticated on public.profiles
  for select to authenticated using (true);
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists games_read_lobby_or_member on public.games;
create policy games_read_lobby_or_member on public.games
  for select to authenticated using (
    (visibility = 'public' and status = 'lobby')
    or public.is_civic_game_member(id)
  );

drop policy if exists game_members_read_member on public.game_members;
create policy game_members_read_member on public.game_members
  for select to authenticated using (public.is_civic_game_member(game_id));

drop policy if exists game_public_snapshots_read_member on public.game_public_snapshots;
create policy game_public_snapshots_read_member on public.game_public_snapshots
  for select to authenticated using (public.is_civic_game_member(game_id));

drop policy if exists game_events_read_member on public.game_events;
create policy game_events_read_member on public.game_events
  for select to authenticated using (public.is_civic_game_member(game_id));

drop policy if exists game_invites_read_creator_or_target on public.game_invites;
create policy game_invites_read_creator_or_target on public.game_invites
  for select to authenticated using (
    created_by = auth.uid() or invitee_user_id = auth.uid()
  );

-- The remaining two tables intentionally have no browser policy.
revoke all on public.game_private_states, public.game_action_receipts from anon, authenticated;
revoke all on public.games, public.game_members, public.game_public_snapshots, public.game_events, public.game_invites from anon, authenticated;
revoke all on public.profiles from anon;
grant select on public.profiles, public.games, public.game_members, public.game_public_snapshots, public.game_events, public.game_invites to authenticated;
grant update (display_name, avatar_color) on public.profiles to authenticated;
grant usage, select on all sequences in schema public to service_role;

-- Service-only transaction: lock the game, reject stale versions, write both
-- snapshots and an ordered public event batch, then record the idempotency key.
create or replace function public.commit_civic_game_action(
  p_game_id uuid,
  p_actor_id uuid,
  p_known_version bigint,
  p_client_action_id uuid,
  p_action_kind text,
  p_next_game jsonb,
  p_public_snapshot jsonb,
  p_private_state jsonb,
  p_events jsonb,
  p_member_status_changes jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_game public.games%rowtype;
  receipt public.game_action_receipts%rowtype;
  next_version bigint;
  item jsonb;
  event_id bigint;
  event_ids jsonb := '[]'::jsonb;
  result jsonb;
  requested_status public.civic_game_status;
  requested_player uuid;
  requested_deadline timestamptz;
begin
  if jsonb_typeof(p_next_game) <> 'object'
     or jsonb_typeof(p_public_snapshot) <> 'object'
     or jsonb_typeof(p_private_state) <> 'object'
     or jsonb_typeof(p_events) <> 'array'
     or jsonb_typeof(p_member_status_changes) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_COMMIT');
  end if;

  select * into receipt
  from public.game_action_receipts
  where game_id = p_game_id and actor_id = p_actor_id and client_action_id = p_client_action_id;
  if found then
    return receipt.result || jsonb_build_object('duplicate', true);
  end if;

  select * into current_game from public.games where id = p_game_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND');
  end if;

  -- Recheck after acquiring the game lock. A concurrent retry can insert its
  -- receipt while this invocation waits on the lock.
  select * into receipt
  from public.game_action_receipts
  where game_id = p_game_id and actor_id = p_actor_id and client_action_id = p_client_action_id;
  if found then
    return receipt.result || jsonb_build_object('duplicate', true);
  end if;

  if not public.is_civic_game_member(p_game_id, p_actor_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_A_MEMBER');
  end if;

  if current_game.state_version <> p_known_version then
    return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'currentVersion', current_game.state_version);
  end if;

  if current_game.status = 'active'
     and p_action_kind <> 'resolve_deadline'
     and current_game.turn_deadline_at is not null
     and current_game.turn_deadline_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'DEADLINE_EXPIRED', 'currentVersion', current_game.state_version);
  end if;

  requested_status := coalesce((p_next_game ->> 'status')::public.civic_game_status, current_game.status);
  requested_player := nullif(p_next_game ->> 'currentPlayerId', '')::uuid;
  requested_deadline := nullif(p_next_game ->> 'turnDeadlineAt', '')::timestamptz;
  next_version := current_game.state_version + 1;

  update public.games
  set state_version = next_version,
      status = requested_status,
      current_player_id = requested_player,
      turn_deadline_at = requested_deadline,
      started_at = case when requested_status = 'active' and started_at is null then now() else started_at end,
      ended_at = case when requested_status in ('finished', 'abandoned') then coalesce(ended_at, now()) else ended_at end
  where id = p_game_id;

  insert into public.game_public_snapshots (game_id, version, snapshot, updated_at)
  values (p_game_id, next_version, p_public_snapshot, now())
  on conflict (game_id) do update
  set version = excluded.version, snapshot = excluded.snapshot, updated_at = excluded.updated_at;

  insert into public.game_private_states (game_id, version, state, updated_at)
  values (p_game_id, next_version, p_private_state, now())
  on conflict (game_id) do update
  set version = excluded.version, state = excluded.state, updated_at = excluded.updated_at;

  update public.game_members m
  set status = (change_item.value ->> 'status')::public.civic_member_status,
      left_at = case when (change_item.value ->> 'status') = 'left' then now() else null end
  from jsonb_array_elements(p_member_status_changes) as change_item(value)
  where m.game_id = p_game_id
    and m.user_id = (change_item.value ->> 'userId')::uuid
    and (change_item.value ->> 'status') in ('joined', 'left', 'eliminated');

  for item in select value from jsonb_array_elements(p_events)
  loop
    insert into public.game_events (game_id, version, ordinal, kind, actor_id, message, data)
    values (
      p_game_id,
      next_version,
      coalesce((item ->> 'ordinal')::smallint, 0),
      coalesce(nullif(item ->> 'kind', ''), 'game_update'),
      coalesce(nullif(item ->> 'actorId', '')::uuid, p_actor_id),
      left(coalesce(nullif(item ->> 'message', ''), 'Game updated'), 280),
      coalesce(item -> 'data', '{}'::jsonb)
    )
    returning id into event_id;
    event_ids := event_ids || to_jsonb(event_id);
  end loop;

  result := jsonb_build_object(
    'ok', true,
    'gameId', p_game_id,
    'version', next_version,
    'eventIds', event_ids,
    'duplicate', false
  );
  insert into public.game_action_receipts (game_id, actor_id, client_action_id, action_kind, applied_version, result)
  values (p_game_id, p_actor_id, p_client_action_id, p_action_kind, next_version, result);

  return result;
end;
$$;

-- Service-only lobby transaction used by create-game.
create or replace function public.bootstrap_civic_game(
  p_game_id uuid,
  p_creator_id uuid,
  p_title text,
  p_visibility public.civic_game_visibility,
  p_max_players smallint,
  p_settings jsonb,
  p_public_snapshot jsonb,
  p_private_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if char_length(trim(p_title)) not between 2 and 60
     or p_max_players not between 2 and 20
     or jsonb_typeof(p_settings) <> 'object'
     or jsonb_typeof(p_public_snapshot) <> 'object'
     or jsonb_typeof(p_private_state) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_GAME');
  end if;

  insert into public.games (id, title, visibility, created_by, host_user_id, max_players, settings)
  values (p_game_id, trim(p_title), p_visibility, p_creator_id, p_creator_id, p_max_players, p_settings);
  insert into public.game_members (game_id, user_id, seat, role)
  values (p_game_id, p_creator_id, 0, 'host');
  insert into public.game_public_snapshots (game_id, version, snapshot)
  values (p_game_id, 0, p_public_snapshot);
  insert into public.game_private_states (game_id, version, state)
  values (p_game_id, 0, p_private_state);
  insert into public.game_events (game_id, version, ordinal, kind, actor_id, message)
  values (p_game_id, 0, 0, 'game_created', p_creator_id, 'Room created');
  return jsonb_build_object('ok', true, 'gameId', p_game_id, 'version', 0);
end;
$$;

-- Service-only lobby join. Invite tokens are SHA-256 digests supplied by the
-- Edge Function; raw tokens never enter the database.
create or replace function public.join_civic_game(
  p_game_id uuid,
  p_user_id uuid,
  p_invite_token_digest text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_game public.games%rowtype;
  existing_member public.game_members%rowtype;
  invite public.game_invites%rowtype;
  joined_count integer;
  available_seat smallint;
  has_existing boolean := false;
begin
  select * into current_game from public.games where id = p_game_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); end if;
  if current_game.status <> 'lobby' then return jsonb_build_object('ok', false, 'code', 'GAME_ALREADY_STARTED'); end if;

  select * into existing_member from public.game_members where game_id = p_game_id and user_id = p_user_id for update;
  if found and existing_member.status = 'joined' then
    return jsonb_build_object('ok', true, 'alreadyJoined', true, 'seat', existing_member.seat);
  end if;
  has_existing := found;

  if current_game.visibility = 'private' then
    select * into invite from public.game_invites
    where game_id = p_game_id
      and token_digest = p_invite_token_digest
      and status = 'active'
      and expires_at > now()
      and uses_count < max_uses
      and (invitee_user_id is null or invitee_user_id = p_user_id)
    for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'INVITE_REQUIRED'); end if;
  end if;

  select count(*) into joined_count from public.game_members where game_id = p_game_id and status = 'joined';
  if joined_count >= current_game.max_players then return jsonb_build_object('ok', false, 'code', 'ROOM_FULL'); end if;

  if has_existing then
    select seats.seat::smallint into available_seat
    from generate_series(0, current_game.max_players - 1) as seats(seat)
    where not exists (
      select 1 from public.game_members m
      where m.game_id = p_game_id and m.seat = seats.seat and m.status <> 'left'
    )
    order by seats.seat limit 1;
    if available_seat is null then return jsonb_build_object('ok', false, 'code', 'ROOM_FULL'); end if;
    update public.game_members
    set seat = available_seat, status = 'joined', left_at = null, joined_at = now()
    where game_id = p_game_id and user_id = p_user_id;
  else
    select seats.seat::smallint into available_seat
    from generate_series(0, current_game.max_players - 1) as seats(seat)
    where not exists (
      select 1 from public.game_members m where m.game_id = p_game_id and m.seat = seats.seat and m.status <> 'left'
    )
    order by seats.seat limit 1;
    if available_seat is null then return jsonb_build_object('ok', false, 'code', 'ROOM_FULL'); end if;
    insert into public.game_members (game_id, user_id, seat, role) values (p_game_id, p_user_id, available_seat, 'player');
  end if;

  if current_game.visibility = 'private' then
    update public.game_invites
    set uses_count = uses_count + 1,
        status = case when uses_count + 1 >= max_uses then 'expired'::public.civic_invite_status else status end
    where id = invite.id;
  end if;
  return jsonb_build_object('ok', true, 'seat', available_seat, 'alreadyJoined', false);
end;
$$;

create or replace function public.start_civic_game(
  p_game_id uuid,
  p_actor_id uuid,
  p_known_version bigint,
  p_current_player_id uuid,
  p_turn_deadline_at timestamptz,
  p_public_snapshot jsonb,
  p_private_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_game public.games%rowtype;
  joined_count integer;
  next_version bigint;
  event_id bigint;
begin
  select * into current_game from public.games where id = p_game_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); end if;
  if current_game.host_user_id <> p_actor_id then return jsonb_build_object('ok', false, 'code', 'HOST_ONLY'); end if;
  if current_game.status <> 'lobby' then return jsonb_build_object('ok', false, 'code', 'GAME_ALREADY_STARTED'); end if;
  if current_game.state_version <> p_known_version then return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'currentVersion', current_game.state_version); end if;
  select count(*) into joined_count from public.game_members where game_id = p_game_id and status = 'joined';
  if joined_count < 2 then return jsonb_build_object('ok', false, 'code', 'NEED_TWO_PLAYERS'); end if;
  if jsonb_typeof(p_public_snapshot) <> 'object' or jsonb_typeof(p_private_state) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATE');
  end if;

  next_version := current_game.state_version + 1;
  update public.games
  set state_version = next_version,
      status = 'active', current_player_id = p_current_player_id, turn_deadline_at = p_turn_deadline_at, started_at = now()
  where id = p_game_id;
  update public.game_public_snapshots set version = next_version, snapshot = p_public_snapshot, updated_at = now() where game_id = p_game_id;
  update public.game_private_states set version = next_version, state = p_private_state, updated_at = now() where game_id = p_game_id;
  insert into public.game_events (game_id, version, ordinal, kind, actor_id, message)
  values (p_game_id, next_version, 0, 'game_started', p_actor_id, 'Game started') returning id into event_id;
  return jsonb_build_object('ok', true, 'gameId', p_game_id, 'version', next_version, 'eventIds', jsonb_build_array(event_id));
end;
$$;

create or replace function public.leave_civic_game(p_game_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_game public.games%rowtype;
  active_others integer;
begin
  select * into current_game from public.games where id = p_game_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); end if;
  if current_game.status <> 'lobby' then return jsonb_build_object('ok', false, 'code', 'ACTIVE_GAME_RETAINS_SEAT'); end if;
  if not exists (select 1 from public.game_members where game_id = p_game_id and user_id = p_user_id and status = 'joined') then
    return jsonb_build_object('ok', false, 'code', 'NOT_A_MEMBER');
  end if;
  if current_game.host_user_id = p_user_id then
    select count(*) into active_others from public.game_members where game_id = p_game_id and user_id <> p_user_id and status = 'joined';
    if active_others > 0 then return jsonb_build_object('ok', false, 'code', 'HOST_MUST_TRANSFER'); end if;
    update public.games set status = 'abandoned', ended_at = now() where id = p_game_id;
  end if;
  update public.game_members set status = 'left', left_at = now() where game_id = p_game_id and user_id = p_user_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.transfer_civic_game_host(p_game_id uuid, p_actor_id uuid, p_target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.games where id = p_game_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); end if;
  if not public.is_civic_game_host(p_game_id, p_actor_id) then return jsonb_build_object('ok', false, 'code', 'HOST_ONLY'); end if;
  if not exists (select 1 from public.game_members where game_id = p_game_id and user_id = p_target_id and status = 'joined') then
    return jsonb_build_object('ok', false, 'code', 'TARGET_NOT_JOINED');
  end if;
  update public.games set host_user_id = p_target_id where id = p_game_id;
  update public.game_members set role = case when user_id = p_target_id then 'host'::public.civic_member_role else 'player'::public.civic_member_role end
  where game_id = p_game_id;
  return jsonb_build_object('ok', true, 'hostUserId', p_target_id);
end;
$$;

-- Safe public-lobby discovery: do not expose member identities or private rooms
-- to a user who has not joined. This bypasses member-table RLS only for this
-- deliberately small projection.
create or replace function public.list_public_civic_lobbies()
returns table (
  id uuid,
  title text,
  visibility public.civic_game_visibility,
  status public.civic_game_status,
  max_players smallint,
  seat_count bigint,
  host_display_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.title,
    g.visibility,
    g.status,
    g.max_players,
    count(m.user_id) filter (where m.status = 'joined') as seat_count,
    coalesce(p.display_name, 'Host') as host_display_name,
    g.created_at
  from public.games g
  left join public.game_members m on m.game_id = g.id
  left join public.profiles p on p.id = g.host_user_id
  where g.visibility = 'public' and g.status = 'lobby'
  group by g.id, p.display_name
  order by g.created_at desc
  limit 100;
$$;

revoke all on function public.commit_civic_game_action(uuid, uuid, bigint, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.bootstrap_civic_game(uuid, uuid, text, public.civic_game_visibility, smallint, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.join_civic_game(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.start_civic_game(uuid, uuid, bigint, uuid, timestamptz, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.leave_civic_game(uuid, uuid) from public, anon, authenticated;
revoke all on function public.transfer_civic_game_host(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_public_civic_lobbies() from public, anon;
grant execute on function public.commit_civic_game_action(uuid, uuid, bigint, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.bootstrap_civic_game(uuid, uuid, text, public.civic_game_visibility, smallint, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.join_civic_game(uuid, uuid, text) to service_role;
grant execute on function public.start_civic_game(uuid, uuid, bigint, uuid, timestamptz, jsonb, jsonb) to service_role;
grant execute on function public.leave_civic_game(uuid, uuid) to service_role;
grant execute on function public.transfer_civic_game_host(uuid, uuid, uuid) to service_role;
grant execute on function public.list_public_civic_lobbies() to authenticated, service_role;

-- Private Realtime authorization: members may subscribe to `game:<uuid>` and
-- publish Presence only. Only service-role Edge Functions broadcast state events.
drop policy if exists civic_game_realtime_read on realtime.messages;
create policy civic_game_realtime_read on realtime.messages
  for select to authenticated
  using (
    realtime.topic() like 'game:%'
    and public.is_civic_game_member(
      case when split_part(realtime.topic(), ':', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then split_part(realtime.topic(), ':', 2)::uuid else null end
    )
  );

drop policy if exists civic_game_realtime_presence on realtime.messages;
create policy civic_game_realtime_presence on realtime.messages
  for insert to authenticated
  with check (
    realtime.topic() like 'game:%'
    and realtime.messages.extension = 'presence'
    and public.is_civic_game_member(
      case when split_part(realtime.topic(), ':', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then split_part(realtime.topic(), ':', 2)::uuid else null end
    )
  );

grant select, insert on realtime.messages to authenticated;

comment on table public.game_private_states is 'Server-only canonical Civic Fortune state. RLS has no client policy; Edge Functions use service_role.';
comment on table public.game_action_receipts is 'Server-only idempotency receipts for authoritative action commits.';
