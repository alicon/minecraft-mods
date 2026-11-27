"""Summarize native Java expedition reports without running another game."""

import argparse
from collections import Counter
import json
from pathlib import Path
import re
from statistics import median


PASSED = re.compile(r"Expedition Survival (\w+) passed: dog=(\S+) owner=(\S+)")
REOPENED = re.compile(r"Expedition Survival (\w+) reopened: dog=(\S+) owner=(\S+)")
SEED = re.compile(r"Expedition Survival ready: seed=(-?\d+)")


def summarize(path):
    game_log = (path / "game.log").read_text(encoding="utf-8", errors="replace")
    initial_seed = SEED.search(game_log)
    passed = PASSED.search(game_log)
    reopened = REOPENED.search(game_log)
    status_path = path / "status"
    status = status_path.read_text(encoding="utf-8").strip() if status_path.exists() else "starting"
    actions = Counter()
    choices = Counter()
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
    parser.add_argument("run", nargs="+", type=Path, help="directories printed by run-mushroom-java-survival.sh")
    args = parser.parse_args()
    print(json.dumps([summarize(path) for path in args.run], indent=2))


if __name__ == "__main__":
    main()
