# Minecraft mods agent guide

These instructions apply only to this Minecraft mods repository and its worktrees.
Read `docs/ENGINEERING.md`, `docs/TESTING.md`, and the relevant mod's documentation
before changing gameplay or the testing harness. Follow the shared communication
contract at `/Users/abellicon/.agents/skills/human-communication/references/voice-contract.md`.

## GitHub work tracking and continuity

Use GitHub issues in `alicon/minecraft-mods` for active work, progress, bugs, and
handoffs. Search for a matching open issue before creating one. Maintain one
owning issue for the current task; link separate reproducible gameplay bugs.
Do not use company Jira for this personal project.

Checkpoint at meaningful milestones, before a handoff or ending a work session,
and **before context compaction whenever advance notice permits**. Compaction
may happen without an opportunity to act, so do not rely on that timing alone.
Immediately after compaction, read the owning issue's latest checkpoint, inspect
the worktree and live connection, and record any missing progress before resuming.
Do not post duplicate checkpoints when nothing changed; note that state was verified.

Each checkpoint should make continuation possible without the chat:

- Goal, owning issue, current status, and next concrete action.
- Branch, worktree, base/current commit, and uncommitted changes.
- Implemented versus planned work; confirmed bugs versus hypotheses.
- Tests/scenarios run, passed/failed/blocked counts, reproduction commands,
  and report/screenshot paths (say explicitly when evidence is local only).
- Live Minecraft version/profile, exact test save, bridge address, and any
  running process or pending test that must be checked before restarting.
- Blockers, limitations, and decisions actually needed from the user.

Use verified account attribution for agent-authored issue bodies and comments.
Do not close an issue merely because a session ends or a partial pass succeeds.
In pull request descriptions, avoid closing keywords next to unresolved issue
references, including negated phrases such as "does not resolve #123". GitHub
still treats those as closing links. Check the PR's closing-issue references
before merging and verify the intended issue states afterward.

## Safe live testing

Use a disposable copied save for destructive scenarios, never a family save.
Verify the save identity and single-player bridge before mutating it. Keep the
bridge bound to loopback. Test cases must reset their fixtures, use bounded waits,
save failure evidence, and distinguish setup failures from behavior assertions.
Run the relevant automated tests and repository checks. Record any unrun checks.
Java changes require rebuilding, installing the jars, and restarting Minecraft;
a passing old client does not validate new code.

## Gradle run isolation

Serialize Gradle invocations in one worktree, including different Minecraft
targets. Versioned build directories do not isolate task history or Loom's
generated launch configuration. Competing runs can lose runtime classes and
fail with class-loading errors. Use separate worktrees with independent project
caches when parallel builds are needed. Preserve such failures as harness
evidence and verify a serialized run before calling them gameplay regressions.
