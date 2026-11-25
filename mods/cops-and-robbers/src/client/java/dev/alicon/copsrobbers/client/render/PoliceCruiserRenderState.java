package dev.alicon.copsrobbers.client.render;

import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;

/** Render state for the Cops and Robbers model. */
public final class PoliceCruiserRenderState extends LivingEntityRenderState {
	/** Whether the lightbar should flash. */
	public boolean lightsEnabled;
	/** Whether the siren is currently enabled. */
	public boolean sirenEnabled;
	/** Active stunt animation type. */
	public int trickType;
	/** Normalized stunt animation progress. */
	public float trickProgress;
}
