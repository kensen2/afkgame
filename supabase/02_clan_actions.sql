-- AFK Dungeon · clan işlemleri (Supabase SQL Editor'e yapıştırıp Run de)
-- Tablolar ve okuma fonksiyonları zaten kuruldu; bu parça kurma, katılma, onay, atma, ayrılma işlemlerini ekler.
-- Tekrar çalıştırmak güvenlidir (create or replace).

create or replace function create_clan(p_name text, p_tag text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare cid uuid;
begin
  perform check_clan(p_name, p_tag);
  -- TODO(Faz 2): perform spend_tokens(auth.uid(), 25000, 'clan_create');
  insert into clans (name, tag) values (regexp_replace(trim(p_name), '\s+', ' ', 'g'), upper(trim(p_tag))) returning id into cid;
  insert into clan_members (clan_id, player_id, role) values (cid, auth.uid(), 'leader');
  delete from clan_requests where player_id = auth.uid();
  return cid;
end $$;

create or replace function request_join(c uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from players where id = auth.uid()) then raise exception 'need_nick'; end if;
  if exists (select 1 from clan_members where player_id = auth.uid()) then raise exception 'already_in_clan'; end if;
  perform 1 from clans where id = c for update;
  if not found then raise exception 'not_found'; end if;
  if (select count(*) from clan_members where clan_id = c) >= 250 then raise exception 'clan_full'; end if;
  if exists (select 1 from clan_requests where clan_id = c and player_id = auth.uid()) then raise exception 'already_requested'; end if;
  if (select count(*) from clan_requests where player_id = auth.uid()) >= 3 then raise exception 'too_many_requests'; end if;
  insert into clan_requests (clan_id, player_id) values (c, auth.uid());
end $$;

-- Onay/red: lider VE officer
create or replace function review_request(c uuid, p uuid, accept boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from clans where id = c for update;          -- aynı clandaki işlemleri sıraya sok (250 / 2 officer sınırı yarışmasın)
  if coalesce(my_role(c), '') not in ('leader','officer') then raise exception 'no_permission'; end if;
  delete from clan_requests where clan_id = c and player_id = p;
  if not found then raise exception 'not_found'; end if;
  if accept then
    if (select count(*) from clan_members where clan_id = c) >= 250 then raise exception 'clan_full'; end if;
    if exists (select 1 from clan_members where player_id = p) then raise exception 'not_found'; end if;
    insert into clan_members (clan_id, player_id, role) values (c, p, 'member');
    delete from clan_requests where player_id = p;        -- diğer isteklerini kapat
  end if;
end $$;

-- Aşağıdakiler SADECE lider
create or replace function set_officer(c uuid, p uuid, on_ boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from clans where id = c for update;
  if coalesce(my_role(c), '') <> 'leader' then raise exception 'no_permission'; end if;
  if on_ and (select count(*) from clan_members where clan_id = c and role = 'officer') >= 2 then raise exception 'officers_full'; end if;
  update clan_members set role = case when on_ then 'officer' else 'member' end
   where clan_id = c and player_id = p and role <> 'leader';
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function kick_member(c uuid, p uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from clans where id = c for update;
  if coalesce(my_role(c), '') <> 'leader' then raise exception 'no_permission'; end if;
  delete from clan_members where clan_id = c and player_id = p and role <> 'leader';
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function transfer_leader(c uuid, p uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from clans where id = c for update;
  if coalesce(my_role(c), '') <> 'leader' then raise exception 'no_permission'; end if;
  if not exists (select 1 from clan_members where clan_id = c and player_id = p and player_id <> auth.uid()) then raise exception 'not_found'; end if;
  update clan_members set role = 'member' where clan_id = c and player_id = auth.uid();
  update clan_members set role = 'leader' where clan_id = c and player_id = p;
end $$;

create or replace function disband_clan(c uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from clans where id = c for update;
  if coalesce(my_role(c), '') <> 'leader' then raise exception 'no_permission'; end if;
  delete from clans where id = c;
end $$;

create or replace function leave_clan() returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c uuid; r text;
begin
  select clan_id, role into c, r from clan_members where player_id = auth.uid();
  if c is null then raise exception 'not_in_clan'; end if;
  if r = 'leader' then
    if (select count(*) from clan_members where clan_id = c) > 1 then raise exception 'leader_must_transfer'; end if;
    delete from clans where id = c;
  else
    delete from clan_members where player_id = auth.uid();
  end if;
end $$;

create or replace function cancel_request(c uuid) returns void language sql security definer set search_path = public, pg_temp as $$
  delete from clan_requests where clan_id = c and player_id = auth.uid()
$$;


revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
-- yardımcılar sadece diğer fonksiyonların içinden çalışır
revoke execute on function my_role(uuid) from authenticated;
revoke execute on function clan_summary(clan_ranking) from authenticated;
-- istemci tablolara doğrudan yazamaz (RLS de engelliyor; bu ikinci kilit)
revoke insert, update, delete, truncate, references, trigger on players, clans, clan_members, clan_requests from anon, authenticated;
