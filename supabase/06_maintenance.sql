-- =====================================================================
--  AFK Dungeon · Bakım modu (admin paneli "Maintenance").
--  Admin "N dakika sonra bakım" der: oyunda geri sayım şeridi çıkar, süre dolunca oyun durur ve bakım ekranı gelir.
--  "Bakımı bitir" ile oyun kendini yeniler (yeni sürüm varsa onu yükler).
--  Faz 1: oyun tarafında uygulanır (oyunun durması). Sunucu işlemleri ayrıca kapatılmaz.
-- =====================================================================

create table if not exists maintenance (
  id         int primary key default 1 check (id = 1),
  starts_at  timestamptz,                         -- null = bakım yok; gelecekte = geri sayım; geçmişte = bakımda
  message    text not null default '' check (char_length(message) <= 200),
  updated_at timestamptz not null default now()
);
insert into maintenance (id) values (1) on conflict (id) do nothing;
alter table maintenance enable row level security;
revoke all on maintenance from anon, authenticated;

-- Oyun 10 saniyede bir sorar. Sunucu saatini de verir (oyuncunun saati yanlış olsa da geri sayım doğru olsun).
create or replace function get_maintenance() returns json language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object('startsAt', extract(epoch from starts_at) * 1000, 'message', nullif(message, ''),
                           'now', extract(epoch from now()) * 1000)
  from maintenance where id = 1
$$;

-- p_minutes: 0 = hemen, en fazla 1440 (24 saat)
create or replace function admin_set_maintenance(p_minutes int, p_message text) returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare m int := greatest(0, least(coalesce(p_minutes, 0), 1440));
begin
  perform assert_admin();
  update maintenance set starts_at = now() + make_interval(mins => m), message = left(coalesce(p_message, ''), 200), updated_at = now() where id = 1;
  perform admin_note('maintenance_on', null, jsonb_build_object('minutes', m, 'message', p_message));
  return get_maintenance();
end $$;

create or replace function admin_end_maintenance() returns json language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin();
  update maintenance set starts_at = null, updated_at = now() where id = 1;
  perform admin_note('maintenance_off', null, '{}'::jsonb);
  return get_maintenance();
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
