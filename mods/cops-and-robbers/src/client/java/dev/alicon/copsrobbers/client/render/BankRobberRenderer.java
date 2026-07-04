package dev.alicon.copsrobbers.client.render;

import dev.alicon.copsrobbers.CopsAndRobbers;
import dev.alicon.copsrobbers.entity.BankRobberEntity;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.resources.Identifier;

/** Renderer that binds the bank robber model layer and texture. */
public final class BankRobberRenderer extends MobRenderer<BankRobberEntity, BankRobberRenderState, BankRobberModel> {
	private static final Identifier TEXTURE = CopsAndRobbers.id("textures/entity/bank_robber.png");

	/** Binds the robber model layer; keep layer registration and BankRobberModel.LAYER_LOCATION in sync. */
	public BankRobberRenderer(EntityRendererProvider.Context context) {
		super(context, new BankRobberModel(context.bakeLayer(BankRobberModel.LAYER_LOCATION)), 0.5F);
	}

	@Override
	public BankRobberRenderState createRenderState() {
		return new BankRobberRenderState();
	}

	@Override
	public void extractRenderState(BankRobberEntity entity, BankRobberRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.stolenGold = entity.hasStolenGold();
	}

	@Override
	public Identifier getTextureLocation(BankRobberRenderState state) {
		return TEXTURE;
	}
}
