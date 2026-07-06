# Development Environment

This repository is a Fabric multi-mod Gradle workspace. The fastest setup is to use the checked-in Gradle wrapper with Java 21.

## Prerequisites

- Java 21 or newer.
- Git.
- An editor with Gradle project import support. VS Code users who open the Dev Container get the recommended Java and Gradle extensions automatically.

## Dev Container

If you use VS Code Dev Containers or GitHub Codespaces, open the repository in the included dev container. It provides Java 21, Git, GitHub CLI, and VS Code Java/Gradle extension recommendations.

The container runs this smoke check after creation:

```shell
./gradlew --version && ./gradlew validateFormatting --no-daemon
```

## Local Setup

From the repository root:

```shell
./gradlew --version
./gradlew check
```

Gradle downloads Minecraft, Fabric, Loom, and test dependencies into the configured Gradle cache on first use.

## Common Commands

```shell
make help
make check
make test MOD=narwhal-together
make build MOD=mushroom-the-yorkie
make build-all
```

Use `MC_VERSION=1.21.1` when testing the NARwhal Together compatibility target:

```shell
make check MOD=narwhal-together MC_VERSION=1.21.1
```

## Manual Playtesting

To copy a built mod jar into a local Minecraft or Modrinth profile, point `LIVE_TEST_MODS_DIR` at that profile's `mods` directory:

```shell
make live-test MOD=cops-and-robbers LIVE_TEST_MODS_DIR=/path/to/profile/mods
```

The Makefile backs up older matching jars before copying the newly built jar.

## Troubleshooting

- Run commands from the repository root so Gradle can find `settings.gradle` and the mod subprojects.
- If dependency resolution is stale, run `./gradlew --refresh-dependencies check`.
- If an editor fails to import sources, confirm it is using Java 21 and the Gradle wrapper.
- On non-macOS systems, prefer setting `LIVE_TEST_MODS_DIR` directly instead of relying on the default Modrinth profile path.
