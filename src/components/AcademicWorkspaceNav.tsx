"use client";

/**
 * The old Academic Tool switcher duplicated the primary school navigation and
 * created multiple doors into the same workflows. Academic navigation now
 * lives in the normal AppShell, with Academic Settings as the single setup hub.
 *
 * Keep this compatibility component temporarily so older pages can render while
 * their imports are retired incrementally without reintroducing duplicate UI.
 */
export function AcademicWorkspaceNav({ current: _current }: { current: string }) {
  return null;
}
