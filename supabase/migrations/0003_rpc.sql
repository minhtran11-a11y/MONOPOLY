-- ============================================================================
-- 0003_rpc.sql — atomic lobby RPCs (SECURITY DEFINER)
--
-- These run as the migration owner (table owner -> bypasses RLS), so they can
-- insert/delete room_players rows that clients themselves cannot touch.
-- All raise exceptions whose MESSAGE is a stable machine-readable code
-- (ROOM_NOT_FOUND, ROOM_FULL, ALREADY_STARTED, ALREADY_JOINED, ...); the
-- client (src/store/lobbyStore.ts toErrorCode) matches on these substrings.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- create_room(display_name, color, token) -> {room_id, code}
-- Generates a unique 6-char code from A-Z2-9 (no 0/O/1/I) and seats the
-- caller (host) at seat 0.
-- ----------------------------------------------------------------------------
create or replace function public.create_room(
    p_display_name text,
    p_color        text,
    p_token        text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    -- 24 letters (no I/O) + 8 digits (no 0/1) = 32 chars
    v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_uid      uuid := auth.uid();
    v_name     text := trim(coalesce(p_display_name, ''));
    v_color    text := trim(coalesce(p_color, ''));
    v_code     text;
    v_room_id  uuid;
    v_attempt  int := 0;
    i          int;
begin
    if v_uid is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;
    if v_name = '' or char_length(v_name) > 32 then
        raise exception 'BAD_DISPLAY_NAME';
    end if;
    if v_color = '' then
        raise exception 'BAD_COLOR';
    end if;

    loop
        v_attempt := v_attempt + 1;
        if v_attempt > 20 then
            raise exception 'CODE_GENERATION_FAILED';
        end if;

        v_code := '';
        for i in 1..6 loop
            -- random() in [0,1) -> index 1..32, never out of range
            v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::int, 1);
        end loop;

        begin
            insert into public.rooms (code, host_id)
            values (v_code, v_uid)
            returning id into v_room_id;
            exit; -- success
        exception
            when unique_violation then
                null; -- code collision: regenerate and retry
        end;
    end loop;

    insert into public.room_players (room_id, user_id, seat_index, display_name, color_hex, token_kind)
    values (v_room_id, v_uid, 0, v_name, v_color, coalesce(nullif(trim(p_token), ''), 'pawn'));

    return jsonb_build_object('room_id', v_room_id, 'code', v_code);
end;
$$;

-- ----------------------------------------------------------------------------
-- join_room(code, display_name, color, token) -> room_id
-- Locks the room row (FOR UPDATE) so concurrent joins serialize; picks the
-- lowest free seat below max_players.
-- ----------------------------------------------------------------------------
create or replace function public.join_room(
    p_code         text,
    p_display_name text,
    p_color        text,
    p_token        text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid   uuid := auth.uid();
    v_name  text := trim(coalesce(p_display_name, ''));
    v_color text := trim(coalesce(p_color, ''));
    v_room  public.rooms%rowtype;
    v_count int;
    v_seat  int;
begin
    if v_uid is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;
    if v_name = '' or char_length(v_name) > 32 then
        raise exception 'BAD_DISPLAY_NAME';
    end if;
    if v_color = '' then
        raise exception 'BAD_COLOR';
    end if;

    select * into v_room
    from public.rooms
    where code = upper(trim(coalesce(p_code, '')))
    for update;

    if not found then
        raise exception 'ROOM_NOT_FOUND';
    end if;
    if v_room.status <> 'lobby' then
        raise exception 'ALREADY_STARTED';
    end if;
    if exists (
        select 1 from public.room_players
        where room_id = v_room.id and user_id = v_uid
    ) then
        raise exception 'ALREADY_JOINED';
    end if;

    select count(*) into v_count
    from public.room_players
    where room_id = v_room.id;

    if v_count >= v_room.max_players then
        raise exception 'ROOM_FULL';
    end if;

    select gs.s into v_seat
    from generate_series(0, v_room.max_players - 1) as gs(s)
    where not exists (
        select 1 from public.room_players rp
        where rp.room_id = v_room.id and rp.seat_index = gs.s
    )
    order by gs.s
    limit 1;

    if v_seat is null then
        raise exception 'ROOM_FULL';
    end if;

    insert into public.room_players (room_id, user_id, seat_index, display_name, color_hex, token_kind)
    values (v_room.id, v_uid, v_seat, v_name, v_color, coalesce(nullif(trim(p_token), ''), 'pawn'));

    return v_room.id;
end;
$$;

-- ----------------------------------------------------------------------------
-- leave_room(room_id)
-- Removes the caller's seat (any room status, so players can exit finished
-- games too). Lobby housekeeping: delete the room when it empties, or promote
-- the lowest remaining seat to host when the host leaves. Idempotent.
-- ----------------------------------------------------------------------------
create or replace function public.leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid      uuid := auth.uid();
    v_room     public.rooms%rowtype;
    v_left     int;
    v_new_host uuid;
begin
    if v_uid is null then
        raise exception 'NOT_AUTHENTICATED';
    end if;

    select * into v_room
    from public.rooms
    where id = p_room_id
    for update;

    if not found then
        return; -- room already gone: nothing to do
    end if;

    delete from public.room_players
    where room_id = p_room_id and user_id = v_uid;

    if not found then
        return; -- caller was not seated: nothing to do
    end if;

    if v_room.status = 'lobby' then
        select count(*) into v_left
        from public.room_players
        where room_id = p_room_id;

        if v_left = 0 then
            delete from public.rooms where id = p_room_id;
        elsif v_room.host_id = v_uid then
            select user_id into v_new_host
            from public.room_players
            where room_id = p_room_id
            order by seat_index
            limit 1;

            update public.rooms
            set host_id = v_new_host
            where id = p_room_id;
        end if;
    end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants: authenticated only (functions default to PUBLIC execute).
-- ----------------------------------------------------------------------------
revoke execute on function public.create_room(text, text, text)            from public, anon;
revoke execute on function public.join_room(text, text, text, text)        from public, anon;
revoke execute on function public.leave_room(uuid)                         from public, anon;

grant execute on function public.create_room(text, text, text)             to authenticated;
grant execute on function public.join_room(text, text, text, text)         to authenticated;
grant execute on function public.leave_room(uuid)                          to authenticated;
