# Academic calendar and class-teacher operations

This layer extends the existing `AcademicYear`, `Term`, `CalendarEvent`, `TermWeek` and term-lock records rather than replacing them.

## Calendar hierarchy

`AcademicYearPlan` stores the school's year pattern (`three_terms`, `two_semesters`, `three_trimesters`, `four_quarters`, or `custom`). Each existing `Term` receives an `AcademicSessionPolicy` with an explicit sequence, session kind and `isYearEnd` flag. Promotion behavior therefore never depends on a term name such as `Term 3`.

Every planned session automatically gets a final `GradingPeriod`. The separate table deliberately leaves room for schools that later need progress reports or mid-semester grading windows without pretending those are separate academic terms.

## Enumerated school calendar

`SchoolCalendarDay` materializes every date inside the academic year. Weekdays inside a session are instructional by default, weekends are weekends, and gaps between sessions are vacation. Existing `CalendarEvent` records can turn dates into holidays, closures, examinations, staff-only days or make-up days. Manual day overrides are preserved when generated dates are refreshed.

The year planner shows the next academic year's start date when it exists. The gap after the current year is therefore an explicit long-vacation/resumption window instead of an inferred label.

## Closing lifecycle

A planned session uses `open -> closing -> ready -> locked`. Warnings such as incomplete marks/reports remain visible for human review. A year-end session has a hard blocker until every active structured learner has a confirmed `PromotionDecision`.

Newly planned sessions cannot be locked through the legacy term-lock endpoint before closing validation. Backfilled legacy terms remain compatible and can be adopted gradually.

## Class Teacher Desk

`/school/class-teacher` is intentionally separate from Teacher Academic Studio. The subject workspace owns work and marks; My Class provides whole-class oversight across academic coverage, attendance, report readiness, guardian context and year-end recommendations.

A class teacher can only act on a class where `Class.classTeacherId` matches their account and only during the configured year-end session. Recommendations are written into the existing `PromotionDecision` table with `status='draft'`. Academic leadership confirms them from the Year Planner, at which point the existing Year-End Rollover engine can consume them. A database guard prevents a confirmed/applied decision from being silently returned to draft.

Promotion still decides the grade. Rollover still decides the target section and creates next-year enrollment; `Student.classId` is not rewritten by this workflow.
