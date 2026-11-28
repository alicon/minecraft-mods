import json
from pathlib import Path
import runpy
import tempfile
import unittest


API = runpy.run_path(str(Path(__file__).resolve().parents[1] / "summarize-mushroom-expedition.py"))


class ExpeditionComparisonTests(unittest.TestCase):
    def make_run(self, policy, game_log="", actions=(), seed=71, reopen="original", stage="expedition",
                 held_reason=None, archive_reason=None, reattached=False, retired_reason=None):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name)
        (path / "source-build.txt").write_text("Revision verified-build\n", encoding="utf-8")
        narration = f"Run | Started the Survival controller. Stage {stage}, policy {policy}.\n"
        if reattached:
            narration += f"Run | Reattached to the same save. Stage {stage}, policy {policy}.\n"
        if held_reason:
            narration += f"Result | Run held. {held_reason}\n"
            (path / "status").write_text("held", encoding="utf-8")
        if archive_reason:
            (path / "archived-controller-failure.txt").write_text(archive_reason, encoding="utf-8")
        if retired_reason:
            (path / "retired-for-build").write_text(retired_reason, encoding="utf-8")
        (path / "playtest.log").write_text(narration, encoding="utf-8")
        (path / "game.log").write_text(
            f"Expedition Survival ready: seed={seed}\n" + game_log.format(reopen=reopen),
            encoding="utf-8",
        )
        (path / "actions.jsonl").write_text(
            "".join(json.dumps(action) + "\n" for action in actions), encoding="utf-8"
        )
        if game_log.startswith("Expedition Survival expedition passed"):
            (path / "native-end-victory").write_text("original-dragon", encoding="utf-8")
        return API["summarize"](path)

    def test_mismatched_reopen_cannot_count_as_full_victory(self):
        result = self.make_run("rules", self.winning_log, reopen="replacement-dog")
        self.assertTrue(result["terminal"])
        self.assertFalse(result["fullExpeditionVerified"])

    def test_cost_per_win_includes_failed_matched_runs_without_counting_staged_or_live_runs(self):
        rules = self.make_run("rules", self.winning_log)
        win = self.make_run("jev", self.winning_log, [{"policy": "jev", "chosen": "a", "costUsd": 0.01}])
        failure = self.make_run("jev", "Expedition lost the original companion: creeper\nBUILD FAILED\n",
                                [{"policy": "jev", "chosen": "a", "costUsd": 0.03}])
        live = self.make_run("jev", actions=[{"policy": "jev", "chosen": "a", "costUsd": 0.02}])
        staged = self.make_run("jev", self.winning_log, stage="defense")
        coached = self.make_run("jev", self.winning_log, [{"policy": "jev", "coaching": "pick route a"}])
        unmatched = self.make_run("jev", self.winning_log, seed=74)
        comparison = API["compare_policies"]([rules, win, failure, live, staged, coached, unmatched])
        self.assertEqual(comparison["excludedRuns"], 3)
        policy = comparison["pairedByRevision"]["verified-build"]["jev"]
        self.assertEqual(policy["terminalAttempts"], 2)
        self.assertEqual(policy["liveAttempts"], 1)
        self.assertEqual(policy["verifiedWinsWithOriginalDog"], 1)
        self.assertEqual(policy["completionRate"], 0.5)
        self.assertEqual(policy["originalDogDeaths"], 1)
        self.assertEqual(policy["reportedCostPerWinUsd"], 0.04)

    def test_a_request_timeout_keeps_cost_per_win_unknown(self):
        rules = self.make_run("rules", self.winning_log)
        jev = self.make_run("jev", self.winning_log, [{"policy": "jev", "fallback": "request failed"}])
        result = API["compare_policies"]([rules, jev])["pairedByRevision"]["verified-build"]["jev"]
        self.assertEqual(result["requestsWithUnknownCost"], 1)
        self.assertIsNone(result["reportedCostPerWinUsd"])

    def test_only_an_archived_controller_failure_can_close_a_held_attempt(self):
        reason = "The wool search exhausted its rounds"
        live = self.make_run("jev", held_reason=reason)
        archived = self.make_run("jev", held_reason=reason, archive_reason=reason)
        mismatch = self.make_run("jev", held_reason=reason, archive_reason="something else")
        self.assertFalse(live["terminal"])
        self.assertTrue(archived["terminal"])
        self.assertEqual(archived["archivedControllerFailure"], reason)
        self.assertFalse(mismatch["terminal"])

    def test_manual_or_legacy_reattachment_is_assisted(self):
        manual = self.make_run("rules", self.winning_log, actions=[
            {"action": "controller_resume_started", "assisted": True}
        ], reattached=True)
        legacy = self.make_run("rules", self.winning_log, actions=[
            {"action": "controller_reattached"}
        ], reattached=True)
        failed_early = self.make_run("rules", "BUILD FAILED\n", reattached=True)
        automatic = self.make_run("rules", self.winning_log, actions=[
            {"action": "controller_resume_started", "assisted": False},
            {"action": "controller_reattached"},
        ], reattached=True)
        self.assertTrue(manual["assisted"])
        self.assertTrue(legacy["assisted"])
        self.assertTrue(failed_early["assisted"])
        self.assertFalse(automatic["assisted"])
        self.assertEqual(automatic["controllerReattachments"], 1)

    def test_an_experiment_retired_for_a_new_build_is_excluded_and_keeps_its_cost(self):
        rules = self.make_run("rules", self.winning_log)
        jev = self.make_run("jev", self.winning_log, [{"policy": "jev", "chosen": "a", "costUsd": 0.01}])
        retired = self.make_run("jev", "BUILD FAILED\n", [{"policy": "jev", "chosen": "a", "costUsd": 0.04}],
                                retired_reason="Replaced after the new mod build")
        result = API["compare_policies"]([rules, jev, retired])
        self.assertEqual(result["excludedRuns"], 1)
        self.assertEqual(retired["reportedCostUsd"], 0.04)
        self.assertEqual(retired["retiredForBuild"], "Replaced after the new mod build")
        self.assertEqual(result["pairedByRevision"]["verified-build"]["jev"]["terminalAttempts"], 1)
        self.assertEqual(result["pairedByRevision"]["verified-build"]["jev"]["reportedCostPerWinUsd"], 0.01)

    winning_log = ("Expedition Survival expedition passed: dog=original owner=owner\n"
                   "Expedition Survival expedition reopened: dog={reopen} owner=owner\n"
                   "BUILD SUCCESSFUL\n")
