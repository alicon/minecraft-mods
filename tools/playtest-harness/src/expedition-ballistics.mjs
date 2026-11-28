const FULL_DRAW_SPEED = 3;
const AIR_DRAG = 0.99;
const ARROW_GRAVITY = 0.05;

export function bowAim(player, target) {
  const dx = target[0] - player.position.x;
  const dy = target[1] - (player.position.y + 1.52);
  const dz = target[2] - player.position.z;
  const range = Math.hypot(dx, dz);

  for (let ticks = 1; ticks <= 45; ticks++) {
    // Arrow velocity decays each tick. Use the first solution for the lower arc.
    const travel = (1 - AIR_DRAG ** ticks) / (1 - AIR_DRAG);
    const horizontal = range / travel;
    const vertical = (dy + ARROW_GRAVITY * (ticks - travel) / (1 - AIR_DRAG)) / travel;
    if (Math.hypot(horizontal, vertical) <= FULL_DRAW_SPEED) {
      return { yaw: Math.atan2(-dx, dz) * 180 / Math.PI,
        pitch: -Math.atan2(vertical, horizontal) * 180 / Math.PI };
    }
  }
  return null;
}
