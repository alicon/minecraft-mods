package dev.alicon.narwhaltogether;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.StreamSupport;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

final class TeleportTargetSelectorTest {
	private static final Candidate AOIFE = new Candidate(UUID.fromString("00000000-0000-0000-0000-000000000001"), "Aoife");
	private static final Candidate NOELLE = new Candidate(UUID.fromString("00000000-0000-0000-0000-000000000002"), "Noelle");
	private static final Candidate RUFUS = new Candidate(UUID.fromString("00000000-0000-0000-0000-000000000003"), "Rufus");

	@Test
	void firstTargetIsSelectedWhenThereIsNoPreviousTarget() {
		Candidate selected = TeleportTargetSelector.nextTarget(null, List.of(AOIFE, NOELLE, RUFUS), Candidate::id);

		assertEquals(AOIFE, selected);
	}

	@Test
	void nextTargetAfterPreviousTargetIsSelected() {
		Candidate selected = TeleportTargetSelector.nextTarget(AOIFE.id(), List.of(AOIFE, NOELLE, RUFUS), Candidate::id);

		assertEquals(NOELLE, selected);
	}

	@Test
	void targetSelectionWrapsToFirstTarget() {
		Candidate selected = TeleportTargetSelector.nextTarget(RUFUS.id(), List.of(AOIFE, NOELLE, RUFUS), Candidate::id);

		assertEquals(AOIFE, selected);
	}

	@Test
	void firstTargetIsSelectedWhenPreviousTargetLeftTheGame() {
		UUID missingTarget = UUID.fromString("00000000-0000-0000-0000-000000000099");

		Candidate selected = TeleportTargetSelector.nextTarget(missingTarget, List.of(AOIFE, NOELLE, RUFUS), Candidate::id);

		assertEquals(AOIFE, selected);
	}

	@Test
	void emptyTargetListsAreRejected() {
		assertThrows(IllegalArgumentException.class, () -> TeleportTargetSelector.nextTarget(null, List.<Candidate>of(), Candidate::id));
	}

	@Test
	void matchesTheSharedBedrockCycle() throws IOException {
		JsonObject scenario;
		try (var resource = getClass().getResourceAsStream("/narwhal-regroup-cycle.json")) {
			if (resource == null) {
				throw new IOException("Missing shared regroup cycle test data");
			}
			scenario = JsonParser.parseReader(new InputStreamReader(resource, UTF_8)).getAsJsonObject();
		}

		List<Candidate> eligible = names(scenario.getAsJsonArray("joinOrder")).stream()
				.map(name -> new Candidate(UUID.nameUUIDFromBytes(name.getBytes(UTF_8)), name))
				.sorted(Comparator.comparing(Candidate::name, String.CASE_INSENSITIVE_ORDER))
				.toList();
		List<String> expectedCycle = names(scenario.getAsJsonArray("expectedCycle"));
		assertEquals(eligible.size() + 1, expectedCycle.size());
		UUID previous = null;
		for (String expected : expectedCycle) {
			Candidate selected = TeleportTargetSelector.nextTarget(previous, eligible, Candidate::id);
			assertEquals(expected, selected.name());
			previous = selected.id();
		}
	}

	private static List<String> names(JsonArray values) {
		return StreamSupport.stream(values.spliterator(), false).map(JsonElement::getAsString).toList();
	}

	private record Candidate(UUID id, String name) {
	}
}
