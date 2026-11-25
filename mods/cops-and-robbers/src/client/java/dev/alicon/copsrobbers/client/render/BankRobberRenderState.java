package dev.alicon.copsrobbers.client.render;

import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;

/** Render state for the bank robber model. */
public final class BankRobberRenderState extends LivingEntityRenderState {
	/** True when a robber should visibly carry stolen gold. */
	public boolean stolenGold;
	BankRobberModel.Role role = BankRobberModel.Role.ROBBER;
}
