-- =====================================================================
--  AFK Dungeon · Founding Raiders kampanyası (raid.html). Oyundan bağımsız; aynı Supabase projesi.
--  Kimlik: tarayıcının anonim oturumu (auth.uid()) → raiders satırı. Cüzdan imzası ve X/tweet doğrulaması
--  "raid" Edge Function'ında yapılır (supabase/functions/raid). Buradaki fonksiyonlar durum, görev, kart ve sıralama.
--  Ödüller dolar/token değildir: erken giriş, oyun içi rozet ve anahtarlar (sahip kararı, 2026-10-21).
--  Bitiş: raid_config.ends_at (1 Kasım 2026, 24:00 İstanbul).
-- =====================================================================

create table if not exists raid_config (
  id        int primary key default 1 check (id = 1),
  x_handle  text not null default 'bighashgame',
  post_url  text,                                   -- raid yapılacak gönderi (admin panelinden)
  ends_at   timestamptz not null default '2026-11-01 21:00:00+00',
  updated_at timestamptz not null default now()
);
insert into raid_config (id) values (1) on conflict (id) do nothing;

create table if not exists raiders (
  id           bigint generated always as identity primary key,
  user_id      uuid unique,                         -- şu anki tarayıcı oturumu (cüzdanla başka cihaza taşınabilir)
  code         text not null unique,                -- davet + X doğrulama kodu
  nonce        text not null,                       -- cüzdan imzası için tek kullanımlık
  wallet       text unique,
  x_handle     text unique,                         -- küçük harf
  x_display    text,
  x_tweet      text,
  x_at         timestamptz,
  followed     boolean not null default false,
  liked        boolean not null default false,
  reposted     boolean not null default false,
  reply_tweet  text,
  post_tweet   text,
  card_no      int unique,
  card_at      timestamptz,
  invited_by   bigint references raiders(id),
  ref_pending  text,
  status       text not null default 'ok' check (status in ('ok', 'rejected')),
  ip_hash      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists raiders_invited_by on raiders (invited_by);
create index if not exists raiders_ip on raiders (ip_hash);

create table if not exists raid_tweets (
  tweet_id   text primary key,                      -- bir tweet bir kez sayılır
  raider_id  bigint not null references raiders(id) on delete cascade,
  kind       text not null,
  at         timestamptz not null default now()
);

alter table raid_config enable row level security;
alter table raiders enable row level security;
alter table raid_tweets enable row level security;
revoke all on raid_config, raiders, raid_tweets from anon, authenticated;

-- Puanlar (sayfadaki tabloyla aynı)
create or replace function raid_invites(r raiders) returns int language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from raiders i
  where i.invited_by = r.id and i.x_handle is not null and i.status = 'ok' and i.ip_hash is distinct from r.ip_hash
$$;
create or replace function raid_points(r raiders) returns int language sql stable security definer set search_path = public, pg_temp as $$
  select case when r.status <> 'ok' then 0 else
    (case when r.wallet is not null then 50 else 0 end) + (case when r.x_handle is not null then 100 else 0 end)
    + (case when r.followed then 25 else 0 end) + (case when r.liked then 25 else 0 end) + (case when r.reposted then 25 else 0 end)
    + (case when r.reply_tweet is not null then 50 else 0 end) + (case when r.card_at is not null then 50 else 0 end)
    + (case when r.post_tweet is not null then 100 else 0 end) + least(raid_invites(r), 50) * 50 end
$$;

-- Kart: cüzdana bağlı, değişmez (nadirlik, kahraman, istatistikler)
create or replace function raid_card(r raiders) returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare h text := md5('afk-card:' || coalesce(r.wallet, r.code)); roll int; rar text; hero text;
begin
  roll := ('x' || substr(h, 1, 4))::bit(16)::int % 1000;
  rar := case when roll < 20 then 'Legendary' when roll < 100 then 'Epic' when roll < 350 then 'Rare' else 'Common' end;
  hero := (array['warrior', 'lion', 'mage'])[1 + ('x' || substr(h, 5, 2))::bit(8)::int % 3];
  return jsonb_build_object('no', r.card_no, 'rarity', rar, 'hero', hero,
    'atk', 40 + ('x' || substr(h, 7, 2))::bit(8)::int % 60, 'def', 40 + ('x' || substr(h, 9, 2))::bit(8)::int % 60,
    'luck', 40 + ('x' || substr(h, 11, 2))::bit(8)::int % 60);
end $$;

create or replace function raid_rank(r raiders) returns int language sql stable security definer set search_path = public, pg_temp as $$
  select 1 + count(*)::int from raiders o
  where o.status = 'ok' and o.x_handle is not null and o.id <> r.id
    and (raid_points(o) > raid_points(r) or (raid_points(o) = raid_points(r) and o.id < r.id))
$$;

create or replace function raid_new_code() returns text language plpgsql volatile set search_path = public, pg_temp as $$
declare c text;
begin
  loop
    c := upper(substr(translate(md5(random()::text || clock_timestamp()::text), '01', ''), 1, 6));
    exit when char_length(c) = 6 and not exists (select 1 from raiders where code = c);
  end loop;
  return c;
end $$;

-- Sayfa açılışı: satırı oluşturur (yoksa) ve bütün durumu döner
create or replace function raid_me(p_ref text default null) returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare me raiders; cfg raid_config;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into cfg from raid_config where id = 1;
  select * into me from raiders where user_id = auth.uid();
  if me.id is null then
    insert into raiders (user_id, code, nonce, ref_pending, ip_hash)
    values (auth.uid(), raid_new_code(), md5(random()::text || clock_timestamp()::text),
            nullif(upper(left(regexp_replace(coalesce(p_ref, ''), '[^A-Za-z0-9]', '', 'g'), 12)), ''), req_ip_hash())
    returning * into me;
  else
    update raiders set ip_hash = coalesce(ip_hash, req_ip_hash()),
      ref_pending = coalesce(ref_pending, nullif(upper(left(regexp_replace(coalesce(p_ref, ''), '[^A-Za-z0-9]', '', 'g'), 12)), ''))
    where id = me.id returning * into me;
  end if;
  return json_build_object(
    'code', me.code, 'nonce', me.nonce, 'wallet', me.wallet, 'x', me.x_display,
    'tasks', json_build_object('follow', me.followed, 'like', me.liked, 'repost', me.reposted,
      'reply', me.reply_tweet is not null, 'card', me.card_at is not null, 'post', me.post_tweet is not null),
    'card', case when me.card_at is not null then raid_card(me) end,
    'points', raid_points(me), 'rank', case when me.x_handle is not null then raid_rank(me) end,
    'invites', raid_invites(me), 'invitedBy', (select x_display from raiders where id = me.invited_by),
    'status', me.status,
    'config', json_build_object('xHandle', cfg.x_handle, 'postUrl', cfg.post_url,
      'tweetId', substring(coalesce(cfg.post_url, '') from '/status/([0-9]+)'),
      'endsAt', extract(epoch from cfg.ends_at) * 1000, 'now', extract(epoch from now()) * 1000));
end $$;

-- Takip / beğeni / repost: X ücretsiz API ile doğrulanamaz; işaretlenir, ödülden önce ilk 100 elle kontrol edilir
create or replace function raid_task(p_task text) returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare me raiders;
begin
  select * into me from raiders where user_id = auth.uid();
  if me.id is null then raise exception 'not_started'; end if;
  if me.x_handle is null then raise exception 'need_x'; end if;
  if now() > (select ends_at from raid_config where id = 1) then raise exception 'raid_ended'; end if;
  if p_task = 'follow' then update raiders set followed = true, updated_at = now() where id = me.id;
  elsif p_task = 'like' then update raiders set liked = true, updated_at = now() where id = me.id;
  elsif p_task = 'repost' then update raiders set reposted = true, updated_at = now() where id = me.id;
  else raise exception 'bad_task'; end if;
  return raid_me(null);
end $$;

-- Kartı al: sıra numarası verilir (Founding Raider #N)
create or replace function raid_claim_card() returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare me raiders;
begin
  select * into me from raiders where user_id = auth.uid();
  if me.id is null then raise exception 'not_started'; end if;
  if me.wallet is null or me.x_handle is null then raise exception 'need_x'; end if;
  if me.card_at is null then
    if now() > (select ends_at from raid_config where id = 1) then raise exception 'raid_ended'; end if;
    perform pg_advisory_xact_lock(7701);
    update raiders set card_no = coalesce((select max(card_no) from raiders), 0) + 1, card_at = now(), updated_at = now() where id = me.id;
  end if;
  return raid_me(null);
end $$;

-- Sıralama: ilk N + toplam
create or replace function raid_board(lim int default 100) returns json language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object(
    'total', (select count(*) from raiders where x_handle is not null and status = 'ok'),
    'rows', coalesce((select json_agg(json_build_object('x', x_display, 'points', pts, 'rarity', rar, 'card', card_at is not null) order by pts desc, id)
      from (select r.id, r.x_display, r.card_at, raid_points(r) as pts, raid_card(r)->>'rarity' as rar from raiders r where r.x_handle is not null and r.status = 'ok'
            order by raid_points(r) desc, r.id limit least(greatest(lim, 1), 100)) t), '[]'::json))
$$;

-- ---------- admin ----------
create or replace function admin_raiders(q text default '', lim int default 200) returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  return coalesce((select json_agg(x order by (x->>'points')::int desc, (x->>'id')::bigint) from (
    select json_build_object('id', r.id, 'x', r.x_display, 'wallet', r.wallet, 'points', raid_points(r), 'status', r.status,
      'invites', raid_invites(r), 'invitedBy', (select x_display from raiders where id = r.invited_by),
      'tasks', json_build_object('follow', r.followed, 'like', r.liked, 'repost', r.reposted, 'reply', r.reply_tweet, 'post', r.post_tweet, 'xTweet', r.x_tweet),
      'card', case when r.card_at is not null then raid_card(r) end, 'at', extract(epoch from r.created_at) * 1000,
      'sameIp', (select count(*) from raiders o where o.ip_hash = r.ip_hash and o.id <> r.id and o.x_handle is not null),
      'sameIpAsInviter', r.invited_by is not null and r.ip_hash = (select ip_hash from raiders where id = r.invited_by)) as x
    from raiders r where r.x_handle is not null
      and (coalesce(q, '') = '' or r.x_handle ilike '%' || lower(q) || '%' or r.wallet ilike '%' || lower(q) || '%')
    order by raid_points(r) desc, r.id limit least(greatest(lim, 1), 2000)) s), '[]'::json);
end $$;

create or replace function admin_raid_config() returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  return (select json_build_object('xHandle', x_handle, 'postUrl', post_url, 'endsAt', extract(epoch from ends_at) * 1000,
    'raiders', (select count(*) from raiders where x_handle is not null), 'wallets', (select count(*) from raiders where wallet is not null),
    'cards', (select count(*) from raiders where card_at is not null)) from raid_config where id = 1);
end $$;

create or replace function admin_raid_set(p_handle text, p_post_url text, p_ends_at timestamptz) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  if coalesce(p_post_url, '') <> '' and p_post_url !~ '^https://(x|twitter)\.com/[A-Za-z0-9_]{1,15}/status/[0-9]+' then raise exception 'bad_post_url'; end if;
  update raid_config set x_handle = coalesce(nullif(regexp_replace(coalesce(p_handle, ''), '[^A-Za-z0-9_]', '', 'g'), ''), x_handle),
    post_url = nullif(p_post_url, ''), ends_at = coalesce(p_ends_at, ends_at), updated_at = now() where id = 1;
  perform admin_note('raid_config', null, jsonb_build_object('handle', p_handle, 'post', p_post_url, 'ends', p_ends_at));
end $$;

create or replace function admin_raider_status(p_id bigint, p_status text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  if p_status not in ('ok', 'rejected') then raise exception 'bad_status'; end if;
  update raiders set status = p_status, updated_at = now() where id = p_id;
  perform admin_note('raider_' || p_status, null, jsonb_build_object('raider', p_id));
end $$;

-- yetkiler (önceki dosyalarla aynı düzen)
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
revoke execute on function player_risk(uuid) from authenticated;
revoke execute on function raid_new_code() from authenticated;
revoke execute on function raid_invites(raiders) from authenticated;
revoke execute on function raid_points(raiders) from authenticated;
revoke execute on function raid_card(raiders) from authenticated;
revoke execute on function raid_rank(raiders) from authenticated;
