package dev.alicon.copsrobbers.entity;

final class PoliceCruiserGameplayConfig {
	/** Server ticks a creative cruiser trick lasts; keeps movement and renderer animation in sync. */
	static final int TRICK_DURATION_TICKS = 36;
	/** Base ground driving speed for a ridden cruiser. Higher values make police chases faster. */
	static final float RIDDEN_SPEED = 0.34F;
	/** Reverse input scale. Lower values make backing up slower and easier to control. */
	static final float REVERSE_MULTIPLIER = 0.45F;
	/** Sideways input scale. Lower values make the cruiser feel heavier and less twitchy. */
	static final float STRAFE_MULTIPLIER = 0.35F;
	/** Creative-mode flight speed while the cruiser flight toggle is enabled. */
	static final double CREATIVE_FLIGHT_SPEED = 0.62D;
	/** Minimum horizontal speed before front collisions can damage mobs or crash occupants. */
	static final double IMPACT_MIN_SPEED = 0.06D;
	/** Damage dealt to living entities hit by the front impact zone. */
	static final float IMPACT_DAMAGE = 6.0F;
	/** Crash damage dealt to non-creative drivers during heavy impacts. */
	static final float CRASH_SELF_DAMAGE = 2.0F;
	/** Crash damage dealt to the cruiser during heavy impacts. */
	static final float CRASH_TRUCK_DAMAGE = 3.0F;
	/** Maximum robbers a cruiser can hold before dropoff at a jail. */
	static final int MAX_CAPTURED_ROBBERS = 12;

	private PoliceCruiserGameplayConfig() {
	}
}
