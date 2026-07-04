package dev.alicon.mushroomyorkie.entity;

import java.util.List;
import net.minecraft.resources.ResourceKey;
import net.minecraft.tags.StructureTags;
import net.minecraft.tags.TagKey;
import net.minecraft.world.level.levelgen.structure.BuiltinStructures;
import net.minecraft.world.level.levelgen.structure.Structure;

enum StructureScentTarget {
	VILLAGE("village", "structure.mushroom_yorkie.village", StructureTags.VILLAGE),
	WOODLAND_MANSION("woodland_mansion", "structure.mushroom_yorkie.woodland_mansion", StructureTags.ON_WOODLAND_EXPLORER_MAPS),
	PILLAGER_OUTPOST("pillager_outpost", "structure.mushroom_yorkie.pillager_outpost", BuiltinStructures.PILLAGER_OUTPOST),
	SWAMP_HUT("swamp_hut", "structure.mushroom_yorkie.swamp_hut", BuiltinStructures.SWAMP_HUT),
	RUINED_PORTAL("ruined_portal", "structure.mushroom_yorkie.ruined_portal", StructureTags.RUINED_PORTAL);

	private final String configName;
	private final String descriptionKey;
	private final TagKey<Structure> tag;
	private final ResourceKey<Structure> structureKey;

	StructureScentTarget(String configName, String descriptionKey, TagKey<Structure> tag) {
		this.configName = configName;
		this.descriptionKey = descriptionKey;
		this.tag = tag;
		this.structureKey = null;
	}

	StructureScentTarget(String configName, String descriptionKey, ResourceKey<Structure> structureKey) {
		this.configName = configName;
		this.descriptionKey = descriptionKey;
		this.tag = null;
		this.structureKey = structureKey;
	}

	String descriptionKey() {
		return this.descriptionKey;
	}

	TagKey<Structure> tag() {
		return this.tag;
	}

	ResourceKey<Structure> structureKey() {
		return this.structureKey;
	}

	static List<StructureScentTarget> fromConfig(List<String> targetNames) {
		return List.of(values()).stream()
				.filter(target -> targetNames.contains(target.configName))
				.toList();
	}
}
