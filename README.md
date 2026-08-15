# FlexFit Studio

Class booking and membership management for a single gym site. Members book classes, buy memberships and spend class credits. Staff run the front desk, manage trainers and pull reports. Companies buy credit pools their employees book against.

## Requirements

Node 20 or newer, and pnpm. If you don't have pnpm:

```bash
npm install -g pnpm
```

The database is SQLite and lives in a file. There's no server to install and no account to create.

## Getting set up

```bash
pnpm install
pnpm db:push
pnpm db:seed
pnpm dev
```

That gets you a populated studio at http://localhost:3000 with a couple of weeks of classes either side of today.

`db:push` creates `flexfit.db` and applies the schema. `db:seed` fills it with sample members, plans, classes and bookings.

## Signing in

| Role    | Email                  | Password   |
| ------- | ---------------------- | ---------- |
| Admin   | admin@flexfit.test     | admin123   |
| Trainer | arjun@flexfit.test     | trainer123 |
| Member  | rahul.k@example.com    | member123  |

Every seeded member uses `member123`. The other member emails are in `src/db/seed.ts`.

## Commands

| Command         | What it does                                      |
| --------------- | ------------------------------------------------- |
| `pnpm dev`      | Development server on port 3000                    |
| `pnpm build`    | Production build                                   |
| `pnpm db:push`  | Apply the schema in `src/db/schema.ts`             |
| `pnpm db:seed`  | Wipe the data and reseed                           |
| `pnpm db:reset` | Delete the database file, then push and seed again |

`db:reset` is the one you want when the data gets into a state you don't like. It's destructive and it's meant to be.

## Two things that will waste your time

Don't run `pnpm build` while `pnpm dev` is running. The build writes over the directory the dev server is using and the app starts throwing `MODULE_NOT_FOUND`. Nothing is actually broken. Stop the dev server, delete `.next`, start it again. If you want to typecheck while the server is up, use `npx tsc --noEmit` instead.

If you're changing anything in `src/db/schema.ts`, run `pnpm db:push` afterwards or the app and the database will disagree with each other in confusing ways.

## Layout

```
src/
  app/          routes and pages
  components/   shared components
  db/           schema, client, seed data
  lib/          helpers
  server/       tRPC routers
documents/      empty, for your own notes
```

## Summary of Refactoring Changes

Below is a summary of the improvements and optimizations implemented across the codebase:

### 1. Extraction of Pure Utilities & Constants (Batch 1)
- Centrally defined business policy limits (e.g., free cancellation hours, unlimited credit thresholds) in `src/lib/constants/policies.ts`.
- Extracted and centralized time calculation helpers into `src/lib/date.ts` (e.g., `hoursUntil`).

### 2. UI Component Extractions (Batch 2)
- Modularized complex pages by extracting reusable components:
  - `AvailabilityEditor`: Extracted trainer availability logic to `src/components/trainer/availability-editor.tsx`.
  - `TrainerClassCard`: Extracted class display items to `src/components/trainer/trainer-class-card.tsx`.
  - `BookingListItem`: Extracted dashboard items to `src/components/booking/booking-list-item.tsx`.

### 3. Shared Query Layer (Batch 3)
- Created reusable database query modules:
  - `src/server/db/queries/memberships.ts`: Consolidates user active membership checks.
  - `src/server/db/queries/bookings.ts`: Standardizes booking count calculations and SQL helpers.

### 4. Query Consolidation & Optimization (Batch 4)
- Optimized trainer scheduling dashboard queries by joining booking rosters and check-in counts using aggregate SQL subqueries inside `trainers.upcomingClasses` endpoint (resolving client-side N+1 queries).
- Shifted same-name class filtering in the `RescheduleModal` directly into database query parameters, avoiding client-side overhead.

### 5. Service Layer Separation (Batch 5)
- Decoupled business rules and transactions from tRPC endpoints by creating dedicated domain services:
  - `booking-service.ts`: Manages standard bookings, cancellations, and waitlist queues.
  - `reschedule-service.ts`: Handles rescheduling validations and swap transactions.
  - `corporate-booking-service.ts`: Manages corporate pool credits and corporate bookings/check-ins.
- Kept the standard routers clean, thin, and strictly controller-focused.
- Maintained exact behavior-preservation constraints (e.g., rescheduling waitlist skip, corporate check-in logs).

### 6. Loading State Regression Fix
- Resolved an infinite refetching loop on the `/schedule` page and within the `RescheduleModal` by memoizing query dates via `useState`/`useEffect` hooks, stabilizing React Query cache keys.

