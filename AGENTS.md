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

## Check the QA objective during long runs

Use the `forest-for-the-trees` skill when available. Review the run after its
first useful evidence, roughly every ten minutes of active work, and after
two retries of the same failing tactic. Name the player-facing mod behavior
under test and what this run has actually proved. If setup or vanilla
progression dominates, run the closest focused mod check and keep the
long-duration run when it is still useful. Record harness failures as
harness evidence and keep the full acceptance criteria for the owning issue.

While working on [Mushroom expedition #158](https://github.com/alicon/minecraft-mods/issues/158),
read the newest **Hourly Astra review** on continuation and at the next long-run
review. The Mac also keeps the last delivered review in
`~/Library/Application Support/MushroomQA/hourly-review/latest.md`.
Compare its evidence with the current save and choose the next experiment.
Carry forward the last verified Mushroom behavior, the farthest point reached
in one uninterrupted campaign, and any intervention needed. A repeated harness
stall calls for a different tactic. A focused replay can verify a mod fix while
the campaign continues. Record what happened when the player next encounters
that situation through ordinary play.

## Safe live testing

Use a disposable copied save for destructive scenarios, never a family save.
Verify the save identity and single-player bridge before mutating it. Keep the
bridge bound to loopback. Test cases must reset their fixtures, use bounded waits,
save failure evidence, and distinguish setup failures from behavior assertions.
Run the relevant automated tests and repository checks. Record any unrun checks.
Java changes require rebuilding, installing the jars, and restarting Minecraft;
a passing old client does not validate new code.
Freeze the copied world's mob ticks after an investigative failure before lengthy
code or review work, so the fixture does not keep aging. Players can still tick
while the world is frozen: verify the owner's health and position, and explicitly
resume world ticks before the next native-input test. Preserve the failed report.
Failure screenshots must preserve the current owner/view: no camera teleports or
rotation, screen closing, HUD hiding or chat clearing. Even a same-position `/tp`
can dismount the owner and reset native movement/ground state.

## Gradle run isolation

Serialize Gradle invocations in one worktree, including different Minecraft
targets. Versioned build directories do not isolate task history or Loom's
generated launch configuration. Competing runs can lose runtime classes and
fail with class-loading errors. Use separate worktrees with independent project
caches when parallel builds are needed. Preserve such failures as harness
evidence and verify a serialized run before calling them gameplay regressions.
