# Release guide

## Create the Modrinth projects

Create a Modrinth **Mod** project for NARwhal Together with these values:

- Name: `NARwhal Together`
- Suggested slug: `narwhal-together`
- Summary: `Little tools for big Minecraft adventures together.`
- License: `MIT`
- Source: `https://github.com/alicon/narwhal-together`
- Client environment: `Required`
- Server environment: `Required`
- Loader: `Fabric`
- Game version: `1.21.11` and `1.21.1`
- Required dependency: `Fabric API`
- Optional dependency: `Controlify`

Use `mods/narwhal-together/src/main/resources/assets/narwhal_together/icon.png` as the project icon, `docs/media/narwhal-together-banner.png` as a gallery image, and `docs/MODRINTH.md` as the long description.

Create a Modrinth **Mod** project for Mushroom the Yorkie with these values:

- Name: `Mushroom the Yorkie`
- Suggested slug: `mushroom-the-yorkie`
- Summary: `A tiny Yorkie companion with treats, naps, bathroom barks, and sheep-chasing opinions.`
- License: `MIT`
- Source: `https://github.com/alicon/narwhal-together`
- Client environment: `Required`
- Server environment: `Required`
- Loader: `Fabric`
- Game version: `1.21.11` and `1.21.1`
- Required dependency: `Fabric API`

Use `mods/mushroom-the-yorkie/src/main/resources/assets/mushroom_yorkie/icon.png` as the project icon, `docs/MODRINTH_MUSHROOM.md` as the long description, and these gallery images:

- `docs/media/mushroom-the-yorkie-banner.png`
- `docs/media/mushroom-the-yorkie-sleeping.png`
- `docs/media/mushroom-the-yorkie-mob-chase.png`
- `docs/media/mushroom-the-yorkie-adventure.png`

Create a Modrinth **Mod** project for Cops and Robbers with these values:

- Name: `Cops and Robbers`
- Suggested slug: `cops-and-robbers`
- Summary: `Police cruisers, fire trucks, robbers, banks, and patrol play for family Minecraft worlds.`
- License: `MIT`
- Source: `https://github.com/alicon/minecraft-mods`
- Client environment: `Required`
- Server environment: `Required`
- Loader: `Fabric`
- Game version: `1.21.11`
- Required dependency: `Fabric API`

Use `mods/cops-and-robbers/src/main/resources/assets/cops_robbers/icon.png` as the project icon and `docs/MODRINTH_COPS_AND_ROBBERS.md` as the long description.

## Configure publishing

After the Modrinth project exists:

1. Create a Modrinth personal access token with version publishing permission.
2. In GitHub, open **Settings → Secrets and variables → Actions**.
3. Add a repository secret named `MODRINTH_TOKEN`.
4. Add a repository variable named `MODRINTH_PROJECT_ID` containing the NARwhal project ID or slug.
5. Add a repository variable named `MUSHROOM_MODRINTH_PROJECT_ID` containing the Mushroom project ID or slug. If this is omitted, the workflows use the slug `mushroom-the-yorkie`.
6. Add a repository variable named `COPS_ROBBERS_MODRINTH_PROJECT_ID` containing the Cops and Robbers project ID or slug. If this is omitted, the workflows use the slug `cops-and-robbers`.

Never commit the token.

For local metadata syncs on macOS, the token can be stored in Keychain as a generic password with service `modrinth-token` and account `abellicon`. The sync script reads that entry automatically when `MODRINTH_TOKEN` is not already set.

Run **Sync Modrinth Metadata** from the repository's Actions tab whenever the name, description, license, links, icon, or gallery material changes. Select the mod to sync from the workflow input. The workflow leaves the project's review status unchanged.

## Publish

1. Complete `docs/TESTING.md` using the exact JAR being released.
2. Update `mod_version` in the selected mod's `mods/<mod>/build.gradle`.
3. Commit and push the release changes.
4. Open the repository's **Actions** tab.
5. Run **Publish to Modrinth**, select the mod, select the Minecraft target, and select `alpha`, `beta`, or `release`.

The workflow rebuilds from the selected commit and uploads the remapped production JAR for the selected Minecraft target. The publishing task declares Fabric API as required. NARwhal also declares Controlify as optional.
