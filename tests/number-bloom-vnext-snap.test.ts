import { describe, expect, it } from "vitest";
import {
  NUMBER_BLOOM_SNAP_RADIUS_PX,
  distanceFromPointToRect,
  findNearestNumberBloomSnap,
} from "@/lib/arcade-vnext/games/number-bloom/snap";

const candidates = [
  { containerId: "left-bed", slot: 0, rect: { left: 100, top: 100, right: 160, bottom: 160 } },
  { containerId: "left-bed", slot: 1, rect: { left: 180, top: 100, right: 240, bottom: 160 } },
] as const;

describe("Number Bloom touch snap geometry", () => {
  it("treats a point inside a slot as zero distance", () => {
    expect(distanceFromPointToRect(130, 130, candidates[0].rect)).toBe(0);
  });

  it("accepts a child drop just outside the visible slot", () => {
    const snapped = findNearestNumberBloomSnap(165, 130, candidates);
    expect(snapped).toMatchObject({ containerId: "left-bed", slot: 0, distance: 5 });
  });

  it("chooses the closest eligible hole rather than screen position order", () => {
    const snapped = findNearestNumberBloomSnap(176, 130, candidates);
    expect(snapped).toMatchObject({ containerId: "left-bed", slot: 1, distance: 4 });
  });

  it("does not teleport a drop from beyond the forgiving radius", () => {
    expect(findNearestNumberBloomSnap(
      300,
      220,
      candidates,
      NUMBER_BLOOM_SNAP_RADIUS_PX,
    )).toBeNull();
  });

  it("rejects invalid pointer geometry instead of inventing a target", () => {
    expect(findNearestNumberBloomSnap(Number.NaN, 130, candidates)).toBeNull();
    expect(findNearestNumberBloomSnap(130, 130, candidates, -1)).toBeNull();
  });
});
