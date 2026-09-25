# Complete academic demonstration — 25 September 2026

Eugene Academy (eug123) is a synthetic school. Its demonstrations must not be mistaken for real learner achievements.

## Guarded refresh
`scripts/complete-eugene-academic-demo.ts` requires the exact school name, owner, code, two existing three-term years, 200–300 active SNT-prefixed synthetic learners, and `ALLOW_EUGENE_ACADEMY_ACADEMIC_DEMO=EUGENE_ACADEMY_ONLY`.
It preserves existing calendars, passwords, issued reports and their marks. It confirms unfinished synthetic enrolments, fills missing assessments/scores, adds teacher/head remarks, and records weekday attendance only through today, excluding configured closures. Withdrawn learners are excluded.

The completed 2025/2026 year provides historical report demonstrations. The ongoing 2026/2027 term includes simulated exam marks solely for demonstrations. Future terms retain their calendar but receive no fictitious future attendance or results.

The refresh calculates and renders a PDF for each populated class in each processed term before recording completion. CI runs it twice to check the one-time marker. It never sends fixture SMS or changes financial ledgers.

Open **Report Cards**, choose the year, term and class, then **Open class reports**. Use **Download PDF** beside a learner or **Print / save class PDF** for the class.

## One authorised handset test
`scripts/verify-authorized-sms.ts` accepts one exact run key. A committed audit claim limits it to a single provider call to the owner's explicitly approved handset, including after uncertain network failure. It does not enable delivery to synthetic guardian numbers. Provider acceptance alone does not prove handset delivery.

After verification, disable both execution flags in Railway. Further edits to the demo are preserved by the completion marker.

## Learning corrections
Nursing chart questions now refer to the assessment/action table they actually display. Distinct medication arithmetic exercises survive prompt deduplication. Mixed-topic sessions rotate formats across catalogue passes instead of locking a topic to one format.

This release does not claim millions of authored questions or full curriculum accreditation. Nursing diploma/degree content still needs sustained subject-expert expansion.
