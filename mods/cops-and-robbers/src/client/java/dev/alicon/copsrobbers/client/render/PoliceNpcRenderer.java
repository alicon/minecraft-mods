package dev.alicon.copsrobbers.client.render;

import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Mob;

/** Shared humanoid renderer for simple police-bank NPCs. */
public final class PoliceNpcRenderer<T extends Mob> extends MobRenderer<T, BankRobberRenderState, BankRobberModel> {
	private final Identifier texture;

	/** Shared renderer for NPCs using the robber geometry; texture is the only intended variation point. */
	public PoliceNpcRenderer(EntityRendererProvider.Context context, Identifier texture) {
		super(context, new BankRobberModel(context.bakeLayer(BankRobberModel.LAYER_LOCATION)), 0.5F);
		this.texture = texture;
	}

	@Override
	public BankRobberRenderState createRenderState() {
		return new BankRobberRenderState();
	}

	@Override
	public Identifier getTextureLocation(BankRobberRenderState state) {
		return this.texture;
	}
}
