# Eugene Academy permanent production demonstration school

Eugene Academy (`eug123`) is SukuuNova's permanent synthetic demonstration tenant. It is intended for product walkthroughs, onboarding rehearsals, stakeholder demonstrations, and collaboration meetings with prospective schools.

The demonstration school is deliberately stored in the normal production database so it behaves like a real tenant and remains available between deployments. All learner, guardian, staff, finance, attendance, transport, feeding, academic, library, visitor, pickup, payroll, and communication records created by the fixture are synthetic.

## Safety model

The production command is separate from the staging/test fixture and requires an exact acknowledgement value before it can touch the database. When running inside Railway it also refuses any environment whose `RAILWAY_ENVIRONMENT_NAME` is not `production`.

The command performs a preflight lookup for school code `eug123`. If that code already belongs to another school name, it refuses to overwrite it. If Eugene Academy already exists, the expected owner account must also exist before an idempotent refresh is allowed.

The fixture uses a dedicated zero-cost subscription plan named `Eugene Academy Demo`, so seeding or refreshing the demonstration tenant does not modify the shared `Foundation` subscription plan. SMS and WhatsApp provider delivery is not invoked by the fixture; communication rows are synthetic internal lifecycle records.

## Required environment variables

- `DATABASE_URL` — the production SukuuNova PostgreSQL database.
- `ALLOW_EUGENE_ACADEMY_PRODUCTION_DEMO_SEED=EUGENE_ACADEMY_ONLY` — explicit one-time acknowledgement.
- `EUGENE_ACADEMY_DEMO_PASSWORD` — the shared demonstration login password, minimum 12 characters. Keep it in Railway variables or another secret store; never commit it.
- `EUGENE_ACADEMY_OWNER_NAME` — optional owner display name.

Run:

```bash
npm run demo:seed-eugene:production
```

After a successful run, remove `ALLOW_EUGENE_ACADEMY_PRODUCTION_DEMO_SEED` from the service variables so an accidental future command cannot reseed the production demonstration tenant. Keep `EUGENE_ACADEMY_DEMO_PASSWORD` available if the team needs a stable login credential for presentations.

## Permanent demo identity

- School name: `Eugene Academy`
- School code: `eug123`
- Owner login: `eugeneacademy@gmail.com`
- Student population target: 225
- Demo subscription plan: `Eugene Academy Demo`

The production seed reuses the verified full-system Eugene Academy fixture and its coverage verifier. A successful run therefore checks the same broad academic, finance, communications, library, transport, operations, access, PDF, and workflow coverage exercised in CI before reporting success.
