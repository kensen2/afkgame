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

- Depositors (v6, trial): no fixed pool. Production first pays back what they deposited (only the fee applies);
  after payback they can take out a share of their own production that steps down daily (`CONFIG.v5.depositor.schedule`
  50/40/30/20 %, last value until season end). All depositors together are capped at `capOfDeposits` (10 %) of the season's
  deposits per day; above that everyone is scaled down. The rest stays in the game balance. No guaranteed return, and
  this is not written into the whitepaper (owner decision).
- Free pool is tiered by counted players (`CONFIG.v5.freePool`, `F.freePoolSize`):
  1M up to 119, +1M per 100 (120 → 2M, 220 → 3M …), fixed 10M from 920. Counted = free-pool account that reached wave 20
  and played in the last hour (to become 24h after online launch); must be counted server-side.
  Clan top-5 bonus (10/5/3/2/1 %) only shifts shares.
- Free players: waves 1–20, max 1,000 DGN/h (hand-written table `CONFIG.v5.rate.free`; waves 21+ still build on 2,000), loop 20 → 15 at "The Sealed Gate" (10 s screen).
- Keys: 10 per tier per season, USD prices, one key per new wave above 20, unused keys carry over.
  Packs (10 keys) only with deposited DGN; single keys in every tier with any DGN at pack/10 × `singleKeyMult` (4).
- Withdrawal: deposit back first, then today's pool share; game → vault fee grows per move in 24h: 5/10/20/40 %
  (capped at 40, back to 5 after 24h without a move; half burned); 2h between moves; vault → wallet needs a
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
  never the spot price. Hourly production stays fixed in DGN (`designUsdPerToken` 0.0001). Live: spot from the DEX, TWAP on the server.
- "Burned" only for on-chain burns; in-game spending is "Spent in the dungeon".
- The creator does not trade the token. Never propose wash trading, volume bots or price support.
