package dev.alicon.copsrobbers.entity;

import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.world.entity.ai.goal.RandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.npc.villager.Villager;
import net.minecraft.world.entity.player.Player;

final class BankRobberGoals {
	private BankRobberGoals() {
	}

	static void register(BankRobberEntity robber) {
		robber.addRobberGoal(0, new FloatGoal(robber));
		robber.addRobberGoal(2, new MeleeAttackGoal(robber, 1.05D, true));
		robber.addRobberGoal(6, new RandomStrollGoal(robber, 0.9D));
		robber.addRobberGoal(7, new LookAtPlayerGoal(robber, Player.class, 8.0F));
		robber.addRobberTargetGoal(1, new HurtByTargetGoal(robber));
		robber.addRobberTargetGoal(2, new NearestAttackableTargetGoal<>(robber, Villager.class, true));
		robber.addRobberTargetGoal(3, new NearestAttackableTargetGoal<>(robber, Player.class, true));
	}
}
