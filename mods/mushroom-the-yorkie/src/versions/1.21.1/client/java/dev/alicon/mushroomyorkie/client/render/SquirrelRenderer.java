package dev.alicon.mushroomyorkie.client.render;

import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import dev.alicon.mushroomyorkie.entity.SquirrelEntity;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.resources.ResourceLocation;

/** Minecraft 1.21.1 renderer for the squirrel model. */
public final class SquirrelRenderer extends MobRenderer<SquirrelEntity, SquirrelModel> {
	private static final ResourceLocation TEXTURE = MushroomTheYorkie.id("textures/entity/mushroom_yorkie.png");

	/** Creates a squirrel renderer from the baked client model layer. */
	public SquirrelRenderer(EntityRendererProvider.Context context) {
		super(context, new SquirrelModel(context.bakeLayer(SquirrelModel.LAYER_LOCATION)), 0.22F);
	}

	@Override
	public ResourceLocation getTextureLocation(SquirrelEntity entity) {
		return TEXTURE;
	}
}
