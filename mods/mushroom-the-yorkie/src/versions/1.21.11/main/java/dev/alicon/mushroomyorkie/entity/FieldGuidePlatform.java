package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import net.minecraft.core.GlobalPos;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FontDescription;
import net.minecraft.network.chat.MutableComponent;

final class FieldGuidePlatform {
	private FieldGuidePlatform() {
	}

	static MutableComponent picture(String glyph) {
		return Component.literal(glyph).withStyle(style -> style.withFont(new FontDescription.Resource(MushroomTheYorkie.id("field_guide"))).withColor(0xffffff));
	}

	static String dimensionName(GlobalPos place) {
		return place.dimension().identifier().getPath().replace('_', ' ');
	}
}
