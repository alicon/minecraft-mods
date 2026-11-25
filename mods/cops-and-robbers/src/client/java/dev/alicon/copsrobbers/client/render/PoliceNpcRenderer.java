package dev.alicon.copsrobbers.client.render;

import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Mob;

/** Shared humanoid renderer for simple police-bank NPCs. */
public final class PoliceNpcRenderer<T extends Mob> extends MobRenderer<T, BankRobberRenderState, BankRobberModel> {
	private final Identifier texture;
	private final BankRobberModel.Role role;

	/** Binds the uniform texture and role-specific model parts for the NPC. */
	public PoliceNpcRenderer(EntityRendererProvider.Context context, Identifier texture, BankRobberModel.Role role) {
		super(context, new BankRobberModel(context.bakeLayer(BankRobberModel.LAYER_LOCATION)), 0.5F);
		this.texture = texture;
		this.role = role;
	}

	@Override
	public BankRobberRenderState createRenderState() {
		BankRobberRenderState state = new BankRobberRenderState();
		state.role = this.role;
		return state;
	}

	@Override
	public Identifier getTextureLocation(BankRobberRenderState state) {
		return this.texture;
	}
}
