# CareLoop

Clinic software for independent Indian clinics and polyclinics, covering many specialties. Doctors, front-desk staff and clinic owners use a web dashboard and a mobile app. Patients get prescriptions and reminders on WhatsApp.

## Status

- **Stage:** pre-MVP; the repo is being scaffolded. The stack and layout below are decided. If a folder, script or helper named here does not exist yet, create it as described instead of choosing something different.
- **Current milestone:** M1 Foundation <!-- update this line when a milestone closes -->
- Work only on the current milestone unless asked. The milestone table is at the end.

## Hard rules

These apply to every change. If a task seems to need breaking one, stop and ask.

1. **No patient data in logs, errors, analytics or crash reports.** Log record IDs only.
2. **WhatsApp and SMS text never names a diagnosis, medicine or test result.** Clinical content goes in a PDF behind a signed, expiring link.
3. **Every tenant table has `organisationId` and a row-level security policy.** No query crosses organisations.
4. **Every read or write of clinical data adds an `AuditLog` row:** who, which record, when.
5. **Permissions are enforced in the API,** never only in the UI. Restricted visit sections are returned only to permitted roles.
6. **AI output is a draft.** Nothing AI-generated is saved to a record or sent to a patient until a doctor approves it. No feature diagnoses or recommends treatment.
7. **Never add a field, note or AI output that could reveal foetal sex** (PCPNDT Act).
8. **Money is integer paise. Timestamps are UTC `timestamptz`,** displayed in Asia/Kolkata. Dates of birth and LMP are plain dates.
9. **Seeds, fixtures and tests use made-up data only.** No real patient data, screenshots or production dumps in the repo.
10. **Secrets come from environment variables.** Never commit keys.

## Ask before you

- add a dependency
- change `packages/db/prisma/schema.prisma` or write a migration
- touch auth, row-level security or audit logging
- send patient data to a new third-party service

Unsure about a medical or legal rule? Leave `TODO(compliance): <question>` in the code and list it in the PR description. Do not guess.

## Product in brief

- **Core (every clinic):** appointments and token queue, patient record, visits, prescriptions, billing, WhatsApp reminders.
- **Specialty packs:** versioned configuration that adds forms, charts, templates and reminder schedules for one specialty. MVP packs: General Practice, Pediatrics, Gynaecology, Dermatology.
- **Polyclinic layer:** departments and a multi-doctor front desk now; referrals, one bill per visit and revenue share later.
- **Out of scope:** pharmacy or chemist product, online medicine sales, doctor-discovery marketplace, insurance claims. Do not build toward these.

## Stack

| Layer | Choice |
| --- | --- |
| Repo | pnpm workspaces + Turborepo, TypeScript strict |
| API | NestJS, REST, WebSockets for the live queue |
| Jobs | BullMQ on Redis (reminders, WhatsApp sends, PDFs) |
| Database | PostgreSQL 16 + Prisma, row-level security per organisation |
| Web | Next.js App Router, Tailwind, shadcn/ui |
| Mobile | Expo (React Native), Android first |
| Validation | Zod schemas in `packages/shared` |
| AI | Python service in `services/ai` |
| Hosting | India region only |

## Layout

```
apps/api        NestJS API, one folder per feature under src/
apps/web        Next.js dashboard
apps/mobile     Expo app (doctor, front desk, owner modes)
apps/worker     BullMQ processors
services/ai     Python: transcription and scribe
packages/shared Zod schemas, types, constants
packages/db     Prisma schema, migrations, seed
packages/forms  Specialty-pack form renderer and calculators
packages/packs  Specialty pack definitions: <slug>/<version>/
packages/ui     Shared web components
```

## Commands

```bash
pnpm dev                  # all apps, watch mode
pnpm --filter api dev     # one app
pnpm lint
pnpm typecheck
pnpm test                 # unit tests
pnpm test:e2e             # Playwright, web
pnpm db:migrate           # prisma migrate dev
pnpm db:seed              # made-up demo clinics and patients
pnpm packs:validate       # check every pack against the pack meta-schema
```

## Data model

- `Organisation → Location → Department → User`. Roles: owner, doctor, front desk.
- A `Patient` belongs to one organisation and is shared by all its doctors.
- A `Visit` has exactly one `specialtyPackId` and `packVersion`. Pack answers go in `Visit.visitData` (JSONB), validated against that pack version.
- Anything trended or exported (weight, BP, sugar, HbA1c) is also written to `Observation` with a code, value, unit and time. Charts read `Observation`, never the JSONB.
- `Prescription → PrescriptionItem`. Generic name is required, brand optional. The PDF prints the doctor's name, qualification and registration number.

## Conventions

- No `any` without a comment saying why.
- Parse every API input with a Zod schema from `packages/shared`; web and mobile import the same schema.
- API features live in `apps/api/src/<feature>/`: `patients`, `appointments`, `visits`, `prescriptions`, `billing`, `packs`.
- Web: server components by default; `'use client'` only where interaction needs it.
- User-facing text goes through i18n keys (`en`, `hi`). No hard-coded strings.
- Conventional commits (`feat:`, `fix:`, `chore:`). One concern per PR.

## Done means

- `pnpm lint && pnpm typecheck && pnpm test` pass.
- A new tenant table ships with its RLS policy and a test that organisation A reads zero rows of organisation B.
- New money logic or a new calculator ships with unit tests built on worked examples.
- A pack change passes `pnpm packs:validate`.
- The critical path still passes in Playwright: register patient → book → visit → prescription → bill → reminder queued.

## Milestones

| Code | Name | Delivers |
| --- | --- | --- |
| M1 | Foundation | Monorepo, CI, environments, OTP sign-in, roles, tenancy with RLS, audit log, seed data |
| M2 | Front desk | Patients, appointments, tokens, live queue screen, booking link, WhatsApp reminders |
| M3 | Consultation | Visit screen, medicine database, prescription builder and PDF, follow-ups, observations |
| M4 | Billing and reports | Charges, receipts, UPI QR, day-end summary, basic reports, subscriptions |
| M5 | Specialty packs | Pack format and validator, form renderer, the 4 MVP packs |
| M6 | Mobile and polyclinic desk | Expo doctor mode, packs on mobile, multi-doctor front desk, data import, Hindi |
| M7 | Pilot hardening | Security fixes, consent log, data export and erasure, monitoring, backup drill |

Not yet, unless asked: AI scribe, ABDM integration, referrals and revenue share, video consultations.

## Scoped rules

- `.claude/rules/specialty-packs.md` applies in `packages/packs` and `packages/forms`.
- `.claude/rules/ai-features.md` applies in `services/ai` and `apps/api/src/ai`.