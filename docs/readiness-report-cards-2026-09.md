# Report cards and messaging readiness — September 2026

## Intended report workflow
1. Choose academic year, term and class, then press **Open class reports**.
2. Generate missing draft reports. Missing marks never block a draft download.
3. Open a learner or download their PDF directly. Repeat downloads render the same selected term; they do not depend on an old stored PDF.
4. Missing marks show **Pending**. Recorded zero remains zero. Incomplete results do not acquire a misleading overall average, rank or automatic promotion outcome.
5. Submission, approval and guardian release remain separate authorised actions. Approved version-6 records freeze identity, results, presentation, attendance and calendar context.

## Changes
- Bulk historical roster resolution removes per-learner evidence queries; concurrent requests within a transaction share only in-flight reads.
- Class selection submits explicitly. Generation invalidates the reporting page.
- Report listing, generation and download check academic access; teachers are restricted to assigned classes unless granted school-wide academic access.
- Unicode PDF rendering, pagination, school themes and compact signatories replace the old fixed-length renderer.
- Queue inserts use batches. Provider requests have deadlines; the supervised runtime worker handles SMS and WhatsApp with bounded concurrency and rotates school order.
- Database wallet reservations, retries, delivery receipts and claim fencing remain in place. Provider acceptance is not proof of handset delivery.
- Nursing diploma and BSc degree are separate three- and four-year pathways. Unsupported topics no longer borrow unrelated generic questions. Cosmetic variants are not counted as millions of independent nursing questions.
- Government no longer selects the Law profile because a topic contains the word “evidence”.

## Verification boundaries
CI includes tenant isolation, device HMAC authentication, browser face positioning, lesson review jurisdiction, calculations, queue concurrency and PDF regression tests. Browser smoke generates a partial report and downloads it twice at a mobile viewport.
No physical biometric terminal has been supplied; actual enrollment, scan matching, model-specific connector operation and offline recovery require the chosen device.
No test SMS recipient has been authorised; live carrier delivery must be checked with an authorised recipient.
New nursing pathway maps reflect common Ghana training areas, not accreditation or a claim that every institution teaches identical year-by-year modules. Course banks still require expansion and qualified educator review. Millions of substantive reviewed questions have not been created.
Older approved snapshots may lack identity/calendar fields that were never stored; these cannot be reconstructed as historical facts.

## Curriculum references
- Nursing and Midwifery Council, examination and licensing: https://nmc.gov.gh/web/examination-licensing
- University of Ghana undergraduate nursing: https://nursing.ug.edu.gh/admission/undergraduate-admissions
- Korle Bu diploma RGN: https://www.nmtckb.edu.gh/academics/diploma-rgn.php
- NaCCA secondary curriculum: https://nacca.gov.gh/secondary-education-curriculum/

## Further release work
Complete the live report/mobile checks after the successful exact-commit release gate; refresh the synthetic Eugene Academy fixture without resetting credentials; visually inspect downloaded ID cards and report variants; validate platform administration and plan limits through role-specific browser journeys. Do not describe the whole platform as market-ready based only on these patches.
