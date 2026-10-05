---
name: afk-verify
description: Play-test AFK Dungeon in a headless browser — open the game at a chosen hero and wave, press skill keys, take screenshots at exact game times and catch console errors. Use after any change to visuals, skills, UI or game flow, before committing.
---

# AFK Dungeon play-test

One command starts the local server, skips the nickname screen, jumps to a wave, enters combat
and captures what happened. Use it instead of writing a new Playwright script each time.

```bash
python3 .claude/skills/afk-verify/scripts/play.py --hero warrior --wave 8 --press 4 --at 0.5,1.0,1.6,2.4 --out /tmp/shots
```

| Flag | Meaning |
|---|---|
| `--hero warrior\|lion\|mage` | which hero card to pick |
| `--wave N` | start wave (floors change every 10 waves) |
| `--press 2,5` | keys pressed in order once combat starts (`1`–`3` skills, `4`/`5` ultimates). The script waits for the hero to finish casting before the next key, because the game ignores keys while a cast is running. |
| `--at 0.5,1.2` | screenshots at these **game** seconds after the first key press (hit-stop and slow rendering do not skew them) |
| `--min-enemies 3` | wait until this many enemies are active |
| `--auto` | leave AUTO skills on (default off, so only your keys fire) |
| `--screen title\|select` | screenshot a menu instead of combat (`select` shows the chosen `--hero` card selected) |
| `--width 390 --height 800` | phone layout |

The hero gets god mode (re-applied every 50 ms, so level-ups do not undo it) and all cooldowns reset,
so a long ultimate can be filmed safely. Old-save compatibility is not covered: test it by loading a
saved `zindan_dalgalari_save_v1` from an older version by hand.
Exit code is 1 if the page threw an error.

## Reading the result

- Open the PNGs with Read. To compare frames in one image:
  `ffmpeg -y -pattern_type glob -i '/tmp/shots/shot_*.png' -vf "scale=440:-1,tile=2x3" -frames:v 1 /tmp/shots/sheet.jpg`
- The headless browser uses software WebGL: it is slow, but game-time capture keeps the frames correct.
  It says nothing about real phone FPS.
- Google Fonts are blocked in the sandbox; the script ignores that error.

## Checklist before saying a change works

1. No page errors.
2. Desktop (1100×620) and phone (390×800) screenshots: nothing clipped or overlapping, text readable, the effect visible where it should land.
3. For skills: frames before, during and after impact.
4. For a floor/theme change: start at a wave inside that floor (e.g. `--wave 12` for floor 2).

The opening scenes (door, descent) are skipped under automation. Add `?intro=1` to the URL in your own Playwright script to test them;
the software renderer is too slow to film them live, so freeze stages by setting classes on `#intro` (see `src/ui/intro.js`).
