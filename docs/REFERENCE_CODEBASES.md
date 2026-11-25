# Reference Codebases

These projects are useful references for habits and patterns, not templates to copy wholesale. Our mods are small, kid-friendly Fabric mods, so we borrow discipline while avoiding unnecessary architecture.

## Fabric API

Source: https://github.com/FabricMC/fabric-api

Borrow:

- clear module boundaries
- stable naming and package ownership
- strong Javadocs for reusable API surfaces
- compatibility discipline around Minecraft and Fabric versions

Avoid:

- splitting into many modules before the repo needs it
- exposing internal mod code as public API too early

## Sodium

Source: https://github.com/CaffeineMC/sodium

Borrow:

- strict build and release hygiene
- clear issue reporting expectations
- careful compatibility notes
- disciplined separation between implementation and integration layers

Avoid:

- performance-oriented complexity that does not apply to playful companion/tool mods
- multi-loader structure before there is a real need

## Just Enough Items

Source: https://github.com/mezz/JustEnoughItems

Borrow:

- user-facing workflow polish
- compatibility mindset
- small integration contracts where other code needs to interact
- clear handling of client-only UI code

Avoid:

- UI framework complexity until a mod actually needs substantial screens

## Tech Reborn

Source: https://github.com/TechReborn/TechReborn

Borrow later:

- data generation for items, recipes, loot tables, and tags
- content organization once a mod has many blocks/items
- testable content registration patterns

Avoid for now:

- large content-system abstractions before Mushroom or NARwhal have enough content to justify them

## Immersive Engineering

Source: https://github.com/BluSunrize/ImmersiveEngineering

Borrow later:

- mature organization for larger gameplay features
- data-driven content habits
- feature grouping when one mod grows beyond a few systems

Avoid for now:

- broad gameplay frameworks and large registries before this repo needs them

## Practical Rule

When adding a new pattern, ask:

- Does this make the next kid-friendly idea easier to add?
- Does this reduce duplication now, not just hypothetically?
- Can it be tested from the CLI?
- Is it simpler than the code it replaces?

If the answer is no, keep the implementation small and local.
