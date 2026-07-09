#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${MODRINTH_TOKEN:-}" ]] && command -v security >/dev/null 2>&1; then
	MODRINTH_TOKEN="$(security find-generic-password -s modrinth-token -a abellicon -w 2>/dev/null || true)"
fi

: "${MODRINTH_TOKEN:?MODRINTH_TOKEN is required. Set it directly or save it in macOS Keychain as service 'modrinth-token' with account 'abellicon'.}"

mod="${MODRINTH_MOD:-narwhal-together}"
repository_url="https://github.com/alicon/minecraft-mods"
license_url="${repository_url}/blob/main/LICENSE"
source_url="$repository_url"
issues_url="${repository_url}/issues"
user_agent="alicon/minecraft-mods (${repository_url})"

require_command() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "Missing required command: $1" >&2
		exit 127
	fi
}

require_file() {
	if [[ ! -f "$1" ]]; then
		echo "Required file does not exist: $1" >&2
		exit 1
	fi
}

case "$mod" in
	narwhal-together)
		project_id="${MODRINTH_PROJECT_ID:-narwhal-together}"
		body_file="docs/MODRINTH.md"
		icon_file="mods/narwhal-together/src/main/resources/assets/narwhal_together/icon.png"
		title="NARwhal Together"
		description="Controller-friendly tools that make Minecraft easier and more fun for families playing together."
		categories='["utility", "social"]'
		stale_gallery_titles=()
		gallery_specs=(
			"Playing Together|docs/media/narwhal-together-banner.png|Three young adventurers regroup beneath the NARwhal Together mascot.|true|0"
		)
		;;
	mushroom-the-yorkie)
		project_id="${MUSHROOM_MODRINTH_PROJECT_ID:-mushroom-the-yorkie}"
		body_file="docs/MODRINTH_MUSHROOM.md"
		icon_file="mods/mushroom-the-yorkie/src/main/resources/assets/mushroom_yorkie/icon.png"
		title="Mushroom the Yorkie"
		description="A tiny Yorkie companion with treats, naps, bathroom barks, sheep-chasing opinions, and tiny barrel rolls."
		categories='["mobs", "game-mechanics"]'
		stale_gallery_titles=(
			"Mushroom Wants a Treat"
			"Curled Up Indoors"
			"Adventure Companion"
			"Big Feelings About Cows"
			"Big feelings about Sheep!"
			"Sitting Pretty"
			"Leashed Walk"
			"Paddling in Water"
			"Fetching the Ball"
			"Tiny Flight"
			"Snack Bowl"
			"Water Bowl"
			"Wants Outside"
			"Sheep Opinions"
			"Tiny Defender"
		)
		gallery_specs=(
			"Sitting Pretty|docs/media/mushroom-the-yorkie-banner.png|Mushroom sits beside his dog bed with no leash.|true|0"
			"Leashed Walk|docs/media/mushroom-the-yorkie-leashed.png|Mushroom wears his harness and is tied to a fence lead for a walk.|false|1"
			"Curled Up Indoors|docs/media/mushroom-the-yorkie-sleeping.png|At night indoors, Mushroom curls up on his dog bed.|false|2"
			"Paddling in Water|docs/media/mushroom-the-yorkie-water.png|Mushroom splashes through shallow water.|false|3"
			"Fetching the Ball|docs/media/mushroom-the-yorkie-fetching.png|Mushroom starts after a dropped Yorkie Ball.|false|4"
			"Tiny Flight|docs/media/mushroom-the-yorkie-flying.png|Mushroom hovers midair during creative-flight play.|false|5"
			"Snack Bowl|docs/media/mushroom-the-yorkie-eating.png|Mushroom checks in on a filled dog food bowl.|false|6"
			"Water Bowl|docs/media/mushroom-the-yorkie-drinking.png|Mushroom checks in on a filled water bowl.|false|7"
			"Wants Outside|docs/media/mushroom-the-yorkie-wants-outside.png|Mushroom asks to go outside from an indoor room.|false|8"
			"Sheep Opinions|docs/media/mushroom-the-yorkie-sheep-chase.png|Mushroom starts chasing a nearby sheep.|false|9"
			"Tiny Defender|docs/media/mushroom-the-yorkie-spider.png|Mushroom nips a hostile spider.|false|10"
		)
		;;
	cops-and-robbers)
		project_id="${COPS_ROBBERS_MODRINTH_PROJECT_ID:-cops-and-robbers}"
		body_file="docs/MODRINTH_COPS_AND_ROBBERS.md"
		icon_file="mods/cops-and-robbers/src/main/resources/assets/cops_robbers/icon.png"
		title="Cops and Robbers"
		description="Police cruisers, fire trucks, robbers, banks, and patrol play for family Minecraft worlds."
		categories='["adventure", "mobs", "game-mechanics"]'
		stale_gallery_titles=()
		gallery_specs=(
			"Patrol Scene Lineup|docs/media/cops-and-robbers-lineup.png|Cops, robbers, bank staff, emergency crews, and vehicles staged together.|true|0"
			"Mob Cast Closeup|docs/media/cops-and-robbers-mobs.png|Bank robbers, a cop, a teller, and a fireman ready for patrol scenes.|false|1"
			"Emergency Vehicles|docs/media/cops-and-robbers-vehicles.png|A police cruiser and fire truck for chases, captures, and fire response.|false|2"
			"Police Station Kit|docs/media/cops-and-robbers-police-station.png|The placeable police station kit gives patrol worlds a jail and station front.|false|3"
			"Bank Kit|docs/media/cops-and-robbers-bank.png|The placeable bank kit creates a target for robber heists and teller spawns.|false|4"
			"Fire Station Kit|docs/media/cops-and-robbers-fire-station.png|The placeable fire station kit adds a red responder base with a truck bay and crew.|false|5"
		)
		;;
	*)
		echo "Unknown MODRINTH_MOD '$mod'. Expected narwhal-together, mushroom-the-yorkie, or cops-and-robbers." >&2
		exit 2
		;;
esac

require_command curl
require_command jq
require_file "$body_file"
require_file "$icon_file"
for spec in ${gallery_specs[@]+"${gallery_specs[@]}"}; do
	IFS='|' read -r _gallery_title gallery_file _gallery_description _featured _ordering <<<"$spec"
	require_file "$gallery_file"
done

api="https://api.modrinth.com/v2/project/${project_id}"
auth_header="Authorization: ${MODRINTH_TOKEN}"

metadata="$({
	jq -n \
		--rawfile body "$body_file" \
		--arg title "$title" \
		--arg description "$description" \
		--argjson categories "$categories" \
		--arg license_url "$license_url" \
		--arg source_url "$source_url" \
		--arg issues_url "$issues_url" \
		'{
			title: $title,
			description: $description,
			body: $body,
			categories: $categories,
			client_side: "required",
			server_side: "required",
			license_id: "MIT",
			license_url: $license_url,
			source_url: $source_url,
			issues_url: $issues_url
		}'
})"

project_json="$(curl --silent --show-error \
	--write-out '\n%{http_code}' \
	--header "$auth_header" \
	--header "User-Agent: $user_agent" \
	"$api")"
project_status="$(tail -n 1 <<<"$project_json")"
project_body="$(sed '$d' <<<"$project_json")"

if [[ "$project_status" == "404" ]]; then
	create_metadata="$(jq -c '. + {slug: $slug, project_type: "mod", requested_status: "draft", is_draft: true, initial_versions: [], gallery_items: []}' \
		--arg slug "$project_id" \
		<<<"$metadata")"
	create_metadata_file="$(mktemp)"
	printf '%s' "$create_metadata" >"$create_metadata_file"
	create_response="$(curl --silent --show-error \
		--write-out '\n%{http_code}' \
		--request POST \
		--header "$auth_header" \
		--header "User-Agent: $user_agent" \
		--form "data=@${create_metadata_file};type=application/json" \
		--form "icon=@${icon_file}" \
		"https://api.modrinth.com/v2/project")"
	rm -f "$create_metadata_file"
	create_status="$(tail -n 1 <<<"$create_response")"
	create_body="$(sed '$d' <<<"$create_response")"
	if [[ ! "$create_status" =~ ^2 ]]; then
		echo "$create_body" >&2
		echo "Failed to create Modrinth project $project_id; HTTP $create_status" >&2
		exit 1
	fi
	project_json="$(curl --fail-with-body --silent --show-error \
		--header "$auth_header" \
		--header "User-Agent: $user_agent" \
		"$api")"
elif [[ "$project_status" =~ ^2 ]]; then
	project_json="$project_body"
else
	echo "$project_body" >&2
	echo "Failed to load Modrinth project $project_id; HTTP $project_status" >&2
	exit 1
fi

curl --fail-with-body --silent --show-error \
	--request PATCH \
	--header "$auth_header" \
	--header "User-Agent: $user_agent" \
	--header "Content-Type: application/json" \
	--data "$metadata" \
	"$api"

curl --fail-with-body --silent --show-error \
	--request PATCH \
	--header "$auth_header" \
	--header "User-Agent: $user_agent" \
	--header "Content-Type: image/png" \
	--data-binary @"$icon_file" \
	"$api/icon?ext=png"

urlencode() {
	jq -nr --arg value "$1" '$value|@uri'
}

if ((${#stale_gallery_titles[@]})); then
	for stale_title in ${stale_gallery_titles[@]+"${stale_gallery_titles[@]}"}; do
		while IFS= read -r stale_url; do
			if [[ -z "$stale_url" ]]; then
				continue
			fi
			curl --fail-with-body --silent --show-error \
				--request DELETE \
				--header "$auth_header" \
				--header "User-Agent: $user_agent" \
				"$api/gallery?url=$(urlencode "$stale_url")"
		done < <(jq -r --arg title "$stale_title" '.gallery[]? | select(.title == $title) | .url' <<<"$project_json")
	done
	project_json="$(curl --fail-with-body --silent --show-error \
		--header "$auth_header" \
		--header "User-Agent: $user_agent" \
		"$api")"
fi

if ((${#gallery_specs[@]})); then
	for spec in ${gallery_specs[@]+"${gallery_specs[@]}"}; do
		IFS='|' read -r gallery_title gallery_file gallery_description featured ordering <<<"$spec"
		if jq -e --arg title "$gallery_title" '.gallery[]? | select(.title == $title)' <<<"$project_json" >/dev/null; then
			continue
		fi

		curl --fail-with-body --silent --show-error \
			--request POST \
			--header "$auth_header" \
			--header "User-Agent: $user_agent" \
			--header "Content-Type: image/png" \
			--data-binary @"$gallery_file" \
			"$api/gallery?ext=png&featured=${featured}&title=$(urlencode "$gallery_title")&description=$(urlencode "$gallery_description")&ordering=${ordering}"
	done
fi

echo "Modrinth metadata synchronized for $mod ($project_id)"
