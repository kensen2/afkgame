-- =====================================================================
--  AFK Dungeon · Çekim talepleri ve hile/bot analizi (admin paneli "Withdrawals").
--  schema.sql + 03_admin.sql + 04_referral.sql üzerine uygulanır.
--   - Oyun her açılışta cihaz bilgisini bildirir (note_device): cihaz kimliği (tarayıcıda saklanan rastgele id),
--     tarayıcı parmak izi (özet), user agent, mobil mi, otomasyon (webdriver) işareti, saat dilimi, ekran.
--   - Çekim talebi = oyunun bildirdiği 'vault' (oyundan kasaya) ve 'withdraw' (kasadan cüzdana) olayları.
--   - player_risk(): aynı cihaz, aynı ağ (IP özeti), bot belirtileri ve ekonomi tutarsızlıklarını işaretler.
--   - Admin talebi onaylar ya da reddeder (Faz 1'de zincirde bir şey olmaz; Faz 3'te ödeme onaya bağlanır).
--  Not: Faz 1'de oyun verisi oyuncunun bildirdiğidir; işaretler karar değil, inceleme ipucudur.
-- =====================================================================

create table if not exists player_devices (
  player_id  uuid not null references players(id) on delete cascade,
  dev_id     text not null,
  fp         text not null,
  ua         text,
  mobile     boolean,
  webdriver  boolean,
  tz         text,
  screen     text,
  first_at   timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  primary key (player_id, dev_id, fp)
);
create index if not exists player_devices_dev on player_devices (dev_id);
create index if not exists player_devices_fp on player_devices (fp);
create index if not exists player_ips_hash on player_ips (ip_hash);
create index if not exists player_events_kind on player_events (kind, id desc);

create table if not exists withdraw_reviews (
  event_id   bigint primary key,
  player_id  uuid not null,
  status     text not null check (status in ('approved', 'rejected')),
  note       text check (char_length(note) <= 200),
  admin_id   uuid,
  at         timestamptz not null default now()
);

alter table player_devices enable row level security;
alter table withdraw_reviews enable row level security;
revoke all on player_devices, withdraw_reviews from anon, authenticated;

-- Oyun bildirir (açılışta ve saatte bir)
create or replace function note_device(p_dev text, p_fp text, p_ua text, p_mobile boolean, p_webdriver boolean, p_tz text, p_screen text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not exists (select 1 from players where id = auth.uid()) then return; end if;
  if coalesce(p_dev, '') !~ '^[A-Za-z0-9-]{8,64}$' or coalesce(p_fp, '') !~ '^[a-f0-9]{8,64}$' then return; end if;
  insert into player_devices (player_id, dev_id, fp, ua, mobile, webdriver, tz, screen)
  values (auth.uid(), p_dev, p_fp, left(p_ua, 300), p_mobile, p_webdriver, left(p_tz, 64), left(p_screen, 32))
  on conflict (player_id, dev_id, fp) do update set last_at = now(), ua = excluded.ua, mobile = excluded.mobile,
    webdriver = coalesce(player_devices.webdriver, false) or coalesce(excluded.webdriver, false), tz = excluded.tz, screen = excluded.screen;
  perform note_ip();
end $$;

-- Bir oyuncunun risk analizi: { verdict: ok|check|multi|bot|cheat, flags: [{level, kind, text}], devices: [...], ipCount }
create or replace function player_risk(p uuid) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  flags jsonb := '[]'::jsonb; snap jsonb; econ jsonb; pl players%rowtype;
  n int; names text; x numeric; y numeric; best int; age_h numeric; verdict text := 'ok';
begin
  select * into pl from players where id = p;
  if pl.id is null then return jsonb_build_object('verdict', 'ok', 'flags', '[]'::jsonb); end if;
  select data into snap from player_snapshot where player_id = p;
  econ := snap->'econ';
  age_h := extract(epoch from now() - pl.created_at) / 3600;

  -- 1) aynı cihaz (tarayıcıda saklanan cihaz kimliği aynı)
  select count(distinct d2.player_id), string_agg(distinct x2.nick, ', ') into n, names
  from player_devices d1 join player_devices d2 on d2.dev_id = d1.dev_id and d2.player_id <> p
  join players x2 on x2.id = d2.player_id where d1.player_id = p;
  if n > 0 then flags := flags || jsonb_build_object('level', 'high', 'kind', 'device',
    'text', format('Same device as %s other account(s): %s', n, names)); end if;

  -- 2) aynı tarayıcı parmak izi ama farklı cihaz kimliği (aynı PC'de silinmiş kayıt ya da aynı model telefon)
  select count(distinct d2.player_id), string_agg(distinct x2.nick, ', ') into n, names
  from player_devices d1 join player_devices d2 on d2.fp = d1.fp and d2.dev_id <> d1.dev_id and d2.player_id <> p
  join players x2 on x2.id = d2.player_id where d1.player_id = p
    and not exists (select 1 from player_devices d3 where d3.player_id = d2.player_id and d3.dev_id = d1.dev_id);
  if n > 0 then flags := flags || jsonb_build_object('level', 'med', 'kind', 'device',
    'text', format('Same browser fingerprint as %s: %s (same PC with cleared data, or the same phone model)', n, names)); end if;

  -- 3) aynı ağ (IP özeti)
  select count(distinct b.player_id), string_agg(distinct x2.nick, ', ') into n, names
  from player_ips a join player_ips b on b.ip_hash = a.ip_hash and b.player_id <> p
  join players x2 on x2.id = b.player_id where a.player_id = p and b.at > now() - interval '30 days';
  if n >= 3 then flags := flags || jsonb_build_object('level', 'high', 'kind', 'network', 'text', format('Same internet (IP) as %s accounts: %s', n, names));
  elsif n > 0 then flags := flags || jsonb_build_object('level', 'med', 'kind', 'network', 'text', format('Same internet (IP) as: %s (family, café or the same person)', names)); end if;

  -- 4) davet + aynı ağ/cihaz = davet çiftliği
  select count(*), string_agg(distinct x2.nick, ', ') into n, names
  from referrals r join players x2 on x2.id = case when r.inviter = p then r.invitee else r.inviter end
  where (r.inviter = p or r.invitee = p) and (
    exists (select 1 from player_ips a join player_ips b on a.ip_hash = b.ip_hash where a.player_id = r.inviter and b.player_id = r.invitee)
    or exists (select 1 from player_devices a join player_devices b on a.dev_id = b.dev_id or a.fp = b.fp where a.player_id = r.inviter and b.player_id = r.invitee));
  if n > 0 then flags := flags || jsonb_build_object('level', 'high', 'kind', 'cheat',
    'text', format('Invite linked to an account on the same device or internet: %s (invite farming)', names)); end if;

  -- 5) otomasyon tarayıcısı
  if exists (select 1 from player_devices where player_id = p and (webdriver
       or ua ~* '(headless|puppeteer|playwright|selenium|phantomjs|electron|bot\b|crawler|spider)')) then
    flags := flags || jsonb_build_object('level', 'high', 'kind', 'bot', 'text', 'Automated browser detected (webdriver / headless browser)');
  end if;

  -- 6) 7/24 aktivite
  select count(distinct date_trunc('hour', at)) into n from player_events where player_id = p and at > now() - interval '24 hours';
  if n >= 22 then flags := flags || jsonb_build_object('level', 'med', 'kind', 'bot', 'text', format('Active in %s of the last 24 hours (no sleep)', n)); end if;

  -- 7) makine gibi düzenli çekim aralıkları
  select count(*), avg(g), stddev_samp(g) into n, x, y from (
    select extract(epoch from at - lag(at) over (order by id)) as g
    from (select id, at from player_events where player_id = p and kind = 'vault' order by id desc limit 8) v) z where g is not null;
  if n >= 4 and x > 0 and y / x < 0.03 then flags := flags || jsonb_build_object('level', 'med', 'kind', 'bot',
    'text', format('Withdrawals at machine-like regular intervals (every %s min)', round(x / 60))); end if;

  -- 8) ekonomi tutarlılığı (oyunun bildirdiği özet)
  if snap is not null then
    best := coalesce((snap->>'seasonBest')::int, 0);
    if coalesce((econ->>'depositor')::boolean, coalesce((snap->>'seasonDeposited')::numeric, 0) > 0) then
      if coalesce((econ->>'returnX')::numeric, 0) > coalesce((econ->>'lifeCap')::numeric, 2.2) + 0.05 then
        flags := flags || jsonb_build_object('level', 'high', 'kind', 'cheat', 'text',
          format('Took out %s× of the deposit (limit %s×)', econ->>'returnX', econ->>'lifeCap')); end if;
      if econ is not null and coalesce((econ->>'usdPerHour')::numeric, 0) > rate_at(least(best, 100)) * 0.0001 * 1.11 + 0.01 then
        flags := flags || jsonb_build_object('level', 'high', 'kind', 'cheat', 'text',
          format('Production $%s/h is higher than wave %s allows', econ->>'usdPerHour', best)); end if;
    else
      if coalesce((snap->>'rate')::numeric, 0) > rate_at(least(best, 100)) * 1.11 + 1 then
        flags := flags || jsonb_build_object('level', 'high', 'kind', 'cheat', 'text',
          format('Production %s/h is higher than wave %s allows', snap->>'rate', best)); end if;
      select coalesce(sum((data->>'amount')::numeric), 0) into x from player_events
      where player_id = p and kind = 'vault' and at > now() - interval '24 hours' and jsonb_typeof(data->'amount') = 'number';
      if x > 30000 and coalesce((snap->>'deposited')::numeric, 0) = 0 then flags := flags || jsonb_build_object('level', 'high', 'kind', 'cheat', 'text',
        format('Free player moved %s DGN out in 24 h (about 24,000 is the most possible)', round(x))); end if;
    end if;
    if best >= 40 and age_h < 2 then flags := flags || jsonb_build_object('level', 'med', 'kind', 'cheat',
      'text', format('Reached wave %s within %s h of joining', best, round(age_h, 1))); end if;
    if coalesce((snap->>'deposited')::numeric, 0) > 0 then flags := flags || jsonb_build_object('level', 'info', 'kind', 'info',
      'text', 'Deposits are demo tokens (test mode)'); end if;
  else
    flags := flags || jsonb_build_object('level', 'info', 'kind', 'info', 'text', 'No account report from the game yet');
  end if;

  -- 9) toplam: bütün çekimler (USD) yatırılanın 2.2 katını + bedava üretim payını + davet kazancını aşıyor mu (olay kaydından)
  select coalesce(sum(case when kind = 'vault' then coalesce((data->>'usd')::numeric, (data->>'amount')::numeric * 0.0001) end), 0),
         coalesce(sum(case when kind = 'deposit' then coalesce((data->>'usd')::numeric, (data->>'amount')::numeric * 0.0001) end), 0)
    into x, y
  from player_events where player_id = p and kind in ('vault', 'deposit')
    and jsonb_typeof(coalesce(data->'usd', data->'amount')) = 'number';
  -- eski yatırımlar olay kaydında yok: oyunun bildirdiği toplam yatırım (DGN) tasarım kuruyla
  y := greatest(y, coalesce((snap->>'deposited')::numeric, 0) * 0.0001);
  if x > y * 2.2 + 2.4 * greatest(age_h / 24, 1) + coalesce((select sum(earned_usd) from referrals where inviter = p), 0) + 5 then
    flags := flags || jsonb_build_object('level', 'high', 'kind', 'cheat', 'text',
      format('Took out $%s in total but deposited $%s (more than the 2.2× limit allows)', round(x, 2), round(y, 2)));
  end if;

  if not exists (select 1 from player_devices where player_id = p) then
    flags := flags || jsonb_build_object('level', 'info', 'kind', 'info', 'text', 'No device info yet (older game version)');
  end if;

  -- karar
  if exists (select 1 from jsonb_array_elements(flags) f where f->>'level' = 'high' and f->>'kind' = 'bot') then verdict := 'bot';
  elsif exists (select 1 from jsonb_array_elements(flags) f where f->>'level' = 'high' and f->>'kind' = 'cheat') then verdict := 'cheat';
  elsif exists (select 1 from jsonb_array_elements(flags) f where f->>'level' = 'high') then verdict := 'multi';
  elsif exists (select 1 from jsonb_array_elements(flags) f where f->>'level' = 'med') then verdict := 'check';
  end if;

  return jsonb_build_object('verdict', verdict, 'flags', flags,
    'ipCount', (select count(*) from player_ips where player_id = p),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('ua', ua, 'mobile', mobile, 'screen', screen, 'tz', tz,
        'webdriver', webdriver, 'last', extract(epoch from last_at) * 1000) order by last_at desc)
      from (select * from player_devices where player_id = p order by last_at desc limit 5) d), '[]'::jsonb));
end $$;

-- Admin: çekim talepleri. p_filter: 'open' (bekleyen), 'flagged' (bekleyen ve işaretli), 'all'
create or replace function admin_withdrawals(p_filter text default 'open', lim int default 100) returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  return coalesce((
    with ev as (
      select e.id, e.player_id, e.kind, e.data, e.at, r.status, r.note, r.at as reviewed_at
      from player_events e left join withdraw_reviews r on r.event_id = e.id
      where e.kind in ('vault', 'withdraw') and (p_filter = 'all' or r.event_id is null)
      order by e.id desc limit least(greatest(lim, 1), 500)
    ), risk as (select pid, player_risk(pid) as rk from (select distinct player_id as pid from ev) q)
    select json_agg(json_build_object('id', ev.id, 'at', extract(epoch from ev.at) * 1000, 'kind', ev.kind,
        'playerId', ev.player_id, 'nick', p.nick, 'wave', p.best_wave, 'banned', is_banned(ev.player_id),
        'dgn', ev.data->'amount', 'usd', ev.data->'usd', 'fee', ev.data->'fee', 'rate', ev.data->'rate',
        'status', ev.status, 'note', ev.note, 'reviewedAt', extract(epoch from ev.reviewed_at) * 1000, 'risk', risk.rk) order by ev.id desc)
    from ev join players p on p.id = ev.player_id join risk on risk.pid = ev.player_id
    where p_filter <> 'flagged' or risk.rk->>'verdict' <> 'ok'), '[]'::json);
end $$;

create or replace function admin_withdraw_counts() returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  return (with pend as (
      select e.player_id from player_events e left join withdraw_reviews r on r.event_id = e.id
      where e.kind in ('vault', 'withdraw') and r.event_id is null and e.at > now() - interval '30 days'
    ), risk as (select pid, player_risk(pid)->>'verdict' as v from (select distinct player_id as pid from pend) q)
    select json_build_object('open', (select count(*) from pend),
      'flagged', (select count(*) from pend o join risk on risk.pid = o.player_id where risk.v <> 'ok'),
      'danger', (select count(*) from pend o join risk on risk.pid = o.player_id where risk.v in ('bot', 'cheat', 'multi'))));
end $$;

create or replace function admin_review_withdraw(p_event bigint, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare pid uuid;
begin
  perform assert_admin();
  if p_status not in ('approved', 'rejected') then raise exception 'bad_status'; end if;
  select player_id into pid from player_events where id = p_event and kind in ('vault', 'withdraw');
  if pid is null then raise exception 'not_found'; end if;
  insert into withdraw_reviews (event_id, player_id, status, note, admin_id) values (p_event, pid, p_status, left(p_note, 200), auth.uid())
  on conflict (event_id) do update set status = excluded.status, note = excluded.note, admin_id = excluded.admin_id, at = now();
  perform admin_note('withdraw_' || p_status, pid, jsonb_build_object('event', p_event, 'note', p_note));
end $$;

create or replace function admin_player_risk(p uuid) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  return player_risk(p);
end $$;

-- yetkiler (03_admin.sql / 04_referral.sql ile aynı düzen)
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
