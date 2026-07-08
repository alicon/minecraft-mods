# Compatibility Policy

This repo optimizes for simple, maintainable Fabric mods for family Minecraft play.

## Supported Platform

- Minecraft Java Edition: target the version in `gradle.properties`
- Loader: Fabric
- Java: target the version in `gradle.properties`
- Required dependency: Fabric API

By default, the workspace builds the version in `gradle.properties`. Individual mods may opt into a
small version matrix with version-specific source roots when the compatibility value is worth the
extra maintenance.

Current Minecraft target support:

- NARwhal Together: Minecraft Java Edition `1.21.11` and `1.21.1`
- Mushroom the Yorkie: Minecraft Java Edition `1.21.11` and `1.21.1`
- Cops and Robbers: Minecraft Java Edition `1.21.11`

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
