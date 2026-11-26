# Compatibility Policy

This repo maintains native Java Fabric mods and is adding native Bedrock Add-Ons for family Minecraft play.

## Supported Platform

- Minecraft Java Edition: target the version in `gradle.properties`
- Loader: Fabric
- Java: target the version in `gradle.properties`
- Required dependency: Fabric API

By default, the workspace builds the version in `gradle.properties`. Individual mods may opt into a
small version matrix with version-specific source roots when the compatibility value is worth the
extra maintenance.

### Support matrix

| Mod | Fabric targets | Bedrock minimum | Dedicated Server used in CI | Device and Realm results |
| --- | --- | --- | --- | --- |
| Mushroom the Yorkie | 1.21.11, 1.21.1 | 26.60 | 26.66.1 | [Mushroom playtests](https://github.com/alicon/minecraft-mods/issues/134) |
| Cops and Robbers | 1.21.11 | 26.60 | 26.66.1 | [Patrol playtests](https://github.com/alicon/minecraft-mods/issues/138) |
| NARwhal Together | 1.21.11, 1.21.1 | 26.60 | 26.66.1 | [Regroup playtests](https://github.com/alicon/minecraft-mods/issues/141) |

Each device result applies to the archive version, Minecraft version and join method recorded in its issue.

## Bedrock development

Development packs target Bedrock 26.60 with stable pack schemas. Release support is based on the exact versions and devices that pass playtesting.

- [Mushroom the Yorkie](../mods/mushroom-the-yorkie/bedrock/README.md) uses normal item and pet interactions on Bedrock.
- [Cops and Robbers](../mods/cops-and-robbers/bedrock/README.md) includes placeable kits, ground vehicles, bank patrols, jail, and fire response.
- [NARwhal Together](../mods/narwhal-together/bedrock/README.md) uses a craftable Regroup Charm on Bedrock. On Java it uses a keybind or Controlify shortcut.

- Keep each Bedrock implementation under `mods/<mod-name>/bedrock/` with independent release versions and stable pack UUIDs. Keep Bedrock-specific behavior, models, and interactions there. Reuse matching art and test data and compare player-visible behavior across editions.
- Use stable Bedrock Script API modules when scripts are needed. Check the pack's minimum engine version against the modules and content in its manifests. Track important edition differences with each release.
- Record the effects on Java and Bedrock in gameplay changes. Run the affected Fabric checks and Bedrock package checks, and test the exact package on a supported client for as many affected scenarios as apply. Include save/reopen, upgrade, controller or touch, and multiplayer or Realm checks for release.
- Keep released identifiers and save keys stable. Increment both Bedrock pack versions together. Exercise previous saves in disposable copies before releasing changes to saved state or assets.

GitHub Actions checks Bedrock scripts against the pinned stable API and builds the add-ons in the package tests. Run the type check locally with `npm --prefix tools/bedrock ci` and `npm --prefix tools/bedrock run check`. The package tests also verify that scripted behavior packs declare the version used to type-check them.

CI also runs Mojang’s Creator Tools on the built archives. Its main suite checks JSON, manifests and resources. Its cooperative Add-On suite checks packaging conventions used when multiple add-ons share a world. Download the reports from the workflow artifacts to inspect warnings and file paths. After building the three packs, run `python3 scripts/check-bedrock-creator-tools.py <candidate.mcaddon> [<other-candidate.mcaddon> ...] --output build/creator-reports` against the intended candidates. [Minecraft Creator Tools](https://github.com/Mojang/minecraft-creator-tools)

Creator Tools 0.21.0 reports two warning types against these candidates. Mojang’s own resource pack uses string paths in `item_texture.json` (JSON192), and its bee behavior uses string arrays for `move_to_block.target_blocks` (JSONF110). Keep these findings visible in the reports and verify item textures in a rendered client and the block-seeking behavior in server smoke tests. [Vanilla item atlas](https://github.com/Mojang/bedrock-samples/blob/main/resource_pack/textures/item_texture.json) · [Vanilla bee behavior](https://github.com/Mojang/bedrock-samples/blob/main/behavior_pack/entities/bee.json)

The `bedrock-smoke` job builds all three packs and runs the scenarios below on a pinned, checksum-verified [Bedrock Dedicated Server](https://www.minecraft.net/en-us/download/server/bedrock). It exercises each add-on in a separate disposable world with both companion add-ons active. Review the pinned server build and checksum when updating the supported Bedrock version.

Each server smoke runner accepts one `--with-addon` argument per additional archive. This command tests NARwhal's upgrade and regrouping while Mushroom and Cops and Robbers stay active.

```shell
python3 scripts/smoke-narwhal-bedrock.py /path/to/bedrock-server.zip /path/to/narwhal.mcaddon \
  --upgrade-from /path/to/prior-narwhal.mcaddon \
  --with-addon /path/to/mushroom.mcaddon \
  --with-addon /path/to/cops.mcaddon
```

Use the [Bedrock release checklist](RELEASING.md#release-a-bedrock-add-on) to record client and Realm evidence alongside server results.

### Testing a game update

1. Keep the previous supported patch and its checksum available. Run the last playtested archive there and on the proposed stable patch. A change seen with the same archive isolates the engine update.
2. Run the candidate on the proposed patch in a fresh world and on a disposable copy created with the earlier archive. Exercise ownership, inventory across rejoin and the three-pack smoke. Record both archive hashes, exact game versions and the first failing action in the affected mod's issue.
3. Update the CI pin, this table and release notes after the checks pass. Enter client, controller or touch and Realm results on the same candidate before advertising those platforms.

Package tests compare the built archives to the [playtested identifiers](../scripts/fixtures/bedrock-pack-baselines.json). They check pack and module UUIDs, the entity, block and item names stored in worlds, and paired pack versions. Additive content is allowed in a newer version. Refresh each baseline from its verified download when releasing, retaining every identifier from earlier saves. The patrol stores structured state under a versioned key. Preserve existing scalar save keys and migrate their old values explicitly when their meaning changes.

### Saved state

| Bedrock mod | Current saved schema |
| --- | --- |
| Mushroom the Yorkie | V1 uses native entity ownership and cargo plus stable scalar keys for pet identity, owner contact, daily bowls and practice toys. Changes to a scalar's meaning need an explicit migration that accepts the old value. |
| Cops and Robbers | V1 patrol records live under `cops_robbers:patrol_v1/`. Retired-robber markers retain their original scalar keys. |
| NARwhal Together | Charm cooldowns and concurrent regroup requests are session state. The item identifier persists in inventories. |

Upgrade fixtures check saved ownership, daily care, cargo, structures, patrols, and the Regroup Charm alongside the other active add-ons.

### Gameplay checks by edition

| Shared behavior | Java Fabric checks | Bedrock checks |
| --- | --- | --- |
| Mushroom ownership and borrowed leads | Native `daycareGuestsShareLeads` on both Fabric targets checks the one-dog limit, harness, guest lead, feeding while leashed, and ownership | Adoption and care persistence probes and the mixed two-player session exercise independent ownership, guest walks, and feeding while leashed |
| Mushroom treat use | Native `feedsTreatsAcrossEditions` uses the [shared feeding cases](../scripts/fixtures/mushroom-treat-cases.json) | The fetch probe uses the same cases to check health and Survival and Creative inventory |
| Mushroom fetch and night flight | Native fetch interruption and persistence GameTests plus the bridge transition matrix | The fetch probe verifies interrupted carry and rejoin. The flight probe verifies sleeping through Creative takeoff and resuming flight at dawn |
| Cops and Robbers kits, patrol, and fire response | Live patrol and structures smoke exercises kit placement, mounted capture, jail drop-off, and extinguishing fires | [Patrol smoke](../mods/cops-and-robbers/bedrock/README.md#verify-the-kits-vehicles-patrol-fire-response-and-jail) with the vehicle, patrol, fire, and jail scenarios enabled |
| NARwhal alphabetical regroup and wraparound | Fabric target selector tests use the [shared regroup cycle](../scripts/fixtures/narwhal-regroup-cycle.json) | [Regroup smoke](../mods/narwhal-together/bedrock/README.md#build-and-test) exercises the same cycle through native item use |

Creative takeoff wakes a sleeping companion on Java, as exercised by the live bridge transition matrix. The Bedrock companion stays asleep through takeoff and follows flight again at dawn. The Bedrock party tests use the latter expectation. [Mushroom Bedrock gameplay checks](../mods/mushroom-the-yorkie/bedrock/README.md#automated-checks)

See [Java automated coverage](TESTING.md#current-automated-coverage) for the complete test descriptions.

See [Add-On development](https://learn.microsoft.com/en-us/minecraft/creator/documents/addondevelopmentworkflow?view=minecraft-bedrock-stable) and [Script API versioning](https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/versioning?view=minecraft-bedrock-stable).

## Non-Goals For Now

- Forge, NeoForge, or Quilt support
- multi-loader architecture
- broad compatibility layers
- public plugin APIs
- broad backport branches

Those can be reconsidered only when there is a real user need.

## Versioned Source Layout

Keep pure Java logic in the normal source roots:

```text
mods/<mod>/src/main/java
mods/<mod>/src/test/java
```

Put Minecraft/Fabric integration that differs by Minecraft version under:

```text
mods/<mod>/src/versions/<minecraft-version>/main/java
mods/<mod>/src/versions/<minecraft-version>/client/java
```

The active version is selected from `gradle.properties`, or per command with:

```shell
./gradlew :narwhal-together:check -Ptarget_minecraft_version=1.21.1
./gradlew :mushroom-the-yorkie:check -Ptarget_minecraft_version=1.21.1
```

A mod that uses versioned sources must declare its supported version matrix in its `build.gradle`.
The shared Gradle convention wires the matching Minecraft, Fabric Loader, Fabric API, metadata, and
source roots from that matrix. Versioned mods publish distinct Modrinth version numbers such as
`0.1.0+mc1.21.1` so separate jars do not collide.

## Compatibility Rules

- Prefer Fabric APIs over custom hooks.
- Keep client-only code under `src/client/java`.
- Do not import client-only classes from `src/main/java`.
- Keep registry ids, translation keys, packet ids, and save-data keys stable after release.
- Treat world-save data changes as compatibility-sensitive.
- Add migration code before changing released save-data meaning.
- Keep network payloads small and explicit.
- Avoid making one mod depend on another mod's internals.

## Release Expectations

Before publishing:

- run `./gradlew check`
- run `./gradlew check -Ptarget_minecraft_version=1.21.1` for mods with a 1.21.1 compatibility target
- run `./gradlew build`
- complete the relevant manual checks in `docs/TESTING.md`
- update docs when behavior, requirements, output paths, or release steps change
