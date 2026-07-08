# Minecraft Mods

Fabric mod workspace for small Minecraft projects.

## Mods

- **NARwhal Together**: family-focused multiplayer helpers. Current feature: press `G` to teleport to the next online player.
- **Mushroom the Yorkie**: a tiny pointy-eared Yorkie companion with pet needs, treats, bowls, a dog bed, toys, food-bar care, lost-dog recovery, tame/follow/sit behavior, and early trick hooks.
- **Cops and Robbers**: police cruisers, fire trucks, cops, robbers, bank tellers, and placeable bank/police station kits.

## Layout

```text
mods/
  narwhal-together/
    src/
  mushroom-the-yorkie/
    src/
  cops-and-robbers/
    src/
gradle/
  fabric-mod.gradle
```

Each mod has its own `fabric.mod.json`, Java package, assets, and jar. Shared Fabric/Loom/Modrinth build setup lives in `gradle/fabric-mod.gradle`.

## Requirements

- Minecraft Java Edition 1.21.11 by default
- NARwhal Together and Mushroom the Yorkie also support Minecraft Java Edition 1.21.1
- Fabric Loader 0.19.3 or newer
- Fabric API
- Java 21 or newer

## Build

```shell
./gradlew build
```

Distributable jars are written under the active Minecraft target:

```text
build/mods/narwhal-together/<minecraft-version>/libs/narwhal-together-<version>.jar
build/mods/mushroom-the-yorkie/<minecraft-version>/libs/mushroom-the-yorkie-<version>.jar
build/mods/cops-and-robbers/<minecraft-version>/libs/cops-and-robbers-<version>.jar
```

## Verification

```shell
./gradlew check
./gradlew check -Ptarget_minecraft_version=1.21.1
```

This runs unit tests plus repo quality gates for layout, metadata links, formatting, file size, versioned-source layout, release notes, forbidden client imports, public API docs, and Javadocs.

## Per-Mod Builds

```shell
./gradlew :narwhal-together:build
./gradlew :mushroom-the-yorkie:build
./gradlew :cops-and-robbers:build
```

## Mushroom Config

Mushroom the Yorkie writes a config file at first launch:

```text
config/mushroom_yorkie.json
```

The main option is `wakeUpSpawnMode`:

- `respawn`: after a successful night in bed, a player gets Mushroom if they do not already have a loaded owned Mushroom; a loaded Mushroom lost from his owner for a full Minecraft day can also return to the bed instead of staying missing.
- `extreme`: each player gets Mushroom only once after sleeping; if he dies, that player does not get another one.

## Engineering Standards

This repo prioritizes maintainability: shared configuration, reusable domain logic, separation of concerns, documented public APIs, and automated tests before manual testing. See [Engineering Principles](docs/ENGINEERING.md).

Helpful process docs:

- [Testing](docs/TESTING.md)
- [Compatibility Policy](docs/COMPATIBILITY.md)
- [Reference Codebases](docs/REFERENCE_CODEBASES.md)
- [Release Guide](docs/RELEASING.md)

## License

These mods are available under the [MIT License](LICENSE).
