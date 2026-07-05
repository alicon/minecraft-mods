package dev.alicon.mushroomyorkie.entity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

final class MushroomPeacefulMobMemoryTest {
	@Test
	void roundTripsSavedIdsAndIgnoresCorruptEntries() {
		UUID first = UUID.fromString("00000000-0000-0000-0000-000000000001");
		UUID second = UUID.fromString("00000000-0000-0000-0000-000000000002");
		MushroomPeacefulMobMemory memory = new MushroomPeacefulMobMemory();

		memory.read(first + ";nope;" + second);

		assertEquals(first + ";" + second, memory.save());
	}

	@Test
	void keepsOnlyMostRecentRememberedIds() {
		List<UUID> ids = new ArrayList<>();
		for (int index = 0; index < 70; index++) {
			ids.add(new UUID(0L, index + 1L));
		}
		MushroomPeacefulMobMemory memory = new MushroomPeacefulMobMemory();

		memory.read(String.join(";", ids.stream().map(UUID::toString).toList()));

		String saved = memory.save();
		assertEquals(64, saved.split(";").length);
		assertFalse(saved.contains(ids.get(0).toString()));
	}
}
