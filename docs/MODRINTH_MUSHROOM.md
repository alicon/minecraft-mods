# Mushroom the Yorkie

**A tiny Yorkie companion with big feelings.**

Mushroom the Yorkie adds one small, loyal dog companion to your Minecraft world. He follows his owner, takes treats and normal food, naps indoors at night, asks to go outside, eats from dog bowls, curls up on a dog bed, fetches a toy ball, does loop-de-loops and barrel rolls when flying with you, and occasionally gets very invested in nearby peaceful animals.

**Yep, 100% vibe-coded with Codex and ChatGPT.** My daughter and I wanted our real dog in Minecraft. It's a bonding project we play with our neighbors, too. I'm a software engineer, my daughter calls the shots on what's fun, and we read the comments and fix things together. We test stuff like saving mid-fetch so Mushroom doesn't lose his ball, and getting him safely out of the water. Real meat robots, real dog.

## Current Features

- One Mushroom per player by default, including creative spawn eggs.
- Spawn eggs create your owned Mushroom directly.
- Yorkie treats tame, feed, and call Mushroom back.
- Normal edible player food can feed an owned Mushroom in an emergency.
- Craft copper dog bowls, fill them with food or water, and watch Mushroom use one serving per Minecraft day.
- Mushroom has a simple food bar shown during owner interactions; it drains while following and much more slowly while sitting.
- If a loaded Mushroom is lost from his owner for a full Minecraft day, the next successful sleep can bring him back to the player's bed.
- Craft a dog bed from wool and dye, or give Mushroom a doghouse for sheltered rest.
- Woodland squirrels climb trees, hop between nearby crowns, and plant dropped vanilla saplings when mob griefing is enabled. They have their own spawn egg.
- Mushroom can chase squirrels and walk back to you afterward. On a lead he may stop for a bathroom break, sniff in a different direction, or briefly dig his heels in.
- Craft wool-and-dye toys, including a ball and chew toy you can right-click throw for Mushroom to fetch. Dropped toys and vanilla bones also work, including safe open-water fetches.
- Mushroom barks when he needs to go outside after being indoors too long, then only resets that potty need once per Minecraft day.
- At night indoors in a natural day/night dimension, Mushroom curls up to sleep. A nearby monster can wake him, even through a wall.
- A following Mushroom travels through dimension-changing portals with his owner; tell him to sit if he should stay behind.
- Double-click a sleeping Mushroom to wake him briefly before he settles back down.
- Mushroom can bark at and chase peaceful mobs, but treats call him off and teach him to leave nearby passive animals alone.
- Creative flying support lets Mushroom trail along with loop-de-loops and barrel rolls, and he can hop out of boats before trying to fly.
- Be careful not to drop too fast while flying. Land gently, or little Mushroom can get injured.

## Configuration

Mushroom writes a config file at:

```text
config/mushroom_yorkie.json
```

The default behavior allows one loaded Mushroom per player. Set `oneMushroomPerPlayer` to `false` if you want creative worlds or servers to allow multiple Mushrooms per owner.

Wake-up spawning is configurable too:

- `respawn`: after a successful night in bed, a player gets Mushroom if they do not already have a loaded owned Mushroom. A loaded Mushroom lost from his owner for a full Minecraft day can also return to the bed instead of staying missing.
- `extreme`: each player gets Mushroom only once after sleeping; if he dies, that player does not get another one.

## Installation

Mushroom the Yorkie must be installed on every participating client and on the server or LAN host.

### Required

- Minecraft Java Edition 1.21.11 or 1.21.1
- Fabric Loader 0.19.3 or newer on 1.21.11, or 0.16.14 or newer on 1.21.1
- Fabric API for your Minecraft version

## Why Mushroom?

Mushroom is built for family Minecraft worlds where a companion should feel small, expressive, and a little bit silly without turning into a full pet-management system.
