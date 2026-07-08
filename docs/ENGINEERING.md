# Engineering Principles

This repository is a long-lived multi-mod workspace. The goal is not only to ship features, but to keep the codebase easy to understand, easy to change, and hard to accidentally break.

## North Star

Prefer clear, reusable, tested building blocks over one-off implementations. Do not copy and paste behavior when a shared helper, domain class, Gradle convention, or small abstraction can express the same idea cleanly.

## Repository Structure

- Keep each mod isolated under `mods/<mod-name>/`.
- Keep shared build logic in `gradle/`, not duplicated across mod `build.gradle` files.
- Keep root-level docs focused on the whole workspace.
- Put mod-specific implementation, assets, metadata, tests, and docs under that mod's directory when they are not shared.
- Do not let one mod depend on another mod's internal package unless that package is intentionally promoted to a shared module.

## Code Reuse

- Extract shared behavior before adding a second copy.
- Reuse existing local helpers and patterns before introducing a new style.
- Prefer pure Java domain classes for gameplay rules that can be tested without Minecraft.
- Use generic helpers only when they are genuinely shared by multiple call sites.
- Avoid premature abstractions for single-use code, but leave code shaped so extraction is easy when a second use appears.

Good examples:

- `gradle/fabric-mod.gradle` centralizes common Fabric/Loom/Modrinth setup.
- `PetNeeds` keeps Mushroom's need math separate from Minecraft entity plumbing.
- `TeleportTargetSelector` keeps NARwhal's target cycling separate from `ServerPlayer` behavior.

## Configuration

- Centralize shared versions in `gradle.properties`.
- Centralize repeated build behavior in `gradle/fabric-mod.gradle`.
- Give each mod only the configuration that is truly unique: mod id, display name, archive name, Modrinth project id, optional dependencies.
- Do not hard-code repeated Minecraft, Fabric Loader, Fabric API, Java, or JUnit versions in subprojects.
- Keep output paths symmetric across mods.
- Separate configuration by purpose:
  - **Build/release configuration** lives in Gradle files, workflow files, release scripts, and release docs.
  - **Runtime user configuration** lives in explicit config loader classes and generated config files.
  - **Gameplay tuning configuration** lives in domain-specific `*GameplayConfig` classes or value objects near the behavior it tunes.
- Document gameplay tuning values with their unit and gameplay effect, especially when changing speed, radius, damage, cooldown, capacity, spawn, or probability.
- Keep non-gameplay constants such as save-data keys, translation keys, asset paths, and logger names close to the adapter that uses them.
- Do not hide gameplay-affecting values inside entity plumbing, renderers, Gradle properties, or scripts.
- For mods with multiple Minecraft targets, declare the version matrix in the mod's `build.gradle`
  and keep version-specific Minecraft/Fabric integration under `src/versions/<minecraft-version>/`.
  Keep shared pure Java behavior in the normal source roots so tests run across every target.

## Separation Of Concerns

Keep these responsibilities separate:

- **Domain logic**: pure Java rules, deterministic and unit-testable.
- **Minecraft integration**: entity classes, item classes, networking, registries, save/load adapters.
- **Client rendering**: models, renderers, textures, animation state.
- **Build/release logic**: Gradle convention scripts, workflows, release scripts.
- **Documentation**: usage, testing, release process, engineering standards.

Entity classes should mostly adapt Minecraft events to domain logic. If an entity class starts accumulating unrelated behavior, extract:

- a state object
- a behavior class
- a selector/strategy
- a save/load adapter
- a renderer/model helper

## Public API Documentation

Document public APIs when they are intended for reuse outside their immediate class or package.

Documentation and comments in this repo are primarily for future LLM sessions working in the codebase.
They should reduce rediscovery cost: explain intent, invariants, ownership, version traps, gameplay
constraints, and coupling that is not obvious from a quick read. Avoid comments that merely narrate
the implementation, because an LLM can already read the code.

Use Javadoc for:

- public classes that represent reusable concepts
- public methods with non-obvious contracts
- public methods that mutate state
- public methods where order, bounds, side effects, or threading matter
- public constants whose values affect gameplay or compatibility

Javadoc should explain the contract and reason, not restate the method name. Useful comments answer:

- Why does this abstraction exist instead of living inline?
- What game behavior, compatibility concern, or validation gate depends on it?
- Which values are gameplay tuning versus persistence keys or integration glue?
- What must remain stable across Minecraft versions?
- What should the next agent avoid changing casually?

Do not add noisy comments for obvious code. Prefer clear names and small methods.

## File Size And Factoring

- Keep files focused on one responsibility.
- Treat 300 lines as a prompt to review structure.
- Treat 500 lines as a strong signal to extract responsibilities before adding more.
- `./gradlew check` warns above 300 lines and fails Java files above 500 lines.
- Avoid classes with many unrelated private helpers.
- Prefer several small cohesive classes over one large class with sections.

When a file grows, ask:

- Is there pure logic that can move out of Minecraft integration?
- Is there save/load code that can be isolated?
- Is there rendering or animation code mixed with gameplay state?
- Is there repeated logic across mods?
- Would tests be easier if this were split?

## Testing

Automated tests should be added at the lowest practical layer.

Use plain JVM tests for:

- math and state transitions
- selectors and ordering
- cooldown rules
- permission checks
- serialization helpers that do not need a world
- config parsing

Use Minecraft GameTest later for:

- entity spawn behavior
- item interactions
- block behavior
- registry-driven behavior
- world interactions

Use manual testing for:

- visual quality
- animation feel
- audio feel
- multiplayer feel
- pathfinding quality

Every bug fix should include a regression test unless the behavior is only visual/manual.

## Engineering Hardening

A hardening pass in this repository means improving engineering resilience, not only security.
Use it to make the mods easier to change, easier to test, faster to iterate on, and easier to
observe while developing or playtesting.

Start a hardening pass by reading this file, [Testing](TESTING.md), the relevant mod's
`build.gradle`, existing tests, and the code around the target behavior. Then write down a short
Now / Next / Later audit before editing when the scope is not obvious.

Prioritize:

- untested gameplay rules with user-visible behavior
- entity classes that mix Minecraft plumbing with reusable domain rules
- repeated setup that slows local development or makes manual playtesting error-prone
- missing logs around rare but important state transitions
- behavior that is hard to debug in-game without temporarily editing code

When implementing hardening changes:

- Prefer small vertical slices that leave gameplay unchanged unless a bug is clear.
- Extract pure Java policies, selectors, state transitions, and value objects when that unlocks fast tests.
- Use Minecraft GameTests only for behavior that needs registries, entities, world state, or tick loops.
- Add JUnit parameterized tests for rule matrices and boundary values.
- Add shared test fixtures only after repetition appears across tests.
- Keep server-authoritative behavior in common/server code and keep client code as an input/display adapter.
- Update docs when commands, workflows, coverage, or acceptance checks change.

## Observability

Logs and in-game diagnostics should make development clearer without spamming normal play.

- Use existing SLF4J mod loggers.
- Use `debug` for high-frequency diagnostics, decisions, and state that is useful during development.
- Use `info` for startup, rare lifecycle events, and notable state transitions.
- Use `warn` for recoverable invalid state, missing optional data, or ignored impossible requests.
- Avoid logging every tick unless the log is behind a debug toggle and rate-limited.
- Use parameterized log messages instead of string concatenation.
- Prefer opt-in debug commands, config flags, or actionbar messages for gameplay diagnostics.
- Do not replace player-facing feedback with logs; use both when the information serves different audiences.

## Automated Quality Gates

`./gradlew check` enforces the baseline maintenance rules:

- symmetric multi-mod layout and valid `fabric.mod.json` metadata
- no stale root `src/` directory
- unique mod ids
- existing icons and entrypoint classes
- duplicate translation-key detection
- item model texture reference validation for local assets
- no trailing whitespace, CRLF line endings, or missing final newlines
- Java file-size warnings at 300 lines and failures above 500 lines
- no client-only imports from common/server source
- Javadocs for public declarations that are not overrides
- release notes for every declared mod version
- successful per-mod Javadoc generation
- per-mod JVM unit tests

## Minecraft Modding Guidelines

- Keep client-only classes under `src/client/java`.
- Never reference client-only classes from common/server entrypoints.
- Keep registry code small and predictable.
- Use unique mod ids, asset namespaces, translation keys, and packet ids.
- Keep saved data keys stable once released.
- Prefer server-authoritative gameplay changes.
- Keep random behavior injectable or isolated when it needs tests.
- Avoid doing expensive scans every tick; amortize, cache, or use goals/events.
- Keep networking payloads small and version-conscious.

## Anti-Patterns To Avoid

- Copy-pasted Gradle blocks across mods.
- Copy-pasted gameplay rules embedded in entity classes.
- Giant entity classes that handle state, AI, rendering assumptions, saving, and item behavior together.
- Hard-coded paths that only work for one mod.
- Public methods without a clear owner or contract.
- Client classes imported by common/server code.
- Tests that require launching Minecraft when pure JVM tests would cover the rule.
- Magic numbers without names when they affect gameplay tuning.
- Silent behavior changes without docs or tests.
- Large refactors mixed into unrelated feature work.

## Review Checklist

Before merging a change:

- Does shared logic live in one place?
- Are versions and repeated Gradle settings centralized?
- Are public APIs documented where useful?
- Is the code split by responsibility?
- Are files still reasonably sized?
- Are there automated tests for pure logic?
- Does `./gradlew check` pass?
- Does `./gradlew build` pass before release?
- Are docs updated when workflow, behavior, or output paths change?
