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

- Daily pools: depositor fixed 10M DGN. Free pool is tiered by counted players (`CONFIG.v5.freePool`, `F.freePoolSize`):
  1M up to 119, +1M per 100 (120 → 2M, 220 → 3M …), fixed 10M from 920. Counted = free-pool account that reached wave 20
  and played in the last hour (to become 24h after online launch); must be counted server-side.
  Clan top-5 bonus (10/5/3/2/1 %) only shifts shares.
- Free players: waves 1–20, max 1,000 DGN/h (hand-written table `CONFIG.v5.rate.free`; waves 21+ still build on 2,000), loop 20 → 15 at "The Sealed Gate" (10 s screen).
- Keys: 10 per tier per season, USD prices, one key per new wave above 20, unused keys carry over.
- Withdrawal: deposit back first, then today's pool share; 5% fee (half burned); vault → wallet;
  wallet must hold 20K DGN for 12h; depositor pool starts 48h after first deposit. No staking. 10-day seasons.
- "Burned" only for on-chain burns; in-game spending is "Spent in the dungeon".
- The creator does not trade the token. Never propose wash trading, volume bots or price support.
