package dev.alicon.mushroomyorkie.entity;

import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.FollowOwnerGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.RandomStrollGoal;
import net.minecraft.world.entity.ai.goal.SitWhenOrderedToGoal;
import net.minecraft.world.entity.player.Player;

final class MushroomYorkieGoals {
	private MushroomYorkieGoals() {
	}

	static void register(MushroomYorkieEntity yorkie) {
		yorkie.addYorkieGoal(0, new FloatGoal(yorkie));
		yorkie.addYorkieGoal(1, new SleepAtNightGoal(yorkie));
		yorkie.addYorkieGoal(2, new NightStirGoal(yorkie));
		yorkie.addYorkieGoal(3, new IndoorPottyWarningGoal(yorkie));
		yorkie.addYorkieGoal(4, new DomesticCareGoal(yorkie));
		yorkie.addYorkieGoal(5, new FetchBallGoal(yorkie));
		yorkie.addYorkieGoal(6, new StructureScentGoal(yorkie));
		yorkie.addYorkieGoal(7, new BarkAtPeacefulMobsGoal(yorkie));
		yorkie.addYorkieGoal(8, new HesitantHostileMobGoal(yorkie));
		yorkie.addYorkieGoal(9, new UntamedStayNearPlayerGoal(yorkie));
		yorkie.addYorkieGoal(10, new SitWhenOrderedToGoal(yorkie));
		yorkie.addYorkieGoal(11, new FollowOwnerGoal(yorkie, 1.25D, 2.0F, 1.0F));
		yorkie.addYorkieGoal(12, new CreativeProfileGoal(yorkie));
		yorkie.addYorkieGoal(13, new DaytimeBumShuffleGoal(yorkie));
		yorkie.addYorkieGoal(14, new RandomStrollGoal(yorkie, 0.9D, 80));
		yorkie.addYorkieGoal(15, new LookAtPlayerGoal(yorkie, Player.class, 8.0F));
		yorkie.addYorkieGoal(16, new RandomLookAroundGoal(yorkie));
	}
}
