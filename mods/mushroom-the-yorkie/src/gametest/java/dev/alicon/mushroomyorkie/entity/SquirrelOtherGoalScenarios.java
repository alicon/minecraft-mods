package dev.alicon.mushroomyorkie.entity;

import static dev.alicon.mushroomyorkie.entity.SquirrelTraceReports.point;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.nio.file.Path;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/** Without a reachable tree, ordinary navigation and the squirrel's full AI remain active. */
final class SquirrelOtherGoalScenarios {
	private SquirrelOtherGoalScenarios() {
	}

	static void flee(GameTestHelper helper) {
		flee(helper, false);
	}

	static void fleeBlockedTree(GameTestHelper helper) {
		flee(helper, true);
	}

	private static void flee(GameTestHelper helper, boolean blockedTree) {
		floor(helper);
		if (blockedTree) encloseTree(helper, 11, 8);
		MushroomYorkieEntity threat = helper.spawn(ModEntities.MUSHROOM_YORKIE, 6, 1, 8);
		// A stationary threat isolates squirrel avoidance; only the threat's AI is disabled.
		threat.setNoAi(true);
		SquirrelEntity squirrel = helper.spawn(ModEntities.SQUIRREL, 8, 1, 8);
		String label = blockedTree ? "squirrel-blocked-tree-flee" : "squirrel-no-tree-flee";
		long seed = GameTestSeeds.apply(squirrel, label);
		new Probe(helper, squirrel, threat.position(), true, label, seed, () -> {
			threat.discard();
			squirrel.discard();
		}).start();
	}

	static void tempt(GameTestHelper helper) {
		tempt(helper, false);
	}

	static void temptBlockedTree(GameTestHelper helper) {
		tempt(helper, true);
	}

	private static void tempt(GameTestHelper helper, boolean blockedTree) {
		floor(helper);
		if (blockedTree) encloseTree(helper, 8, 3);
		ServerPlayer player = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		player.setPos(helper.absoluteVec(new Vec3(11.5D, 1.0D, 8.5D)));
		player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.SWEET_BERRIES));
		SquirrelEntity squirrel = helper.spawn(ModEntities.SQUIRREL, 5, 1, 8);
		String label = blockedTree ? "squirrel-blocked-tree-tempt" : "squirrel-no-tree-tempt";
		long seed = GameTestSeeds.apply(squirrel, label);
		new Probe(helper, squirrel, player.position(), false, label, seed, () -> {
			squirrel.discard();
			if (helper.getLevel().getServer().getPlayerList().getPlayer(player.getUUID()) == player) {
				helper.getLevel().getServer().getPlayerList().remove(player);
			}
			player.discard();
		}).start();
	}

	private static void encloseTree(GameTestHelper helper, int x, int z) {
		for (int y = 1; y <= 7; y++) {
			if (y <= 5) helper.setBlock(x, y, z, Blocks.OAK_LOG);
			for (int edge = -2; edge <= 2; edge++) {
				helper.setBlock(x - 2, y, z + edge, Blocks.STONE);
				helper.setBlock(x + 2, y, z + edge, Blocks.STONE);
				helper.setBlock(x + edge, y, z - 2, Blocks.STONE);
				helper.setBlock(x + edge, y, z + 2, Blocks.STONE);
			}
		}
	}

	private static void floor(GameTestHelper helper) {
		for (int x = 0; x <= 15; x++) {
			for (int z = 0; z <= 15; z++) helper.setBlock(x, 0, z, Blocks.STONE);
		}
	}

	private static final class Probe {
		private final GameTestHelper helper;
		private final SquirrelEntity squirrel;
		private final Vec3 target;
		private final boolean fleeing;
		private final Runnable cleanup;
		private final Vec3 origin;
		private final JsonObject report = new JsonObject();
		private final JsonArray frames = new JsonArray();
		private final Path output;
		private int ticks, stableTicks;

		Probe(GameTestHelper helper, SquirrelEntity squirrel, Vec3 target, boolean fleeing, String label, long seed, Runnable cleanup) {
			this.helper = helper;
			this.squirrel = squirrel;
			this.target = target;
			this.fleeing = fleeing;
			this.cleanup = cleanup;
			this.origin = helper.absoluteVec(Vec3.ZERO);
			String directory = System.getenv("MUSHROOM_SQUIRREL_TRACE_DIR");
			this.output = directory == null ? null : Path.of(directory, label + "-" + squirrel.getUUID() + ".json");
			this.report.addProperty("label", label);
			this.report.addProperty("entityUuid", squirrel.getUUID().toString());
			this.report.addProperty("entitySeed", Long.toString(seed));
			this.report.addProperty("worldSeed", Long.toString(helper.getLevel().getSeed()));
			this.report.add("origin", point(this.origin));
			this.report.add("target", point(target.subtract(this.origin)));
			this.report.add("frames", this.frames);
		}

		void start() {
			this.helper.runAfterDelay(1, this::tick);
		}

		private void tick() {
			this.ticks++;
			try {
				JsonObject frame = new JsonObject();
				frame.addProperty("tick", this.ticks);
				frame.addProperty("health", this.squirrel.getHealth());
				frame.addProperty("entityTick", this.squirrel.tickCount);
				frame.addProperty("onGround", this.squirrel.onGround());
				frame.addProperty("noGravity", this.squirrel.isNoGravity());
				frame.addProperty("foundTree", this.squirrel.hasFoundTree());
				frame.add("position", point(this.squirrel.position().subtract(this.origin)));
				var path = this.squirrel.getNavigation().getPath();
				frame.addProperty("navigationDone", this.squirrel.getNavigation().isDone());
				if (path != null) {
					frame.addProperty("pathCanReach", path.canReach());
					frame.add("pathTarget", point(Vec3.atBottomCenterOf(path.getTarget()).subtract(this.origin)));
				}
				this.frames.add(frame);
				this.helper.assertTrue(this.squirrel.isAlive() && this.squirrel.getHealth() == this.squirrel.getMaxHealth(),
						"Ordinary squirrel goal lost health");
				this.helper.assertTrue(!this.squirrel.hasFoundTree() && !this.squirrel.isNoGravity(),
						"No-tree control unexpectedly found a tree or disabled gravity");
				double distance = this.squirrel.position().distanceTo(this.target);
				boolean arrived = this.fleeing ? distance >= 4.0D : distance <= 2.0D;
				this.stableTicks = arrived && this.squirrel.onGround() ? this.stableTicks + 1 : 0;
				if (this.stableTicks >= 5) {
					this.save(true);
					this.cleanup.run();
					this.helper.succeed();
					return;
				}
				if (this.ticks % 10 == 0) this.save(false);
				this.helper.assertTrue(this.ticks < 120,
						"Ordinary squirrel " + (this.fleeing ? "avoidance" : "tempting") + " stalled: distance=" + distance);
			} catch (RuntimeException | Error failure) {
				this.report.addProperty("error", failure.toString());
				try {
					this.save(true);
				} catch (RuntimeException saveFailure) {
					failure.addSuppressed(saveFailure);
				} finally {
					this.cleanup.run();
				}
				throw failure;
			}
			this.start();
		}

		private void save(boolean complete) {
			this.report.addProperty("complete", complete);
			this.report.addProperty("passed", complete && !this.report.has("error"));
			SquirrelTraceReports.save(this.output, this.report);
		}
	}
}
