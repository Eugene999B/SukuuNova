# Academic Structure Engine

## Purpose

SukuuNova already preserves a learner's official term-bound class through `Enrollment`. The Academic Structure Engine adds the missing semantics above that history: which grade a class belongs to, which academic year a section belongs to, how levels progress, when a pathway is required, and how the next academic year is created safely.

The core rule is deliberate:

> Promotion decides the learner's next grade. Placement decides the learner's section.

A learner moving from Basic 1B is therefore promoted to **Basic 2**, not hard-wired to **Basic 2B**. The rollover planner subsequently chooses a valid Basic 2 section using the school's section/pathway/capacity setup.

## Data layers

- `AcademicFramework` — one configurable curriculum/structure for a school.
- `GradeLevel` — canonical level such as Basic 1, Year 7, Montessori Lower Elementary or TVET Level 2.
- `AcademicPathway` — branch/programme such as General Science, Business, Engineering or ICT.
- `GradeProgressionRule` — directed progression edge. Supports branching instead of a single `nextGradeId`.
- `ClassSection` — maps an existing `Class` to a grade, academic year and optional pathway. A/B/C are sections, not grades.
- `StudentYearEnrollment` — durable learner+academic-year+grade fact.
- `PromotionDecision` — promoted/retained/graduated/transferred/withdrawn/deferred decision independent of section placement.
- `AcademicYearRollover` / `AcademicYearRolloverItem` — auditable Preview -> Validate -> Commit plan.

`Enrollment` remains the canonical learner+term+class record. `Student.classId` remains a compatibility/current-projection field and is intentionally not rewritten by rollover.

## Built-in presets

The engine ships presets, but the runtime never hard-codes their names or sequence.

- Ghana Standard: Creche -> Nursery 1 -> Nursery 2 -> KG 1 -> KG 2 -> Basic 1-6 -> JHS 1-3 -> SHS 1-3.
- British / Year System: Nursery, Reception, Year 1-13.
- American / Grade System: Pre-K, Kindergarten, Grade 1-12.
- Cambridge International: Early Years, Primary stages, Lower Secondary, Upper Secondary and Advanced.
- Montessori: configurable Montessori developmental stages.
- TVET / Technical: foundation and competency levels with programme pathways.
- International Baccalaureate: PYP, MYP and DP stages.
- Custom: API primitives allow a school to create its own framework, levels, pathways and progression graph.

## Ghana pathways

The Ghana preset includes selectable SHS programme pathways: General Science, General Arts, Business, Home Economics, Visual Arts and Technical / Vocational. SHS levels are marked as pathway-required so a JHS 3 learner cannot silently roll into an unspecified senior-high programme.

## Migration and compatibility

The rollout is intentionally additive.

1. Existing `Class`, `Student.classId` and `Enrollment` records remain unchanged.
2. A school installs a framework or creates a custom one.
3. Existing classes are mapped into `ClassSection` for a specific academic year.
4. Official historical term enrollments for that mapped class reconstruct `StudentYearEnrollment` automatically.
5. Future term `Enrollment` writes keep the year-grade record synchronized.
6. Once a class participates in official term history, changing its grade/pathway meaning is blocked.

No migration guesses grade semantics from the legacy free-text `Class.level` field.

## Rollover lifecycle

### Preview

The planner reads the source year's active year enrollments, explicit promotion decisions, default progression rules, target-year sections and existing target section loads. It returns a deterministic plan and blockers without writing student history.

### Validate / Prepare

A persisted rollover plan is `validated` only when every learner is resolvable. Typical blockers are:

- no progression rule;
- required pathway not selected;
- no target section;
- all valid sections at capacity;
- deferred promotion decision;
- learner already enrolled in the target year.

### Commit

Commit is transactional and advisory-lock protected. It:

- marks source year enrollment completed/retained/graduated/transferred/withdrawn;
- creates the target `StudentYearEnrollment` for moving learners;
- creates draft `Enrollment` rows for each target-year term using the resolved section;
- marks applied promotion decisions and rollover items;
- writes a school audit event;
- does **not** rewrite `Student.classId`.

Target draft term enrollments still need the normal enrollment readiness/confirmation workflow before term-bound academic operations treat them as official.

## Security and integrity

Every new table is tenant-owned, has composite same-school foreign keys where applicable, and has FORCE ROW LEVEL SECURITY using `app.current_school_id`. Cross-framework grade/pathway combinations are rejected by database triggers. Open rollover plans are unique per school/source-year/target-year/framework, and committed runs are immutable through the application service.

## Transition rule for report-card promotion

When a learner's historical class has an Academic Structure mapping, final-term promotion should be represented as `PromotionDecision` and applied through year rollover. Legacy class-to-class `classProgression` remains only as a compatibility path for schools not yet migrated to the Academic Structure Engine.
