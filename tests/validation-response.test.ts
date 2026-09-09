import { describe, expect, it } from "vitest";
import { z } from "zod";
import { routeError } from "../src/lib/errors";

describe("route schema errors", () => {
  it("returns actionable validation messages without echoing submitted credentials", async () => {
    const submitted = "private-credential";
    const parsed = z.object({ password: z.string().min(24) }).safeParse({ password: submitted });
    if (parsed.success) throw new Error("Expected invalid test input");
    const response = routeError(parsed.error);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.issues[0].path).toEqual(["password"]);
    expect(body.message).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain(submitted);
  });
});
