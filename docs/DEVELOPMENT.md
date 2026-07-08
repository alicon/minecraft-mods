# Development Environment

This repository is a Fabric multi-mod Gradle workspace. Use Java 21 and the checked-in Gradle wrapper for local work.

## Prerequisites

- Java 21 or newer
- Git
- An editor with Gradle project import support

VS Code users can open the included Dev Container to get Java 21, Git, GitHub CLI, and the recommended Java, Gradle, and EditorConfig extensions.

## Dev Container

Open the repository in VS Code Dev Containers or GitHub Codespaces. The container runs this smoke check after creation:

```shell
GRADLE_USER_HOME=.gradle-user-home ./gradlew --version
GRADLE_USER_HOME=.gradle-user-home ./gradlew validateFormatting --no-daemon
```

If the first import is slow, Gradle is downloading Minecraft, Fabric, Loom, and test dependencies.

## Local Setup

From the repository root:

```shell
./gradlew --version
./gradlew check
./gradlew check -Ptarget_minecraft_version=1.21.1
```

The default target is Minecraft `1.21.11`. NARwhal Together and Mushroom the Yorkie also support Minecraft `1.21.1`; Cops and Robbers currently supports `1.21.11`.

## Common Commands

```shell
make help
make check
make validate
make test MOD=narwhal-together
make build MOD=mushroom-the-yorkie
make build-all
```

`make check` runs the root repository check. `MOD` is used by per-mod targets such as `make test`, `make build`, `make live-test`, `make publish-modrinth`, and `make sync-modrinth`.

Use `MC_VERSION=1.21.1` for the compatibility target:

```shell
make check MC_VERSION=1.21.1
make build MOD=narwhal-together MC_VERSION=1.21.1
make build MOD=mushroom-the-yorkie MC_VERSION=1.21.1
```

## Manual Playtesting

To copy a built mod jar into a local Minecraft or Modrinth profile, point `LIVE_TEST_MODS_DIR` at that profile's `mods` directory:

```shell
make live-test MOD=cops-and-robbers LIVE_TEST_MODS_DIR=/path/to/profile/mods
```

The Makefile backs up older matching jars before copying the newly built jar. On this workstation, the default profile path is Dad's Minecraft Modrinth profile.

## Release Helpers

Sync Modrinth project metadata:

```shell
make sync-modrinth MOD=narwhal-together
make sync-modrinth MOD=mushroom-the-yorkie
make sync-modrinth MOD=cops-and-robbers
```

Publish a selected target when `MODRINTH_TOKEN` is available:

```shell
make publish-modrinth MOD=narwhal-together MC_VERSION=1.21.11 MODRINTH_VERSION_TYPE=alpha
```

## Troubleshooting

- Run commands from the repository root so Gradle can find `settings.gradle` and the mod subprojects.
- If dependency resolution is stale, run `./gradlew --refresh-dependencies check`.
- If an editor fails to import sources, confirm it is using Java 21 and the Gradle wrapper.
- If Gradle file locking fails inside a restricted sandbox, run the same command in a normal terminal.
- On non-macOS systems, set `LIVE_TEST_MODS_DIR` directly instead of relying on the default Modrinth profile path.
