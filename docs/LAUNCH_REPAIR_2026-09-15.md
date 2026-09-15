# Launch repair and verification

Work is implemented and tested remotely on GitHub; production runs on Railway.

## Repairs
- CSV learners use canonical intake, guardian and confirmed term enrollment. The school explicitly chooses intake year and placement term; retries serialize by batch.
- Payroll-v2 validates subscription entitlement before reads/writes.
- Personnel staff numbers are used on ID cards and print scopes.
- Setup completion is distinct from operational health; approvals, teaching roles, recorded demographics and net collections are represented accurately.
- New payments capture immutable student identity and historical term/class details. Legacy receipts use term enrollment, never current placement.
- Receipt PDFs bundle an OFL Noto Sans font, wrap long values and paginate; CSV formulas are neutralized.
- Enabled optional modules require certification. Passing evidence requires current deployment SHA, linked evidence and an expiry within 30 days.
- GitHub risk scan identity is restricted to repository ID 1334027943, main and the exact scheduled/manual workflow. Existing authenticated-secret clients remain compatible.
- Railway's build gate waits for successful Build verification for the exact main commit.
- CI includes a production Chromium smoke journey in addition to database integration tests.

## Evidence still required before a school launch
The software must not manufacture a passed certification record for these:
1. A real SMS/provider delivery, failure and retry cycle; inspect queued messages before activating any new sender process.
2. Off-host encrypted backup retention and an isolated restore drill with measured recovery time.
3. Physical device arrival/departure, revocation and offline recovery.
4. Physical ID-card front/back alignment and 80mm printer calibration.
5. Agreed concurrent-school capacity and latency rehearsal.
6. Full teacher/family production journeys and cross-school denial using disposable accounts.

Staff/opening-balance CSV types are clearly preview-only until dedicated writers are certified. Existing staff and finance workflows remain the entry routes.

## Release control
The release gate fails closed when checks fail, are missing, cannot be verified, or time out. It reads public GitHub Actions status and needs no production credential. CI itself uses the regular build command, avoiding a circular dependency. A new deployment invalidates older certification passes.

## Scope of readiness
Green CI establishes tested code behavior. Live deployment checks establish runtime availability. Hardware, providers, recovery and school acceptance require their own observed evidence. Broad launch approval requires all applicable gates to pass on the deployed version.
