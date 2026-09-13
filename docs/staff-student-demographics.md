# Staff and student demographics

SukuuNova keeps authentication identity separate from personnel and learner demographics.

## Staff

`User` remains the login, role and permission identity. `StaffProfile` is the school-owned personnel record for staff number, gender, date of birth, nationality, date joined, workforce type/category, job title, department, employment status/type, qualifications, residential address, emergency contact and internal personnel notes.

Existing school staff are backfilled with a profile and stable staff number. Legacy records are not assigned a guessed gender, date of birth or joining date. Those remain visibly incomplete until an authorised user records them.

New staff created from Staff & Teachers must select gender. The registration flow persists workforce metadata into `StaffProfile`, while teaching assignments and access roles continue to use the existing academic and RBAC tables.

`StaffProfile` has school-tenant RLS and is edited only through existing `users:write` authority.

## Students

The official `Student` record now stores canonical gender values:

- `female`
- `male`
- `other`
- `prefer_not_to_say`

Admissions already captured gender before this change. The migration backfills official students from their converted admission applications where possible. New submitted admission applications require gender, values are normalized by the database, and completing enrollment synchronizes the application gender to the new `Student` record.

Legacy students with no recoverable value remain `NULL` and are shown as **Not recorded** rather than guessed.

Student profile editing can correct or add gender without changing the learner's index number or academic history.

## Analytics

The Staff directory reports total staff, teachers, female, male, active login and missing-gender counts. The Student register reports active learners, female, male, missing-gender and placement counts. Missing data is deliberately surfaced so schools can improve record quality instead of silently excluding people from statistics.
