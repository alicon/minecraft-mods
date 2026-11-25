package dev.alicon.mushroomyorkie.entity;

import java.util.UUID;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;

// Keeps vanilla's target-specific lifecycle signatures out of the shared Yorkie.
abstract sealed class MushroomVersionedAnimal extends TamableAnimal permits MushroomYorkieEntity {
	MushroomVersionedAnimal(EntityType<? extends TamableAnimal> type, Level level) {
		super(type, level);
	}

	@Override
	protected void customServerAiStep() {
		super.customServerAiStep();
		ServerLevel level = (ServerLevel) this.level();
		MushroomYorkieServerAi.tick(this.yorkie(), level);
	}

	@Override
	public void addAdditionalSaveData(CompoundTag data) {
		super.addAdditionalSaveData(data);
		MushroomYorkiePersistence.save(this.yorkie(), data);
	}

	@Override
	public void readAdditionalSaveData(CompoundTag data) {
		super.readAdditionalSaveData(data);
		MushroomYorkiePersistence.read(this.yorkie(), data);
	}

	@Override
	public boolean hurt(DamageSource source, float amount) {
		boolean hurt = super.hurt(source, amount);
		if (hurt && this.level() instanceof ServerLevel level) {
			this.yorkie().onDamage(level, source);
		}
		return hurt;
	}

	void hurtFromNeglect(ServerLevel level, float amount) {
		this.hurt(level.damageSources().starve(), amount);
	}

	void tameForOwner(Player player) {
		this.tame(player);
	}

	void clearVanillaOwner() {
		this.setOwnerUUID(null);
	}

	static Player findPlayer(ServerLevel level, UUID playerId) {
		return level.getServer().getPlayerList().getPlayer(playerId);
	}

	private MushroomYorkieEntity yorkie() {
		return (MushroomYorkieEntity) this;
	}
}
