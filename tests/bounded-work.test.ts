import { describe, expect, it } from "vitest";
import { loadInBatchesWithRetry } from "../src/lib/bounded-work";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("bounded async work", () => {
  it("never exceeds the requested batch concurrency and preserves input order", async () => {
    let active = 0;
    let maxActive = 0;
    const ids = ["a", "b", "c", "d", "e", "f", "g"];

    const result = await loadInBatchesWithRetry({
      ids,
      batchSize: 3,
      load: async (id) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await wait(id === "a" ? 8 : 2);
        active -= 1;
        return `value:${id}`;
      },
    });

    expect(maxActive).toBeLessThanOrEqual(3);
    expect(result.failures).toEqual([]);
    expect(result.items.map((item) => item.id)).toEqual(ids);
    expect(result.items.map((item) => item.value)).toEqual(ids.map((id) => `value:${id}`));
  });

  it("retries a transient failure once without losing report order", async () => {
    const attempts = new Map<string, number>();
    const result = await loadInBatchesWithRetry({
      ids: ["a", "b", "c"],
      batchSize: 3,
      load: async (id) => {
        const attempt = (attempts.get(id) ?? 0) + 1;
        attempts.set(id, attempt);
        if (id === "b" && attempt === 1) throw new Error("temporary");
        return id.toUpperCase();
      },
    });

    expect(attempts.get("b")).toBe(2);
    expect(result.failures).toEqual([]);
    expect(result.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("returns a permanent failure instead of silently producing an incomplete item", async () => {
    const attempts = new Map<string, number>();
    const result = await loadInBatchesWithRetry({
      ids: ["a", "broken", "c"],
      batchSize: 2,
      load: async (id) => {
        attempts.set(id, (attempts.get(id) ?? 0) + 1);
        if (id === "broken") throw new Error("still broken");
        return id;
      },
    });

    expect(attempts.get("broken")).toBe(2);
    expect(result.items.map((item) => item.id)).toEqual(["a", "c"]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.id).toBe("broken");
  });
});
