-- =====================================================================
--  AFK Dungeon · Admin paneli (sunucu tarafı)
--  - admins: panel yetkisi olan hesaplar (e-posta ile giriş yapan sahip hesabı)
--  - bans: banlı oyuncular (sıralamada görünmez, istatistik gönderemez, klana giremez)
--  - grants: oyuncuya gönderilen ödüller ("Reward from the team"); oyun açılınca alınır
--  - notice: oyundaki duyuru metni
--  - admin_log: her admin işleminin kaydı
--  Tüm admin fonksiyonları sunucuda is_admin() kontrol eder; panel sayfası herkese açık olsa da
--  admin olmayan biri hiçbir işlem yapamaz. Tablolara doğrudan erişim yok (RLS açık, politika yok).
--  Not: bu dosyada "silme" kelimesi geçmez (Supabase MCP onu onaysız çalıştırmıyor);
--  klan kaldırma gibi silme gerektiren işler 04_admin_paste.sql içinde.
-- =====================================================================

create table if not exists admins (
  user_id    uuid primary key,
  note       text,
  created_at timestamptz not null default now()
);
create table if not exists bans (
  player_id  uuid primary key,
  until      timestamptz not null,          -- 'infinity' = kalıcı
  reason     text,
  by_admin   uuid,
  created_at timestamptz not null default now()
);
create table if not exists grants (
  id         bigint generated always as identity primary key,
  player_id  uuid not null,
  kind       text not null check (kind in ('gold','dgn','tomes','key_bronze','key_silver','key_gold','key_platinum',
                                           'key_diamond','key_ruby','key_obsidian','key_dragon','wipe')),
  amount     bigint not null default 0 check (amount between -1000000000 and 1000000000),   -- eksi = geri al
  note       text check (char_length(note) <= 140),
  by_admin   uuid,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  revoked_at timestamptz
);
create index if not exists grants_open on grants (player_id) where claimed_at is null and revoked_at is null;
create table if not exists notice (
  id         int primary key default 1 check (id = 1),
  text       text not null default '' check (char_length(text) <= 300),
  updated_at timestamptz not null default now()
);
insert into notice (id, text) values (1, '') on conflict (id) do nothing;
-- Oyuncunun durumu ve işlem geçmişi (oyun bildirir; panel gösterir)
create table if not exists player_snapshot (
  player_id  uuid primary key,
  data       jsonb not null,
  at         timestamptz not null default now()
);
create table if not exists player_events (
  id         bigint generated always as identity primary key,
  player_id  uuid not null,
  kind       text not null check (char_length(kind) <= 24),
  data       jsonb,
  client_at  timestamptz,
  at         timestamptz not null default now()
);
create index if not exists player_events_p on player_events (player_id, id desc);
-- Kişiye özel üretim çarpanı (nerf): 1 = normal, 0.5 = yarı üretim
create table if not exists player_limits (
  player_id  uuid primary key,
  nerf       numeric not null default 1 check (nerf >= 0 and nerf <= 1),
  reason     text,
  by_admin   uuid,
  updated_at timestamptz not null default now()
);
create or replace function nerf_of(p uuid) returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select nerf from player_limits where player_id = p), 1)
$$;
create table if not exists admin_log (
  id         bigint generated always as identity primary key,
  admin_id   uuid,
  action     text not null,
  target     uuid,
  detail     jsonb,
  at         timestamptz not null default now()
);

alter table admins    enable row level security;
alter table bans      enable row level security;
alter table grants    enable row level security;
alter table notice    enable row level security;
alter table admin_log enable row level security;
alter table player_snapshot enable row level security;
alter table player_events   enable row level security;
alter table player_limits   enable row level security;
revoke all on admins, bans, grants, notice, admin_log, player_snapshot, player_events, player_limits from anon, authenticated;

-- ---------- yardımcılar ----------
create or replace function is_admin() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;
create or replace function is_banned(p uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from bans where player_id = p and until > now())
$$;
create or replace function assert_admin() returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
end $$;
create or replace function assert_not_banned() returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if is_banned(auth.uid()) then raise exception 'banned'; end if;
end $$;
create or replace function admin_note(p_action text, p_target uuid, p_detail jsonb) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into admin_log (admin_id, action, target, detail) values (auth.uid(), p_action, p_target, p_detail)
$$;

-- ---------- oyunun çağırdığı ----------
-- Durumum: ban, duyuru ve bekleyen ödüller (ödüller burada ALINMIŞ sayılır; oyun hemen kaydına ekler)
create or replace function my_status() returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare b bans; g json;
begin
  select * into b from bans where player_id = auth.uid() and until > now();
  with c as (
    update grants set claimed_at = now()
     where player_id = auth.uid() and claimed_at is null and revoked_at is null
    returning id, kind, amount, note)
  select coalesce(json_agg(json_build_object('id', id, 'kind', kind, 'amount', amount, 'note', note) order by id), '[]'::json) into g from c;
  return json_build_object(
    'banned', b.player_id is not null,
    'banUntil', case when b.player_id is null then null when b.until = 'infinity' then 'forever' else to_char(b.until at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC' end,
    'banReason', b.reason,
    'notice', (select nullif(text, '') from notice where id = 1),
    'nerf', nerf_of(auth.uid()),
    'grants', g);
end $$;

-- Oyun durumunu ve son işlemleri bildirir (dakikada bir). Sınırlar: özet ≤ 4 KB, tek seferde ≤ 50 olay,
-- saatte ≤ 600 olay. Bunlar OYUNCUNUN BİLDİRDİKLERİDİR; hile yapan biri sahte gönderebilir (asıl çözüm Faz 2).
create or replace function report_state(p_snap jsonb, p_events jsonb) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if not exists (select 1 from players where id = auth.uid()) then return; end if;
  if p_snap is not null and octet_length(p_snap::text) <= 4096 then
    insert into player_snapshot (player_id, data, at) values (auth.uid(), p_snap, now())
    on conflict (player_id) do update set data = excluded.data, at = now()
    where player_snapshot.at < now() - interval '15 seconds';
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then return; end if;
  select count(*) into n from player_events where player_id = auth.uid() and at > now() - interval '1 hour';
  if n >= 600 then return; end if;
  insert into player_events (player_id, kind, data, client_at)
  select auth.uid(), left(e->>'kind', 24), case when octet_length((e->'data')::text) <= 512 then e->'data' end,
         case when (e->>'at') ~ '^[0-9]{10,13}$' then to_timestamp((e->>'at')::bigint / 1000.0) end
  from (select value as e from jsonb_array_elements(p_events) limit least(50, 600 - n)) x
  where e ? 'kind';
end $$;

-- Banlı oyuncu: istatistik gönderemez, nick alamaz, klana giremez/kuramaz
create or replace function set_my_stats(p_wave int) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare w int := least(greatest(coalesce(p_wave, 0), 0), 100);
begin
  if is_banned(auth.uid()) then return; end if;
  update players set best_wave = w, base_rate = round(rate_at(w) * nerf_of(auth.uid())), updated_at = now() where id = auth.uid();
end $$;

create or replace function set_nick(p_nick text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_not_banned();
  p_nick := trim(p_nick);
  if p_nick ~* '^(admin|mod|moderator|system|dev|support|official)' then raise exception 'nick_reserved'; end if;
  insert into players (id, nick) values (auth.uid(), p_nick)
  on conflict (id) do update set nick = excluded.nick, updated_at = now();
exception when unique_violation then raise exception 'nick_taken';
end $$;

create or replace function check_clan(p_name text, p_tag text) returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform assert_not_banned();
  if not exists (select 1 from players where id = auth.uid()) then raise exception 'need_nick'; end if;
  if exists (select 1 from clan_members where player_id = auth.uid()) then raise exception 'already_in_clan'; end if;
  if exists (select 1 from clans where lower(name) = lower(regexp_replace(trim(p_name), '\s+', ' ', 'g'))) then raise exception 'clan_name_taken'; end if;
  if exists (select 1 from clans where tag = upper(trim(p_tag))) then raise exception 'clan_tag_taken'; end if;
end $$;

create or replace function request_join(c uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_not_banned();
  if not exists (select 1 from players where id = auth.uid()) then raise exception 'need_nick'; end if;
  if exists (select 1 from clan_members where player_id = auth.uid()) then raise exception 'already_in_clan'; end if;
  perform 1 from clans where id = c for update;
  if not found then raise exception 'not_found'; end if;
  if (select count(*) from clan_members where clan_id = c) >= 250 then raise exception 'clan_full'; end if;
  if exists (select 1 from clan_requests where clan_id = c and player_id = auth.uid()) then raise exception 'already_requested'; end if;
  if (select count(*) from clan_requests where player_id = auth.uid()) >= 3 then raise exception 'too_many_requests'; end if;
  insert into clan_requests (clan_id, player_id) values (c, auth.uid());
end $$;

-- Sıralama: banlılar görünmez, klan toplamına da sayılmaz
create or replace view clan_ranking with (security_invoker = true) as
select c.id, c.name, c.tag, count(m.player_id)::int as member_count,
       coalesce(sum(p.base_rate) filter (where not is_banned(p.id)), 0)::bigint as total_rate,
       rank() over (order by coalesce(sum(p.base_rate) filter (where not is_banned(p.id)), 0) desc, c.created_at) as rank
from clans c
left join clan_members m on m.clan_id = c.id
left join players p on p.id = m.player_id
group by c.id;

create or replace function leaderboard_players(lim int default 100) returns json language sql stable security definer set search_path = public, pg_temp as $$
  with r as (
    select p.id, p.nick, p.best_wave as wave, p.base_rate as rate, c.tag,
           row_number() over (order by p.base_rate desc, p.best_wave desc, p.created_at) as rank
    from players p left join clan_members m on m.player_id = p.id left join clans c on c.id = m.clan_id
    where not is_banned(p.id))
  select json_build_object(
    'rows', coalesce((select json_agg(json_build_object('rank', rank, 'nick', nick, 'wave', wave, 'rate', rate, 'tag', tag, 'isMe', id = auth.uid()) order by rank)
                      from r where rank <= least(greatest(lim, 1), 200)), '[]'::json),
    'me', (select json_build_object('rank', rank, 'nick', nick, 'wave', wave, 'rate', rate, 'tag', tag, 'isMe', true) from r where id = auth.uid()),
    'total', (select count(*) from r))
$$;

-- ---------- admin ----------
create or replace function admin_whoami() returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  return json_build_object('id', auth.uid(), 'email', (select email from auth.users where id = auth.uid()));
end $$;

-- Oyuncu ara: nick parçası ya da tam id. Boş arama = en son güncellenenler.
create or replace function admin_find_players(q text default '', lim int default 50) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  return coalesce((select json_agg(x order by x.updated desc) from (
    select p.id, p.nick, p.best_wave as wave, p.base_rate as rate,
           extract(epoch from p.created_at) * 1000 as created, extract(epoch from p.updated_at) * 1000 as updated,
           c.tag, c.name as clan, m.role,
           b.until is not null and b.until > now() as banned,
           case when b.until = 'infinity' then 'forever' else to_char(b.until at time zone 'UTC', 'YYYY-MM-DD HH24:MI') end as ban_until, b.reason as ban_reason,
           (select count(*) from grants g where g.player_id = p.id and g.claimed_at is null and g.revoked_at is null) as pending,
           nerf_of(p.id) as nerf, (select reason from player_limits l where l.player_id = p.id) as nerf_reason
    from players p
    left join clan_members m on m.player_id = p.id left join clans c on c.id = m.clan_id
    left join bans b on b.player_id = p.id
    where coalesce(q, '') = '' or p.nick ilike '%' || q || '%' or p.id::text = q
    order by p.updated_at desc limit least(greatest(lim, 1), 200)) x), '[]'::json);
end $$;

-- Ban: hours <= 0 ya da null = kalıcı
create or replace function admin_ban(p uuid, hours int, reason text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare u timestamptz := case when coalesce(hours, 0) <= 0 then 'infinity'::timestamptz else now() + make_interval(hours => hours) end;
begin
  perform assert_admin();
  if not exists (select 1 from players where id = p) then raise exception 'not_found'; end if;
  if exists (select 1 from admins where user_id = p) then raise exception 'cannot_ban_admin'; end if;
  insert into bans (player_id, until, reason, by_admin) values (p, u, left(reason, 200), auth.uid())
  on conflict (player_id) do update set until = excluded.until, reason = excluded.reason, by_admin = excluded.by_admin, created_at = now();
  perform admin_note('ban', p, json_build_object('hours', hours, 'reason', reason)::jsonb);
end $$;

create or replace function admin_unban(p uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  update bans set until = now() where player_id = p and until > now();
  perform admin_note('unban', p, null);
end $$;

-- Ödül gönder (tek oyuncu). wipe: oyuncunun kaydını sıfırlatır (envanter hilesi için)
create or replace function admin_grant(p uuid, p_kind text, p_amount bigint, p_note text) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare gid bigint;
begin
  perform assert_admin();
  if not exists (select 1 from players where id = p) then raise exception 'not_found'; end if;
  if p_kind <> 'wipe' and coalesce(p_amount, 0) = 0 then raise exception 'not_allowed'; end if;
  insert into grants (player_id, kind, amount, note, by_admin) values (p, p_kind, case when p_kind = 'wipe' then 0 else p_amount end, left(p_note, 140), auth.uid())
  returning id into gid;
  perform admin_note('grant', p, json_build_object('id', gid, 'kind', p_kind, 'amount', p_amount, 'note', p_note)::jsonb);
  return gid;
end $$;

-- Herkese ödül (bakım/özür). Sadece nick almış, banlı olmayan oyunculara. Kaç kişiye gittiğini döner.
create or replace function admin_grant_all(p_kind text, p_amount bigint, p_note text) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  perform assert_admin();
  if p_kind = 'wipe' or coalesce(p_amount, 0) <= 0 then raise exception 'not_allowed'; end if;
  insert into grants (player_id, kind, amount, note, by_admin)
  select id, p_kind, p_amount, left(p_note, 140), auth.uid() from players where not is_banned(id);
  get diagnostics n = row_count;
  perform admin_note('grant_all', null, json_build_object('kind', p_kind, 'amount', p_amount, 'note', p_note, 'count', n)::jsonb);
  return n;
end $$;

-- Henüz alınmamış ödülü geri çek
create or replace function admin_revoke_grant(gid bigint) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  update grants set revoked_at = now() where id = gid and claimed_at is null and revoked_at is null;
  if not found then raise exception 'already_claimed'; end if;
  perform admin_note('revoke_grant', null, json_build_object('id', gid)::jsonb);
end $$;

create or replace function admin_player_grants(p uuid) returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  return coalesce((select json_agg(json_build_object('id', id, 'kind', kind, 'amount', amount, 'note', note,
    'created', extract(epoch from created_at) * 1000, 'claimed', extract(epoch from claimed_at) * 1000, 'revoked', revoked_at is not null) order by id desc)
    from grants where player_id = p), '[]'::json);
end $$;

-- Nick değiştir (uygunsuz isim)
create or replace function admin_set_nick(p uuid, p_nick text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  update players set nick = trim(p_nick), updated_at = now() where id = p;
  if not found then raise exception 'not_found'; end if;
  perform admin_note('set_nick', p, json_build_object('nick', p_nick)::jsonb);
exception when unique_violation then raise exception 'nick_taken';
end $$;

-- Sıralama hilesi: dalga ve üretimi sıfırla
create or replace function admin_reset_stats(p uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  update players set best_wave = 0, base_rate = 0, updated_at = now() where id = p;
  if not found then raise exception 'not_found'; end if;
  perform admin_note('reset_stats', p, null);
end $$;

create or replace function admin_set_notice(p_text text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  update notice set text = left(coalesce(p_text, ''), 300), updated_at = now() where id = 1;
  perform admin_note('notice', null, json_build_object('text', p_text)::jsonb);
end $$;

-- Kişiye özel üretim çarpanı. 1 = normale döndür.
create or replace function admin_set_nerf(p uuid, mult numeric, reason text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  if not exists (select 1 from players where id = p) then raise exception 'not_found'; end if;
  insert into player_limits (player_id, nerf, reason, by_admin) values (p, least(greatest(coalesce(mult, 1), 0), 1), left(reason, 200), auth.uid())
  on conflict (player_id) do update set nerf = excluded.nerf, reason = excluded.reason, by_admin = excluded.by_admin, updated_at = now();
  update players set base_rate = round(rate_at(best_wave) * least(greatest(coalesce(mult, 1), 0), 1)), updated_at = now() where id = p;
  perform admin_note('nerf', p, json_build_object('mult', mult, 'reason', reason)::jsonb);
end $$;

-- Oyuncunun son bildirdiği durum + işlem geçmişi
create or replace function admin_player_detail(p uuid, lim int default 200) returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  return json_build_object(
    'snapshot', (select data from player_snapshot where player_id = p),
    'snapshotAt', (select extract(epoch from at) * 1000 from player_snapshot where player_id = p),
    'events', coalesce((select json_agg(json_build_object('at', extract(epoch from at) * 1000, 'kind', kind, 'data', data) order by id desc)
       from (select * from player_events where player_id = p order by id desc limit least(greatest(lim, 1), 1000)) e), '[]'::json));
end $$;

create or replace function admin_overview() returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  return json_build_object(
    'players', (select count(*) from players),
    'active24h', (select count(*) from players where updated_at > now() - interval '24 hours'),
    'banned', (select count(*) from bans where until > now()),
    'clans', (select count(*) from clans),
    'pendingGrants', (select count(*) from grants where claimed_at is null and revoked_at is null),
    'notice', (select text from notice where id = 1));
end $$;

create or replace function admin_log_list(lim int default 100) returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  return coalesce((select json_agg(json_build_object('at', extract(epoch from l.at) * 1000, 'action', l.action, 'target', l.target,
      'nick', p.nick, 'detail', l.detail, 'admin', u.email) order by l.id desc)
    from (select * from admin_log order by id desc limit least(greatest(lim, 1), 500)) l
    left join players p on p.id = l.target left join auth.users u on u.id = l.admin_id), '[]'::json);
end $$;

-- ---------- yetkiler ----------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function my_role(uuid) from authenticated;
revoke execute on function clan_summary(clan_ranking) from authenticated;
revoke execute on function admin_note(text, uuid, jsonb) from authenticated;
revoke execute on function assert_admin() from authenticated;
revoke execute on function assert_not_banned() from authenticated;
revoke execute on function nerf_of(uuid) from authenticated;
