# Yorkie Gallery Staging Candidates

Use the bridge scout to find outdoor scenes in a disposable copy. It moves the player and changes world state while scouting. Keep the original save closed and verify the copy before running the command.

## Scout Command

```shell
make modrinth-autoplay-yorkie-biome-scout \
  PLAYTEST_WORLD="Codex Gallery Scout" \
  BRIDGE_SCREENSHOT_NAME=yorkie-biome-scout \
  BRIDGE_REPORT_FILE="$PWD/build/playtest-reports/yorkie-biome-scout.json" \
  YORKIE_SCOUT_SEED=scout-gallery
```

Useful knobs:

- `YORKIE_SCOUT_SAMPLES`: random coordinates to inspect. Default: `24`.
- `YORKIE_SCOUT_CAPTURES`: top candidates to screenshot. Default: `6`.
- `YORKIE_SCOUT_RANGE`: coordinate range around world origin. Default: `12000`.
- `YORKIE_SCOUT_RADIUS`: terrain scan radius per coordinate. Default: `40`.
- `YORKIE_SCOUT_STEP`: terrain scan grid spacing. Default: `16`.

Heavier runs can find more variety, but they can also overload singleplayer chunk generation. If the bridge stops responding after an aggressive run, restart Minecraft before continuing.

## Natural Gallery Command

Use a closed template with the original seed and world generation settings below. The launcher copies it before placing props and mobs.

```shell
make modrinth-autoplay-yorkie-natural-gallery \
  PLAYTEST_TEMPLATE_WORLD="Gallery Template" \
  PLAYTEST_WORLD_PREFIX="Codex Yorkie Natural" \
  BRIDGE_SCREENSHOT_NAME=yorkie-natural-gallery \
  BRIDGE_REPORT_FILE="$PWD/build/playtest-reports/yorkie-natural-gallery.json"
```

The scenario uses the fixed coordinates below to capture outdoor sitting, leash, water, fetch, flying, bowl, chase, and hostile-defense scenes. For a different seed or world generation setup, run the scout and stage at the new coordinates.

## New World (21)

Save: `New World (21)`
Seed: `-1516458930155410200`

Original local reports, when available:

- `build/playtest-reports/yorkie-biome-scout-new-world-21-v2.json`
- `build/playtest-reports/yorkie-biome-scout-new-world-21-v3.json`

Good candidates from visual review:

| Use | X | Y | Z | Biome Signal | Notes |
| --- | ---: | ---: | ---: | --- | --- |
| Water, fetch, leash walk | 4448 | 63 | 4000 | plains, forest, river | Best low-angle natural lake/river bank from v2 candidate 02. Open enough for Mushroom, bowls, leash, and ball scenes. |
| Water and action | 3760 | 64 | -304 | sparse jungle, river, shrubland | Strong body-of-water read from v2 candidate 06. Good for water/fetch with real shoreline instead of a puddle. |
| Forested water valley | -80 | 63 | 7216 | forested highlands, alpine highlands, river | Best v3 candidate 01. Nice greenery, water, and red conifer accents; good general outdoor setting. |
| Taiga river | -13520 | 63 | 2112 | old growth spruce/pine taiga, river | Good for swimming or chase scenes with a different evergreen look. |
| Highlands/flying backdrop | -4848 | 64 | 2128 | highlands, forest | Useful for flying or action shots where hills behind Mushroom matter more than water. |
| Cherry-adjacent revisit | -2624 | 78 | 7664 | shield, cherry grove | Not captured in the top set, but the scan found `minecraft:cherry_grove` nearby. Revisit manually for cherry-specific staging. |

The high aerial scout shots can show square render edges. Judge low-angle screenshots first; they are closer to final gallery composition.
