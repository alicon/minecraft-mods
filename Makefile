SHELL := /bin/zsh

GRADLE := GRADLE_USER_HOME=.gradle-user-home ./gradlew
MOD ?= cops-and-robbers
MC_VERSION ?= 1.21.11
MOD_VERSION := $(shell awk -F"'" '/mod_version =/{print $$2; exit}' mods/$(MOD)/build.gradle)
MOD_JAR := build/mods/$(MOD)/$(MC_VERSION)/libs/$(MOD)-$(MOD_VERSION).jar
HARNESS_DIR := tools/playtest-harness
HARNESS := npm --prefix $(HARNESS_DIR)
HARNESS_SCENARIO ?= companion
HARNESS_HOST ?= localhost
HARNESS_PORT ?= 25565
HARNESS_USERNAME ?= CodexBot
HARNESS_AUTH ?= offline
HARNESS_TARGET ?=
HARNESS_VIEWER ?= 1
HARNESS_VIEWER_PORT ?= 3007
BRIDGE_HOST ?= 127.0.0.1
BRIDGE_PORT ?= 57321
BRIDGE_MESSAGE ?= Codex bridge connected.
BRIDGE_COMMAND ?= say Playtest bridge command received.
BRIDGE_PLAYER ?=
BRIDGE_DISTANCE ?= 8
BRIDGE_RADIUS ?= 6
BRIDGE_ITEM ?= minecraft:apple
BRIDGE_ENTITY ?= minecraft:pig
BRIDGE_BLOCK ?= minecraft:stone
BRIDGE_REPLACE_BLOCK ?=
BRIDGE_COUNT ?= 1
BRIDGE_EMPTY_HAND ?= 0
BRIDGE_X ?=
BRIDGE_Y ?=
BRIDGE_Z ?=
BRIDGE_DX ?= 0
BRIDGE_DY ?= 0
BRIDGE_DZ ?= 0
BRIDGE_FACE ?= up
BRIDGE_HIT_X ?= 0.5
BRIDGE_HIT_Y ?= 1.0
BRIDGE_HIT_Z ?= 0.5
BRIDGE_X1 ?=
BRIDGE_Y1 ?=
BRIDGE_Z1 ?=
BRIDGE_X2 ?=
BRIDGE_Y2 ?=
BRIDGE_Z2 ?=
BRIDGE_STEP ?= 8
BRIDGE_SCREENSHOT_NAME ?=
BRIDGE_SCREENSHOT_RESUME ?= 1
BRIDGE_SCREENSHOT_HIDE_GUI ?= 0
BRIDGE_SCREENSHOT_CLEAR_CHAT ?= 0
BRIDGE_REPORT_FILE ?=
YORKIE_SCOUT_SAMPLES ?= 24
YORKIE_SCOUT_CAPTURES ?= 6
YORKIE_SCOUT_RANGE ?= 12000
YORKIE_SCOUT_RADIUS ?= 40
YORKIE_SCOUT_STEP ?= 16
YORKIE_SCOUT_SEED ?=
PLAYTEST_BRIDGE_SCENARIO ?= smoke
MODRINTH_INSTANCE_ID ?= legacy:Dad’s Minecraft
MODRINTH_OPEN_BACKGROUND ?= 1
PLAYTEST_DISABLE_PAUSE_ON_LOST_FOCUS ?= 1
PLAYTEST_TEMPLATE_WORLD ?=
PLAYTEST_WORLD_PREFIX ?= Codex Playtest
PLAYTEST_WORLD ?=
PLAYTEST_BOOT_TIMEOUT_SECONDS ?= 180
PLAYTEST_BOOT_POLL_SECONDS ?= 2
PLAYTEST_SCREENSHOT_DELAY_SECONDS ?= 5
MODRINTH_PROFILE ?= $(HOME)/Library/Application Support/ModrinthApp/profiles/Dad’s Minecraft
LIVE_TEST_MODS_DIR ?= $(or $(MODRINTH_LIVE_TEST_MODS_DIR),$(MODRINTH_PROFILE)/mods)
LIVE_TEST_BACKUP_SUFFIX := codexbak-$(shell date +%Y%m%d%H%M%S)
MODRINTH_VERSION_TYPE ?= alpha

.PHONY: help build build-all check test validate quick-validate api-docs format-check clean live-test live-test-mushroom live-test-cops live-test-bridge preview-structures modrinth-playtest-world modrinth-launch-world modrinth-autoplay-smoke modrinth-autoplay-yorkie modrinth-autoplay-yorkie-water modrinth-autoplay-yorkie-adventure modrinth-autoplay-yorkie-home-squirrel modrinth-autoplay-yorkie-visual modrinth-autoplay-yorkie-biome-scout modrinth-autoplay-yorkie-natural-gallery modrinth-autoplay-cops modrinth-autoplay-cops-structures modrinth-autoplay-cops-visual harness-install harness-list harness-run harness-companion harness-watch harness-mushroom-smoke harness-cops-smoke bridge-health bridge-state bridge-smoke bridge-chat bridge-command bridge-look bridge-give bridge-summon bridge-teleport bridge-player-abilities bridge-use-entity bridge-clear-entities bridge-set-block-near-entity bridge-set-block bridge-use-block bridge-count-blocks bridge-terrain-scan bridge-yorkie-smoke bridge-yorkie-water-smoke bridge-yorkie-adventure-smoke bridge-yorkie-home-squirrel bridge-yorkie-visual-sweep bridge-yorkie-biome-scout bridge-yorkie-natural-gallery bridge-cops-smoke bridge-cops-structures-smoke bridge-cops-visual-sweep bridge-screenshot release release-dry-run publish-modrinth deploy-modrinth sync-modrinth print-vars

help:
	@printf '%s\n' \
		'Common targets:' \
		'  make live-test                         Build MOD and copy its jar to Dad’s Minecraft.' \
		'  make live-test-mushroom                Build Mushroom and copy its jar to Dad’s Minecraft.' \
		'  make live-test-cops                    Build Cops and Robbers and copy its jar to Dad’s Minecraft.' \
		'  make live-test-bridge                  Build Playtest Bridge and copy its jar to Dad’s Minecraft.' \
		'  make preview-structures                Generate HTML previews for Cops and Robbers buildings.' \
		'  make modrinth-playtest-world           Copy a template save and open Modrinth into the copy.' \
		'  make modrinth-launch-world             Open Modrinth into an existing singleplayer save.' \
		'  make modrinth-autoplay-smoke           Launch a world, wait for bridge, smoke test, screenshot.' \
		'  make modrinth-autoplay-yorkie          Launch a world and run the Yorkie bridge scenario.' \
		'  make modrinth-autoplay-yorkie-water    Launch a world and run Yorkie water/fetch checks.' \
		'  make modrinth-autoplay-yorkie-adventure Launch a world and run Yorkie flight/water adventure checks.' \
		'  make modrinth-autoplay-yorkie-home-squirrel Launch a doghouse/squirrel behavior and screenshot pass.' \
		'  make modrinth-autoplay-yorkie-visual   Launch a world and capture Yorkie gallery screenshots.' \
		'  make modrinth-autoplay-yorkie-biome-scout Launch a world and capture real-biome staging candidates.' \
		'  make modrinth-autoplay-yorkie-natural-gallery Launch a copied scout world and capture natural Yorkie gallery scenes.' \
		'  make modrinth-autoplay-cops            Launch a world and run the Cops and Robbers bridge scenario.' \
		'  make modrinth-autoplay-cops-structures Launch a world and run Cops structure/heist checks.' \
		'  make modrinth-autoplay-cops-visual     Launch a world and capture clean Cops visual screenshots.' \
		'  make harness-install                   Install Mineflayer harness dependencies.' \
		'  make harness-companion                 Join a local world as CodexBot and follow HARNESS_TARGET.' \
		'  make harness-watch                     Join a local world and keep the viewer/log stream open.' \
		'  make harness-mushroom-smoke            Run op-only Mushroom local smoke scenario.' \
		'  make harness-cops-smoke                Run op-only Cops and Robbers local smoke scenario.' \
		'  make bridge-health                     Check the in-game Fabric playtest bridge.' \
		'  make bridge-state                      Read world/player/entity state from the bridge.' \
		'  make bridge-smoke                      Run a harmless bridge health/state/look/chat pass.' \
		'  make bridge-chat BRIDGE_MESSAGE=...    Broadcast a test chat message through the bridge.' \
		'  make bridge-command BRIDGE_COMMAND=... Execute a local test-world command through the bridge.' \
		'  make bridge-look                       Inspect the block/entity the player is looking at.' \
		'  make bridge-give BRIDGE_ITEM=...       Give the test player an item.' \
		'  make bridge-summon BRIDGE_ENTITY=...   Summon an entity at the test player.' \
		'  make bridge-teleport BRIDGE_X=...      Teleport the test player to coordinates.' \
		'  make bridge-player-abilities           Set test player flying/mayfly abilities.' \
		'  make bridge-use-entity                 Use held item/empty hand on nearest matching entity.' \
		'  make bridge-clear-entities             Remove loaded entities matching BRIDGE_ENTITY.' \
		'  make bridge-set-block-near-entity      Set a block relative to nearest matching entity.' \
		'  make bridge-set-block                  Set an absolute block in the test world.' \
		'  make bridge-use-block                  Use an item on an absolute block.' \
		'  make bridge-count-blocks               Count blocks in an absolute box.' \
		'  make bridge-terrain-scan               Sample biome, surface, water, and tree signals around a coordinate.' \
		'  make bridge-yorkie-smoke               Run the Mushroom Yorkie bridge scenario.' \
		'  make bridge-yorkie-water-smoke         Run Yorkie water/fetch bridge checks.' \
		'  make bridge-yorkie-adventure-smoke     Run Yorkie flight/water bridge checks.' \
		'  make bridge-yorkie-home-squirrel       Verify doghouse sleep and bounded squirrel chasing.' \
		'  make bridge-yorkie-visual-sweep        Capture Yorkie gallery scenario screenshots.' \
		'  make bridge-yorkie-biome-scout         Scout random real terrain for future Yorkie gallery staging.' \
		'  make bridge-yorkie-natural-gallery     Capture staged Yorkie screenshots in saved real-biome locations.' \
		'  make bridge-cops-smoke                 Run the Cops and Robbers bridge scenario.' \
		'  make bridge-cops-structures-smoke      Run Cops structure/heist bridge checks.' \
		'  make bridge-cops-visual-sweep          Capture Cops mob, vehicle, and structure screenshots.' \
		'  make bridge-screenshot                 Save a client screenshot and print its path.' \
		'  make build                             Build one mod. Default MOD=cops-and-robbers.' \
		'  make test                              Run tests for one mod.' \
		'  make check                             Run root Gradle check.' \
		'  make validate                          Run repo validation tasks.' \
		'  make quick-validate                    Run validation tasks that do not depend on versioned source layout.' \
		'  make build-all                         Build every mod subproject.' \
		'  make release                           Validate, build, sync, publish, and install release jars.' \
		'  make release-dry-run                   Print the release plan without publishing or copying jars.' \
		'  make publish-modrinth                  Upload MOD to Modrinth using MODRINTH_TOKEN.' \
		'  make sync-modrinth                     Sync Modrinth project metadata using MODRINTH_TOKEN.' \
		'' \
		'Useful variables:' \
		'  MOD=narwhal-together|mushroom-the-yorkie|cops-and-robbers|playtest-bridge' \
		'  MC_VERSION=1.21.11|1.21.1' \
		'  HARNESS_PORT=25565 HARNESS_TARGET=YourMinecraftName HARNESS_VIEWER=1' \
		'  HARNESS_AUTH=offline|microsoft HARNESS_USERNAME=CodexBot' \
		'  BRIDGE_HOST=127.0.0.1 BRIDGE_PORT=57321 BRIDGE_PLAYER=YourMinecraftName' \
		'  BRIDGE_COMMAND="time set day" BRIDGE_ENTITY=cops_robbers:police_cruiser' \
		'  BRIDGE_ITEM=mushroom_yorkie:yorkie_treat BRIDGE_RADIUS=12 BRIDGE_EMPTY_HAND=0|1' \
		'  BRIDGE_BLOCK=minecraft:oak_planks BRIDGE_DX=0 BRIDGE_DY=2 BRIDGE_DZ=0' \
		'  PLAYTEST_TEMPLATE_WORLD="Clean Template" PLAYTEST_WORLD_PREFIX="Codex Playtest"' \
		'  PLAYTEST_WORLD="Codex Playtest 20260708-195500"' \
		'  MODRINTH_INSTANCE_ID="legacy:Dad’s Minecraft"' \
		'  MODRINTH_OPEN_BACKGROUND=1|0' \
		'  PLAYTEST_DISABLE_PAUSE_ON_LOST_FOCUS=1|0' \
		'  LIVE_TEST_MODS_DIR=/path/to/profile/mods' \
		'  MODRINTH_LIVE_TEST_MODS_DIR=/path/to/profile/mods' \
		'  MODRINTH_PROFILE="$(HOME)/Library/Application Support/ModrinthApp/profiles/Dad’s Minecraft"' \
		'  MODRINTH_VERSION_TYPE=alpha|beta|release' \
		'  RELEASE_DRY_RUN=1 RELEASE_SKIP_PROFILE=1 RELEASE_MODS="narwhal-together mushroom-the-yorkie"'

build:
	$(GRADLE) :$(MOD):build -Ptarget_minecraft_version=$(MC_VERSION) --no-daemon

build-all:
	$(GRADLE) buildAllMods -Ptarget_minecraft_version=$(MC_VERSION) --no-daemon

check:
	$(GRADLE) check -Ptarget_minecraft_version=$(MC_VERSION) --no-daemon

test:
	$(GRADLE) :$(MOD):test -Ptarget_minecraft_version=$(MC_VERSION) --no-daemon

validate:
	$(GRADLE) validateModLayout validateFormatting validateJavaFileSizes validateNoClientImportsInMain validatePublicApiDocs validateReleaseNotes validateVersionedSourceLayout -Ptarget_minecraft_version=$(MC_VERSION) --no-daemon

quick-validate:
	$(GRADLE) validateFormatting validateJavaFileSizes validateNoClientImportsInMain -Ptarget_minecraft_version=$(MC_VERSION) --no-daemon

api-docs:
	$(GRADLE) validatePublicApiDocs -Ptarget_minecraft_version=$(MC_VERSION) --no-daemon

format-check:
	$(GRADLE) validateFormatting --no-daemon

clean:
	$(GRADLE) clean --no-daemon

live-test: build
	mkdir -p "$(LIVE_TEST_MODS_DIR)"
	for jar in "$(LIVE_TEST_MODS_DIR)"/$(MOD)-*.jar(N); do \
		[[ "$$jar" == "$(LIVE_TEST_MODS_DIR)/$(notdir $(MOD_JAR))" ]] && continue; \
		mv "$$jar" "$$jar.$(LIVE_TEST_BACKUP_SUFFIX)"; \
	done
	tmp="$(LIVE_TEST_MODS_DIR)/.$(notdir $(MOD_JAR)).tmp"; \
	cp "$(MOD_JAR)" "$$tmp"; \
	mv -f "$$tmp" "$(LIVE_TEST_MODS_DIR)/$(notdir $(MOD_JAR))"
	@printf 'Copied %s to %s\n' "$(MOD_JAR)" "$(LIVE_TEST_MODS_DIR)"

live-test-mushroom:
	$(MAKE) live-test MOD=mushroom-the-yorkie MC_VERSION=$(MC_VERSION)

live-test-cops:
	$(MAKE) live-test MOD=cops-and-robbers MC_VERSION=$(MC_VERSION)

live-test-bridge:
	$(MAKE) live-test MOD=playtest-bridge MC_VERSION=$(MC_VERSION)

preview-structures:
	python3 scripts/preview_cops_robbers_structures.py

modrinth-playtest-world:
	MODRINTH_PROFILE="$(MODRINTH_PROFILE)" \
		MODRINTH_INSTANCE_ID="$(MODRINTH_INSTANCE_ID)" \
		MODRINTH_OPEN_BACKGROUND="$(MODRINTH_OPEN_BACKGROUND)" \
		PLAYTEST_DISABLE_PAUSE_ON_LOST_FOCUS="$(PLAYTEST_DISABLE_PAUSE_ON_LOST_FOCUS)" \
		PLAYTEST_WORLD="$(PLAYTEST_WORLD)" \
		PLAYTEST_TEMPLATE_WORLD="$(PLAYTEST_TEMPLATE_WORLD)" \
		PLAYTEST_WORLD_PREFIX="$(PLAYTEST_WORLD_PREFIX)" \
		scripts/modrinth-playtest-world.sh

modrinth-launch-world:
	$(MAKE) modrinth-playtest-world PLAYTEST_WORLD="$(PLAYTEST_WORLD)"

modrinth-autoplay-smoke:
	MODRINTH_PROFILE="$(MODRINTH_PROFILE)" \
		MODRINTH_INSTANCE_ID="$(MODRINTH_INSTANCE_ID)" \
		MODRINTH_OPEN_BACKGROUND="$(MODRINTH_OPEN_BACKGROUND)" \
		PLAYTEST_DISABLE_PAUSE_ON_LOST_FOCUS="$(PLAYTEST_DISABLE_PAUSE_ON_LOST_FOCUS)" \
		PLAYTEST_WORLD="$(PLAYTEST_WORLD)" \
		PLAYTEST_TEMPLATE_WORLD="$(PLAYTEST_TEMPLATE_WORLD)" \
		PLAYTEST_WORLD_PREFIX="$(PLAYTEST_WORLD_PREFIX)" \
		BRIDGE_HOST="$(BRIDGE_HOST)" \
		BRIDGE_PORT="$(BRIDGE_PORT)" \
		BRIDGE_DISTANCE="$(BRIDGE_DISTANCE)" \
		BRIDGE_MESSAGE="$(BRIDGE_MESSAGE)" \
		BRIDGE_SCREENSHOT_NAME="$(BRIDGE_SCREENSHOT_NAME)" \
			BRIDGE_REPORT_FILE="$(BRIDGE_REPORT_FILE)" \
			YORKIE_SCOUT_SAMPLES="$(YORKIE_SCOUT_SAMPLES)" \
			YORKIE_SCOUT_CAPTURES="$(YORKIE_SCOUT_CAPTURES)" \
			YORKIE_SCOUT_RANGE="$(YORKIE_SCOUT_RANGE)" \
			YORKIE_SCOUT_RADIUS="$(YORKIE_SCOUT_RADIUS)" \
			YORKIE_SCOUT_STEP="$(YORKIE_SCOUT_STEP)" \
			YORKIE_SCOUT_SEED="$(YORKIE_SCOUT_SEED)" \
			PLAYTEST_BRIDGE_SCENARIO="$(PLAYTEST_BRIDGE_SCENARIO)" \
		PLAYTEST_BOOT_TIMEOUT_SECONDS="$(PLAYTEST_BOOT_TIMEOUT_SECONDS)" \
		PLAYTEST_BOOT_POLL_SECONDS="$(PLAYTEST_BOOT_POLL_SECONDS)" \
		PLAYTEST_SCREENSHOT_DELAY_SECONDS="$(PLAYTEST_SCREENSHOT_DELAY_SECONDS)" \
		scripts/modrinth-autoplay-smoke.sh

modrinth-autoplay-yorkie:
	$(MAKE) modrinth-autoplay-smoke PLAYTEST_BRIDGE_SCENARIO=yorkie-smoke BRIDGE_SCREENSHOT_NAME="$(BRIDGE_SCREENSHOT_NAME)"

modrinth-autoplay-yorkie-water:
	$(MAKE) modrinth-autoplay-smoke PLAYTEST_BRIDGE_SCENARIO=yorkie-water-smoke BRIDGE_SCREENSHOT_NAME="$(BRIDGE_SCREENSHOT_NAME)"

modrinth-autoplay-yorkie-adventure:
	$(MAKE) modrinth-autoplay-smoke PLAYTEST_BRIDGE_SCENARIO=yorkie-adventure-smoke BRIDGE_SCREENSHOT_NAME="$(BRIDGE_SCREENSHOT_NAME)"

modrinth-autoplay-yorkie-home-squirrel:
	$(MAKE) modrinth-autoplay-smoke PLAYTEST_BRIDGE_SCENARIO=yorkie-home-squirrel BRIDGE_SCREENSHOT_NAME="$(BRIDGE_SCREENSHOT_NAME)"

modrinth-autoplay-yorkie-visual:
	$(MAKE) modrinth-autoplay-smoke PLAYTEST_BRIDGE_SCENARIO=yorkie-visual-sweep BRIDGE_SCREENSHOT_NAME="$(BRIDGE_SCREENSHOT_NAME)"

modrinth-autoplay-yorkie-biome-scout:
	$(MAKE) modrinth-autoplay-smoke PLAYTEST_BRIDGE_SCENARIO=yorkie-biome-scout BRIDGE_SCREENSHOT_NAME="$(BRIDGE_SCREENSHOT_NAME)"

modrinth-autoplay-yorkie-natural-gallery:
	$(MAKE) modrinth-autoplay-smoke PLAYTEST_BRIDGE_SCENARIO=yorkie-natural-gallery BRIDGE_SCREENSHOT_NAME="$(BRIDGE_SCREENSHOT_NAME)"

modrinth-autoplay-cops:
	$(MAKE) modrinth-autoplay-smoke PLAYTEST_BRIDGE_SCENARIO=cops-smoke BRIDGE_SCREENSHOT_NAME="$(BRIDGE_SCREENSHOT_NAME)"

modrinth-autoplay-cops-structures:
	$(MAKE) modrinth-autoplay-smoke PLAYTEST_BRIDGE_SCENARIO=cops-structures-smoke BRIDGE_SCREENSHOT_NAME="$(BRIDGE_SCREENSHOT_NAME)"

modrinth-autoplay-cops-visual:
	$(MAKE) modrinth-autoplay-smoke PLAYTEST_BRIDGE_SCENARIO=cops-visual-sweep BRIDGE_SCREENSHOT_NAME="$(BRIDGE_SCREENSHOT_NAME)"

harness-install:
	$(HARNESS) install

harness-list:
	$(HARNESS) run list

harness-run:
	SCENARIO="$(HARNESS_SCENARIO)" \
		MINECRAFT_VERSION="$(MC_VERSION)" \
		$(HARNESS) start -- \
		--host "$(HARNESS_HOST)" \
		--port "$(HARNESS_PORT)" \
		--username "$(HARNESS_USERNAME)" \
		--auth "$(HARNESS_AUTH)" \
		--target "$(HARNESS_TARGET)" \
		--viewer "$(HARNESS_VIEWER)" \
		--viewer-port "$(HARNESS_VIEWER_PORT)"

harness-companion:
	$(MAKE) harness-run HARNESS_SCENARIO=companion

harness-watch:
	$(MAKE) harness-run HARNESS_SCENARIO=watch

harness-mushroom-smoke:
	$(MAKE) harness-run HARNESS_SCENARIO=mushroom-smoke

harness-cops-smoke:
	$(MAKE) harness-run HARNESS_SCENARIO=cops-smoke

bridge-health:
	$(HARNESS) run bridge -- health --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)"

bridge-state:
	$(HARNESS) run bridge -- state --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)"

bridge-smoke:
	$(HARNESS) run bridge -- smoke --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --player "$(BRIDGE_PLAYER)" --distance "$(BRIDGE_DISTANCE)" --message "$(BRIDGE_MESSAGE)"

bridge-chat:
	$(HARNESS) run bridge -- chat --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --message "$(BRIDGE_MESSAGE)"

bridge-command:
	$(HARNESS) run bridge -- command --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --command "$(BRIDGE_COMMAND)"

bridge-look:
	$(HARNESS) run bridge -- look --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --player "$(BRIDGE_PLAYER)" --distance "$(BRIDGE_DISTANCE)"

bridge-give:
	$(HARNESS) run bridge -- give --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --player "$(BRIDGE_PLAYER)" --item "$(BRIDGE_ITEM)" --count "$(BRIDGE_COUNT)"

bridge-summon:
	$(HARNESS) run bridge -- summon --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --player "$(BRIDGE_PLAYER)" --entity "$(BRIDGE_ENTITY)" --count "$(BRIDGE_COUNT)"

bridge-teleport:
	$(HARNESS) run bridge -- teleport --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --player "$(BRIDGE_PLAYER)" --x "$(BRIDGE_X)" --y "$(BRIDGE_Y)" --z "$(BRIDGE_Z)"

bridge-player-abilities:
	$(HARNESS) run bridge -- player-abilities --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --player "$(BRIDGE_PLAYER)" --flying "$(BRIDGE_PLAYER_FLYING)" --mayfly "$(BRIDGE_PLAYER_MAYFLY)"

bridge-use-entity:
	$(HARNESS) run bridge -- use-entity --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --player "$(BRIDGE_PLAYER)" --type "$(BRIDGE_ENTITY)" --radius "$(BRIDGE_RADIUS)" --item "$(BRIDGE_ITEM)" --count "$(BRIDGE_COUNT)" --empty-hand "$(BRIDGE_EMPTY_HAND)"

bridge-clear-entities:
	$(HARNESS) run bridge -- clear-entities --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --type "$(BRIDGE_ENTITY)"

bridge-set-block-near-entity:
	$(HARNESS) run bridge -- set-block-near-entity --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --player "$(BRIDGE_PLAYER)" --type "$(BRIDGE_ENTITY)" --radius "$(BRIDGE_RADIUS)" --block "$(BRIDGE_BLOCK)" --dx "$(BRIDGE_DX)" --dy "$(BRIDGE_DY)" --dz "$(BRIDGE_DZ)" --replace "$(BRIDGE_REPLACE_BLOCK)"

bridge-set-block:
	$(HARNESS) run bridge -- set-block --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --player "$(BRIDGE_PLAYER)" --x "$(BRIDGE_X)" --y "$(BRIDGE_Y)" --z "$(BRIDGE_Z)" --block "$(BRIDGE_BLOCK)" --replace "$(BRIDGE_REPLACE_BLOCK)"

bridge-use-block:
	$(HARNESS) run bridge -- use-block --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --player "$(BRIDGE_PLAYER)" --x "$(BRIDGE_X)" --y "$(BRIDGE_Y)" --z "$(BRIDGE_Z)" --item "$(BRIDGE_ITEM)" --count "$(BRIDGE_COUNT)" --face "$(BRIDGE_FACE)" --hit-x "$(BRIDGE_HIT_X)" --hit-y "$(BRIDGE_HIT_Y)" --hit-z "$(BRIDGE_HIT_Z)"

bridge-count-blocks:
	$(HARNESS) run bridge -- count-blocks --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --player "$(BRIDGE_PLAYER)" --x1 "$(BRIDGE_X1)" --y1 "$(BRIDGE_Y1)" --z1 "$(BRIDGE_Z1)" --x2 "$(BRIDGE_X2)" --y2 "$(BRIDGE_Y2)" --z2 "$(BRIDGE_Z2)"

bridge-terrain-scan:
	$(HARNESS) run bridge -- terrain-scan --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --player "$(BRIDGE_PLAYER)" --x "$(BRIDGE_X)" --z "$(BRIDGE_Z)" --radius "$(BRIDGE_RADIUS)" --step "$(BRIDGE_STEP)"

bridge-yorkie-smoke:
	$(HARNESS) run bridge -- yorkie-smoke --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --screenshot-name "$(BRIDGE_SCREENSHOT_NAME)" --report-file "$(BRIDGE_REPORT_FILE)"

bridge-yorkie-water-smoke:
	$(HARNESS) run bridge -- yorkie-water-smoke --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --screenshot-name "$(BRIDGE_SCREENSHOT_NAME)" --report-file "$(BRIDGE_REPORT_FILE)"

bridge-yorkie-adventure-smoke:
	$(HARNESS) run bridge -- yorkie-adventure-smoke --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --screenshot-name "$(BRIDGE_SCREENSHOT_NAME)" --report-file "$(BRIDGE_REPORT_FILE)"

bridge-yorkie-home-squirrel:
	$(HARNESS) run bridge -- yorkie-home-squirrel --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --screenshot-name "$(BRIDGE_SCREENSHOT_NAME)" --report-file "$(BRIDGE_REPORT_FILE)"

bridge-yorkie-visual-sweep:
	$(HARNESS) run bridge -- yorkie-visual-sweep --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --screenshot-name "$(BRIDGE_SCREENSHOT_NAME)" --report-file "$(BRIDGE_REPORT_FILE)"

bridge-yorkie-biome-scout:
	$(HARNESS) run bridge -- yorkie-biome-scout --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --screenshot-name "$(BRIDGE_SCREENSHOT_NAME)" --samples "$(YORKIE_SCOUT_SAMPLES)" --captures "$(YORKIE_SCOUT_CAPTURES)" --range "$(YORKIE_SCOUT_RANGE)" --radius "$(YORKIE_SCOUT_RADIUS)" --step "$(YORKIE_SCOUT_STEP)" --scout-seed "$(YORKIE_SCOUT_SEED)" --report-file "$(BRIDGE_REPORT_FILE)"

bridge-yorkie-natural-gallery:
	$(HARNESS) run bridge -- yorkie-natural-gallery --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --screenshot-name "$(BRIDGE_SCREENSHOT_NAME)" --report-file "$(BRIDGE_REPORT_FILE)"

bridge-cops-smoke:
	$(HARNESS) run bridge -- cops-smoke --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --screenshot-name "$(BRIDGE_SCREENSHOT_NAME)" --report-file "$(BRIDGE_REPORT_FILE)"

bridge-cops-structures-smoke:
	$(HARNESS) run bridge -- cops-structures-smoke --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --screenshot-name "$(BRIDGE_SCREENSHOT_NAME)" --report-file "$(BRIDGE_REPORT_FILE)"

bridge-cops-visual-sweep:
	$(HARNESS) run bridge -- cops-visual-sweep --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --screenshot-name "$(BRIDGE_SCREENSHOT_NAME)" --report-file "$(BRIDGE_REPORT_FILE)"

bridge-screenshot:
	$(HARNESS) run bridge -- screenshot --host "$(BRIDGE_HOST)" --port "$(BRIDGE_PORT)" --name "$(BRIDGE_SCREENSHOT_NAME)" --resume "$(BRIDGE_SCREENSHOT_RESUME)" --hide-gui "$(BRIDGE_SCREENSHOT_HIDE_GUI)" --clear-chat "$(BRIDGE_SCREENSHOT_CLEAR_CHAT)"

release:
	@MODRINTH_VERSION_TYPE="$(MODRINTH_VERSION_TYPE)" \
		MODRINTH_PROFILE="$(MODRINTH_PROFILE)" \
		LIVE_TEST_MODS_DIR="$(LIVE_TEST_MODS_DIR)" \
		RELEASE_DRY_RUN="$(RELEASE_DRY_RUN)" \
		RELEASE_SKIP_PROFILE="$(RELEASE_SKIP_PROFILE)" \
		RELEASE_SKIP_PUBLISH="$(RELEASE_SKIP_PUBLISH)" \
		RELEASE_SKIP_METADATA="$(RELEASE_SKIP_METADATA)" \
		RELEASE_MODS="$(RELEASE_MODS)" \
		RELEASE_MINECRAFT_VERSIONS="$(RELEASE_MINECRAFT_VERSIONS)" \
		RELEASE_INSTALL_MC_VERSION="$(RELEASE_INSTALL_MC_VERSION)" \
		LIVE_TEST_BACKUP_DIR="$(LIVE_TEST_BACKUP_DIR)" \
		ALLOW_DIRTY_RELEASE="$(ALLOW_DIRTY_RELEASE)" \
		scripts/release-mods.sh

release-dry-run:
	@$(MAKE) release RELEASE_DRY_RUN=1

publish-modrinth:
	MODRINTH_VERSION_TYPE=$(MODRINTH_VERSION_TYPE) $(GRADLE) :$(MOD):modrinth -Ptarget_minecraft_version=$(MC_VERSION) --no-daemon

deploy-modrinth: publish-modrinth

sync-modrinth:
	MODRINTH_MOD=$(MOD) scripts/sync-modrinth-metadata.sh

print-vars:
	@printf 'MOD=%s\n' "$(MOD)"
	@printf 'MC_VERSION=%s\n' "$(MC_VERSION)"
	@printf 'MOD_VERSION=%s\n' "$(MOD_VERSION)"
	@printf 'MOD_JAR=%s\n' "$(MOD_JAR)"
	@printf 'MODRINTH_PROFILE=%s\n' "$(MODRINTH_PROFILE)"
	@printf 'LIVE_TEST_MODS_DIR=%s\n' "$(LIVE_TEST_MODS_DIR)"
