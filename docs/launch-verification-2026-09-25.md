# Launch verification — 25 September 2026

## Evidence included in this release
- Authenticated HTTP/browser journey: import and confirmed enrolment; partial report generation and repeated Unicode PDF downloads; complete marks; assigned-teacher submission; separate owner approval; family-portal login and linked-parent approved PDF access; guardian denial from staff report-list and approval APIs; regeneration denial after approval; failed delivery leaves the report approved.
- Denial checks: anonymous PDF, parent draft access, parent approval, owner submission without class-teacher assignment, self-approval, cross-school report ID, final-term submission without a progression recommendation.
- Screen and API now use the academic calendar's year-end authority and the same submission guard. The class overview gives a learner-selection prompt instead of incorrectly saying that generated reports do not exist.
- Persisted SMS delivery tests cover duplicated and out-of-order receipts, terminal failure followed by delivery, and invalid statuses without external sends.

## Already live before this release
225 synthetic Eugene Academy learners across the three 2025/2026 terms and current 2026/2027 Term 1; 2,050 missing current-term scores added; remarks, development ratings and elapsed attendance filled. Issued reports and login credentials preserved. Complete current and historical PDFs downloaded on production.
One owner-authorised SMS was accepted by Arkesel. Handset receipt is not yet confirmed. No further SMS is authorised by this document.

## Still required before broad rollout
- Confirm handset receipt and provider balance/units; perform an explicitly authorised small bulk delivery trial.
- Actual biometric-device and face-enrolment tests.
- Full platform-admin/subscription lifecycle and every school role's UI journey.
- Restore a production backup into a separate environment, then verify it; establish ongoing monitoring and realistic concurrent-load evidence.
- Subject-expert review and expansion of learning content; there are not millions of reviewed questions.
- Finish the broader identity-card/receipt design review and physical print checks.

Passing the automated suite and these selected journeys is not a certification that every feature is error-free.
