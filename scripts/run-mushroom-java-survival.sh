#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: sh scripts/run-mushroom-java-survival.sh PATH_TO_MC_AGENT_JAR" >&2
  exit 2
fi

case "$1" in
  /*) expedition_jar=$1 ;;
  *) expedition_jar="$PWD/$1" ;;
esac
if [ ! -f "$expedition_jar" ]; then
  echo "Minecraft agent JAR was not found: $expedition_jar" >&2
  exit 2
fi
expedition_node=${MUSHROOM_EXPEDITION_NODE:-node}
command -v "$expedition_node" >/dev/null
export MUSHROOM_EXPEDITION_STAGE="${MUSHROOM_EXPEDITION_STAGE:-adoption}"
case "$MUSHROOM_EXPEDITION_STAGE" in
  adoption|stone|iron|nether|nether-powder|stronghold|expedition|reunion|end-kit|defense|feeding|portal|nether-supplies|nether-distant-supplies|ender-supplies|shelter|field-sleep|equipment|end-entry|generated-end-entry|end-camp|end-camp-route|end-crystal|generated-end-crystals|end-return|eye-route|stronghold-approach|quarry-tools|quarry-iron) ;;
  *) echo "Unknown MUSHROOM_EXPEDITION_STAGE: $MUSHROOM_EXPEDITION_STAGE" >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.."
mkdir -p build/playtest-reports
expedition_report=$(mktemp -d "$PWD/build/playtest-reports/expedition-survival.XXXXXX")
echo "$expedition_report"
touch "$expedition_report/start"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  {
    git log -1 --format='Revision %H'
    git status --short --untracked-files=all -- mods/mushroom-the-yorkie/src mods/mushroom-the-yorkie/build.gradle \
      tools/playtest-harness/src scripts/run-mushroom-java-survival.sh
  } > "$expedition_report/source-build.txt"
fi
export MUSHROOM_EXPEDITION_STATUS="$expedition_report/status"
export MUSHROOM_EXPEDITION_SEED="${MUSHROOM_EXPEDITION_SEED:-1}"
export MUSHROOM_EXPEDITION_SPAWN_RADIUS="${MUSHROOM_EXPEDITION_SPAWN_RADIUS:-0}"

./gradlew :mushroom-the-yorkie:runClientGameTest -Pclient_game_tests -Pyorkie_expedition_survival \
  "-Pyorkie_expedition_agent_jar=$expedition_jar" > "$expedition_report/game.log" 2>&1 &
expedition_client=$!
trap 'kill -TERM "$expedition_client" 2>/dev/null || true' INT TERM

while [ ! -f "$MUSHROOM_EXPEDITION_STATUS" ] && kill -0 "$expedition_client" 2>/dev/null; do
  sleep 1
done
expedition_controller=0
if [ -f "$MUSHROOM_EXPEDITION_STATUS" ]; then
  expedition_owner="launcher-$$"
  expedition_owner_file="$expedition_report/controller-owner"
  printf '%s' "$expedition_owner" > "$expedition_owner_file"
  MUSHROOM_EXPEDITION_CONTROLLER_OWNER="$expedition_owner" \
    "$expedition_node" tools/playtest-harness/src/expedition-supplies.mjs \
    > "$expedition_report/actions.jsonl" 2> "$expedition_report/controller.log" || expedition_controller=$?
  expedition_last_death=
  while [ "$expedition_controller" -ne 0 ] && [ "${MUSHROOM_EXPEDITION_LIVE:-0}" = 1 ] \
    && [ "$(cat "$MUSHROOM_EXPEDITION_STATUS")" = held ] \
    && [ "$(cat "$expedition_owner_file")" = "$expedition_owner" ] \
    && [ -f "$expedition_report/controller-checkpoint.json" ]; do
    # The client may still be waiting for the native Respawn button to enable.
    expedition_death=
    for expedition_check in 1 2 3 4 5; do
      if [ -f "$expedition_report/last-owner-death" ]; then
        expedition_death=$(cat "$expedition_report/last-owner-death")
        if [ -n "$expedition_death" ] && [ "$expedition_death" != "$expedition_last_death" ]; then
          break
        fi
      fi
      sleep 1
    done
    if [ -z "$expedition_death" ] || [ "$expedition_death" = "$expedition_last_death" ] \
      || [ "$(cat "$expedition_owner_file")" != "$expedition_owner" ]; then
      break
    fi
    expedition_last_death=$expedition_death
    expedition_controller=0
    MUSHROOM_EXPEDITION_RESUME=1 MUSHROOM_EXPEDITION_CONTROLLER_OWNER="$expedition_owner" \
      "$expedition_node" tools/playtest-harness/src/expedition-supplies.mjs \
      >> "$expedition_report/actions.jsonl" 2>> "$expedition_report/controller.log" || expedition_controller=$?
  done
  if [ "$expedition_controller" -ne 0 ] && [ "$(cat "$MUSHROOM_EXPEDITION_STATUS")" = ready ] \
    && [ "$(cat "$expedition_owner_file")" = "$expedition_owner" ]; then
    # A startup error can happen before the controller begins reporting results.
    printf 'failed' > "$expedition_report/controller-failed"
    mv "$expedition_report/controller-failed" "$MUSHROOM_EXPEDITION_STATUS"
  fi
fi
expedition_result=0
wait "$expedition_client" || expedition_result=$?
trap - INT TERM

expedition_screens=mods/mushroom-the-yorkie/build/run/clientGameTest/screenshots
if [ -d "$expedition_screens" ]; then
  mkdir "$expedition_report/screenshots"
  find "$expedition_screens" -type f -name '*expedition-survival-*' -newer "$expedition_report/start" \
    -exec cp {} "$expedition_report/screenshots" \;
fi
if [ "$expedition_result" -ne 0 ]; then
  expedition_save='mods/mushroom-the-yorkie/build/run/clientGameTest/saves/Codex Expedition Survival'
  if [ -f "$expedition_save/level.dat" ]; then
    if cp -R "$expedition_save" "$expedition_report/saved-world-copy" &&
        cmp -s "$expedition_save/level.dat" "$expedition_report/saved-world-copy/level.dat" &&
        mv "$expedition_report/saved-world-copy" "$expedition_report/saved-world"; then
      printf '[%s] Archive | Preserved the closed Survival save in saved-world.\n' \
        "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$expedition_report/playtest.log"
    else
      printf '[%s] Archive | Could not verify the copy of the closed Survival save.\n' \
        "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$expedition_report/playtest.log"
    fi
  fi
  printf '[%s] Verification | The native game test exited with code %s. See game.log.\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$expedition_result" >> "$expedition_report/playtest.log"
  exit "$expedition_result"
fi
if [ "$expedition_controller" -ne 0 ] && [ "${MUSHROOM_EXPEDITION_LIVE:-0}" != 1 ] \
  && [ "$(cat "$expedition_owner_file")" = "$expedition_owner" ]; then
  exit "$expedition_controller"
fi
if [ ! -f "$MUSHROOM_EXPEDITION_STATUS" ] || [ "$(cat "$MUSHROOM_EXPEDITION_STATUS")" != finished ]; then
  echo "The client exited before finishing the expedition. See $expedition_report/game.log" >&2
  exit 1
fi
printf '[%s] Verification | The native game test passed.\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$expedition_report/playtest.log"
