# CareLoop

Clinic software for independent Indian clinics and polyclinics. Doctors, front-desk staff and clinic owners use a web dashboard (and later a mobile app); patients get prescriptions and reminders on WhatsApp.

Project rules, stack and milestones live in [`CLAUDE.md`](CLAUDE.md). The current build plan is in [`docs/plans/`](docs/plans/).

## Requirements

- Node.js 24.15 or later (the repo pins 26.13.1 in `.nvmrc`)
- pnpm 12.21 (`npm install -g pnpm@12.21.0`, or `corepack enable` on Node versions that still bundle corepack)
- Docker Desktop, for local Postgres 16 and Redis 7

## First run

```bash
cp .env.example .env          # then replace the placeholder secrets
pnpm install
docker compose up -d          # Postgres on 5432, Redis on 6379
pnpm db:bootstrap             # creates the careloop_owner and careloop_app roles
pnpm db:migrate               # applies migrations (local only; CI uses db:migrate:deploy)
pnpm db:seed                  # made-up demo clinics and staff
pnpm dev
```

The web dashboard runs on http://localhost:3000 and the API on http://localhost:4000. In local development, sign-in codes are printed to the API console instead of being sent by SMS.

## Everyday commands

```bash
pnpm lint
pnpm typecheck
pnpm test                     # unit and database tests (needs docker compose up)
pnpm test:e2e                 # Playwright, web
pnpm --filter api dev         # one app
```

## Operator commands

CareLoop staff create clinics and handle account issues with audited commands. Each needs `OPERATOR_ID` set to the operator's fixed UUID.

```bash
pnpm ops:create-org -- --name "Clinic name" --location "Main branch" --owner-phone 98XXXXXXXX
pnpm ops:unlock-phone -- --phone 98XXXXXXXX
pnpm ops:disable-user -- --phone 98XXXXXXXX
```

## Rotating the JWT secret

Access tokens live for 15 minutes and refresh tokens are stored server-side, so rotating `JWT_SECRET` signs everyone out at most once. Change the value, restart the API, and staff sign in again with a fresh OTP.
