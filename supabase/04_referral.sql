-- =====================================================================
--  AFK Dungeon · Davet (referral) sistemi. schema.sql + 03_admin.sql üzerine uygulanır.
--  Kurallar (sahip kararı, 2026-10-20):
--   - Her oyuncunun 6 karakterlik bir davet kodu var (link: ?ref=KOD).
--   - Davet edilen kodu hesabı açıldıktan sonraki 48 saat içinde bir kez bağlar; sonra değişmez.
--   - Kendini davet etmek, karşılıklı davet ve aynı ağdan (IP) davet sayılmaz.
--   - Davet eden, arkadaşının oyundan kasaya taşıdığı tutarın (USD) %5'ini kazanır. Bu, arkadaşın kazancından
--     kesilmez; ödül havuzundan ödenir. Sezonluk tavan oyunda (CONFIG.v5.referral.seasonCapUsd).
--   - Kaynak: oyunun bildirdiği 'vault' olayları (player_events.data.usd). Faz 1'de bunlar oyuncu bildirimidir;
--     Faz 2'de çekimler sunucuda olunca aynı hesap sunucu verisiyle yapılır.
-- =====================================================================

alter table players add column if not exists ref_code text;
create unique index if not exists players_ref_code on players (ref_code);

create table if not exists referrals (
  invitee      uuid primary key references players(id) on delete cascade,
  inviter      uuid not null references players(id) on delete cascade,
  created_at   timestamptz not null default now(),
  claimed_upto bigint not null default 0,          -- bu olay id'sine kadar ödül hesaplandı
  earned_usd   numeric not null default 0,         -- davet edene bugüne kadar yazılan
  check (invitee <> inviter)
);
create index if not exists referrals_inviter on referrals (inviter);

-- Ağ kontrolü için IP'nin özeti (IP'nin kendisi saklanmaz)
create table if not exists player_ips (
  player_id  uuid not null references players(id) on delete cascade,
  ip_hash    text not null,
  at         timestamptz not null default now(),
  primary key (player_id, ip_hash)
);

alter table referrals enable row level security;
alter table player_ips enable row level security;
revoke all on referrals, player_ips from anon, authenticated;

create or replace function req_ip_hash() returns text language sql stable set search_path = public, pg_temp as $$
  select md5('afk-ref:' || coalesce(nullif(trim(split_part(
    coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1)), ''), 'unknown'))
$$;

create or replace function note_ip() returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not exists (select 1 from players where id = auth.uid()) then return; end if;
  insert into player_ips (player_id, ip_hash) values (auth.uid(), req_ip_hash())
  on conflict (player_id, ip_hash) do update set at = now();
end $$;

-- Kendi davet kodun (yoksa oluşturur)
create or replace function my_ref_code() returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare c text; tries int := 0; me_id uuid := auth.uid();
begin
  if not exists (select 1 from players where id = auth.uid()) then raise exception 'need_nick'; end if;
  select ref_code into c from players where id = auth.uid();
  while c is null and tries < 20 loop
    c := upper(substr(translate(md5(random()::text || clock_timestamp()::text || me_id::text), '01', ''), 1, 6));
    if char_length(c) < 6 or exists (select 1 from players where ref_code = c) then c := null; end if;
    tries := tries + 1;
  end loop;
  update players set ref_code = c where id = auth.uid() and ref_code is null;
  return (select ref_code from players where id = auth.uid());
end $$;

-- Davet kodunu bağla (bir kez)
create or replace function bind_ref(p_code text) returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); inv uuid; inv_nick text;
begin
  if not exists (select 1 from players where id = me) then raise exception 'need_nick'; end if;
  perform assert_not_banned();
  if exists (select 1 from referrals where invitee = me) then raise exception 'already_invited'; end if;
  select id, nick into inv, inv_nick from players where ref_code = upper(trim(coalesce(p_code, '')));
  if inv is null then raise exception 'ref_not_found'; end if;
  if inv = me or exists (select 1 from referrals where invitee = inv and inviter = me) then raise exception 'self_invite'; end if;
  if (select created_at from players where id = me) < now() - interval '48 hours' then raise exception 'ref_too_late'; end if;
  if is_banned(inv) then raise exception 'ref_not_found'; end if;
  perform note_ip();
  if exists (select 1 from player_ips a join player_ips b on a.ip_hash = b.ip_hash
             where a.player_id = me and b.player_id = inv) then raise exception 'same_network'; end if;
  insert into referrals (invitee, inviter, claimed_upto)
  values (me, inv, coalesce((select max(id) from player_events where player_id = me), 0));
  return json_build_object('inviter', inv_nick);
end $$;

-- Davet özeti: kodun, seni kim davet etti, davet ettiklerin
create or replace function my_referrals() returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid();
begin
  if not exists (select 1 from players where id = me) then raise exception 'need_nick'; end if;
  perform note_ip();
  return json_build_object(
    'code', my_ref_code(),
    'invitedBy', (select p.nick from referrals r join players p on p.id = r.inviter where r.invitee = me),
    'canBind', not exists (select 1 from referrals where invitee = me)
               and (select created_at from players where id = me) > now() - interval '48 hours',
    'earnedUsd', coalesce((select sum(earned_usd) from referrals where inviter = me), 0),
    'invitees', coalesce((select json_agg(json_build_object('nick', p.nick, 'wave', p.best_wave,
        'joined', extract(epoch from r.created_at) * 1000, 'earnedUsd', r.earned_usd,
        'active', p.updated_at > now() - interval '24 hours') order by r.created_at desc)
      from referrals r join players p on p.id = r.invitee where r.inviter = me), '[]'::json));
end $$;

-- Yeni davet ödüllerini al: davet edilenlerin son hesaplamadan beri kasaya taşıdıklarının %5'i (USD)
create or replace function claim_ref_rewards() returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); total numeric := 0;
begin
  if not exists (select 1 from players where id = me) or is_banned(me) then return json_build_object('usd', 0); end if;
  with fresh as (
    select r.invitee, max(e.id) as upto,
           sum(least(greatest(coalesce((e.data->>'usd')::numeric, 0), 0), 1000)) as usd
    from referrals r
    join player_events e on e.player_id = r.invitee and e.id > r.claimed_upto and e.kind = 'vault'
    where r.inviter = me and not is_banned(r.invitee)
      and jsonb_typeof(e.data->'usd') = 'number'
    group by r.invitee
  ), upd as (
    update referrals r set claimed_upto = f.upto, earned_usd = r.earned_usd + round(f.usd * 0.05, 4)
    from fresh f where r.invitee = f.invitee
    returning round(f.usd * 0.05, 4) as got
  )
  select coalesce(sum(got), 0) into total from upd;
  return json_build_object('usd', total);
end $$;

-- Admin: oyuncunun davet bilgisi
create or replace function admin_player_refs(p uuid) returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  return json_build_object(
    'code', (select ref_code from players where id = p),
    'invitedBy', (select json_build_object('id', r.inviter, 'nick', i.nick, 'at', extract(epoch from r.created_at) * 1000)
                  from referrals r join players i on i.id = r.inviter where r.invitee = p),
    'earnedUsd', coalesce((select sum(earned_usd) from referrals where inviter = p), 0),
    'invitees', coalesce((select json_agg(json_build_object('id', r.invitee, 'nick', x.nick, 'wave', x.best_wave,
        'at', extract(epoch from r.created_at) * 1000, 'earnedUsd', r.earned_usd,
        'sameNetwork', exists (select 1 from player_ips a join player_ips b on a.ip_hash = b.ip_hash
                               where a.player_id = p and b.player_id = r.invitee)) order by r.created_at desc)
      from referrals r join players x on x.id = r.invitee where r.inviter = p), '[]'::json));
end $$;

-- yetkiler: 03_admin.sql ile aynı düzen; iç yardımcılar oyuncuya kapalı
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function my_role(uuid) from authenticated;
revoke execute on function clan_summary(clan_ranking) from authenticated;
revoke execute on function admin_note(text, uuid, jsonb) from authenticated;
revoke execute on function assert_admin() from authenticated;
revoke execute on function assert_not_banned() from authenticated;
revoke execute on function nerf_of(uuid) from authenticated;
revoke execute on function note_ip() from authenticated;
revoke execute on function req_ip_hash() from authenticated;
revoke execute on function my_ref_code() from authenticated;
