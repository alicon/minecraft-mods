package dev.alicon.mushroomyorkie.client.render;

import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;

final class MushroomYorkieRenderState extends LivingEntityRenderState {
	boolean sitting;
	boolean sleeping;
	boolean harness;
	boolean flyingWithOwner;
	float verticalSpeed;
	int flightTrickType;
	float flightTrickProgress;
}
