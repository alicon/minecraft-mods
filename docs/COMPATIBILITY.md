# Compatibility Policy

This repo optimizes for simple, maintainable Fabric mods for family Minecraft play.

## Supported Platform

| Minecraft Java | Fabric Loader minimum | Supported projects |
| --- | --- | --- |
| 1.21.11 (default) | 0.19.3 | NARwhal Together, Mushroom the Yorkie, Cops and Robbers, Playtest Bridge |
| 1.21.1 | 0.16.14 | NARwhal Together, Mushroom the Yorkie |

All builds target Java 21 and require Fabric API for their Minecraft version.
Minecraft, Fabric Loader, and Fabric API build versions are pinned in `gradle.properties`.

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

Mods with multiple targets declare `supported_minecraft_versions` in their `build.gradle`.
The shared Gradle convention combines common sources with the selected target's sources and
uses the matching Minecraft, Fabric Loader, Fabric API, and metadata. Mods without a target
matrix build for the default Minecraft version. Use the release catalog to check the actual
target of each artifact, including when a legacy build also configures modern-only projects.
Multi-target Modrinth releases have a suffix such as `0.1.5+mc1.21.1`. The local jar filename has
the mod version alone, so choose it from the matching Minecraft build directory.

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
