package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import java.util.UUID;
import java.util.function.Predicate;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.minecraft.commands.arguments.EntityAnchorArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.EntityHitResult;

final class ExpeditionVestClientScenario {
	private ExpeditionVestClientScenario() {
	}

	static void equipAndInspect(ClientGameTestContext context, TestServerContext server, UUID ownerId, UUID dogId) {
		server.runCommand("tp @a 16.5 90 17.5");
		var aim = server.computeOnServer(minecraft -> {
			var dog = (MushroomYorkieEntity) minecraft.overworld().getEntity(dogId);
			dog.setPos(16.5, 90, 15.7);
			dog.setYRot(110);
			dog.setYBodyRot(110);
			dog.setNoAi(true);
			return dog.getBoundingBox().getCenter();
		});
		context.waitFor(client -> client.player.blockPosition().equals(new BlockPos(16, 90, 17)));
		context.runOnClient(client -> client.player.lookAt(EntityAnchorArgument.Anchor.EYES, aim));

		equip(context, server, ownerId, dogId, ModItems.YORKIE_HARNESS, MushroomYorkieEntity::hasHarness);
		equip(context, server, ownerId, dogId, ModItems.PADDED_VEST, MushroomYorkieEntity::hasExpeditionVest);
		context.takeScreenshot("expedition-padded-vest");
		equip(context, server, ownerId, dogId, Items.ARMADILLO_SCUTE, MushroomYorkieEntity::hasScutePlates);
		context.takeScreenshot("expedition-plated-vest");
		server.runOnServer(minecraft -> {
			var dog = (MushroomYorkieEntity) minecraft.overworld().getEntity(dogId);
			ItemStack worn = MushroomExpeditionEquipment.vest(dog).copy();
			worn.setDamageValue(36);
			dog.setItemSlot(EquipmentSlot.BODY, worn);
		});
		context.waitFor(client -> client.hitResult instanceof EntityHitResult hit
				&& hit.getEntity() instanceof MushroomYorkieEntity dog && dog.getUUID().equals(dogId) && dog.isExpeditionVestCracked());
		context.takeScreenshot("expedition-cracked-vest");
		server.runOnServer(minecraft -> ((MushroomYorkieEntity) minecraft.overworld().getEntity(dogId)).setNoAi(false));
		assertPlated(server, ownerId, dogId);
	}

	static void assertPlated(TestServerContext server, UUID ownerId, UUID dogId) {
		server.runOnServer(minecraft -> {
			var dog = (MushroomYorkieEntity) minecraft.overworld().getEntity(dogId);
			if (!dog.hasScutePlates() || MushroomExpeditionEquipment.vest(dog).getDamageValue() != 36
					|| !dog.isOwnedBy(minecraft.getPlayerList().getPlayer(ownerId))) {
				throw new AssertionError("Expected the same owner and the same worn scute vest");
			}
		});
	}

	private static void equip(ClientGameTestContext context, TestServerContext server, UUID ownerId, UUID dogId,
			Item item, Predicate<MushroomYorkieEntity> expected) {
		server.runOnServer(minecraft -> minecraft.getPlayerList().getPlayer(ownerId)
				.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item)));
		context.waitFor(client -> client.player.getMainHandItem().is(item)
				&& client.hitResult instanceof EntityHitResult hit && hit.getEntity().getUUID().equals(dogId));
		context.getInput().pressKey(options -> options.keyUse);
		context.waitFor(client -> client.player.getMainHandItem().isEmpty()
				&& client.hitResult instanceof EntityHitResult hit && hit.getEntity() instanceof MushroomYorkieEntity dog
				&& dog.getUUID().equals(dogId) && expected.test(dog));
	}
}
