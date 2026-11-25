# Release guide

## Modrinth projects

Use the existing Modrinth projects below for releases. The metadata sync script uses these slugs by default.

### NARwhal Together

- Name: `NARwhal Together`
- Slug: `narwhal-together`
- Summary: `Controller-friendly tools that make Minecraft easier and more fun for families playing together.`
- License: `MIT`
- Source: `https://github.com/alicon/minecraft-mods`
- Client environment: `Required`
- Server environment: `Required`
- Loader: `Fabric`
- Game version: `1.21.11` and `1.21.1`
- Required dependency: `Fabric API`
- Optional dependency: `Controlify`

Use `mods/narwhal-together/src/main/resources/assets/narwhal_together/icon.png` as the project icon, `docs/media/narwhal-together-banner.png` as a gallery image, and `docs/MODRINTH.md` as the long description.

### Mushroom the Yorkie

- Name: `Mushroom the Yorkie`
- Slug: `mushroom-the-yorkie`
- Summary: `A tiny Yorkie companion with treats, naps, bathroom barks, sheep-chasing opinions, and tiny barrel rolls.`
- License: `MIT`
- Source: `https://github.com/alicon/minecraft-mods`
- Client environment: `Required`
- Server environment: `Required`
- Loader: `Fabric`
- Game version: `1.21.11` and `1.21.1`
- Required dependency: `Fabric API`

Use `mods/mushroom-the-yorkie/src/main/resources/assets/mushroom_yorkie/icon.png` as the project icon, `docs/MODRINTH_MUSHROOM.md` as the long description, and these gallery images:

- `docs/media/mushroom-the-yorkie-banner.png`
- `docs/media/mushroom-the-yorkie-leashed.png`
- `docs/media/mushroom-the-yorkie-sleeping.png`
- `docs/media/mushroom-the-yorkie-water.png`
- `docs/media/mushroom-the-yorkie-fetching.png`
- `docs/media/mushroom-the-yorkie-flying.png`
- `docs/media/mushroom-the-yorkie-eating.png`
- `docs/media/mushroom-the-yorkie-drinking.png`
- `docs/media/mushroom-the-yorkie-wants-outside.png`
- `docs/media/mushroom-the-yorkie-sheep-chase.png`
- `docs/media/mushroom-the-yorkie-spider.png`

### Cops and Robbers

- Name: `Cops and Robbers`
- Slug: `cops-and-robbers`
- Summary: `Police cruisers, fire trucks, robbers, banks, and patrol play for family Minecraft worlds.`
- License: `MIT`
- Source: `https://github.com/alicon/minecraft-mods`
- Client environment: `Required`
- Server environment: `Required`
- Loader: `Fabric`
- Game version: `1.21.11`
- Required dependency: `Fabric API`

Use `mods/cops-and-robbers/src/main/resources/assets/cops_robbers/icon.png` as the project icon, `docs/MODRINTH_COPS_AND_ROBBERS.md` as the long description, and these gallery images:

- `docs/media/cops-and-robbers-lineup.png`
- `docs/media/cops-and-robbers-mobs.png`
- `docs/media/cops-and-robbers-vehicles.png`
- `docs/media/cops-and-robbers-police-station.png`
- `docs/media/cops-and-robbers-bank.png`
- `docs/media/cops-and-robbers-fire-station.png`

## Configure publishing

After the Modrinth project exists:

1. Create a Modrinth personal access token with permission to publish versions. Include project write permission if running metadata and gallery sync.
2. In GitHub, open **Settings → Secrets and variables → Actions**.
3. Add a repository secret named `MODRINTH_TOKEN`.
4. Add a repository variable named `MODRINTH_PROJECT_ID` containing the NARwhal project ID or slug. If this is omitted, the workflows use the slug `narwhal-together`.
5. Add a repository variable named `MUSHROOM_MODRINTH_PROJECT_ID` containing the Mushroom project ID or slug. If this is omitted, the workflows use the slug `mushroom-the-yorkie`.
6. Add a repository variable named `COPS_ROBBERS_MODRINTH_PROJECT_ID` containing the Cops and Robbers project ID or slug. If this is omitted, the workflows use the slug `cops-and-robbers`.

Never commit the token.

For local release commands on macOS, the token can be stored in Keychain as a generic password with service `modrinth-token` and account `abellicon`. The release and sync scripts read that entry automatically when `MODRINTH_TOKEN` is not already set.

Run **Sync Modrinth Metadata** from the repository's Actions tab whenever the name, description, license, links, icon, or gallery material changes. Select the mod to sync from the workflow input. The workflow leaves the project's review status unchanged.

## Publish

1. Update `mod_version` in the selected mod's `mods/<mod>/build.gradle` and add `docs/release-notes/<mod>/<version>.md`.
2. Confirm the selected Minecraft targets and version numbers with `./gradlew -q printModReleaseTargets`.
3. Build from the release commit and run the relevant [acceptance checks](TESTING.md#manual-acceptance-checks) with its remapped production jars. Record their paths, target versions, and checksums.
4. Push the release commit and verify its CI results.
5. Preview the local release plan for the selected mod.

   ```shell
   make release-dry-run RELEASE_MODS=cops-and-robbers RELEASE_SKIP_PROFILE=1
   ```

6. To upload the exact tested bytes, select the verified jar in Modrinth's **Create version** form. Use the target and version number from the catalog, mark Fabric API as required, and attach the matching changelog. For multi-target mods, upload one version per Minecraft target. To have the local script rebuild and publish, use the command below and verify the published checksum against the tested artifact.

   ```shell
   make release RELEASE_MODS=cops-and-robbers RELEASE_SKIP_PROFILE=1 MODRINTH_VERSION_TYPE=alpha
   ```

7. Check the public version page for the file, Fabric loader, Minecraft version, release channel, and required dependencies. Compare its file hash against the tested jar. If gallery art changed, run **Sync Modrinth Metadata** for the selected branch and review the public gallery.

The local release command:

- validates each selected Minecraft target with `check --warning-mode all`
- builds every selected release artifact
- prints SHA-256 checksums
- syncs Modrinth metadata for every selected mod
- publishes every selected Modrinth version
- installs the Minecraft `1.21.11` jars into the local Dad's Minecraft profile by default
- backs up previous matching profile jars before copying new ones

By default, `make release` publishes all three mods: NARwhal Together and Mushroom the Yorkie for Minecraft `1.21.11` and `1.21.1`, and Cops and Robbers for Minecraft `1.21.11`.

Useful release switches:

```shell
make release RELEASE_DRY_RUN=1
make release RELEASE_SKIP_PROFILE=1
make release RELEASE_SKIP_PUBLISH=1
make release RELEASE_SKIP_METADATA=1
make release RELEASE_MODS="narwhal-together mushroom-the-yorkie"
make release RELEASE_MINECRAFT_VERSIONS="1.21.1" RELEASE_MODS="narwhal-together mushroom-the-yorkie"
make release RELEASE_INSTALL_MC_VERSION=1.21.11
```

The command refuses to publish from a dirty working tree unless `ALLOW_DIRTY_RELEASE=1` is set. Keep the default guard for normal releases so Modrinth artifacts map cleanly back to a commit.

The GitHub **Publish to Modrinth** workflow rebuilds and publishes one mod for one Minecraft target from the selected ref. It declares Fabric API as required and Controlify as optional for NARwhal Together. Use the manual upload step when publication must use the exact file already tested.
