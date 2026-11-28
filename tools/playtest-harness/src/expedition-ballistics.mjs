const FULL_DRAW_SPEED = 3;
const AIR_DRAG = 0.99;
const ARROW_GRAVITY = 0.05;

export function clearBowArc(player, target, solidAt) {
  const aim = bowAim(player, target);
  if (!aim) return false;
  const { x, y, z } = player.position;
  const range = Math.hypot(target[0] - x, target[2] - z);
  if (range < 1) return false;
  const pitch = -aim.pitch * Math.PI / 180;
  const horizontal = FULL_DRAW_SPEED * Math.cos(pitch);
  const vertical = FULL_DRAW_SPEED * Math.sin(pitch);
  for (let ticks = 0.125; ticks <= 45; ticks += 0.125) {
    const travel = (1 - AIR_DRAG ** ticks) / (1 - AIR_DRAG);
    const progress = horizontal * travel / range;
    if (progress >= 1) return true;
    const height = y + 1.52 + vertical * travel - ARROW_GRAVITY * (ticks - travel) / (1 - AIR_DRAG);
    const pos = [x + (target[0] - x) * progress, height, z + (target[2] - z) * progress].map(Math.floor);
    if (solidAt(pos)) return false;
  }
  return false;
}

export function bowAim(player, target) {
  const dx = target[0] - player.position.x;
  const dy = target[1] - (player.position.y + 1.52);
  const dz = target[2] - player.position.z;
  const range = Math.hypot(dx, dz);
  const velocityAt = ticks => {
    const travel = (1 - AIR_DRAG ** ticks) / (1 - AIR_DRAG);
    const horizontal = range / travel;
    const vertical = (dy + ARROW_GRAVITY * (ticks - travel) / (1 - AIR_DRAG)) / travel;
    return { horizontal, vertical };
  };

  for (let ticks = 1; ticks <= 45; ticks++) {
    // Arrow velocity decays each tick. Use the first solution for the lower arc.
    const velocity = velocityAt(ticks);
    if (Math.hypot(velocity.horizontal, velocity.vertical) > FULL_DRAW_SPEED) continue;
    // The arrow still travels at full draw speed. Solve between whole ticks
    // so the pitch does not assume an arrow slower than the one we release.
    let low = ticks - 1;
    let high = ticks;
    for (let step = 0; step < 12; step++) {
      const mid = (low + high) / 2;
      const trial = velocityAt(mid);
      if (Math.hypot(trial.horizontal, trial.vertical) > FULL_DRAW_SPEED) low = mid;
      else high = mid;
    }
    const { horizontal, vertical } = velocityAt(high);
    return { yaw: Math.atan2(-dx, dz) * 180 / Math.PI,
      pitch: -Math.atan2(vertical, horizontal) * 180 / Math.PI };
  }
  return null;
}
