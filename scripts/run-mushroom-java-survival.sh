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
  adoption|stone|iron) ;;
  *) echo "MUSHROOM_EXPEDITION_STAGE must be adoption, stone or iron" >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.."
mkdir -p build/playtest-reports
expedition_report=$(mktemp -d "$PWD/build/playtest-reports/expedition-survival.XXXXXX")
echo "$expedition_report"
touch "$expedition_report/start"
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
  "$expedition_node" tools/playtest-harness/src/expedition-supplies.mjs \
    > "$expedition_report/actions.jsonl" 2> "$expedition_report/controller.log" || expedition_controller=$?
  if [ "$expedition_controller" -ne 0 ] && [ "$(cat "$MUSHROOM_EXPEDITION_STATUS")" = ready ]; then
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
if [ "$expedition_result" -ne 0 ]; then exit "$expedition_result"; fi
if [ "$expedition_controller" -ne 0 ]; then exit "$expedition_controller"; fi
if [ ! -f "$MUSHROOM_EXPEDITION_STATUS" ] || [ "$(cat "$MUSHROOM_EXPEDITION_STATUS")" != finished ]; then
  echo "The client exited before finishing the expedition. See $expedition_report/game.log" >&2
  exit 1
fi
