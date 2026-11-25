package dev.alicon.mushroomyorkie.entity;

import java.util.UUID;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

// Keeps vanilla's target-specific lifecycle signatures out of the shared Yorkie.
abstract sealed class MushroomVersionedAnimal extends TamableAnimal permits MushroomYorkieEntity {
	MushroomVersionedAnimal(EntityType<? extends TamableAnimal> type, Level level) {
		super(type, level);
	}

	@Override
	protected void customServerAiStep(ServerLevel level) {
		super.customServerAiStep(level);
		MushroomYorkieServerAi.tick(this.yorkie(), level);
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput data) {
		super.addAdditionalSaveData(data);
		MushroomYorkiePersistence.save(this.yorkie(), data);
	}

	@Override
	protected void readAdditionalSaveData(ValueInput data) {
		super.readAdditionalSaveData(data);
		MushroomYorkiePersistence.read(this.yorkie(), data);
	}

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
		boolean hurt = super.hurtServer(level, source, amount);
		if (hurt) {
			this.yorkie().onDamage(level, source);
		}
		return hurt;
	}

	void hurtFromNeglect(ServerLevel level, float amount) {
		this.hurtServer(level, level.damageSources().starve(), amount);
	}

	void tameForOwner(Player player) {
		this.tame(player);
		this.setOwner(player);
	}

	void clearVanillaOwner() {
		this.setOwner(null);
	}

	static Player findPlayer(ServerLevel level, UUID playerId) {
		return level.getPlayerInAnyDimension(playerId);
	}

	private MushroomYorkieEntity yorkie() {
		return (MushroomYorkieEntity) this;
	}
}
