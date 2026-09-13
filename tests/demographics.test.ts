import { describe, expect, it } from "vitest";
import { genderAnalyticsBucket, genderLabel, normalizeGender } from "../src/lib/demographics";

describe("demographic gender normalization", () => {
  it("normalizes legacy admission values and canonical values", () => {
    expect(normalizeGender("Female")).toBe("female");
    expect(normalizeGender("male")).toBe("male");
    expect(normalizeGender("Other")).toBe("other");
    expect(normalizeGender("Prefer not to say")).toBe("prefer_not_to_say");
  });

  it("does not invent a demographic value when the source is empty or unknown", () => {
    expect(normalizeGender("")).toBeNull();
    expect(normalizeGender(null)).toBeNull();
    expect(normalizeGender("unknown-value")).toBeNull();
    expect(genderLabel(null)).toBe("Not recorded");
  });

  it("keeps statistical buckets explicit", () => {
    expect(genderAnalyticsBucket("male")).toBe("male");
    expect(genderAnalyticsBucket("female")).toBe("female");
    expect(genderAnalyticsBucket("other")).toBe("other_or_undisclosed");
    expect(genderAnalyticsBucket("prefer_not_to_say")).toBe("other_or_undisclosed");
    expect(genderAnalyticsBucket(null)).toBe("not_recorded");
  });
});
