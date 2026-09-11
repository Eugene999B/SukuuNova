# SukuuNova legacy writer deprecation register — 11 September 2026

This register is part of Release D. A legacy surface may remain readable for historical compatibility, but it must not remain an independent writer beside a canonical domain service.

| Legacy surface | Canonical owner | Release D state | Removal / compatibility rule |
| --- | --- | --- | --- |
| MVP setup `student` action | Student onboarding service + Admissions enrolment | **Retired** | POST returns `410 LEGACY_STUDENT_WRITER_RETIRED`. Read-only MVP setup data may remain until the old screen is removed. |
| Duplicate Students-page creation logic | Student onboarding service | **Delegated** | Both modern student entry screens use the same onboarding action/service. Intake may create draft placement but may not mutate live `Student.classId`. |
| Admission-enquiry conversion student writer | Student onboarding service | **Delegated** | Conversion runs through the same onboarding transaction and creates draft enrolment context. |
| Phase 3 `P3Asset` mutation API | School Properties | **Retired for writes** | Historical `P3Asset` rows remain readable for old fixture/report compatibility. New create/update requests return `410 LEGACY_ASSET_WRITER_RETIRED`; all new custody/property changes belong in School Properties. |
| Phase 3 finance adjustment mutation path | Canonical Release C finance service | **Delegated** | Requests call `requestFinanceAdjustment`; approvals/rejections call `decideFinanceAdjustment`. The historical `P3FinanceAdjustment` table is retained as the canonical adjustment storage table, not a separate ledger. |
| Phase 3 finance list | Canonical finance storage | **Compatibility read** | Reads may continue from the canonical adjustment table while the old console is phased out. No old direct mutation path is exposed. |
| Timetable engine v2 persistence | Timetable service / NovaCore + DB collision guard | **Compatibility engine, guarded persistence** | The engine remains used by generation policy/tests. Every persisted `TimetableSlot` is protected by class uniqueness plus Release D teacher/venue collision guards, so old/direct writers cannot create conflicting schedules. |
| Ambiguous `/school/inventory` route | School Properties / School Store | **Retired navigation** | The legacy inventory route redirects to School Properties; School Store remains a separate retail register. |
| Legacy Phase 3 asset fixture rows | School Properties migration backlog | **Historical fixture only** | Eugene Academy may retain legacy rows to test backwards compatibility, but production application writers cannot add or edit them. |

## Rules for future changes

1. A replacement module does not count as canonical while an older public writer can still create a conflicting record.
2. Compatibility readers are allowed only when their storage meaning is explicit and immutable enough for historical use.
3. New code must call the canonical service rather than reproducing validation in a route, page or dashboard.
4. Any temporary legacy writer added for migration must have an explicit removal condition in this register and automated coverage proving it cannot bypass current invariants.
5. Database guards remain defense in depth for identity, timetable, custody and ledger invariants even after legacy routes are removed.
