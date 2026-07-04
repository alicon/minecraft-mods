# Mushroom The Yorkie

## Gameplay Configuration

`mushroom_yorkie.json` is generated in the Fabric config directory. Values that change gameplay are centralized in `MushroomYorkieConfig` and exposed through small value objects so entity code reads tuning, not raw JSON fields.

Structure scenting lets a tamed, following Mushroom occasionally catch a strong scent from nearby generated structures. It is intentionally a kid-readable guide, not a compass UI: Mushroom barks, leads, waits when the player falls behind, can lose the trail around water or steep terrain, and celebrates at the destination.

- `structureScentingEnabled`: turns the behavior on or off.
- `structureScentMessages`: shows actionbar prompts such as `Follow Mushroom!`; keep this on for younger players.
- `structureScentDebugMessages`: shows actionbar state messages such as leading, circling back, waiting, recovering, and giving up. Use this during playtesting, then turn it off for quieter play.
- `structureScentCanLoseTrail`: allows water, steep terrain, and failed paths to interrupt the scent.
- `structureScentMinDistanceBlocks`: prevents Mushroom from scenting things already close enough to stumble into.
- `structureScentMaxDistanceBlocks`: caps how far structure lookup searches; higher values find rarer structures but make searches heavier.
- `structureScentCooldownTicks`: delay between structure searches per Mushroom; this protects normal server ticks from repeated locate-style work.
- `structureScentLeadAheadBlocks`: how far Mushroom runs ahead before waiting for the player; keep this short because Mushroom is tiny and easy to lose visually.
- `structureScentCircleBackIntervalTicks`: how often Mushroom breaks from leading and returns near the player so he stays visible.
- `structureScentCircleBackTicks`: how long Mushroom spends circling back before leading again.
- `structureScentCircleBackDistanceBlocks`: how close Mushroom comes back toward the player before heading off again.
- `structureScentFoundDistanceBlocks`: how close Mushroom must get before celebrating and ending the behavior.
- `structureScentBarkIntervalTicks`: bark cadence while leading, waiting, or recovering the scent.
- `structureScentRecoveryTicks`: how long Mushroom sniffs around before giving up after losing a trail.
- `structureScentMaxTrailRiseBlocks`: vertical terrain change that can break the scent, used to make mountains feel like real obstacles.
- `structureScentTargets`: enabled target ids. Defaults are `village`, `woodland_mansion`, `pillager_outpost`, `swamp_hut`, and `ruined_portal`. Underground-only structures such as `trial_chambers` are intentionally disabled by default because they do not fit the surface scent fantasy.
