package dev.alicon.mushroomyorkie.entity;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.minecraft.core.GlobalPos;
import net.minecraft.core.UUIDUtil;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

/** Keeps earned paws on the dog and keeps uncompleted cues local to one play session and dimension. */
final class MushroomLeaveItTraining {
	static final String SAVE_KEY = "LeaveItPaws";
	static final int PAWS = 3;
	// A cue has ten seconds for the return and a further ten seconds to feed the reward.
	private static final int RETURN_TICKS = 200;
	// Heel is a temporary walking job. Expiry also frees a dog whose handler forgot the release cue.
	private static final int HEEL_TICKS = 1_200;
	private static final double RETURN_RANGE_SQ = 2.0 * 2.0;
	private static final double TREAT_RANGE_SQ = 3.0 * 3.0;
	private static final double HEEL_RANGE_SQ = 4.0 * 4.0;
	private static final double SQUIRREL_RANGE_SQ = 8.0 * 8.0;
	private static final double FIELD_WALK_SQ = 4.0 * 4.0;

	record Paw(UUID squirrel, GlobalPos place) {
		static final Codec<Paw> CODEC = RecordCodecBuilder.create(instance -> instance.group(
				UUIDUtil.CODEC.fieldOf("squirrel").forGetter(Paw::squirrel),
				GlobalPos.CODEC.fieldOf("place").forGetter(Paw::place)
		).apply(instance, Paw::new));
	}

	static final Codec<List<Paw>> CODEC = Paw.CODEC.listOf();
	private final List<Paw> paws = new ArrayList<>(PAWS);
	private SquirrelEntity chasedSquirrel;
	private Paw recall;
	private boolean returned;
	private long expiresAt;
	private boolean heeling;
	private Paw trailDistraction;
	private Vec3 distractionStart;
	private Vec3 lastOwnerPosition;
	private boolean passedTrail;

	List<Paw> paws() {
		return List.copyOf(this.paws);
	}

	void restore(List<Paw> saved) {
		this.paws.clear();
		saved.stream().limit(PAWS).forEach(this.paws::add);
		this.clearCue();
		this.chasedSquirrel = null;
	}

	void chasing(SquirrelEntity squirrel) {
		this.chasedSquirrel = squirrel;
	}

	boolean suppressesBarking() {
		return this.recall != null || this.heeling;
	}

	boolean waitingForTreat() {
		return this.recall != null && this.returned;
	}

	boolean shouldHoldForTreat(MushroomYorkieEntity dog, Player owner) {
		return this.waitingForTreat() && canPractice(dog, owner) && dog.distanceToSqr(owner) <= TREAT_RANGE_SQ;
	}

	void cue(ServerLevel level, MushroomYorkieEntity dog, Player owner) {
		if (!dog.isOwnedBy(owner)) {
			return;
		}
		if (!canPractice(dog, owner)) {
			notice(owner, "training_unavailable");
			return;
		}
		if (this.heeling) {
			if (this.passedTrail && this.paws.size() == PAWS - 1) {
				this.earn(level, dog, owner, this.trailDistraction);
			} else {
				notice(owner, "training_released");
			}
			this.clearCue();
			return;
		}
		if (this.recall != null) {
			notice(owner, this.returned ? "training_reward" : "training_recall");
			return;
		}
		if (this.chasedSquirrel != null) {
			if (visibleDistraction(dog, owner, this.chasedSquirrel)) {
				this.recall = pawAt(level, dog, this.chasedSquirrel);
				this.expiresAt = level.getGameTime() + RETURN_TICKS;
				dog.getLookControl().setLookAt(owner);
				notice(owner, "training_recall");
			} else {
				notice(owner, "training_find_squirrel");
			}
			return;
		}
		if (this.paws.size() < PAWS - 1 || dog.distanceToSqr(owner) > RETURN_RANGE_SQ) {
			notice(owner, this.paws.size() < PAWS - 1 ? "training_find_squirrel" : "training_come_closer");
			return;
		}
		this.heeling = true;
		this.expiresAt = level.getGameTime() + HEEL_TICKS;
		this.lastOwnerPosition = owner.position();
		notice(owner, "training_heel");
	}

	boolean reward(ServerLevel level, MushroomYorkieEntity dog, Player player) {
		if (!dog.isOwnedBy(player) || this.recall == null || !this.returned
				|| level.getGameTime() >= this.expiresAt || dog.distanceToSqr(player) > TREAT_RANGE_SQ
				|| !canPractice(dog, player)) {
			return false;
		}
		if (this.paws.size() < PAWS - 1) {
			if (this.paws.stream().noneMatch(paw -> paw.squirrel().equals(this.recall.squirrel()))) {
				this.earn(level, dog, player, this.recall);
			} else {
				notice(player, "training_another_squirrel");
			}
		} else {
			notice(player, "training_heel_next");
		}
		this.clearCue();
		return true;
	}

	void tick(ServerLevel level, MushroomYorkieEntity dog) {
		if (!this.suppressesBarking()) {
			return;
		}
		if (!(dog.getOwner() instanceof Player owner) || !canPractice(dog, owner)) {
			this.clearCue();
			return;
		}
		if (level.getGameTime() >= this.expiresAt) {
			notice(owner, this.heeling ? "training_released" : "training_missed");
			this.clearCue();
			return;
		}
		if (this.recall != null) {
			if (dog.distanceToSqr(owner) <= RETURN_RANGE_SQ && dog.hasLineOfSight(owner)) {
				dog.getLookControl().setLookAt(owner);
				if (!this.returned) {
					this.returned = true;
					this.expiresAt = level.getGameTime() + RETURN_TICKS;
					notice(owner, "training_reward");
				}
			}
		} else {
			this.observeTrail(level, dog, owner);
		}
	}

	private void observeTrail(ServerLevel level, MushroomYorkieEntity dog, Player owner) {
		if (this.passedTrail || this.paws.size() == PAWS) {
			return;
		}
		Vec3 ownerPosition = owner.position();
		boolean alongside = owner.onGround() && dog.onGround() && dog.distanceToSqr(owner) <= HEEL_RANGE_SQ
				&& ownerPosition.distanceToSqr(this.lastOwnerPosition) <= HEEL_RANGE_SQ;
		this.lastOwnerPosition = ownerPosition;
		if (!alongside) {
			this.trailDistraction = null;
			return;
		}
		if (this.trailDistraction != null) {
			if (ownerPosition.distanceToSqr(this.distractionStart) >= FIELD_WALK_SQ) {
				this.passedTrail = true;
				notice(owner, "training_release_to_earn");
			}
		} else if (dog.tickCount % 5 == 0) {
			var squirrels = level.getEntitiesOfClass(SquirrelEntity.class, dog.getBoundingBox().inflate(8, 4, 8),
					squirrel -> visibleDistraction(dog, owner, squirrel));
			for (SquirrelEntity squirrel : squirrels) {
				Paw stamp = pawAt(level, dog, squirrel);
				boolean newTrail = this.paws.stream().noneMatch(stampOfPractice ->
						stamp.place().dimension().equals(stampOfPractice.place().dimension())
								&& stamp.place().pos().closerThan(stampOfPractice.place().pos(), 4));
				if (newTrail) {
					this.trailDistraction = stamp;
					this.distractionStart = ownerPosition;
					break;
				}
			}
		}
	}

	private static boolean visibleDistraction(MushroomYorkieEntity dog, Player owner, SquirrelEntity squirrel) {
		return squirrel.isAlive() && dog.distanceToSqr(squirrel) <= SQUIRREL_RANGE_SQ
				&& owner.hasLineOfSight(squirrel) && dog.hasLineOfSight(squirrel);
	}

	private static boolean canPractice(MushroomYorkieEntity dog, Player owner) {
		return dog.isAlive() && owner.isAlive() && !owner.isSpectator() && owner.level() == dog.level()
				&& !dog.isOrderedToSit() && !dog.isMushroomSleeping() && !dog.isNoGravity()
				&& !dog.isInWater() && !dog.isPassenger() && dog.getLeashHolder() == null
				&& !dog.expeditionCamp.holding();
	}

	private static Paw pawAt(ServerLevel level, MushroomYorkieEntity dog, SquirrelEntity squirrel) {
		return new Paw(squirrel.getUUID(), GlobalPos.of(level.dimension(), dog.blockPosition()));
	}

	private void earn(ServerLevel level, MushroomYorkieEntity dog, Player owner, Paw paw) {
		this.paws.add(paw);
		level.sendParticles(ParticleTypes.HEART, dog.getX(), dog.getY() + 0.5, dog.getZ(), 3, 0.2, 0.15, 0.2, 0);
		notice(owner, "training_paw_" + this.paws.size());
	}

	private void clearCue() {
		this.recall = null;
		this.returned = false;
		this.heeling = false;
		this.trailDistraction = null;
		this.distractionStart = null;
		this.lastOwnerPosition = null;
		this.passedTrail = false;
	}

	private static void notice(Player owner, String key) {
		MushroomCampInteractions.notice(owner, key);
	}
}
