package dev.alicon.mushroomyorkie.entity;

import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import net.minecraft.world.phys.Vec3;

/** Optional native observations share one atomic writer and preserve failed reports. */
final class SquirrelTraceReports {
	private SquirrelTraceReports() {
	}

	static void save(Path output, JsonObject report) {
		if (output == null) return;
		try {
			Files.createDirectories(output.getParent());
			Path temporary = output.resolveSibling(output.getFileName() + ".tmp");
			Files.writeString(temporary, new GsonBuilder().setPrettyPrinting().create().toJson(report) + "\n");
			Files.move(temporary, output, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
		} catch (IOException failure) {
			throw new IllegalStateException("Could not preserve native squirrel evidence", failure);
		}
	}

	static JsonObject point(Vec3 point) {
		JsonObject value = new JsonObject();
		value.addProperty("x", point.x);
		value.addProperty("y", point.y);
		value.addProperty("z", point.z);
		return value;
	}
}
