package dev.alicon.mushroomyorkie.entity;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.alicon.mushroomyorkie.item.ModItems;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.client.gametest.v1.world.TestWorldBuilder;
import net.fabricmc.fabric.api.client.gametest.v1.world.TestWorldSave;
import net.minecraft.core.BlockPos;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;

record ExpeditionSaveRecovery(Path source, long seed, UUID owner, UUID dog, JsonObject camp) {
	static ExpeditionSaveRecovery read(Path manifest, Path status) throws IOException {
		var json = JsonParser.parseString(Files.readString(manifest)).getAsJsonObject();
		var source = Path.of(json.get("source").getAsString()).toRealPath();
		var reports = status.getParent().getParent().toRealPath();
		if (!source.startsWith(reports) || !Files.isRegularFile(source.resolve("level.dat"))) {
			throw new IOException("Expected an archived expedition world under " + reports);
		}
		return new ExpeditionSaveRecovery(source, json.get("seed").getAsLong(),
				UUID.fromString(json.get("owner").getAsString()), UUID.fromString(json.get("dog").getAsString()),
				json.getAsJsonObject("camp"));
	}

	TestSingleplayerContext openCopy(TestWorldBuilder builder) throws IOException {
		TestWorldSave destination;
		try (var empty = builder.create()) {
			destination = empty.getWorldSave();
		}
		var target = destination.getSaveDirectory();
		Files.move(target, target.resolveSibling(target.getFileName() + "-empty"));
		try (var entries = Files.walk(source)) {
			for (Path entry : entries.toList()) {
				if (Files.isSymbolicLink(entry)) throw new IOException("Symbolic link in expedition archive: " + entry);
				var path = source.relativize(entry);
				if (path.toString().equals("session.lock")) continue;
				var copied = target.resolve(path);
				if (Files.isDirectory(entry)) Files.createDirectories(copied);
				else Files.copy(entry, copied);
			}
		}
		return destination.open();
	}

	void verifyAndWriteCheckpoint(TestSingleplayerContext world, UUID loadedOwner, Path status) throws IOException {
		world.getServer().runOnServer(server -> {
			var player = server.getPlayerList().getPlayer(loadedOwner);
			var level = server.overworld();
			if (!owner.equals(loadedOwner) || player == null || !player.isAlive()
					|| player.level().dimension() != Level.OVERWORLD || level.getSeed() != seed
					|| !server.getWorldData().getLevelName().equals("Codex Expedition Survival")
					|| player.getInventory().countItem(Items.STONE_PICKAXE) == 0
					|| player.getInventory().countItem(Items.FURNACE) == 0
					|| player.getInventory().countItem(ModItems.FIELD_GUIDE) == 0
					|| !level.getBlockState(position("bed")).is(BlockTags.BEDS)
					|| !level.getBlockState(position("table")).is(Blocks.CRAFTING_TABLE)
					|| !(level.getEntity(dog) instanceof MushroomYorkieEntity mushroom)
					|| !mushroom.isAlive() || !mushroom.isTame() || !mushroom.isOwnedBy(player)) {
				throw new AssertionError("The archived Survival save did not reopen with its original owner, camp, stone kit, and living Mushroom");
			}
		});
		var checkpoint = new JsonObject();
		checkpoint.addProperty("dog", dog.toString());
		checkpoint.add("camp", camp);
		Files.writeString(status.resolveSibling("restored-checkpoint.json"), checkpoint.toString());
	}

	private BlockPos position(String key) {
		var coordinates = camp.getAsJsonArray(key);
		if (coordinates.size() != 3) throw new IllegalArgumentException("Invalid camp position " + key);
		return new BlockPos(coordinates.get(0).getAsInt(), coordinates.get(1).getAsInt(), coordinates.get(2).getAsInt());
	}
}
