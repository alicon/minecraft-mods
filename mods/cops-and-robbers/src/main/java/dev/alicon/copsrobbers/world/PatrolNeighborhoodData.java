package dev.alicon.copsrobbers.world;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.core.BlockPos;
import net.minecraft.util.datafix.DataFixTypes;
import net.minecraft.world.level.saveddata.SavedData;
import net.minecraft.world.level.saveddata.SavedDataType;

/** Saved once-per-world state for the generated patrol neighborhood. */
public final class PatrolNeighborhoodData extends SavedData {
	/** Persistent data type used by the Overworld data storage. */
	public static final SavedDataType<PatrolNeighborhoodData> TYPE = new SavedDataType<>(
			"cops_robbers_patrol_neighborhood",
			PatrolNeighborhoodData::new,
			RecordCodecBuilder.create(instance -> instance.group(
					Codec.BOOL.fieldOf("generated").forGetter(data -> data.generated),
					BlockPos.CODEC.fieldOf("station_spawn").orElse(BlockPos.ZERO).forGetter(data -> data.stationSpawn)
			).apply(instance, PatrolNeighborhoodData::new)),
			DataFixTypes.LEVEL
	);
	private boolean generated;
	private BlockPos stationSpawn = BlockPos.ZERO;

	/** Default constructor used by SavedDataType; generated state must stay false until markGenerated runs. */
	public PatrolNeighborhoodData() {
	}

	private PatrolNeighborhoodData(boolean generated, BlockPos stationSpawn) {
		this.generated = generated;
		this.stationSpawn = stationSpawn;
	}

	/** Returns whether the patrol neighborhood has already been generated. */
	public boolean generated() {
		return this.generated;
	}

	/** Returns the default police-station spawn point for this world. */
	public BlockPos stationSpawn() {
		return this.stationSpawn;
	}

	/** Marks the neighborhood as generated and remembers the station spawn. */
	public void markGenerated(BlockPos stationSpawn) {
		this.generated = true;
		this.stationSpawn = stationSpawn.immutable();
		this.setDirty();
	}
}
