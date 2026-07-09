#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
cd "$repo_root"

default_release_mods="narwhal-together mushroom-the-yorkie cops-and-robbers"
release_mods=()
for mod in ${RELEASE_MODS:-$default_release_mods}; do
	release_mods+=("$mod")
done

modrinth_version_type="${MODRINTH_VERSION_TYPE:-alpha}"
gradle_user_home="${GRADLE_USER_HOME:-.gradle-user-home}"
default_profile="$HOME/Library/Application Support/ModrinthApp/profiles/Dad’s Minecraft"
modrinth_profile="${MODRINTH_PROFILE:-$default_profile}"
live_test_mods_dir="${LIVE_TEST_MODS_DIR:-$modrinth_profile/mods}"
install_minecraft_version="${RELEASE_INSTALL_MC_VERSION:-$(awk -F= '/^minecraft_version=/{print $2; exit}' gradle.properties)}"

matrix_mods=()
matrix_minecraft_versions=()
unique_minecraft_versions=()
publish_urls=()
installed_jars=()

is_truthy() {
	case "${1:-}" in
		1 | true | TRUE | yes | YES | on | ON)
			return 0
			;;
		*)
			return 1
			;;
	esac
}

dry_run() {
	is_truthy "${RELEASE_DRY_RUN:-}"
}

skip_metadata() {
	is_truthy "${RELEASE_SKIP_METADATA:-}"
}

skip_publish() {
	is_truthy "${RELEASE_SKIP_PUBLISH:-}"
}

skip_profile() {
	is_truthy "${RELEASE_SKIP_PROFILE:-}"
}

log() {
	printf '%s\n' "$*"
}

die() {
	printf 'release: %s\n' "$*" >&2
	exit 1
}

require_command() {
	if ! command -v "$1" >/dev/null 2>&1; then
		die "Missing required command: $1"
	fi
}

print_command() {
	printf '+'
	printf ' %q' "$@"
	printf '\n'
}

run() {
	print_command "$@"
	if dry_run; then
		return 0
	fi
	"$@"
}

run_gradle() {
	run env "GRADLE_USER_HOME=$gradle_user_home" ./gradlew "$@"
}

gradle_string_property() {
	local mod="$1"
	local property="$2"
	awk -F"'" -v property="$property" '$0 ~ property "[[:space:]]*=" { print $2; exit }' "mods/$mod/build.gradle"
}

mod_version() {
	gradle_string_property "$1" "mod_version"
}

archive_name() {
	gradle_string_property "$1" "mod_archive_name"
}

default_minecraft_version() {
	awk -F= '/^minecraft_version=/{print $2; exit}' gradle.properties
}

mod_uses_version_matrix() {
	grep -q "supported_minecraft_versions[[:space:]]*=" "mods/$1/build.gradle"
}

supported_minecraft_versions() {
	local mod="$1"
	local build_file="mods/$mod/build.gradle"
	local versions

	versions="$(awk '
		/supported_minecraft_versions[[:space:]]*=/ {
			in_matrix = 1
			depth = 0
		}
		in_matrix {
			line = $0
			opens = gsub(/\[/, "[", line)
			line = $0
			closes = gsub(/\]/, "]", line)

			if ($0 ~ /^[[:space:]]*'\''[^'\'']+'\''[[:space:]]*:/) {
				version = $0
				sub(/^[[:space:]]*'\''/, "", version)
				sub(/'\''[[:space:]]*:.*/, "", version)
				print version
			}

			depth += opens - closes
			if (depth <= 0) {
				in_matrix = 0
			}
		}
	' "$build_file")"

	if [[ -n "$versions" ]]; then
		printf '%s\n' "$versions"
	else
		default_minecraft_version
	fi
}

append_unique_minecraft_version() {
	local minecraft_version="$1"
	local existing

	for existing in ${unique_minecraft_versions[@]+"${unique_minecraft_versions[@]}"}; do
		if [[ "$existing" == "$minecraft_version" ]]; then
			return 0
		fi
	done

	unique_minecraft_versions+=("$minecraft_version")
}

mod_supports_minecraft_version() {
	local mod="$1"
	local requested_minecraft_version="$2"
	local supported_minecraft_version

	while IFS= read -r supported_minecraft_version; do
		if [[ "$supported_minecraft_version" == "$requested_minecraft_version" ]]; then
			return 0
		fi
	done < <(supported_minecraft_versions "$mod")

	return 1
}

matrix_has_pair() {
	local mod="$1"
	local minecraft_version="$2"
	local index

	for index in "${!matrix_mods[@]}"; do
		if [[ "${matrix_mods[$index]}" == "$mod" && "${matrix_minecraft_versions[$index]}" == "$minecraft_version" ]]; then
			return 0
		fi
	done

	return 1
}

artifact_path() {
	local mod="$1"
	local minecraft_version="$2"
	local version
	local archive

	version="$(mod_version "$mod")"
	archive="$(archive_name "$mod")"
	printf 'build/mods/%s/%s/libs/%s-%s.jar\n' "$mod" "$minecraft_version" "$archive" "$version"
}

published_version_number() {
	local mod="$1"
	local minecraft_version="$2"
	local version

	version="$(mod_version "$mod")"
	if mod_uses_version_matrix "$mod"; then
		printf '%s+mc%s\n' "$version" "$minecraft_version"
	else
		printf '%s\n' "$version"
	fi
}

checksum_files() {
	if command -v shasum >/dev/null 2>&1; then
		shasum -a 256 "$@"
	elif command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$@"
	else
		die "Missing required command: shasum or sha256sum"
	fi
}

release_label() {
	local label
	local mod

	label="$(mod_version "${release_mods[0]}")"
	for mod in "${release_mods[@]}"; do
		if [[ "$(mod_version "$mod")" != "$label" ]]; then
			printf 'mixed\n'
			return 0
		fi
	done

	printf '%s\n' "$label"
}

load_modrinth_token() {
	if [[ -n "${MODRINTH_TOKEN:-}" ]]; then
		export MODRINTH_TOKEN
		return 0
	fi

	if command -v security >/dev/null 2>&1; then
		MODRINTH_TOKEN="$(security find-generic-password -s modrinth-token -a abellicon -w 2>/dev/null || true)"
	fi

	if [[ -z "${MODRINTH_TOKEN:-}" ]]; then
		die "MODRINTH_TOKEN is required. Set it directly or store it in macOS Keychain as service 'modrinth-token' with account 'abellicon'."
	fi

	export MODRINTH_TOKEN
}

prepare_matrix() {
	local mod
	local requested_minecraft_versions=()
	local minecraft_version

	if [[ "${#release_mods[@]}" -eq 0 ]]; then
		die "RELEASE_MODS selected no mods"
	fi

	for minecraft_version in ${RELEASE_MINECRAFT_VERSIONS:-}; do
		requested_minecraft_versions+=("$minecraft_version")
	done

	for mod in "${release_mods[@]}"; do
		if [[ ! -f "mods/$mod/build.gradle" ]]; then
			die "Unknown mod '$mod'; expected mods/$mod/build.gradle"
		fi

		if [[ -z "$(mod_version "$mod")" ]]; then
			die "Could not read mod_version for $mod"
		fi
		if [[ -z "$(archive_name "$mod")" ]]; then
			die "Could not read mod_archive_name for $mod"
		fi
		if [[ ! -f "docs/release-notes/$mod/$(mod_version "$mod").md" ]]; then
			die "$mod is missing docs/release-notes/$mod/$(mod_version "$mod").md"
		fi

		if [[ "${#requested_minecraft_versions[@]}" -gt 0 ]]; then
			for minecraft_version in "${requested_minecraft_versions[@]}"; do
				if ! mod_supports_minecraft_version "$mod" "$minecraft_version"; then
					die "$mod does not support Minecraft $minecraft_version"
				fi
				matrix_mods+=("$mod")
				matrix_minecraft_versions+=("$minecraft_version")
				append_unique_minecraft_version "$minecraft_version"
			done
		else
			while IFS= read -r minecraft_version; do
				matrix_mods+=("$mod")
				matrix_minecraft_versions+=("$minecraft_version")
				append_unique_minecraft_version "$minecraft_version"
			done < <(supported_minecraft_versions "$mod")
		fi
	done
}

verify_git_state() {
	if dry_run || is_truthy "${ALLOW_DIRTY_RELEASE:-}"; then
		return 0
	fi

	if ! git diff --quiet || ! git diff --cached --quiet; then
		die "Working tree has uncommitted changes. Commit them first, or set ALLOW_DIRTY_RELEASE=1."
	fi
}

print_plan() {
	local index
	local mod
	local minecraft_version

	log "Release plan"
	log "  Commit: $(git rev-parse --short HEAD)"
	log "  Channel: $modrinth_version_type"
	log "  Install profile target: Minecraft $install_minecraft_version"
	log "  Dad profile mods dir: $live_test_mods_dir"
	if dry_run; then
		log "  Mode: dry run"
	fi
	if skip_metadata; then
		log "  Metadata sync: skipped"
	fi
	if skip_publish; then
		log "  Modrinth publish: skipped"
	fi
	if skip_profile; then
		log "  Profile install: skipped"
	fi
	log ""
	log "Targets:"

	for index in "${!matrix_mods[@]}"; do
		mod="${matrix_mods[$index]}"
		minecraft_version="${matrix_minecraft_versions[$index]}"
		printf '  - %s %s for Minecraft %s\n' "$mod" "$(published_version_number "$mod" "$minecraft_version")" "$minecraft_version"
	done

	log ""
}

validate_release() {
	local minecraft_version

	log "Validating release"
	for minecraft_version in "${unique_minecraft_versions[@]}"; do
		run_gradle check "-Ptarget_minecraft_version=$minecraft_version" --warning-mode all --no-daemon
	done
	log ""
}

build_release_artifacts() {
	local minecraft_version
	local tasks=()
	local index

	log "Building release artifacts"
	for minecraft_version in "${unique_minecraft_versions[@]}"; do
		tasks=()
		for index in "${!matrix_mods[@]}"; do
			if [[ "${matrix_minecraft_versions[$index]}" == "$minecraft_version" ]]; then
				tasks+=(":${matrix_mods[$index]}:build")
			fi
		done

		run_gradle "${tasks[@]}" "-Ptarget_minecraft_version=$minecraft_version" --warning-mode all --no-daemon
	done
	log ""
}

print_artifact_checksums() {
	local index
	local mod
	local minecraft_version
	local jar
	local jars=()

	log "Artifact checksums"
	for index in "${!matrix_mods[@]}"; do
		mod="${matrix_mods[$index]}"
		minecraft_version="${matrix_minecraft_versions[$index]}"
		jar="$(artifact_path "$mod" "$minecraft_version")"

		if [[ -f "$jar" ]]; then
			jars+=("$jar")
		elif dry_run; then
			printf '  - %s\n' "$jar"
		else
			die "Expected release artifact does not exist: $jar"
		fi
	done

	if [[ "${#jars[@]}" -gt 0 ]]; then
		checksum_files "${jars[@]}"
	fi
	log ""
}

sync_modrinth_metadata() {
	local mod

	if skip_metadata; then
		log "Skipping Modrinth metadata sync"
		log ""
		return 0
	fi

	log "Syncing Modrinth metadata"
	for mod in "${release_mods[@]}"; do
		run env "MODRINTH_MOD=$mod" scripts/sync-modrinth-metadata.sh
	done
	log ""
}

publish_target() {
	local mod="$1"
	local minecraft_version="$2"
	local log_file
	local status
	local url

	if dry_run; then
		print_command env "MODRINTH_VERSION_TYPE=$modrinth_version_type" "GRADLE_USER_HOME=$gradle_user_home" ./gradlew ":$mod:build" ":$mod:modrinth" "-Ptarget_minecraft_version=$minecraft_version" --no-daemon
		return 0
	fi

	log_file="$(mktemp "${TMPDIR:-/tmp}/modrinth-${mod}-${minecraft_version}.XXXXXX.log")"
	set +e
	MODRINTH_VERSION_TYPE="$modrinth_version_type" GRADLE_USER_HOME="$gradle_user_home" ./gradlew ":$mod:build" ":$mod:modrinth" "-Ptarget_minecraft_version=$minecraft_version" --no-daemon 2>&1 | tee "$log_file"
	status="${PIPESTATUS[0]}"
	set -e

	if [[ "$status" -ne 0 ]]; then
		die "Publishing $mod for Minecraft $minecraft_version failed; log: $log_file"
	fi

	while IFS= read -r url; do
		publish_urls+=("$url")
	done < <(grep -Eo 'https://modrinth\.com/project/[^[:space:]]+' "$log_file" || true)
}

publish_modrinth_versions() {
	local index
	local mod
	local minecraft_version

	if skip_publish; then
		log "Skipping Modrinth publish"
		log ""
		return 0
	fi

	log "Publishing Modrinth versions"
	for index in "${!matrix_mods[@]}"; do
		mod="${matrix_mods[$index]}"
		minecraft_version="${matrix_minecraft_versions[$index]}"
		log "Publishing $mod for Minecraft $minecraft_version"
		publish_target "$mod" "$minecraft_version"
	done
	log ""
}

install_profile_jars() {
	local timestamp
	local backup_root
	local backup_dir
	local mod
	local archive
	local jar
	local existing
	local tmp

	if skip_profile; then
		log "Skipping profile install"
		log ""
		return 0
	fi

	log "Installing profile jars"
	if dry_run; then
		for mod in "${release_mods[@]}"; do
			if matrix_has_pair "$mod" "$install_minecraft_version"; then
				printf '  - would install %s to %s\n' "$(artifact_path "$mod" "$install_minecraft_version")" "$live_test_mods_dir"
			else
				printf '  - would skip %s; Minecraft %s is not in this release matrix\n' "$mod" "$install_minecraft_version"
			fi
		done
		log ""
		return 0
	fi

	timestamp="$(date +%Y%m%d-%H%M%S)"
	backup_root="${LIVE_TEST_BACKUP_DIR:-$modrinth_profile/mod-backups}"
	backup_dir="$backup_root/release-$(release_label)-$timestamp"

	mkdir -p "$live_test_mods_dir" "$backup_dir"

	for mod in "${release_mods[@]}"; do
		if ! matrix_has_pair "$mod" "$install_minecraft_version"; then
			log "Skipping profile install for $mod; Minecraft $install_minecraft_version is not in this release matrix"
			continue
		fi

		archive="$(archive_name "$mod")"
		jar="$(artifact_path "$mod" "$install_minecraft_version")"
		if [[ ! -f "$jar" ]]; then
			die "Expected profile jar does not exist: $jar"
		fi

		for existing in "$live_test_mods_dir/$archive"-*.jar; do
			if [[ -e "$existing" ]]; then
				mv "$existing" "$backup_dir/"
			fi
		done

		tmp="$live_test_mods_dir/.$(basename "$jar").tmp"
		cp "$jar" "$tmp"
		mv -f "$tmp" "$live_test_mods_dir/$(basename "$jar")"
		installed_jars+=("$live_test_mods_dir/$(basename "$jar")")
		log "Installed $(basename "$jar")"
	done

	log "Backup: $backup_dir"
	if [[ "${#installed_jars[@]}" -gt 0 ]]; then
		checksum_files "${installed_jars[@]}"
	fi
	log ""
}

print_publish_urls() {
	local url

	if skip_publish; then
		return 0
	fi

	log "Published URLs"
	if [[ "${#publish_urls[@]}" -eq 0 ]]; then
		if dry_run; then
			log "  Dry run did not publish."
		else
			log "  No Modrinth URLs were found in publish output."
		fi
	else
		for url in "${publish_urls[@]}"; do
			printf '  - %s\n' "$url"
		done
	fi
	log ""
}

main() {
	require_command awk
	require_command git
	require_command grep

	prepare_matrix
	verify_git_state

	if ! dry_run && { ! skip_metadata || ! skip_publish; }; then
		load_modrinth_token
	fi

	print_plan
	validate_release
	build_release_artifacts
	print_artifact_checksums
	sync_modrinth_metadata
	publish_modrinth_versions
	install_profile_jars
	print_publish_urls

	log "Release command complete."
}

main "$@"
