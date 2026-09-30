// Clan yetki kuralları ve doğrulama. Hem yerel backend hem (yarın) Supabase fonksiyonları
// aynı kuralları uygular: istemcideki kontrol sadece arayüz içindir, asıl karar sunucuda verilir.
import { CONFIG } from '../config.js';

export const ROLES = ['leader', 'officer', 'member'];

// Kim ne yapabilir
//  - Lider: istek onay/red, officer atama/alma, üye atma, liderliği devretme, clanı dağıtma
//  - Officer: SADECE katılma isteklerini onaylar/reddeder (üye atamaz, clanı dağıtamaz)
//  - Üye: hiçbiri
export const PERMS = {
  leader: new Set(['approve', 'reject', 'kick', 'officer', 'transfer', 'disband']),
  officer: new Set(['approve', 'reject']),
  member: new Set(),
};
export const can = (role, action) => !!PERMS[role]?.has(action);

export function validateNick(nick) {
  const R = CONFIG.social.nick;
  nick = String(nick || '').trim();
  if (nick.length < R.min || nick.length > R.max) return { ok: false, error: 'nick_length' };
  if (!R.re.test(nick)) return { ok: false, error: 'nick_chars' };
  if (/^(admin|mod|moderator|system|dev|support|official)/i.test(nick)) return { ok: false, error: 'nick_reserved' };
  return { ok: true, nick };
}

export function validateClan(name, tag) {
  const C = CONFIG.social.clan;
  name = String(name || '').trim().replace(/\s+/g, ' ');
  tag = String(tag || '').trim().toUpperCase();
  if (name.length < C.name.min || name.length > C.name.max) return { ok: false, error: 'clan_name_length' };
  if (!C.name.re.test(name)) return { ok: false, error: 'clan_name_chars' };
  if (tag.length < C.tag.min || tag.length > C.tag.max) return { ok: false, error: 'clan_tag_length' };
  if (!C.tag.re.test(tag)) return { ok: false, error: 'clan_tag_chars' };
  return { ok: true, name, tag };
}

// Hata kodu → oyuncuya gösterilen metin (oyun dili İngilizce)
export const ERRORS = {
  nick_length: `Nickname must be ${CONFIG.social.nick.min}–${CONFIG.social.nick.max} characters.`,
  nick_chars: 'Use only letters, numbers and _.',
  nick_reserved: 'That nickname is reserved.',
  nick_taken: 'That nickname is taken.',
  clan_name_length: `Clan name must be ${CONFIG.social.clan.name.min}–${CONFIG.social.clan.name.max} characters.`,
  clan_name_chars: "Clan name can use letters, numbers, spaces, _ ' and -.",
  clan_tag_length: `Tag must be ${CONFIG.social.clan.tag.min}–${CONFIG.social.clan.tag.max} characters.`,
  clan_tag_chars: 'Tag can use only letters and numbers.',
  clan_name_taken: 'A clan with that name already exists.',
  clan_tag_taken: 'That tag is taken.',
  already_in_clan: 'You are already in a clan.',
  not_in_clan: 'You are not in a clan.',
  no_funds: `Creating a clan costs ${CONFIG.social.clan.createCost.toLocaleString('en-US')} DGN.`,
  clan_full: `This clan is full (${CONFIG.social.clan.maxMembers} members).`,
  too_many_requests: `You can have up to ${CONFIG.social.clan.maxPendingRequests} join requests at once.`,
  already_requested: 'You already asked to join this clan.',
  no_permission: 'You do not have permission to do that.',
  officers_full: `A clan can have up to ${CONFIG.social.clan.maxOfficers} officers.`,
  leader_must_transfer: 'Make someone else leader before you leave, or disband the clan.',
  not_found: 'Not found.',
  need_nick: 'Pick a nickname first.',
};
export const errText = (code) => ERRORS[code] || 'Something went wrong.';
