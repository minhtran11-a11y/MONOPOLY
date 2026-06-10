-- ============================================================================
-- 0002_rls.sql — Row Level Security for the multiplayer MVP
--
-- Trust model:
--   * Clients (role authenticated, anonymous sign-in) may: read profiles/rooms,
--     read room membership, read their own game state, update their OWN lobby
--     seat flags (is_ready / color_hex / token_kind), and update their own
--     profile display_name.
--   * Seat claiming/leaving and room creation go through SECURITY DEFINER RPCs
--     (0003_rpc.sql) so they are atomic and validated.
--   * games / game_actions are written ONLY by the service-role Edge Function
--     (the authoritative referee). The service role bypasses RLS.
--
-- Column-level note: Postgres RLS cannot restrict WHICH columns an UPDATE may
-- touch, so column-level GRANTs are used (revoke broad UPDATE, grant narrow).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: membership test, SECURITY DEFINER so policies on room_players can
-- use it without recursing into room_players' own RLS.
-- ----------------------------------------------------------------------------
create or replace function public.is_room_member(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1
        from public.room_players rp
        where rp.room_id = rid
          and rp.user_id = (select auth.uid())
    );
$$;

revoke execute on function public.is_room_member(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Enable RLS everywhere
-- ----------------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.rooms        enable row level security;
alter table public.room_players enable row level security;
alter table public.games        enable row level security;
alter table public.game_actions enable row level security;

-- ----------------------------------------------------------------------------
-- profiles: read all (leaderboard/lobby names); write own row only.
-- games_won is protected by column-level grants (service role only).
-- ----------------------------------------------------------------------------
create policy profiles_select_all on public.profiles
    for select to authenticated
    using (true);

create policy profiles_insert_own on public.profiles
    for insert to authenticated
    with check (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
    for update to authenticated
    using (id = (select auth.uid()))
    with check (id = (select auth.uid()));

revoke insert, update, delete on table public.profiles from anon, authenticated;
grant insert (id, display_name) on table public.profiles to authenticated;
grant update (display_name)     on table public.profiles to authenticated;

-- ----------------------------------------------------------------------------
-- rooms: discoverable by any signed-in user (join-by-code preview);
-- insert only as self-host; update only by host while still in lobby,
-- and only max_players (status flips are service-role / RPC concerns).
-- No client deletes (leave_room RPC deletes empty lobbies).
-- ----------------------------------------------------------------------------
create policy rooms_select_authenticated on public.rooms
    for select to authenticated
    using (true);

create policy rooms_insert_self_host on public.rooms
    for insert to authenticated
    with check (host_id = (select auth.uid()));

create policy rooms_update_host_in_lobby on public.rooms
    for update to authenticated
    using (host_id = (select auth.uid()) and status = 'lobby')
    with check (host_id = (select auth.uid()) and status = 'lobby');

revoke insert, update, delete on table public.rooms from anon, authenticated;
grant insert (code, host_id, max_players) on table public.rooms to authenticated;
grant update (max_players)                on table public.rooms to authenticated;

-- ----------------------------------------------------------------------------
-- room_players: visible to room members AND to anyone while the room is in
-- lobby (joining preview). No client INSERT/DELETE (RPC only). UPDATE limited
-- to the caller's own row while the room is in lobby, and via column grants
-- to is_ready / color_hex / token_kind only.
-- ----------------------------------------------------------------------------
create policy room_players_select_member_or_lobby on public.room_players
    for select to authenticated
    using (
        public.is_room_member(room_id)
        or exists (
            select 1 from public.rooms r
            where r.id = room_players.room_id
              and r.status = 'lobby'
        )
    );

create policy room_players_update_self_in_lobby on public.room_players
    for update to authenticated
    using (
        user_id = (select auth.uid())
        and exists (
            select 1 from public.rooms r
            where r.id = room_players.room_id
              and r.status = 'lobby'
        )
    )
    with check (user_id = (select auth.uid()));

revoke insert, update, delete on table public.room_players from anon, authenticated;
grant update (is_ready, color_hex, token_kind) on table public.room_players to authenticated;

-- ----------------------------------------------------------------------------
-- games + game_actions: read-only for room members; ALL writes via the
-- service-role Edge Function (no client write policies at all).
-- ----------------------------------------------------------------------------
create policy games_select_member on public.games
    for select to authenticated
    using (public.is_room_member(room_id));

create policy game_actions_select_member on public.game_actions
    for select to authenticated
    using (
        exists (
            select 1 from public.games g
            where g.id = game_actions.game_id
              and public.is_room_member(g.room_id)
        )
    );

revoke insert, update, delete on table public.games        from anon, authenticated;
revoke insert, update, delete on table public.game_actions from anon, authenticated;

-- ----------------------------------------------------------------------------
-- Realtime: lobbyStore listens to postgres_changes on room_players.
-- (Broadcast channels used by the Edge Functions need no publication.)
-- ----------------------------------------------------------------------------
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        alter publication supabase_realtime add table public.room_players;
    end if;
end;
$$;
