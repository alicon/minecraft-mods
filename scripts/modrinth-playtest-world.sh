#!/usr/bin/env bash
set -euo pipefail

profile_path="${MODRINTH_PROFILE:-$HOME/Library/Application Support/ModrinthApp/profiles/Dad’s Minecraft}"
instance_id="${MODRINTH_INSTANCE_ID:-legacy:Dad’s Minecraft}"
template_world="${PLAYTEST_TEMPLATE_WORLD:-}"
existing_world="${PLAYTEST_WORLD:-}"
world_prefix="${PLAYTEST_WORLD_PREFIX:-Codex Playtest}"
world_name_file="${PLAYTEST_WORLD_NAME_FILE:-}"
open_background="${MODRINTH_OPEN_BACKGROUND:-1}"
disable_pause_on_lost_focus="${PLAYTEST_DISABLE_PAUSE_ON_LOST_FOCUS:-1}"

usage() {
	cat <<'EOF'
Usage:
  PLAYTEST_TEMPLATE_WORLD="Template World" scripts/modrinth-playtest-world.sh

Environment:
  MODRINTH_PROFILE        Modrinth profile directory.
  MODRINTH_INSTANCE_ID    Modrinth instance id. Default: legacy:Dad’s Minecraft
  PLAYTEST_WORLD          Existing save folder to launch without copying.
  PLAYTEST_TEMPLATE_WORLD Existing save folder to copy.
  PLAYTEST_WORLD_PREFIX   Prefix for the disposable world folder.
  PLAYTEST_WORLD_NAME_FILE Optional file to receive the launched save folder name.
  MODRINTH_OPEN_BACKGROUND Set to 0 to let Modrinth activate on launch.
  PLAYTEST_DISABLE_PAUSE_ON_LOST_FOCUS Set to 0 to leave the profile's pause-on-focus-loss setting unchanged.

The script opens Modrinth with a quick-play singleplayer deep link. If
PLAYTEST_WORLD is set, it launches that existing save. Otherwise it copies
PLAYTEST_TEMPLATE_WORLD into a new disposable save folder and launches the copy.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
	usage
	exit 0
fi

saves_dir="$profile_path/saves"
if [[ -n "$existing_world" ]]; then
	world_name="$existing_world"
	world_dir="$saves_dir/$world_name"
	if [[ ! -f "$world_dir/level.dat" ]]; then
		printf 'PLAYTEST_WORLD is missing level.dat: %s\n' "$world_dir" >&2
		exit 1
	fi
else
	if [[ -z "$template_world" ]]; then
		printf 'PLAYTEST_WORLD or PLAYTEST_TEMPLATE_WORLD is required.\n\n' >&2
		usage >&2
		exit 2
	fi

	template_dir="$saves_dir/$template_world"
	if [[ ! -d "$template_dir" ]]; then
		printf 'Template world not found: %s\n' "$template_dir" >&2
		exit 1
	fi
	if [[ ! -f "$template_dir/level.dat" ]]; then
		printf 'Template world is missing level.dat: %s\n' "$template_dir" >&2
		exit 1
	fi
	timestamp="$(date +%Y%m%d-%H%M%S)"
	world_name="$world_prefix $timestamp"
	world_dir="$saves_dir/$world_name"
	if [[ -e "$world_dir" ]]; then
		printf 'World path already exists: %s\n' "$world_dir" >&2
		exit 1
	fi

	mkdir -p "$saves_dir"
	rsync -a \
		--exclude session.lock \
		--exclude 'data/DistantHorizons.sqlite' \
		--exclude 'DIM-1/data/DistantHorizons.sqlite' \
		--exclude 'DIM1/data/DistantHorizons.sqlite' \
		"$template_dir/" "$world_dir/"
	printf 'Created disposable world: %s\n' "$world_dir"
fi

launch_url="$(
	python3 - "$instance_id" "$world_name" <<'PY'
import sys
from urllib.parse import quote, urlencode

instance_id = sys.argv[1]
world_name = sys.argv[2]
path = quote(instance_id, safe="")
query = urlencode({"singleplayer_world": world_name})
print(f"modrinth://launch/instance/{path}?{query}")
PY
)"

printf 'Opening Modrinth launch URL: %s\n' "$launch_url"
if [[ -n "$world_name_file" ]]; then
	printf '%s\n' "$world_name" > "$world_name_file"
fi

if [[ "$disable_pause_on_lost_focus" != "0" && "$disable_pause_on_lost_focus" != "false" ]]; then
	options_file="$profile_path/options.txt"
	if [[ -f "$options_file" ]]; then
		tmp_options="$(mktemp "${TMPDIR:-/tmp}/codex-options.XXXXXX")"
		sed 's/^pauseOnLostFocus:.*/pauseOnLostFocus:false/' "$options_file" > "$tmp_options"
		if ! cmp -s "$tmp_options" "$options_file"; then
			cp "$tmp_options" "$options_file"
			printf 'Set pauseOnLostFocus:false in %s\n' "$options_file"
		fi
		rm -f "$tmp_options"
	fi
fi

if [[ "$open_background" == "0" || "$open_background" == "false" ]]; then
	open "$launch_url"
else
	open -g "$launch_url"
fi
