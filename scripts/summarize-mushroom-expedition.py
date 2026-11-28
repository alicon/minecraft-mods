"""Summarize Java expedition reports and Bedrock gameplay soaks."""

import argparse
from collections import Counter
from datetime import datetime
import json
from pathlib import Path
import re
from statistics import median


PASSED = re.compile(r"Expedition Survival (\w+) passed: dog=(\S+) owner=(\S+)")
REOPENED = re.compile(r"Expedition Survival (\w+) reopened: dog=(\S+) owner=(\S+)")
SEED = re.compile(r"Expedition Survival ready: seed=(-?\d+)")
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
    initial_seed = SEED.search(game_log)
    passed = PASSED.search(game_log)
    reopened = REOPENED.search(game_log)
    status_path = path / "status"
    status = status_path.read_text(encoding="utf-8").strip() if status_path.exists() else "starting"
    actions = Counter()
    choices = Counter()
    broken_generated_crystals = set()
    latencies = []
    cost = 0.0
    tokens = 0
    costs_missing = 0
    assisted = any(sidecar.stat().st_size for sidecar in path.glob("live-*.actions.jsonl"))
    trace_path = path / "actions.jsonl"
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
                if action == "agent_replaced_controller":
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
                    elif row.get("chosen"):
                        costs_missing += 1
                    tokens += row.get("inputTokens") or 0
    return {
        "run": str(path),
        "seed": int(initial_seed.group(1)) if initial_seed else None,
        "status": status,
        "nativeClientFailed": "BUILD FAILED" in game_log,
        "nativeMilestone": passed.group(1) if passed else None,
        "nativeCompanionDefense": "Expedition companion defense passed:" in game_log,
        "nativeFeeding": "Expedition native feeding passed:" in game_log,
        "nativeQuarryIron": "Expedition native quarry iron passed:" in game_log,
        "nativeCompanionEquipment": "Expedition companion equipment passed:" in game_log,
        "nativeEndEntry": "Expedition native End entry passed:" in game_log,
        "nativeEndCrystal": "Expedition native End crystal passed:" in game_log,
        "nativeGeneratedEndCrystals": "Expedition native generated crystals passed:" in game_log,
        "generatedCrystalShots": actions["generated_crystal_shot"],
        "generatedCrystalsBroken": len(broken_generated_crystals),
        "nativeEyeRoute": "Expedition native eye route passed:" in game_log,
        "nativeStrongholdApproach": "Expedition native stronghold approach passed:" in game_log,
        "nativeNetherRoundTrip": "Expedition Nether round trip passed:" in game_log,
        "nativeNetherSupplies": "Expedition native Nether supplies passed:" in game_log,
        "nativeShelteredAdoption": "Expedition sheltered adoption passed:" in game_log,
        "sameDogAndOwnerAfterReopen": bool(passed and reopened and passed.groups() == reopened.groups()),
        "assisted": assisted,
        "movementCalls": actions["go_to"] + actions["move"],
        "controllerReattachments": actions["controller_reattached"],
        "nativeRespawns": game_log.count("Expedition Survival owner respawned in the same save"),
        "gearRecoveryAttempts": actions["recover_dropped_loadout"],
        "jevRequests": choices["requests"],
        "jevChoices": choices["answered"],
        "coachedChoices": choices["coached"],
        "medianJevLatencyMs": median(latencies) if latencies else None,
        "reportedInputTokens": tokens,
        "reportedCostUsd": round(cost, 12),
        "answeredRequestsMissingCost": costs_missing,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", nargs="+", type=Path, help="Java report directories or Bedrock soak logs")
    args = parser.parse_args()
    print(json.dumps([summarize(path) for path in args.run], indent=2))


if __name__ == "__main__":
    main()
