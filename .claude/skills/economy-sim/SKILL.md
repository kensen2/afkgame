---
name: economy-sim
description: Check AFK Dungeon's DGN economy (v5) before changing any number in CONFIG.v5, key prices, pools, clan bonuses or withdrawal rules. Runs the realm simulation and states what each player type can take out per day and what it costs the team.
---

# DGN economy check

The economy lives in `src/config.js` (`CONFIG.v5`, `CONFIG.social.clan`, `F.rateAt`, `F.poolShare`) and
the simulation in `sim/v5.mjs`. Never change a pool, price or rate without running it before and after.

```bash
node sim/v5.mjs                 # 100 … 2000 players
node sim/v5.mjs 1000 --bots 200 # with farming bots in the free pool
```

## Invariants (the owner decided these — do not break them)

- Two fixed daily pools: free 10M DGN, depositor 10M DGN. Bonuses (clan top 5: 10/5/3/2/1 %) only
  change shares of the same pool; they never mint extra DGN.
- Free players are capped at wave 20 (1,000 DGN/h max), loop 20 → 15 behind "The Sealed Gate".
- Keys: 10 per tier per season, prices in USD, each new wave above 20 uses one key.
- Withdrawals: deposit back first (no daily cap), then only today's pool share; 5% fee (half burned);
  two steps (vault → wallet); wallet must hold 20K DGN for 12h. Depositor pool starts 48h after first deposit.
- "Burned" means burned on-chain only. In-game spending is shown as "Spent in the dungeon".
- 10-day seasons; unused keys carry over. No staking.
- The creator does not trade the token. Never propose volume bots, wash trading or price support.

## Report

Show the table for 1,000 players before and after the change, and say plainly who gains and who loses.
If `CONFIG.v5.demo.*.rateSum` should change, the script prints the new values.
