# Minecraft Mods

Small Fabric mods for playing Minecraft together.

## Mods

| Mod | What you can do | Minecraft Java |
| --- | --- | --- |
| [NARwhal Together](https://modrinth.com/mod/narwhal-together) | Press `G` or use Controlify to visit the next online player. | 1.21.11, 1.21.1 |
| [Mushroom the Yorkie](https://modrinth.com/mod/mushroom-the-yorkie) | Take a tiny Yorkie for walks, play fetch, and watch him chase squirrels. | 1.21.11, 1.21.1 |
| [Cops and Robbers](https://modrinth.com/mod/cops-and-robbers) | Build a bank, police station, and fire station. Patrol, catch robbers, and put out fires. | 1.21.11 |

Install the matching mod build and Fabric API on every participating client and on the server or LAN host.

## Layout

```text
mods/
  narwhal-together/
    src/
  mushroom-the-yorkie/
    src/
  cops-and-robbers/
    src/
  playtest-bridge/
    src/
gradle/
  fabric-mod.gradle
```

Each mod has its own Fabric metadata, sources, and jar. Shared Fabric, Loom, and Modrinth configuration lives in `gradle/fabric-mod.gradle`. The Playtest Bridge is a local development tool for 1.21.11.

## Requirements

- Java 21 or newer
- Fabric Loader 0.19.3 or newer for Minecraft 1.21.11
- Fabric Loader 0.16.14 or newer for Minecraft 1.21.1
- Fabric API for the selected Minecraft version

## Build

```shell
./gradlew build
```

Distributable jars are written under the active Minecraft target:

```text
build/mods/narwhal-together/<minecraft-version>/libs/narwhal-together-<version>.jar
build/mods/mushroom-the-yorkie/<minecraft-version>/libs/mushroom-the-yorkie-<version>.jar
build/mods/cops-and-robbers/<minecraft-version>/libs/cops-and-robbers-<version>.jar
build/mods/playtest-bridge/1.21.11/libs/playtest-bridge-<version>.jar
```

Pass `-Ptarget_minecraft_version=1.21.1` to build NARwhal Together or Mushroom the Yorkie for that target. Use the matching Minecraft directory when selecting a jar.

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

- [Development Environment](docs/DEVELOPMENT.md)
- [Testing](docs/TESTING.md)
- [Compatibility Policy](docs/COMPATIBILITY.md)
- [Mushroom gameplay and configuration](docs/MUSHROOM_THE_YORKIE.md)
- [Cops and Robbers gameplay and controls](docs/MODRINTH_COPS_AND_ROBBERS.md)
- [Reference Codebases](docs/REFERENCE_CODEBASES.md)
- [Release Guide](docs/RELEASING.md)

## License

These mods are available under the [MIT License](LICENSE).
