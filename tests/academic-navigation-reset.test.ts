import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("academic navigation reset", () => {
  it("keeps the school academic sidebar focused on canonical workflows", () => {
    const shell = read("src/components/AppShell.tsx");
    expect(shell).toContain('label: "Classes", href: "/school/classes"');
    expect(shell).toContain('label: "Gradebook", href: "/school/gradebook"');
    expect(shell).toContain('label: "Academic Settings", href: "/school/academics/settings"');
    expect(shell).toContain('label: "Houses", href: "/school/houses"');
    expect(shell).not.toContain('label: "Classes & Houses"');
    expect(shell).not.toContain('label: "Homework & Exercises"');
    expect(shell).not.toContain('label: "Exams & Assessments"');
    expect(shell).not.toContain('label: "Subjects", href: "/school/subjects"');
  });

  it("removes duplicate teacher homework and assessment doors", () => {
    const shell = read("src/components/AppShell.tsx");
    expect(shell).not.toContain('label: "My Homework"');
    expect(shell).not.toContain('label: "My Assessments"');
    expect(shell).toContain('label: "Online Assessments", href: "/teacher/studio#activities"');
    expect(shell).toContain('label: "My Gradebook", href: "/teacher/gradebook"');
  });

  it("retires the secondary academic tool switcher", () => {
    const switcher = read("src/components/AcademicWorkspaceNav.tsx");
    expect(switcher).toContain("return null");
    expect(switcher).not.toContain("Assessments");
    expect(switcher).not.toContain("Performance");
  });

  it("redirects the old assessment and performance pages into Gradebook", () => {
    expect(read("src/app/school/exams/page.tsx")).toContain('/school/gradebook?view=assessments');
    const performance = read("src/app/school/academics/performance/page.tsx");
    expect(performance).toContain('view: "insights"');
    expect(performance).toContain("/school/gradebook?");
  });

  it("keeps legacy homework data reachable without advertising the old module", () => {
    const shell = read("src/components/AppShell.tsx");
    const homeworkPage = read("src/app/school/homework/page.tsx");
    expect(shell).not.toContain('href: "/school/homework"');
    expect(homeworkPage).toContain("Homework");
  });
});
