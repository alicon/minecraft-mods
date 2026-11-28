"""Summarize Java expedition reports and Bedrock gameplay soaks."""

import argparse
from collections import Counter
from datetime import datetime
import json
from pathlib import Path
import re
from statistics import median


PASSED = re.compile(r"Expedition Survival ([\w-]+) passed: dog=(\S+) owner=(\S+)")
REOPENED = re.compile(r"Expedition Survival ([\w-]+) reopened: dog=(\S+) owner=(\S+)")
SEED = re.compile(r"Expedition Survival ready: seed=(-?\d+)")
START = re.compile(r"Run \| Started the Survival controller\. Stage ([\w-]+), policy (\w+)\.")
BEDROCK_LINE = re.compile(
    r"^\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}):(\d{3}) (?:WARN|ERROR)] "
    r"\[Scripting] MUSHROOM_(PLAY_\w+|TEST_FAIL) (\{.*\})"
)


def summarize_bedrock(path):
    build = {}
    started = last_event = None
    completed = failed = None
    counts = Counter()
    side_steps = 0
    round_number = 0
    with path.open(encoding="utf-8", errors="replace") as stream:
        for line in stream:
            if not line.endswith("\n"):
                break
            if line.startswith("MUSHROOM_PLAY_BUILD "):
                build = json.loads(line.partition(" ")[2])
                continue
            match = BEDROCK_LINE.match(line)
            if not match:
                continue
            day, clock, millis, event, payload = match.groups()
            when = datetime.fromisoformat(f"{day}T{clock}.{millis}")
            data = json.loads(payload)
            if event == "PLAY_START":
                started = when
            if started is not None:
                last_event = when
            if event == "PLAY_RESULT":
                round_number = data["round"]
                counts[data["case"]] += 1
            elif event == "PLAY_INPUT_RETRY":
                side_steps += data.get("sideSteps", 0)
            elif event == "PLAY_PASS":
                completed = data
                break
            elif event == "TEST_FAIL":
                failed = data
                break
    seconds = (last_event - started).total_seconds() if started and last_event else 0
    requested = build.get("seconds")
    status = "running" if started else "starting"
    if failed:
        status = "failed"
    elif completed:
        seconds = completed["elapsedSeconds"]
        status = "passed" if requested is not None and seconds >= requested else "incomplete"
    return {
        "run": str(path),
        "edition": "bedrock",
        "seed": build.get("seed"),
        "status": status,
        "requestedSeconds": requested,
        "observedSeconds": seconds,
        "completedRounds": round_number,
        "completedCases": dict(counts),
        "sidesteps": side_steps,
        "addOnSha256": build.get("sha256"),
        "fixtureSha256": build.get("fixtures", {}),
        "failure": failed,
    }


def summarize(path):
    if path.is_file():
        return summarize_bedrock(path)
    game_log = (path / "game.log").read_text(encoding="utf-8", errors="replace")
    narration = path / "playtest.log"
    playtest_log = narration.read_text(encoding="utf-8", errors="replace") if narration.is_file() else ""
    started = START.search(playtest_log)
    source = path / "source-build.txt"
    revision = source.read_text(encoding="utf-8").splitlines() if source.is_file() else []
    initial_seed = SEED.search(game_log)
    passed = PASSED.search(game_log)
    reopened = REOPENED.search(game_log)
    status_path = path / "status"
    status = status_path.read_text(encoding="utf-8").strip() if status_path.exists() else "starting"
    archived_failure = path / "archived-controller-failure.txt"
    failure_reason = None
    if status == "held" and archived_failure.is_file() and playtest_log:
        reason = archived_failure.read_text(encoding="utf-8").strip()
        if reason and playtest_log.splitlines()[-1].partition("Result | Run held. ")[2] == reason:
            failure_reason = reason
    actions = Counter()
    choices = Counter()
    broken_generated_crystals = set()
    latencies = []
    cost = 0.0
    tokens = 0
    costs_missing = 0
    charge_unknown = 0
    assisted = any(sidecar.stat().st_size for sidecar in path.glob("live-*.actions.jsonl"))
    trace_path = path / "actions.jsonl"
    end_server_path = path / "generated-end-server.json"
    end_server = json.loads(end_server_path.read_text(encoding="utf-8")) if end_server_path.is_file() else None
    if trace_path.exists():
        with trace_path.open(encoding="utf-8") as stream:
            for line in stream:
                if not line.endswith("\n"):
                    # A live process may still be writing the current record.
                    break
                row = json.loads(line)
                action = row.get("action")
                if action:
                    actions[action] += 1
                if action == "generated_crystal_shot" and row.get("destroyed"):
                    broken_generated_crystals.add(row["crystal"])
                if action == "agent_replaced_controller" or row.get("assisted") is True:
                    assisted = True
                if row.get("policy") == "jev":
                    choices["requests"] += 1
                    choices["answered"] += bool(row.get("chosen"))
                    choices["coached"] += bool(row.get("coaching"))
                    assisted |= bool(row.get("coaching"))
                    if isinstance(row.get("latencyMs"), (int, float)):
                        latencies.append(row["latencyMs"])
                    if isinstance(row.get("costUsd"), (int, float)):
                        cost += row["costUsd"]
                    elif row.get("chosen") or not re.fullmatch(r"HTTP 4\d\d", row.get("fallback", "")):
                        charge_unknown += 1
                        costs_missing += bool(row.get("chosen"))
                    tokens += row.get("inputTokens") or 0
    same_dog_after_reopen = bool(passed and reopened and passed.groups() == reopened.groups())
    native_finished = "BUILD SUCCESSFUL" in game_log
    native_failed = "BUILD FAILED" in game_log
    verified_expedition = (same_dog_after_reopen and passed.group(1) == "expedition"
                           and (path / "native-end-victory").is_file())
    return {
        "run": str(path),
        "edition": "java",
        "revision": revision[0].removeprefix("Revision ") if len(revision) == 1 else None,
        "seed": int(initial_seed.group(1)) if initial_seed else None,
        "stage": started.group(1) if started else None,
        "policy": started.group(2) if started else None,
        "status": status,
        "nativeClientFailed": native_failed,
        "terminal": native_finished or native_failed or failure_reason is not None,
        "archivedControllerFailure": failure_reason,
        "fullExpeditionVerified": native_finished and verified_expedition,
        "nativeMilestone": passed.group(1) if passed else None,
        "nativeCompanionDefense": "Expedition companion defense passed:" in game_log,
        "nativeCreeperRetreat": "Expedition native creeper retreat passed:" in game_log,
        "nativeFeeding": "Expedition native feeding passed:" in game_log,
        "nativeQuarryIron": "Expedition native quarry iron passed:" in game_log,
        "nativeCompanionEquipment": "Expedition companion equipment passed:" in game_log,
        "nativeEndEntry": "Expedition native End entry passed:" in game_log,
        "nativeEndCrystal": "Expedition native End crystal passed:" in game_log,
        "nativeGeneratedEndCrystals": "Expedition native generated crystals passed:" in game_log,
        "nativeGeneratedEndCage": "Expedition native generated cage passed:" in game_log,
        "generatedCrystalShots": actions["generated_crystal_shot"],
        "generatedCrystalsBroken": len(broken_generated_crystals),
        "generatedCagesOpened": actions["generated_cage_opened"],
        "generatedEndServer": end_server,
        "nativeEyeRoute": "Expedition native eye route passed:" in game_log,
        "nativeStrongholdApproach": "Expedition native stronghold approach passed:" in game_log,
        "nativeNetherRoundTrip": "Expedition Nether round trip passed:" in game_log,
        "nativeNetherSupplies": "Expedition native Nether supplies passed:" in game_log,
        "nativeShelteredAdoption": "Expedition sheltered adoption passed:" in game_log,
        "sameDogAndOwnerAfterReopen": same_dog_after_reopen,
        "originalDogLost": "Expedition lost the original companion:" in game_log,
        "assisted": assisted,
        "movementCalls": actions["go_to"] + actions["move"],
        "controllerReattachments": actions["controller_reattached"],
        "nativeRespawns": game_log.count("Expedition Survival owner respawned in the same save"),
        "controllerHolds": playtest_log.count("Result | Run held."),
        "careReturns": actions["companion_care_return"],
        "companionRegroups": actions["companion_regrouped"],
        "gearRecoveryAttempts": actions["recover_dropped_loadout"],
        "jevRequests": choices["requests"],
        "jevChoices": choices["answered"],
        "coachedChoices": choices["coached"],
        "medianJevLatencyMs": median(latencies) if latencies else None,
        "reportedInputTokens": tokens,
        "reportedCostUsd": round(cost, 12),
        "answeredRequestsMissingCost": costs_missing,
        "requestsWithUnknownCost": charge_unknown,
    }


def compare_policies(runs):
    eligible = [r for r in runs if r.get("stage") == "expedition" and r["revision"]
                and r["seed"] is not None and r["policy"] in ("jev", "rules") and not r["assisted"]]
    seeds = {}
    for run in eligible:
        seeds.setdefault((run["revision"], run["seed"]), set()).add(run["policy"])
    matched = [r for r in eligible if len(seeds[(r["revision"], r["seed"])]) == 2]
    comparisons = {}
    for revision in sorted({r["revision"] for r in matched}):
        policies = {}
        for policy in ("rules", "jev"):
            attempts = [r for r in matched if r["revision"] == revision and r["policy"] == policy]
            finished = [r for r in attempts if r["terminal"]]
            wins = sum(r["fullExpeditionVerified"] for r in finished)
            spent = sum(r["reportedCostUsd"] for r in finished)
            missing_cost = sum(r["requestsWithUnknownCost"] for r in finished)
            policies[policy] = {
                "seeds": sorted({r["seed"] for r in attempts}),
                "terminalAttempts": len(finished),
                "liveAttempts": len(attempts) - len(finished),
                "verifiedWinsWithOriginalDog": wins,
                "completionRate": wins / len(finished) if finished else None,
                "reportedCostOnTerminalAttemptsUsd": round(spent, 12),
                "reportedCostPerWinUsd": round(spent / wins, 12) if wins and not missing_cost else None,
                "requestsWithUnknownCost": missing_cost,
                "originalDogDeaths": sum(r["originalDogLost"] for r in finished),
                "playerRespawns": sum(r["nativeRespawns"] for r in finished),
                "controllerHolds": sum(r["controllerHolds"] for r in finished),
                "careReturns": sum(r["careReturns"] for r in finished),
                "companionRegroups": sum(r["companionRegroups"] for r in finished),
            }
        comparisons[revision] = policies
    return {"pairedByRevision": comparisons, "excludedRuns": len(runs) - len(matched)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compare-policies", action="store_true",
                        help="Compare unassisted full Java attempts on seeds shared by rules and Jev")
    parser.add_argument("run", nargs="+", type=Path, help="Java report directories or Bedrock soak logs")
    args = parser.parse_args()
    runs = [summarize(path) for path in args.run]
    print(json.dumps({"runs": runs, "comparison": compare_policies(runs)} if args.compare_policies else runs, indent=2))


if __name__ == "__main__":
    main()
