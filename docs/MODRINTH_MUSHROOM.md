# Mushroom the Yorkie

**A tiny Yorkie companion with big feelings.**

Mushroom the Yorkie adds one small, loyal dog companion to your Minecraft world. He follows his owner, takes treats and normal food, naps indoors at night, asks to go outside, eats from dog bowls, curls up on a dog bed, fetches a toy ball, does loop-de-loops and barrel rolls when flying with you, and occasionally gets very invested in nearby peaceful animals.

## Current Features

- One Mushroom per player by default, including creative spawn eggs.
- Spawn eggs create your owned Mushroom directly.
- Yorkie treats tame, feed, and call Mushroom back.
- Normal edible player food can feed an owned Mushroom in an emergency.
- Craft copper dog bowls, fill them with food or water, and watch Mushroom use one serving per Minecraft day.
- Mushroom has a simple food bar shown during owner interactions; it drains while following and much more slowly while sitting.
- If a loaded Mushroom is lost from his owner for a full Minecraft day, the next successful sleep can bring him back to the player's bed.
- Craft a dog bed from wool and dye so Mushroom has a place to curl up at night.
- Craft wool-and-dye toys, including a ball and chew toy you can right-click throw for Mushroom to fetch. Dropped toys and vanilla bones also work, including safe open-water fetches.
- Mushroom barks when he needs to go outside after being indoors too long, then only resets that potty need once per Minecraft day.
- At night indoors, Mushroom curls up to sleep with closed eyes.
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

- Fabric Loader
- Fabric API
- Minecraft Java Edition 1.21.11 or 1.21.1

## Why Mushroom?

Mushroom is built for family Minecraft worlds where a companion should feel small, expressive, and a little bit silly without turning into a full pet-management system.
