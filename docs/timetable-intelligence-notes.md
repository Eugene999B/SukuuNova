# Timetable intelligence workflow

The timetable generator now uses an explicit plan/review/apply contract.

## Generation modes

- **Fill gaps** keeps every current lesson in scope and generates only the missing weekly periods for each class/subject/teacher assignment.
- **Fresh rebuild** removes the current timetable rows in scope and generates the full configured weekly target again.
- **Rebuild + keep locks** preserves explicitly locked timetable rows, removes the remaining rows in scope, and generates only the lessons needed around those locks.

## Safety

- `dryRun: true` returns additions, removals, preserved rows, coverage metrics and warnings without changing the timetable.
- Applied generation uses a school-level PostgreSQL advisory transaction lock.
- Manual timetable add/update/delete/move/swap operations use the same advisory lock so they cannot race an applied generation run.
- Existing teacher, class, room and teacher-unavailability constraints remain hard constraints.
- Generation remains tenant-scoped and permission-gated.

## Compatibility

The generator still accepts the previous `replaceExisting` option as a compatibility bridge. New callers should use `mode`.
