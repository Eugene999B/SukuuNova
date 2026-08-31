import { describe, expect, it } from "vitest";
import { classifyOperationsIntent } from "../src/lib/operations-assistant-service";

describe("operations assistant intent classifier", () => {
  it("classifies only approved school-record intents", () => {
    expect(classifyOperationsIntent("Who is absent today?")).toBe("TODAY_ATTENDANCE");
    expect(classifyOperationsIntent("Show missing scores")).toBe("MISSING_SCORES");
    expect(classifyOperationsIntent("Which invoices are overdue?")).toBe("OVERDUE_INVOICES");
    expect(classifyOperationsIntent("Which reports are pending?")).toBe("PENDING_REPORTS");
    expect(classifyOperationsIntent("Show failed messages")).toBe("FAILED_MESSAGES");
    expect(classifyOperationsIntent("Show unresolved pickups")).toBe("UNRESOLVED_PICKUPS");
  });

  it("fails closed for unsupported questions", () => {
    expect(classifyOperationsIntent("Tell me anything about this school.")).toBe("UNSUPPORTED");
    expect(classifyOperationsIntent("Delete the student's record.")).toBe("UNSUPPORTED");
  });
});
