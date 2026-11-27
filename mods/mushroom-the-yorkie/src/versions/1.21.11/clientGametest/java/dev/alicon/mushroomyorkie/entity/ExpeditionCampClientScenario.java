package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.block.ModBlocks;
import dev.alicon.mushroomyorkie.item.ModItems;
import java.util.UUID;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.minecraft.commands.arguments.EntityAnchorArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.GlobalPos;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

final class ExpeditionCampClientScenario {
	private static final BlockPos CAMP = new BlockPos(13, 90, 17);

	private ExpeditionCampClientScenario() {
	}

	static void placeAndMark(ClientGameTestContext context, TestServerContext server, UUID ownerId, UUID dogId) {
		placeAndMark(context, server, ownerId, dogId, Level.OVERWORLD, CAMP);
	}

	static void placeAndMark(ClientGameTestContext context, TestServerContext server, UUID ownerId, UUID dogId,
			ResourceKey<Level> dimension, BlockPos camp) {
		server.runOnServer(minecraft -> minecraft.getPlayerList().getPlayer(ownerId)
				.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(ModItems.CAMP_MAT)));
		context.runOnClient(client -> client.player.lookAt(EntityAnchorArgument.Anchor.EYES, Vec3.atBottomCenterOf(camp)));
		context.waitFor(client -> client.player.getMainHandItem().is(ModItems.CAMP_MAT)
				&& client.hitResult instanceof BlockHitResult hit && hit.getBlockPos().equals(camp.below())
				&& hit.getDirection() == Direction.UP);
		context.getInput().pressKey(options -> options.keyUse);
		context.waitFor(client -> client.player.getMainHandItem().isEmpty() && client.level.getBlockState(camp).is(ModBlocks.CAMP_MAT));
		context.runOnClient(client -> client.player.lookAt(EntityAnchorArgument.Anchor.EYES, Vec3.atBottomCenterOf(camp).add(0, 0.04, 0)));
		context.waitFor(client -> client.hitResult instanceof BlockHitResult hit && hit.getBlockPos().equals(camp));
		context.getInput().pressKey(options -> options.keyUse);
		for (int tick = 0; tick < 20; tick++) {
			if (marked(server, dogId, dimension, GlobalPos.of(dimension, camp))) {
				System.out.println("Expedition camp marked through native Use in " + dimension.identifier());
				context.takeScreenshot("expedition-camp-marked-" + dimension.identifier().getPath());
				return;
			}
			context.waitTick();
		}
		throw new AssertionError("The owner's empty-hand Use did not assign the camp");
	}

	static void assertMarked(TestServerContext server, UUID dogId, GlobalPos marker) {
		if (!marked(server, dogId, Level.OVERWORLD, marker)) {
			throw new AssertionError("The living dog lost its camp marker after rejoining");
		}
	}

	private static boolean marked(TestServerContext server, UUID dogId, ResourceKey<Level> dogDimension, GlobalPos marker) {
		return server.computeOnServer(minecraft -> {
			var dog = (MushroomYorkieEntity) minecraft.getLevel(dogDimension).getEntity(dogId);
			return dog != null && marker.equals(dog.expeditionCamp.anchor())
					&& minecraft.getLevel(marker.dimension()).getBlockState(marker.pos()).is(ModBlocks.CAMP_MAT);
		});
	}
}
