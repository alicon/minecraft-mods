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
			"Big Feelings About Cows"
			"Big feelings about Sheep!"
		)
		gallery_specs=(
			"Mushroom Wants a Treat|docs/media/mushroom-the-yorkie-banner.png|Mushroom watches for a treat beside the bed.|true|0"
			"Curled Up Indoors|docs/media/mushroom-the-yorkie-sleeping.png|At night indoors, Mushroom curls up and closes his eyes.|false|1"
			"Adventure Companion|docs/media/mushroom-the-yorkie-adventure.png|A small companion for big family worlds.|false|2"
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
		gallery_specs=()
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
