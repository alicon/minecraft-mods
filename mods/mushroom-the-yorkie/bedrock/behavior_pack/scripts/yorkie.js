export const YORKIE = "mushroom_yorkie:mushroom_yorkie";
export const NAMESPACE = "mushroom_yorkie:";
export const EMPTY_BOWL = NAMESPACE + "dog_bowl";
export const FOOD_BOWL = NAMESPACE + "dog_food_bowl";
export const WATER_BOWL = NAMESPACE + "dog_water_bowl";
export const BED = NAMESPACE + "dog_bed";
export const HOUSE = NAMESPACE + "doghouse";
export const FLIGHT_MODE = NAMESPACE + "flight_mode";
export const WALKING_AFTER_STAY = NAMESPACE + "walking_after_stay";

export function storage(key) {
  return NAMESPACE + key;
}

export function waitingForExpeditionSafety(pup) {
  const goal = pup.getProperty(storage("home_goal"));
  return goal === "camp" || goal === "trail";
}
