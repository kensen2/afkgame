-- =====================================================================
--  AFK Dungeon · Nick, clan, sıralama (Supabase / Postgres)
--  Proje: wfsskmchilndcsauubbs (eu-central-1). Bu dosya veritabanındaki şemanın kaynağıdır.
--  Kural: istemci tablolara doğrudan YAZAMAZ. Her değişiklik aşağıdaki
--  security definer fonksiyonlarla yapılır; yetki kontrolü sunucudadır.
--  (Aynı kurallar src/systems/clan-rules.js içinde de var.)
-- =====================================================================

-- ---------- oyuncular ----------
create table if not exists players (
  id          uuid primary key references auth.users(id) on delete cascade,
  nick        text not null check (char_length(nick) between 3 and 16 and nick ~ '^[A-Za-z0-9_]+$'),
  best_wave   int  not null default 0,
  base_rate   int  not null default 0,       -- saatlik üretim (clan bonusu hariç); sıralama bunu kullanır
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists players_nick_ci on players (lower(nick));

-- ---------- clanlar ----------
create table if not exists clans (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 3 and 20 and name ~ '^[A-Za-z0-9 _''-]+$'),
  tag         text not null check (tag ~ '^[A-Z0-9]{2,4}$'),
  created_at  timestamptz not null default now()
);
create unique index if not exists clans_name_ci on clans (lower(name));
create unique index if not exists clans_tag on clans (tag);

create table if not exists clan_members (
  clan_id     uuid not null references clans(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  role        text not null check (role in ('leader','officer','member')),
  joined_at   timestamptz not null default now(),
  primary key (player_id)                    -- bir oyuncu tek bir clanda
);
create index if not exists clan_members_clan on clan_members (clan_id);
-- her clanda tek lider
create unique index if not exists one_leader on clan_members (clan_id) where role = 'leader';

create table if not exists clan_requests (
  clan_id     uuid not null references clans(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (clan_id, player_id)
);

-- ---------- sıralama görünümü ----------
create or replace view clan_ranking with (security_invoker = true) as
select c.id, c.name, c.tag, count(m.player_id)::int as member_count,
       coalesce(sum(p.base_rate), 0)::bigint as total_rate,
       rank() over (order by coalesce(sum(p.base_rate), 0) desc, c.created_at) as rank
from clans c
left join clan_members m on m.clan_id = c.id
left join players p on p.id = m.player_id
group by c.id;

-- clan bonusu: ilk 5 → %10/5/3/2/1 (havuz sabit; bonus havuz payına yansır)
create or replace function clan_bonus(r bigint) returns numeric language sql immutable as $$
  select case r when 1 then 0.10 when 2 then 0.05 when 3 then 0.03 when 4 then 0.02 when 5 then 0.01 else 0 end
$$;

-- ---------- RLS: okuma herkese, yazma sadece fonksiyonlarla ----------
alter table players enable row level security;
alter table clans enable row level security;
alter table clan_members enable row level security;
alter table clan_requests enable row level security;
create policy read_players on players for select using (true);
create policy read_clans on clans for select using (true);
create policy read_members on clan_members for select using (true);
-- istekleri sadece sahibi ve o clanın lider/officer'ı görür
create policy read_requests on clan_requests for select using (
  player_id = auth.uid() or exists (select 1 from clan_members m where m.clan_id = clan_requests.clan_id
    and m.player_id = auth.uid() and m.role in ('leader','officer')));

-- ---------- yardımcı ----------
create or replace function my_role(c uuid) returns text language sql stable security definer set search_path = public, pg_temp as $$
  select role from clan_members where clan_id = c and player_id = auth.uid()
$$;

-- ---------- işlemler ----------
-- Kurma: 25.000 DGN bakiyeden düşülür (bakiye tablosu Faz 2 ekonomi taşımasıyla gelecek)
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

-- Nick: sadece sunucu fonksiyonuyla alınır (ayrılmış adlar burada da engellenir)
create or replace function set_nick(p_nick text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  p_nick := trim(p_nick);       -- kontrol ve kayıt aynı metin üzerinden (baştaki boşlukla ayrılmış ad kuralı aşılmasın)
  if p_nick ~* '^(admin|mod|moderator|system|dev|support|official)' then raise exception 'nick_reserved'; end if;
  insert into players (id, nick) values (auth.uid(), p_nick)
  on conflict (id) do update set nick = excluded.nick, updated_at = now();
exception when unique_violation then raise exception 'nick_taken';
end $$;

-- =====================================================================
--  Faz 1.5: oyunun okuduğu fonksiyonlar ve istatistik
-- =====================================================================

-- Dalgaya göre saatlik üretim (src/config.js F.rateAt ile aynı).
-- 1–20: elle yazılmış tablo; 21+: 2.000 tabanı + her anahtar kademesi paketini 48 saatte geri üretir.
create or replace function rate_at(w int) returns int language plpgsql immutable set search_path = public, pg_temp as $$
declare
  free int[] := array[57,93,132,174,218,261,307,354,403,451,502,552,605,657,712,766,823,879,938,1000];
  usd  int[] := array[10,15,25,40,60,100,200,500];      -- anahtar paketi fiyatları ($), kademe başına 10 dalga
  r numeric := 2000; k int; f int;
begin
  if w <= 0 then return 0; end if;
  if w <= 20 then return free[w]; end if;
  for k in 1..8 loop
    f := 21 + (k - 1) * 10;
    exit when w < f;
    r := r + (usd[k] / 0.0001) / 48.0 / 10 * (least(w, f + 9) - f + 1);
  end loop;
  return round(r);
end $$;

-- Kendi istatistiğini bildir. Üretim (base_rate) sunucuda dalgadan hesaplanır; istemci sadece dalgayı söyler.
-- DİKKAT: dalga hâlâ istemciden geliyor (Faz 2'de sunucu kendi kaydına göre hesaplayacak).
create or replace function set_my_stats(p_wave int) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare w int := least(greatest(coalesce(p_wave, 0), 0), 100);
begin
  update players set best_wave = w, base_rate = rate_at(w), updated_at = now() where id = auth.uid();
end $$;

-- Ben kimim: nick, clan, rol, bekleyen isteklerim
create or replace function get_me() returns json language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object(
    'id', auth.uid(),
    'nick', (select nick from players where id = auth.uid()),
    'clanId', m.clan_id, 'role', m.role,
    'outgoing', coalesce((select json_agg(clan_id) from clan_requests where player_id = auth.uid()), '[]'::json))
  from (select 1) x left join clan_members m on m.player_id = auth.uid()
$$;

-- Oyuncu sıralaması (ilk N) + benim satırım
create or replace function leaderboard_players(lim int default 100) returns json language sql stable security definer set search_path = public, pg_temp as $$
  with r as (
    select p.id, p.nick, p.best_wave as wave, p.base_rate as rate, c.tag,
           row_number() over (order by p.base_rate desc, p.best_wave desc, p.created_at) as rank
    from players p left join clan_members m on m.player_id = p.id left join clans c on c.id = m.clan_id)
  select json_build_object(
    'rows', coalesce((select json_agg(json_build_object('rank', rank, 'nick', nick, 'wave', wave, 'rate', rate, 'tag', tag, 'isMe', id = auth.uid()) order by rank)
                      from r where rank <= least(greatest(lim, 1), 200)), '[]'::json),
    'me', (select json_build_object('rank', rank, 'nick', nick, 'wave', wave, 'rate', rate, 'tag', tag, 'isMe', true) from r where id = auth.uid()),
    'total', (select count(*) from r))
$$;

-- Clan özeti (sıralama + bonus + lider)
create or replace function clan_summary(cr clan_ranking) returns json language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object('id', cr.id, 'name', cr.name, 'tag', cr.tag, 'rank', cr.rank, 'bonus', clan_bonus(cr.rank),
    'memberCount', cr.member_count, 'maxMembers', 250, 'totalRate', cr.total_rate, 'full', cr.member_count >= 250,
    'leader', coalesce((select p.nick from clan_members m join players p on p.id = m.player_id where m.clan_id = cr.id and m.role = 'leader'), '—'),
    'requested', exists (select 1 from clan_requests q where q.clan_id = cr.id and q.player_id = auth.uid()),
    'mine', exists (select 1 from clan_members m where m.clan_id = cr.id and m.player_id = auth.uid()))
$$;

create or replace function list_clans(q text default '', lim int default 50) returns json language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object(
    'rows', coalesce((select json_agg(clan_summary(x.cr) order by (x.cr).rank) from (
       select cr from clan_ranking cr where coalesce(q, '') = '' or lower(cr.name) like '%' || lower(q) || '%' or lower(cr.tag) like '%' || lower(q) || '%'
       order by cr.rank limit least(greatest(lim, 1), 200)) x), '[]'::json),
    'mine', (select clan_summary(cr) from clan_ranking cr join clan_members m on m.clan_id = cr.id where m.player_id = auth.uid()),
    'total', (select count(*) from clans))
$$;

-- Bir clanın detayı. İstek listesi sadece o clanın lider/officer'ına döner.
create or replace function get_clan(c uuid) returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare cr clan_ranking; r text; out json;
begin
  select * into cr from clan_ranking where id = c;
  if not found then raise exception 'not_found'; end if;
  r := my_role(c);
  select json_build_object('summary', clan_summary(cr), 'myRole', r,
    'members', coalesce((select json_agg(json_build_object('id', p.id, 'nick', p.nick, 'wave', p.best_wave, 'rate', p.base_rate, 'role', m.role,
                 'joinedAt', extract(epoch from m.joined_at) * 1000, 'isMe', p.id = auth.uid())
               order by case m.role when 'leader' then 0 when 'officer' then 1 else 2 end, p.base_rate desc)
               from clan_members m join players p on p.id = m.player_id where m.clan_id = c), '[]'::json),
    'requests', case when r in ('leader','officer') then coalesce((select json_agg(json_build_object('id', p.id, 'nick', p.nick, 'wave', p.best_wave, 'rate', p.base_rate,
                 'at', extract(epoch from q.created_at) * 1000) order by q.created_at)
               from clan_requests q join players p on p.id = q.player_id where q.clan_id = c), '[]'::json) else null end,
    'createdAt', extract(epoch from (select created_at from clans where id = c)) * 1000)
  into out;
  return out;
end $$;

-- Kurmadan önce ad/etiket kontrolü (ücret alınmadan önce)
create or replace function check_clan(p_name text, p_tag text) returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from players where id = auth.uid()) then raise exception 'need_nick'; end if;
  if exists (select 1 from clan_members where player_id = auth.uid()) then raise exception 'already_in_clan'; end if;
  if exists (select 1 from clans where lower(name) = lower(regexp_replace(trim(p_name), '\s+', ' ', 'g'))) then raise exception 'clan_name_taken'; end if;
  if exists (select 1 from clans where tag = upper(trim(p_tag))) then raise exception 'clan_tag_taken'; end if;
end $$;

-- Yetkiler: fonksiyonları sadece giriş yapmış oyuncular çağırabilir
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
-- yardımcılar sadece diğer fonksiyonların içinden çalışır
revoke execute on function my_role(uuid) from authenticated;
revoke execute on function clan_summary(clan_ranking) from authenticated;
-- istemci tablolara doğrudan yazamaz (RLS de engelliyor; bu ikinci kilit)
revoke insert, update, delete, truncate, references, trigger on players, clans, clan_members, clan_requests from anon, authenticated;

-- CANLIYA ÇIKMADAN ÖNCE (Faz 2):
--  1) players.base_rate / best_wave ASLA istemciden alınmaz. Sunucu, kendi tuttuğu duruma
--     (açılmış dalga, anahtarlar) göre hesaplar ve config'teki en yüksek değerle sınırlar.
--     Aksi halde bir oyuncu sahte üretim göndererek clanını 1. yapar ve havuz payını kaydırır.
--  2) create_clan içindeki 25.000 DGN düşümü (spend_tokens) eklenmeden clan kurma açılmaz.
