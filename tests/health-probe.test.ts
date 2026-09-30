import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: mocks.query } }));

afterEach(() => { vi.useRealTimers(); vi.resetModules(); mocks.query.mockReset(); });

describe("health probe", () => {
  it("bounds database wait and shares the pending probe across callers", async () => {
    vi.useFakeTimers();
    let resolveQuery!: (value: unknown) => void;
    mocks.query.mockReturnValue(new Promise(resolve => { resolveQuery = resolve; }));
    const { GET } = await import("../src/app/api/health/route");
    const first = GET();
    const second = GET();
    await vi.advanceTimersByTimeAsync(3000);
    expect((await first).status).toBe(503);
    expect((await second).status).toBe(503);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    resolveQuery([]);
    await vi.advanceTimersByTimeAsync(1);
    const recovered = await GET();
    expect(recovered.status).toBe(200);
    expect(recovered.headers.get("Cache-Control")).toBe("no-store");
  });

  it("reports a rejected database query as unavailable", async () => {
    mocks.query.mockRejectedValue(new Error("unavailable"));
    const { GET } = await import("../src/app/api/health/route");
    expect((await GET()).status).toBe(503);
  });
});
