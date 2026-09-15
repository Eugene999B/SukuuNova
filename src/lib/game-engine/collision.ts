export type Aabb = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function aabbWidth(box: Aabb) {
  return Math.max(0, box.right - box.left);
}

export function aabbHeight(box: Aabb) {
  return Math.max(0, box.bottom - box.top);
}

export function insetAabb(box: Aabb, fraction: number): Aabb {
  const safe = clamp(fraction, 0, 0.45);
  const xInset = aabbWidth(box) * safe;
  const yInset = aabbHeight(box) * safe;
  return {
    left: box.left + xInset,
    right: box.right - xInset,
    top: box.top + yInset,
    bottom: box.bottom - yInset,
  };
}

export function aabbOverlaps(a: Aabb, b: Aabb) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Player collision can be slightly smaller than the sprite/model silhouette.
 * That makes a visually tiny near miss feel like a near miss instead of a cheap
 * failure. The visual geometry itself remains unchanged.
 */
export function forgivingPlayerOverlap(player: Aabb, obstacle: Aabb, forgiveness = 0.08) {
  return aabbOverlaps(insetAabb(player, forgiveness), obstacle);
}

export function pointInsideAabb(x: number, y: number, box: Aabb, padding = 0) {
  const safePadding = Math.max(0, padding);
  return (
    x >= box.left - safePadding
    && x <= box.right + safePadding
    && y >= box.top - safePadding
    && y <= box.bottom + safePadding
  );
}
