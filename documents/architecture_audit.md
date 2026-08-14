# Architecture Audit: FlexFit Studio

This document contains a comprehensive architectural audit of the FlexFit Studio codebase to prepare for the 2026 i12 HR Drive Hackathon.

The goal of this refactoring is to bring the codebase in line with modern Next.js and TypeScript practices, reduce duplication, extract business logic from routing, and ensure single sources of truth, while **preserving exact runtime behavior**.

---

## 1. Files with Multiple Unrelated Responsibilities

These files violate the Single Responsibility Principle (SRP) by mixing router orchestration, database transactions, and core domain validations in the same file.

### Findings

#### Finding 1.1: `src/server/routers/bookings.ts`
*   **Current File:** [bookings.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/bookings.ts)
*   **Approximate Responsibility:** Handles booking queries (`mine`, `rosterFor`, `upcomingForMember`, `waitlisted`), mutations (`book`, `cancel`, `markAttended`), and implements core business validation (active membership check, credit pools check, and waitlist promotion algorithm).
*   **Why it is problematic:** The router file is acting as a Controller, Validator, and Service Layer simultaneously. Directly writing complex database state updates (like promoting the longest-waiting member and updating credits) inside TRPC mutation blocks makes testing difficult and prevents reusability.
*   **Proposed Responsibility after Refactoring:** The router should only validate request inputs (Zod) and delegate execution to a standalone `BookingService` or `MembershipService` class/module in `src/server/services/booking-service.ts`.
*   **Risk Level:** **Medium** (requires extraction of complex db transaction logic).

#### Finding 1.2: `src/server/routers/reschedules.ts`
*   **Current File:** [reschedules.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/reschedules.ts)
*   **Approximate Responsibility:** Handles reschedule validation and rescheduling mutations.
*   **Why it is problematic:** It mirrors booking logic but operates on reschedules. It performs deep validations (startsAt checks, name checks, availability checks) and creates new booking entities alongside cancelling old booking entities in raw db transactions inside the router procedure.
*   **Proposed Responsibility after Refactoring:** Move reschedule validations and transaction choreography to `src/server/services/reschedule-service.ts`.
*   **Risk Level:** **Medium** (affects complex booking swapping states).

#### Finding 1.3: `src/server/routers/corporate-bookings.ts`
*   **Current File:** [corporate-bookings.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/corporate-bookings.ts)
*   **Approximate Responsibility:** Handles corporate membership booking validations, mutations, and rosters.
*   **Why it is problematic:** Re-implements booking logic for a different booking table/mechanism. It manages corporate credit check and credit deduction workflows directly inside tRPC mutations.
*   **Proposed Responsibility after Refactoring:** Delegate corporate booking mutations to a `CorporateBookingService` in `src/server/services/corporate-booking-service.ts`.
*   **Risk Level:** **Medium**.

#### Finding 1.4: `src/server/routers/trainers.ts`
*   **Current File:** [trainers.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/trainers.ts)
*   **Approximate Responsibility:** Handles trainer schedule lookups, availability setting, and the trainer schedule overlap calculation algorithm.
*   **Why it is problematic:** The `checkAvailability` algorithm performs mathematical datetime operations and filters db rows inside the route handler.
*   **Proposed Responsibility after Refactoring:** The validation logic should be moved to `src/server/services/trainer-schedule-service.ts` or a date utility module.
*   **Risk Level:** **Low**.

---

## 2. Repeated Business Logic

There are several areas where the same validation rules or computations are repeated across multiple endpoints.

### Findings

#### Finding 2.1: Class startsAt & cancellation time validation (`hoursUntil`)
*   **Current Files:** 
    *   [bookings.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/bookings.ts#L16-L18)
    *   [reschedules.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/reschedules.ts#L18-L20)
    *   [corporate-bookings.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/corporate-bookings.ts#L20-L22)
*   **Approximate Responsibility:** Calculates hours remaining until class starts.
*   **Why it is problematic:** The function `hoursUntil` is copy-pasted in all three files. If the date parsing library changes or timezones need to be adjusted, it must be changed in three places.
*   **Proposed Responsibility after Refactoring:** Move `hoursUntil` to a shared utility file, e.g., `src/lib/date.ts`.
*   **Risk Level:** **Low** (pure helper extraction).

#### Finding 2.2: Active membership queries (`activeMembershipFor`)
*   **Current Files:** 
    *   [bookings.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/bookings.ts#L20-L37)
    *   [reschedules.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/reschedules.ts#L22-L39)
*   **Approximate Responsibility:** Queries the database for a user's active membership based on current date.
*   **Why it is problematic:** Identical implementation query logic is duplicated across multiple routers.
*   **Proposed Responsibility after Refactoring:** Place in a centralized query repository or a service method inside `src/server/services/membership-service.ts`.
*   **Risk Level:** **Low**.

#### Finding 2.3: Check-in / Attendance Logging
*   **Current Files:**
    *   [bookings.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/bookings.ts#L257-L293) (`markAttended`)
    *   [corporate-bookings.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/corporate-bookings.ts#L267-L302) (`markAttended`)
*   **Approximate Responsibility:** Marks bookings as "attended" and logs the check-in event.
*   **Why it is problematic:** The mutation sequence is duplicated.
*   **Proposed Responsibility after Refactoring:** Consolidate check-in mutations under a shared `CheckInService` or common method since the database actions are nearly identical.
*   **Risk Level:** **Low**.

---

## 3. Repeated Database Query Patterns

### Findings

#### Finding 3.1: Booking count / Capacity check sub-queries
*   **Current Files:**
    *   [classes.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/classes.ts#L36-L40) (`booked` count)
    *   [admin.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/admin.ts#L72-L76) (`booked` count)
    *   [bookings.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/bookings.ts#L127-L132) (`isFull` calculation)
    *   [reschedules.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/reschedules.ts#L163-L168) (`targetIsFull` check)
    *   [corporate-bookings.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/corporate-bookings.ts#L131-L139) (`isFull` check)
*   **Approximate Responsibility:** Queries the bookings table to verify how many active ("booked") registrations exist for a given class.
*   **Why it is problematic:** Sub-queries or counting aggregations are rewritten in slightly different ways. For example, `classes.ts` counts bookings where `status = 'booked'`, whereas `admin.ts` checks `status in ('booked', 'attended')`. This inconsistency can lead to diverging definitions of "capacity" vs "occupancy".
*   **Proposed Responsibility after Refactoring:** Create a reusable query helper `getClassBookingCount(db, classId, options)` or query builders in `src/server/db/queries/bookings.ts`.
*   **Risk Level:** **Medium** (ensure status filters match exactly where required by current behavior).

---

## 4. Business Rules That Should Have a Single Source of Truth

Hardcoded policy definitions are spread across several files.

### Findings

#### Finding 4.1: Cancellation & Rescheduling Hours thresholds
*   **Current Files:**
    *   [bookings.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/bookings.ts#L11) (`FREE_CANCELLATION_HOURS = 12`)
    *   [reschedules.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/reschedules.ts#L16) (`FREE_RESCHEDULE_HOURS = 4`)
    *   [corporate-bookings.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/corporate-bookings.ts#L18) (`CORPORATE_FREE_CANCELLATION_HOURS = 24`)
*   **Approximate Responsibility:** Determines policy windows for free cancellation/rescheduling.
*   **Why it is problematic:** If the business changes these rules (e.g. standardizing cancellation time), developer has to scan router files to change numbers.
*   **Proposed Responsibility after Refactoring:** Centralize all business rules in a configuration configuration file: `src/lib/constants/policies.ts`.
*   **Risk Level:** **Low** (constants only).

#### Finding 4.2: Unlimited Credits threshold (`999`)
*   **Current Files:**
    *   [bookings.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/bookings.ts#L14) (`UNLIMITED_CREDITS = 999`)
    *   [dashboard/page.tsx](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/app/dashboard/page.tsx#L72) (`creditsRemaining >= 999 ? "Unlimited" : ...`)
*   **Approximate Responsibility:** Marks infinite credit memberships.
*   **Why it is problematic:** Hardcoded in both the backend router and the frontend page components independently.
*   **Proposed Responsibility after Refactoring:** Centralize in `src/lib/constants/policies.ts`.
*   **Risk Level:** **Low**.

---

## 5. UI Pages Containing Too Much Business or Data-Fetching Logic

React pages should consume formatted data and trigger mutations, rather than performing calculations or triggering N+1 fetches.

### Findings

#### Finding 5.1: Trainer Schedule N+1 query trigger
*   **Current File:** [trainer/schedule/page.tsx](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/app/trainer/schedule/page.tsx#L8-L12)
*   **Approximate Responsibility:** Displays upcoming classes and lists check-in/booking summaries.
*   **Why it is problematic:** In `ClassCard`, it runs two independent tRPC queries per class (`rosterFor` and `checkinCountFor`). On a dashboard containing 10 classes, this generates 20 parallel network requests on mount.
*   **Proposed Responsibility after Refactoring:** Update the `trainers.upcomingClasses` query on the backend to join class records with their respective roster counts and check-in counts. This resolves the N+1 issue into a single database join.
*   **Risk Level:** **Medium** (requires altering returned query objects and frontend prop mapping).

#### Finding 5.2: Client-side filtering in Reschedule Modal
*   **Current File:** [reschedule-modal.tsx](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/components/reschedule-modal.tsx#L30-L42)
*   **Approximate Responsibility:** Filters classes with matching names to display targets for rescheduling.
*   **Why it is problematic:** It fetches *all* active classes from the database and filters them client-side by name. Also, it fails to filter out the *current* class, allowing the user to select the same class they are already in (which then fails validations on the backend).
*   **Proposed Responsibility after Refactoring:** Update the backend query (`classes.list`) to accept an optional name or booking exclusion parameter so filtering happens at the DB level, and ensure the current class is excluded.
*   **Risk Level:** **Low**.

#### Finding 5.3: Kiosk page duplication of status logic
*   **Current File:** [kiosk/page.tsx](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/app/kiosk/page.tsx#L50-L54)
*   **Approximate Responsibility:** Evaluates whether a membership is expired or has zero credits left.
*   **Why it is problematic:** The client component duplicates logic for calculating membership expiration date and checking remaining credit pools. This should be computed on the backend.
*   **Proposed Responsibility after Refactoring:** The `members.byId` endpoint should return pre-computed flags like `isExpired` and `hasCreditsRemaining` so the UI remains purely presentation-focused.
*   **Risk Level:** **Low**.

---

## 6. Large Router Files

### Findings

*   **`src/server/routers/bookings.ts`** (406 lines) and **`src/server/routers/reschedules.ts`** (382 lines) are bloated with raw Drizzle syntax.
*   **Why it is problematic:** Long files increase merge conflicts and are difficult to scan.
*   **Proposed Responsibility after Refactoring:** Extract query-building blocks (Drizzle `.select()`, `.where()`) into a repository layer (`src/server/db/queries/...`) and move update operations into services (`src/server/services/...`), reducing router files to under 100 lines each.
*   **Risk Level:** **Medium**.

---

## 7. Components That Should Be Extracted

Several parts of page templates are large, nested, or inline, and would benefit from extraction into standalone reusable components.

### Findings

#### Finding 7.1: Trainer Availability Editor
*   **Current File:** [trainer/schedule/page.tsx](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/app/trainer/schedule/page.tsx#L131-L225)
*   **Approximate Responsibility:** Renders and edits trainer weekly availability.
*   **Why it is problematic:** Mixes availability form state, date conversion, and UI elements directly inside the main `TrainerSchedulePage` component.
*   **Proposed Responsibility after Refactoring:** Extract into `TrainerAvailabilityManager` or `AvailabilityDayRow` inside `src/components/trainer/`.
*   **Risk Level:** **Low**.

#### Finding 7.2: Inline Class Card
*   **Current File:** [trainer/schedule/page.tsx](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/app/trainer/schedule/page.tsx#L7-L36)
*   **Approximate Responsibility:** Renders classes details.
*   **Why it is problematic:** Defined as a static function inside the page file, violating file modularity.
*   **Proposed Responsibility after Refactoring:** Move to its own component file `src/components/trainer/trainer-class-card.tsx`.
*   **Risk Level:** **Low**.

#### Finding 7.3: Dashboard list items
*   **Current File:** [dashboard/page.tsx](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/app/dashboard/page.tsx#L100-L140)
*   **Approximate Responsibility:** Displays individual upcoming bookings with bookings.
*   **Why it is problematic:** Large HTML layout inline makes page template hard to read.
*   **Proposed Responsibility after Refactoring:** Extract booking row items to `src/components/booking/booking-list-item.tsx`.
*   **Risk Level:** **Low**.

---

## 8. Suspicious or Inconsistent Patterns

These represent inconsistencies in current code organization and logic between different booking flows.

### Findings

#### Finding 8.1: Kiosk check-in ignores corporate bookings
*   **Current File:** [kiosk/page.tsx](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/app/kiosk/page.tsx)
*   **Problem:** The Kiosk search only pulls bookings from the `bookings` table via `trpc.bookings.upcomingForMember`. It does not search the `corporateBookings` table. As a result, corporate members cannot check in using the Kiosk interface.
*   **Risk Level:** **High** (fixing this requires combining both tables' results in a unified checkin lookup mechanism, which changes query formats).

#### Finding 8.2: Corporate Check-in database logs are incomplete
*   **Current File:** [corporate-bookings.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/corporate-bookings.ts#L296-L299)
*   **Problem:** When a corporate booking check-in is logged:
    ```typescript
    await ctx.db.insert(checkins).values({
      userId: booking.userId,
      bookingId: null,
    });
    ```
    1. The `bookingId` field is set to `null` because the `checkins` table schema `bookingId` column references `bookings.id` (which is standard member bookings, not corporate).
    2. The `source` column is omitted, which falls back to the SQLite default `'front_desk'`.
    Consequently, there is no way to relate corporate check-in records to their original corporate booking or track if checkin was kiosk/app/front-desk, rendering attendance analytics broken.
*   **Risk Level:** **Medium** (structural/schema change would be needed to clean this up, but keeping behavior exact requires leaving schema intact and finding a query workaround).

#### Finding 8.3: Reschedules skip waitlist promotions
*   **Current File:** [reschedules.ts](file:///c:/Users/Uzair/OneDrive/Documents/i12-hackathon/flexfit-studio/src/server/routers/reschedules.ts#L194-L201)
*   **Problem:** In `bookings.ts` cancel procedure, cancelling a booking triggers a search for waitlisted bookings to promote the next member. However, in `reschedules.ts`'s reschedule procedure, the original booking is simply set to `"cancelled"` without triggering a waitlist promotion. The class spot is freed, but waitlisted members are left waiting.
*   **Risk Level:** **Medium** (fixing this discrepancy requires calling waitlist promotion during reschedule, which modifies behavior. If behavior must remain *exactly* the same, this gap must be preserved or documented as a bug to be addressed post-refactor).

---

## 9. Proposed Target Folder Structure

A structured target directories layout complying with Next.js App Router and Clean Architecture conventions:

```
src/
├── app/                      # App router page routing & page layouts
│   ├── (auth)/               # Auth page routes (login/signup)
│   ├── admin/                # Admin-level pages
│   │   └── companies/
│   │       ├── page.tsx
│   │       └── [id]/page.tsx
│   ├── trainer/              # Trainer-level pages
│   │   └── schedule/
│   │       └── page.tsx
│   ├── dashboard/            # Member dashboard page
│   │   └── page.tsx
│   ├── kiosk/                # Kiosk check-in screen
│   │   └── page.tsx
│   ├── layout.tsx
│   └── page.tsx
│
├── components/               # Pure UI Component Library
│   ├── ui/                   # Reusable base styles & components (Button, Modal, etc.)
│   ├── booking/              # Booking specific components (BookingListItem, etc.)
│   ├── trainer/              # Trainer specific components (AvailabilityRow, ClassCard)
│   └── reschedule-modal.tsx
│
├── db/                       # Database initialization and schema
│   ├── index.ts
│   ├── schema.ts
│   └── seed.ts
│
├── lib/                      # Cross-cutting, environment-independent utilities
│   ├── constants/            # Single sources of truth for business rules & constants
│   │   └── policies.ts       # Cancellation windows, unlimited credit values, etc.
│   ├── format.ts
│   ├── date.ts               # Extracted hoursUntil and date arithmetic functions
│   └── trpc.ts
│
└── server/                   # Backend-only logic
    ├── trpc.ts               # Context, procedures definitions
    ├── routers/              # Controllers / Routing Layer (Zod inputs & outputs only)
    │   ├── _app.ts
    │   ├── bookings.ts       # Simplified routing handlers
    │   ├── reschedules.ts
    │   └── ...
    └── services/             # Core Domain Business Logic (Transactions & validations)
        ├── booking-service.ts
        ├── reschedule-service.ts
        ├── trainer-schedule-service.ts
        └── corporate-booking-service.ts
```

---

## 10. Prioritized Refactoring Plan (Safest to Riskiest)

To minimize regression risks, the refactor should be executed in phases:

### Phase 1: Constants and Pure Utilities (Risk: **Very Low**)
*   **Step:** Extract hardcoded constants like `UNLIMITED_CREDITS` and `FREE_CANCELLATION_HOURS` to `src/lib/constants/policies.ts`.
*   **Step:** Extract `hoursUntil` from routers into `src/lib/date.ts`.
*   **Reasoning:** Only moves static configurations and stateless pure helper functions. No database/mutation changes are made. Easy to verify via compilation.

### Phase 2: Client Component Modularization (Risk: **Low**)
*   **Step:** Extract inline components like `ClassCard` in `trainer/schedule/page.tsx` and dashboard list elements into their own modular files in `src/components/`.
*   **Step:** Move client-side helper logic (like kiosk status evaluation) to cleaner presentation selectors.
*   **Reasoning:** UI component extraction changes file locations but retains identical React code logic and query consumption patterns.

### Phase 3: Query Consolidation and Optimization (Risk: **Low-Medium**)
*   **Step:** Refactor client-side filtering in `reschedule-modal.tsx` to utilize query parameters in the tRPC router instead of downloading all classes.
*   **Step:** Group repeated database queries (like `activeMembershipFor` and class booking counters) into a centralized repository helper file or reuse functions.
*   **Reasoning:** Changes query structures and introduces database aggregation optimizations, but doesn't change database mutations.

### Phase 4: Trainer Dashboard N+1 Query Fix (Risk: **Medium**)
*   **Step:** Restructure `trainers.upcomingClasses` query to return joined count figures, allowing the removal of duplicate queries in the loop.
*   **Reasoning:** Requires matching the new returned schema shapes to existing UI variables, modifying how the trainer schedule displays metrics.

### Phase 5: Service Layer Extraction and Transaction Refactoring (Risk: **Medium-High**)
*   **Step:** Extract transaction blocks, capacity validation, waitlist promotions, and credit manipulations from `bookings.ts`, `corporate-bookings.ts`, and `reschedules.ts` into centralized backend services in `src/server/services/`.
*   **Reasoning:** Modifies how SQL queries are executed within transactions. High risk of regressing credit allocation or waitlisting rules if db sessions are shared incorrectly.
*   **Mitigation:** Run standard manual test cases for member check-in, bookings, cancellations, and reschedules back-to-back to verify database entries remain identical before and after extraction.
