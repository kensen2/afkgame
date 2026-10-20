# AFK Dungeon — studio guide

Browser idle dungeon game (Three.js r170, plain ES modules, no build step) with a DGN token economy.
Live: https://afkgame.vercel.app (Vercel deploys `main`). Owner talks Turkish; all game text is English.

## The studio

Roles live in `.claude/agents/`, skills in `.claude/skills/`. Use the producer for multi-part work.

| Role | Owns |
|---|---|
| producer | splits work, routes it, final report |
| game-designer | heroes, skills, enemies, waves (`src/config.js`) |
| economy-designer | DGN economy v5, pools, keys, clans' bonus |
| gameplay-programmer | `src/game.js`, `src/entities`, `src/systems` |
| technical-artist | VFX, shaders, lighting (`src/fx`, `src/systems/ultimates.js`) |
| ui-ux-designer | `index.html`, `style.css`, `src/ui` |
| level-designer | floors and props (`CONFIG.floors`, `src/world/dungeon.js`) |
| sound-designer | `src/core/audio.js` |
| backend-engineer | Supabase (`supabase/schema.sql`, `src/net`) |
| security-engineer | cheating and money safety review |
| performance-analyst | FPS, memory, phone budget |
| qa-tester | browser tests before every commit |

Skills: `afk-verify` (play-test with screenshots), `economy-sim`, `webapp-testing`, and engine guides
`threejs-scene-setup`, `threejs-materials-lighting`, `threejs-gltf-loading`, `game-feel`, `shader-programming`,
`performance-optimization`, `save-systems`, `game-ui-ux`, `audio-design`, `camera-systems`.
The three.js skills are written for r186; this project pins r170, so check APIs before copying code.

## House rules

- Push to GitHub only when the owner says "pushla". Commit when work is verified.
- After a change, also copy changed files to the owner's Desktop folder `kripto-oyun2` when his computer is linked.
- Verify visible changes with `afk-verify` on desktop and phone sizes; `node --check` every edited JS file.
- No new runtime npm dependencies; vendor files into `lib/` only after testing with r170.
- Assets: KayKit and Kenney (CC0). Do not copy art, characters or code from other games.

## Economy invariants (owner decisions)

- Depositors (v8): no fixed pool. Everything is counted in USD: production at the design rate (10,000 DGN = $1),
  deposits at the oracle price, payouts converted to DGN at the oracle price. Production first counts toward the season's
  deposit (deposit itself can leave without the daily limit, only the fee applies); after payback a share of production opens
  up daily (`CONFIG.v5.depositor.schedule` 50/40/30/20/10 %, last value until season end). All depositors together are capped
  at `capOfDeposits` (10 %) of the season's deposits per day (server; Phase 1 uses `demo.capK`). Season total taken out is
  capped at `lifeCap` 2.2× the season's deposit; after that `afterCap` 1 % of the deposit a day. Owner decision (2026-10-20).
  No guaranteed return; never write "deposit back in X days" or ROI in the whitepaper. Sim: `sim/v8-blend.mjs` (avg ~1.7×).
- Free pool is tiered by counted players (`CONFIG.v5.freePool`, `F.freePoolSize`):
  1M up to 119, +1M per 100 (120 → 2M, 220 → 3M …), fixed 10M from 920. Counted = free-pool account that reached wave 20
  and played in the last hour (to become 24h after online launch); must be counted server-side.
  Clan top-5 bonus (10/5/3/2/1 %) only shifts shares.
- Free players: waves 1–20, max 1,000 DGN/h (hand-written table `CONFIG.v5.rate.free`; waves 21+ still build on 2,000), loop 20 → 15 at "The Sealed Gate" (10 s screen).
- Keys: 10 per tier per season, USD prices, one key per new wave above 20, unused keys carry over.
  Packs (10 keys) only with deposited DGN; single keys in every tier with any DGN at pack/10 × `singleKeyMult` (4).
- Withdrawal: deposit first, then the opened share; game → vault fee grows per move in 24h: 5/10/20 %
  (capped at 20, back to 5 after 24h without a move; all of it goes back to the reward pool, not burned); 2h between moves; vault → wallet needs a
  12-hour time-weighted average wallet balance of 20K DGN; "Get DGN" button (not "Buy"). No staking. 10-day seasons.
- Server: Supabase project `wfsskmchilndcsauubbs` (eu-central-1). `supabase/schema.sql` is the source of truth;
  the client (`src/net/supabase-backend.js`) only calls RPCs. Only the publishable key lives in `CONFIG.server`;
  never put a secret/service_role key in the repo. If the server is unreachable the game falls back to the local bot world.
  The Supabase MCP refuses SQL containing `delete` without a confirmation the owner may not see; give him that SQL to paste.
  `supabase/03_admin.sql` (applied) adds the admin panel on top of schema.sql; both files together are the source of truth.
- Admin panel: `admin.html` (+ `src/admin/admin.js`), not linked from the game. Login = Supabase e-mail account listed in the
  `admins` table; every admin RPC checks `is_admin()` on the server and writes `admin_log`. Gifts/take-aways/wipe go through
  `grants` and are applied by the game via `my_status` (balances still live in the player's browser until Phase 2).
  Bans hide players from rankings and block nick/clan/stats; `player_limits.nerf` scales production. The game reports a
  state snapshot + economy events every minute (`report_state`); these are player-reported and can be faked.
- Price oracle (test, `src/systems/oracle.js`): fake DGN price, market cap 100K–200K $ (1B supply), HUD chip top-left.
  All USD → DGN conversions (`CONFIG.token.usdPerToken`: key packs, single keys, USD displays) use the 10-minute TWAP,
  never the spot price. Free players' production stays fixed in DGN; depositors' production is fixed in USD
  (table × `designUsdPerToken` 0.0001, so their DGN/h moves with the oracle price, `Economy.priceFactor`). Live: spot from the DEX, TWAP on the server.
- Referral (`CONFIG.v5.referral`, `supabase/04_referral.sql`): 6-char code, link `?ref=CODE`, bound once within 48h of the
  account, no self/mutual/same-IP-hash invites. Inviter gets 5 % of the invitee's vault moves (USD, from reported `vault`
  events) via `claim_ref_rewards`, paid from the pool, $100/season cap (client), withdrawable, outside the 2.2× cap.
- Withdrawal review (`supabase/05_withdraw_review.sql`, applied): every reported `vault`/`withdraw` event is a request in the
  admin "Withdrawal requests" panel. `player_risk()` flags same device id (`src/net/device.js`, `note_device` hourly),
  same browser fingerprint, same IP hash, invite + same network, webdriver/headless, 24/7 activity, machine-regular
  withdrawals and impossible numbers (x over the cap, production above `rate_at`, out > 2.2× deposits). Verdicts:
  ok / check / multi / bot / cheat. Flags are hints; approving does nothing on-chain in Phase 1.
- "Burned" only for on-chain burns; in-game spending is "Spent in the dungeon".
- The creator does not trade the token. Never propose wash trading, volume bots or price support.
