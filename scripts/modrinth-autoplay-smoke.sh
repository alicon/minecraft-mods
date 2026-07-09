#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bridge_host="${BRIDGE_HOST:-127.0.0.1}"
bridge_port="${BRIDGE_PORT:-57321}"
bridge_message="${BRIDGE_MESSAGE:-Codex autonomous bridge smoke passed.}"
bridge_distance="${BRIDGE_DISTANCE:-16}"
bridge_scenario="${PLAYTEST_BRIDGE_SCENARIO:-smoke}"
report_file="${BRIDGE_REPORT_FILE:-}"
timeout_seconds="${PLAYTEST_BOOT_TIMEOUT_SECONDS:-180}"
poll_seconds="${PLAYTEST_BOOT_POLL_SECONDS:-2}"
screenshot_delay_seconds="${PLAYTEST_SCREENSHOT_DELAY_SECONDS:-5}"
screenshot_name="${BRIDGE_SCREENSHOT_NAME:-codex-autoplay-$(date +%Y%m%d-%H%M%S).png}"
world_name_file="$(mktemp "${TMPDIR:-/tmp}/codex-playtest-world.XXXXXX")"

cleanup() {
	rm -f "$world_name_file"
}
trap cleanup EXIT

PLAYTEST_WORLD_NAME_FILE="$world_name_file" "$repo_root/scripts/modrinth-playtest-world.sh"
world_name="$(cat "$world_name_file")"

printf 'Waiting up to %s seconds for bridge world: %s\n' "$timeout_seconds" "$world_name"
deadline=$((SECONDS + timeout_seconds))
state_json=""
while (( SECONDS < deadline )); do
	if state_json="$(node "$repo_root/tools/playtest-harness/src/bridge-cli.js" state --host "$bridge_host" --port "$bridge_port" 2>/dev/null)"; then
		if printf '%s\n' "$state_json" | python3 -c '
import json
import sys

expected = sys.argv[1]
state = json.load(sys.stdin)
players = state.get("players", [])
save_name = state.get("saveName", "")
save_path = state.get("savePath", "")
motd = state.get("motd", "")

matches_save = save_name == expected or save_path.endswith("/" + expected)
legacy_match = not save_name and expected in motd
raise SystemExit(0 if players and (matches_save or legacy_match) else 1)
' "$world_name"
		then
			break
		fi
	fi
	sleep "$poll_seconds"
done

if (( SECONDS >= deadline )); then
	printf 'Timed out waiting for Modrinth/Minecraft to load world: %s\n' "$world_name" >&2
	printf 'Last bridge state:\n%s\n' "${state_json:-<none>}" >&2
	exit 1
fi

printf 'Bridge loaded expected world: %s\n' "$world_name"
report_args=()
if [[ -n "$report_file" ]]; then
	report_args=(--report-file "$report_file")
fi
case "$bridge_scenario" in
	smoke)
		node "$repo_root/tools/playtest-harness/src/bridge-cli.js" smoke \
			--host "$bridge_host" \
			--port "$bridge_port" \
			--distance "$bridge_distance" \
			--message "$bridge_message" \
			"${report_args[@]}"

		if [[ "$screenshot_delay_seconds" != "0" ]]; then
			sleep "$screenshot_delay_seconds"
		fi

		node "$repo_root/tools/playtest-harness/src/bridge-cli.js" screenshot \
			--host "$bridge_host" \
			--port "$bridge_port" \
			--name "$screenshot_name"
		;;
	yorkie-smoke)
		node "$repo_root/tools/playtest-harness/src/bridge-cli.js" yorkie-smoke \
			--host "$bridge_host" \
			--port "$bridge_port" \
			--screenshot-name "$screenshot_name" \
			"${report_args[@]}"
		;;
	yorkie-water-smoke)
		node "$repo_root/tools/playtest-harness/src/bridge-cli.js" yorkie-water-smoke \
			--host "$bridge_host" \
			--port "$bridge_port" \
			--screenshot-name "$screenshot_name" \
			"${report_args[@]}"
		;;
	yorkie-adventure-smoke)
		node "$repo_root/tools/playtest-harness/src/bridge-cli.js" yorkie-adventure-smoke \
			--host "$bridge_host" \
			--port "$bridge_port" \
			--screenshot-name "$screenshot_name" \
			"${report_args[@]}"
		;;
	yorkie-visual-sweep)
		node "$repo_root/tools/playtest-harness/src/bridge-cli.js" yorkie-visual-sweep \
			--host "$bridge_host" \
			--port "$bridge_port" \
			--screenshot-name "$screenshot_name" \
			"${report_args[@]}"
		;;
	cops-smoke)
		node "$repo_root/tools/playtest-harness/src/bridge-cli.js" cops-smoke \
			--host "$bridge_host" \
			--port "$bridge_port" \
			--screenshot-name "$screenshot_name" \
			"${report_args[@]}"
		;;
	cops-structures-smoke)
		node "$repo_root/tools/playtest-harness/src/bridge-cli.js" cops-structures-smoke \
			--host "$bridge_host" \
			--port "$bridge_port" \
			--screenshot-name "$screenshot_name" \
			"${report_args[@]}"
		;;
	cops-visual-sweep)
		node "$repo_root/tools/playtest-harness/src/bridge-cli.js" cops-visual-sweep \
			--host "$bridge_host" \
			--port "$bridge_port" \
			--screenshot-name "$screenshot_name" \
			"${report_args[@]}"
		;;
	*)
		printf 'Unknown PLAYTEST_BRIDGE_SCENARIO: %s\n' "$bridge_scenario" >&2
		exit 2
		;;
esac
