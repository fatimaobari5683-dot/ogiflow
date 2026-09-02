# LogiFlow — Project Constitution

This file is the source of truth for how LogiFlow is actually built. It
documents the CURRENT architecture, not an aspirational one. If something
here conflicts with the code, the code wins — flag the conflict and update
this file rather than silently trusting either one.

This document was derived from a full repository audit (stack, schema,
services, tests, docs/00-PROGRESSION.md, docs/FONCTIONNALITES-PLATEFORMES.md)
and should be kept in sync as the system evolves. Do not let it rot.

---

## 1. Product Identity

- **LogiFlow** — a delivery management / logistics operating system for the
  Moroccan market.
- Currency: **MAD** (Moroccan Dirham).
- Product/domain language is **French** — UI copy, code comments, commit
  history, and internal docs are predominantly French. Identifiers
  (models, functions, routes) are English; user-facing text and business
  rationale are usually French. Keep this convention when writing UI copy
  or user-facing error messages.
- No customer account system exists by product design — customers are
  created by suppliers at order time (phone-keyed find-or-create), and
  interact with the platform only through unauthenticated, deliberately
  minimal-PII public endpoints (`/track/:orderNumber`).

## 2. Current Stack

- **Framework**: Next.js 14.2.15 (App Router), React 18.3.1, TypeScript
  5.6.2 (strict mode).
- **Database**: PostgreSQL via Prisma 5.20.0 (`prisma/schema.prisma`).
  19 migrations at time of writing, applied incrementally — no schema
  drift via `db push` in the tracked history.
- **Auth**: `jsonwebtoken` + `bcryptjs` (12 rounds) + `otplib` (TOTP/MFA).
  No NextAuth/Auth.js/Passport — this is a hand-rolled auth stack.
- **Validation**: `zod` at every API input boundary.
- **Styling**: Tailwind CSS 3.4 with a hand-built CVD-safe token palette
  (`brand`, `status`, `series`, chrome tokens) — not a component library.
- **Maps**: `maplibre-gl`, raster CARTO tiles (no API key required, no
  vector style — vector rendering was tried and failed in headless/WebGL
  restricted environments).
- **Domain-specific libs**: `qrcode` + `jsqr` (delivery label / pickup QR
  scan), `papaparse` (CSV bulk order import), `recharts` (analytics
  charts), `date-fns`, `nanoid`.
- **Testing**: Vitest 2.1.9 (pinned down from 4.x after a real hang — see
  §12), Playwright 1.62.1 (manual/E2E verification per session, not wired
  into `npm test` or any CI).
- **Installed but NOT used anywhere in `src/`**: `ioredis`, `bullmq`.
  `.env.example` documents Redis as reserved for "V1.5+" async
  notifications. Do not assume a queue exists — see §13.
- No GraphQL, no separate backend service, no microservices. API routes
  under `src/app/api/v1/**` are the entire backend surface.

## 3. Architectural Model

LogiFlow is a **modular monolith**, not NestJS, not microservices — this
was evaluated and explicitly declined more than once in project history
in favor of extending what already works and is tested.

Layering, enforced by convention (not by a lint rule):

```
API route (thin, src/app/api/v1/**)
    ↓  parses/validates input (zod), calls one service function, maps errors
Domain service (src/modules/<domain>/*.service.ts)
    ↓  business rules, transactions, authorization context checks
Prisma client (src/infrastructure/database/client.ts)
    ↓
PostgreSQL
```

Routes stay thin. Business logic — including authorization/ownership
checks, price/commission recalculation, and state transitions — lives in
services, never in the route handler and never in the frontend.

### Singleton event bus

`src/infrastructure/messaging/event-bus.ts` decouples cross-domain side
effects (notifications, payment/ledger creation, driver release,
analytics updates, webhook dispatch, referral rewards) from the service
that triggers them. Handlers are registered at boot via
`src/instrumentation.ts`.

**This bus is backed by a `global.*`-scoped singleton, not a plain module
variable.** That is load-bearing, not incidental: Next.js can compile API
routes into separate module graphs (particularly in dev), and a
module-scoped `Map` of handlers silently split into multiple empty
instances once already caused a real, totally silent production bug (COD
payment never triggered, driver never released, notifications never
sent — no error, no failing test, 200 OK on every request). Do not
"simplify" this back to a plain module-level variable. If the event bus
is ever replaced or refactored, this failure mode must be re-verified
end-to-end (real HTTP calls across separately-compiled routes), not just
type-checked.

Side effects should be added as event handlers registered on the bus, not
as direct calls from one domain service into another. Direct
service-to-service calls for core CRUD/query flows are fine; side effects
of a domain event (a status transition, a document verification, an
order delivery) should go through `dispatchDomainEvent`.

## 4. Domain Map

Actual modules under `src/modules/` (18 domains):

`auth`, `users`, `suppliers`, `products`, `customers`, `orders`, `drivers`
(includes referral program), `dispatch` (includes `offers.service.ts`),
`deliveries`, `tracking`, `documents`, `payments`, `settlements`,
`promotions`, `notifications`, `messaging` (order chat), `operations`
(Control Tower / SLA exceptions), `support`, `webhooks`, `onboarding`,
`analytics`.

Four portals partition the frontend by role via route groups:
`(dashboard)` (admin/ops), `(driver)`, `(supplier)`, plus unauthenticated
public routes (`track/`, `register/`, `login/`, `onboarding/pending`,
`account/`).

## 5. Real Domain Vocabulary

Use these names. Do not substitute generic logistics-textbook terms.

| Use this | Not this |
|---|---|
| `Driver` | ~~Deliverer~~ |
| `Supplier` | ~~Vendor/Merchant~~ |
| `Customer` | (correct, but see §1 — no account/login exists) |
| `Order` | ~~Shipment~~ |
| `Delivery` | (the fulfillment record for an `Order`, 1:1) |
| `DriverOffer` | (offer/accept/reject flow, not a forced assignment) |
| `Document` | ~~DocumentVerification~~ |
| `Transaction` | (the financial ledger row) |
| `Settlement` | (periodic supplier payout aggregation) |
| `Zone` | |

**Explicitly does NOT exist as a model — do not invent it or assume it:**

- **`Vehicle` is not an entity.** A driver's vehicle is two scalar fields
  on `Driver`: `vehicleType` (enum) and `vehiclePlate` (string). A driver
  with two vehicles cannot have independent per-vehicle eligibility today.
  This is a known, named limitation (see §15), not an oversight to
  "quietly fix" — separating `Vehicle` out is a real migration affecting
  dispatch, documents, tests, and admin UI, and requires an explicit
  architecture decision first (§16/§17).
- **`DeliveryAssignment` is not a model.** Assignment is represented by
  the combination of `Delivery` (the 1:1 fulfillment record, holds
  `driverId`, `assignedAt`, `dispatchScore`) and `DriverOffer` (the
  offer/accept/reject negotiation that precedes a manual/auto assignment).
- **`DocumentVerification` is not a model.** Verification state
  (`status`, `verifiedById`, `verifiedAt`, `rejectionReasonCode`,
  `rejectionReason`) lives directly as fields on `Document` itself. There
  is no separate verification-event table.
- There is no `Vehicle`, `Shipment`, `Package`, or `Organization` model.
  LogiFlow is single-tenant.

## 6. Order State Machine

Source of truth: `src/modules/orders/order-state-machine.ts`.

```
PENDING            → CONFIRMED, CANCELLED
CONFIRMED          → READY_FOR_PICKUP, CANCELLED
READY_FOR_PICKUP   → ASSIGNED, CANCELLED
ASSIGNED           → PICKED_UP, CANCELLED
PICKED_UP          → IN_TRANSIT
IN_TRANSIT         → OUT_FOR_DELIVERY
OUT_FOR_DELIVERY   → DELIVERED, CUSTOMER_ABSENT, WRONG_ADDRESS,
                     CUSTOMER_REFUSED, RESCHEDULED
CUSTOMER_ABSENT    → RESCHEDULED, RETURNED
WRONG_ADDRESS      → RESCHEDULED, RETURNED
CUSTOMER_REFUSED   → RETURNED
RESCHEDULED        → OUT_FOR_DELIVERY, RETURNED
DELIVERED          → (terminal)
RETURNED           → (terminal)
CANCELLED          → (terminal)
```

This exact adjacency map is unit-tested exhaustively (196 from/to pairs)
in `tests/unit/order-state-machine.test.ts`. Domain events fired per
transition are defined in `getDomainEventsForTransition` in the same file
— e.g. `DELIVERED` fires `ORDER_DELIVERED`, `NOTIFY_CUSTOMER`,
`CALCULATE_COMMISSION`, `UPDATE_DRIVER_BALANCE`,
`CREATE_FINANCIAL_TRANSACTION`, `UPDATE_ANALYTICS`, etc.

**RULE: Never write `order.status = X` directly, anywhere.** Every status
change must go through `transitionOrderStatus` (`orders.service.ts`),
which validates the transition against this map, writes
`OrderStatusHistory`, and fires the correct domain events. A direct write
bypasses history, events, and validation — this breaks payments,
notifications, dispatch release, and audit trail simultaneously.

## 7. Driver State Rules

`DriverStatus`: `PENDING_APPROVAL`, `AVAILABLE`, `BUSY`, `OFFLINE`,
`REJECTED`, `SUSPENDED`.

- A newly-approved driver becomes `OFFLINE`, never `AVAILABLE` —
  approval authorizes the account, it does not make the driver
  dispatchable. The driver must self-activate.
- Self-service toggle is restricted to `AVAILABLE ⇄ OFFLINE`
  (`SELF_SERVICE_STATUSES`, `drivers.service.ts`). A driver can never
  self-set `BUSY`.
- **`BUSY` is system-controlled only** — set by `assignDriverToOrder`
  when a delivery is assigned, cleared by `releaseDriverIfIdle` once the
  driver has zero non-terminal deliveries.
- Multi-stop: a `BUSY` driver remains a dispatch/offer/manual-assignment
  candidate as long as their active (non-terminal) delivery count is
  below `MAX_CONCURRENT_DELIVERIES` (currently 3,
  `dispatch.service.ts`). Beyond that, they drop out of candidacy until a
  delivery completes.
- Rejecting an offer never changes `driver.status` — a driver who
  declines a `DriverOffer` stays exactly where they were.
- `Driver.baseZoneId` (declared "home" zone, profile-only) is distinct
  from `DriverZone` (many-to-many "service areas", used by dispatch
  `zoneMatch` scoring) — do not conflate the two.
- `lastLocationUpdate`/`locationStale` (>20 min without a GPS heartbeat)
  is **informational only** — shown to operators, never used to exclude
  a driver from dispatch. Do not turn this into a hard filter; doing so
  once would have broken dispatch entirely for any driver who had never
  opened the app since the heartbeat was introduced.

### Compliance gating before dispatch eligibility

"The dispatch must never decide alone" is a hard, tested rule:
`getIneligibleOwnerIds('DRIVER', ...)` (documents module) is applied as a
**pre-filter, before scoring**, in all three paths that can put a driver
on a delivery:

1. `getDispatchCandidates` (the candidate list an operator sees)
2. `assignDriverToOrder` (direct manual assignment by driverId)
3. `createOffer` (offering a specific driver a delivery)

A driver missing a required `Document` (or holding only an expired one)
must not appear as a candidate and must not be assignable by any path,
even one that bypasses the candidate list. The same class of gate applies
to suppliers: `createOrderForSupplier` requires both `Supplier.status ===
'ACTIVE'` and document eligibility. Never add a new
assignment/order-creation path without applying the same gate.

## 8. Authentication and Authorization

- **JWT** (`jsonwebtoken`, HS256) signed with `JWT_SECRET`. Refuses to
  boot with a missing/short (<32 char) secret **only when
  `NODE_ENV === 'production'`** — a misconfigured staging/unset
  environment will not catch a weak secret. Treat this as a gap to close,
  not a feature to rely on.
- **Server-side `Session` revocation** layered over the JWT: a hash of
  the signed token is stored per session so `logout`/forced revocation
  (e.g. on password change) works despite the JWT itself being stateless.
  `verifyToken` checks both JWT validity and that the underlying session
  is not revoked/expired.
- **bcrypt**, 12 rounds, for password hashing.
- **TOTP MFA** via `otplib` — two-step enrollment (secret issued, not
  active until a real 6-digit code confirms it), required at login once
  enabled, disable requires re-entering the password (not just a TOTP
  code).
- **RBAC**: flat `Record<UserRole, Permission[]>` in
  `src/shared/constants/permissions.ts`. `UserRole` enum:
  `SUPER_ADMIN`, `LOGISTICS_MANAGER`, `FINANCE_MANAGER`, `SUPPORT_AGENT`,
  `SUPPLIER`, `DRIVER`, `CUSTOMER`.
- **Ownership checks** enforce that a driver only acts on their own
  delivery (`assertDeliveryOwnership`, reused by chat/POD/label routes),
  and a supplier only on their own orders/products/settlements
  (`requireSupplierAccess`). These are server-side and tested (IDOR
  coverage) — never assume the frontend hiding a button is sufficient.
- **Approval gating**: registration creates a `User` +
  `PENDING_APPROVAL` business profile — never `ACTIVE`. A business
  profile only becomes usable after an operator approves it
  (`onboarding.service.ts`). `createOrderForSupplier` explicitly checks
  `Supplier.status === 'ACTIVE'` — this check was once missing and
  allowed a never-approved supplier to create real orders; do not let a
  new order/dispatch/finance entry point regress on this.

### Rules

- **Deny by default.** Any permission not explicitly listed for a role is
  refused (`hasPermission`/`assertPermission`).
- **Frontend visibility is never authorization.** Hiding a button or nav
  item is a UX nicety, not a security control.
- **Every protected API route must enforce authorization server-side**,
  via `requirePermission` / `requireAnyPermission` / `requireDriverAccess`
  / `requireSupplierAccess` (or an equivalent explicit check). There is
  **no global RBAC middleware** today — enforcement is per-route. This is
  functional and tested but has no backstop: a new route that forgets the
  guard call fails open. Treat "did I add the guard?" as a mandatory
  checklist item for every new route, and prefer closing this gap with a
  global backstop over continuing to rely on per-route discipline alone
  (see §15/§17).

## 9. Financial Invariants

- **COD lifecycle**: fully automatic. On the `ORDER_DELIVERED` domain
  event, `payments.service.ts` confirms the `Payment`, writes three
  `Transaction` rows (`COD_COLLECTION`, `COMMISSION_DEDUCTION`,
  `DRIVER_PAYOUT`), and updates `Driver.walletBalance` — idempotently
  (safe if the event were somehow replayed).
- **Commission** is computed and stored on the `Order`
  (`commissionAmount`, `supplierPayoutAmount`) at order-creation time
  from `Supplier.defaultCommissionRate`/`Driver.commissionRate`. Prices
  and commissions are **always recalculated server-side from the
  catalog/DB** — never trust a price, discount, or commission value sent
  by the client, even from an internal/trusted-looking form.
- **`Transaction`** is the single ledger — every money movement
  (`COD_COLLECTION`, `COMMISSION_DEDUCTION`, `SUPPLIER_PAYOUT`,
  `DRIVER_PAYOUT`, `REFERRAL_BONUS`, `REFUND`, `ADJUSTMENT`) is a row
  here. Don't add a parallel "amount" field elsewhere as a shortcut.
- **`Settlement`** aggregates a supplier's payable orders over a period
  (`DRAFT → PENDING_PAYMENT → PAID / DISPUTED`), and guards against
  double-settling by checking for an existing `SUPPLIER_PAYOUT`
  transaction rather than a date-range assumption.
- **`Transaction.reference`** is generated via a **Postgres sequence**
  (`nextval`), not `COUNT(*) + 1`. This was a real, once-live race
  condition: two event handlers running concurrently on the same
  `ORDER_DELIVERED` event (COD collection + referral bonus) could read
  the same starting count and collide on the unique `reference`. Any new
  code that needs a sequential human-readable reference must use the same
  sequence-backed pattern — never re-derive a "next number" from a
  `COUNT`/`MAX` query when more than one writer can run concurrently.
- **Idempotency**: `IdempotencyKey` reserves `(scope, key)` atomically
  *before* the handler runs (not check-then-write), used today on
  `POST /api/v1/orders`. Any new mutating endpoint with real financial or
  duplicate-creation consequences (a second order, a second payout)
  should use `withIdempotency` the same way, opt-in via an
  `Idempotency-Key` header.
- **Financial values must never be trusted from client input** — this is
  the single most repeated invariant in this codebase's history. Every
  price, discount, commission, and payout must be read from the
  database/catalog inside the service, not accepted as a request field.

## 10. Document Compliance

- `Document` (KYC for `Driver`, KYB for `Supplier`) is **polymorphic**:
  `ownerType` (`DRIVER`/`SUPPLIER`) + `ownerId`, no direct Prisma
  relation. This is deliberate — do not "fix" it into two nullable FKs
  without an explicit decision; the polymorphic shape was chosen to
  mirror a pattern used elsewhere and is relied on by
  `getIneligibleOwnerIds`'s batched-lookup shape.
- `DocumentType`: `CIN`, `DRIVER_LICENSE`, `VEHICLE_REGISTRATION`,
  `VEHICLE_INSURANCE`, `COMPANY_REGISTRATION`. Single verification tier
  (`UPLOADED → UNDER_REVIEW → VERIFIED/REJECTED`, plus `EXPIRED`) — there
  is no BASIC/VERIFIED/BUSINESS_VERIFIED multi-tier scheme; do not
  introduce one without a product decision.
- Eligibility (`computeEligibility`) means "at least one `VERIFIED`,
  non-expired document of each required type." A `REJECTED` or
  `UPLOADED`-but-not-yet-reviewed document does not satisfy eligibility —
  but the UI must distinguish "never submitted" from "submitted, pending
  review" (`classifyMissingTypes`) rather than showing both as
  generically "missing," which was a real, user-reported UX bug.
- Rejection reasons are a **closed enum**
  (`DocumentRejectionReason`) plus optional free text — do not replace
  the codified reason with free text alone.
- **Storage**: `src/infrastructure/storage/document-storage.ts` defines a
  swappable `DocumentStorage` interface. The only implementation today is
  local disk (`LocalDiskDocumentStorage`).

  **This is DEVELOPMENT ONLY / NOT PRODUCTION SAFE.** No replication, no
  encryption at rest, incompatible with any multi-instance or
  ephemeral-filesystem deployment. Do not deploy this to a real
  production environment without first swapping in an S3-compatible
  implementation behind the same interface. Documents (CIN, plates,
  personal data) must never be served from `/public` or any
  unauthenticated path — always through an authenticated streaming route.

## 11. Event-Driven Side Effects

Restated from §3 because it matters: the singleton event bus
(`src/infrastructure/messaging/event-bus.ts` + `src/instrumentation.ts`)
is **load-bearing architecture**, not an implementation detail to casually
refactor away. It is what lets `orders`, `dispatch`, `payments`,
`notifications`, `webhooks`, and `drivers` (referrals) react to a status
transition without importing each other directly. Do not replace it with
direct cross-service function calls "for simplicity" — that reintroduces
tight coupling this design deliberately avoids, and previously produced a
silent-failure bug when the registration mechanism was module-scoped
instead of `global`-scoped. If you add a new side effect to an existing
transition, register a new handler; if you must change the bus itself,
that is an architecture-level change (see §16/§17), and its fix must be
re-verified with real cross-route HTTP calls, not just types passing.

## 12. Testing Rules

- **Vitest 2.1.9** (pinned after a real, non-obvious hang on 4.x — see
  `docs/00-PROGRESSION.md` for the postmortem before "helpfully"
  upgrading it again).
- Tests run against a **real, dedicated PostgreSQL test database**, not
  mocks. `tests/setup.ts` refuses to run unless `DATABASE_URL` contains
  `"test"` — this is a genuine safety guard against wiping a dev/prod
  database, not decorative. Never bypass or weaken it.
- Reset strategy: `tests/db.ts` does an explicit `TRUNCATE CASCADE`
  across a maintained table list, **opt-in per test file** (a global
  `beforeEach` reset once made 196 unrelated unit tests take 5+ minutes).
  **Every new model/table must be added to this truncation list at the
  same time the migration is written** — forgetting this has caused
  silent bugs at least three times (rows accumulating across tests,
  masked when a table happened to cascade-delete via another FK, invisible
  until something collided on a unique constraint).
- **Known limitation**: two `npm test` runs against the same shared test
  database will corrupt each other's data (no per-run isolation). Do not
  run concurrent test suites against one database; this must be resolved
  before any CI setup that could run test jobs in parallel.
- **Regression policy**: every bug fix should include a regression test
  where practical. Every change to a critical business rule — state
  machine transitions, dispatch eligibility/scoring, financial
  calculations, RBAC/ownership checks — requires a test; "it typechecks"
  is explicitly not sufficient evidence in this codebase's own history
  (several real bugs — the event-bus singleton bug, the timezone bug in
  trend analytics, a missing `supplierId` in a form — were only caught by
  live end-to-end verification, not by types or a partial test run).

## 13. No-Scheduler Convention

LogiFlow **intentionally has no scheduler or job queue**, despite
`ioredis` and `bullmq` being installed dependencies. Every time-sensitive
concern (SLA exception detection, driver-offer expiry, scheduled-delivery
dispatch eligibility) is computed **lazily, at read time**, using code
constants for thresholds — not a cron job, not a delayed queue.

This is a deliberate, repeated architectural choice, not an oversight:
introducing a scheduler is treated in project history as "complexity this
codebase avoids everywhere else" until a real need forces the decision.

**Do NOT introduce BullMQ workers, Redis-backed jobs, cron, or any
background scheduler silently as part of an unrelated feature.** If a
feature seems to require one (automatic scheduled-order dispatch at the
exact window time, deferred webhook retry queues, automatic document
expiry reminders), surface that as an explicit architectural decision to
the user/architect first — do not wire it in as an implementation detail.

## 14. Security Rules

- **Zod** validates every external input at the API boundary — new routes
  must follow this, no hand-rolled validation.
- **RBAC** deny-by-default (§8) — every new permission must be explicitly
  granted to a role in `permissions.ts`, never inferred.
- **IDOR/ownership protection** is mandatory on any route that reads or
  mutates a driver-, supplier-, or order-scoped resource. Reuse
  `assertDeliveryOwnership`/`requireSupplierAccess`/`requireDriverAccess`
  rather than writing a new ad hoc check.
- **Audit logging** (`AuditLog`, before/after JSON) is used for
  sensitive state changes (logins, MFA enable/disable, password changes,
  document verify/reject, onboarding decisions). Extend this pattern for
  new sensitive actions rather than skipping it.
- **HMAC-signed outbound webhooks** (`X-LogiFlow-Signature:
  sha256=<HMAC>` over the raw body) — preserve this if webhooks are
  extended to new events.
- **Idempotency** for mutating endpoints with duplicate-submission
  consequences (§9).
- **Secret handling**: `JWT_SECRET`, `webhookSecret`, DB credentials live
  in `.env`/`.env.test` (gitignored). **Never read, print, log, or expose
  `.env` file contents unless the task genuinely requires it** — and even
  then, never include secret values in commit messages, logs, or
  responses.
- **Upload/storage rules**: documents and POD (photo/signature) files are
  never served from `/public` or any unauthenticated path; always via an
  authenticated route backed by the `DocumentStorage`/proof-file
  abstraction. Local disk storage is dev-only (§10).
- Known-thin spots to be honest about rather than silently assume solid:
  minimal SSRF protection on outbound webhook URLs (private hosts/HTTP
  blocked in production only, no DNS-rebinding protection), and no rate
  limiting anywhere (login, register, MFA verify, public tracking lookup).
  Treat these as real gaps (§15), not settled.

## 15. Known Production Gaps

Documented honestly — do not present any of these as done in status
reports, commit messages, or user-facing copy unless they are actually
fixed:

- **No real notification provider.** `NotificationProvider` only has a
  logging stub (`console.info`) for SMS/WhatsApp/Email/Push. Every "the
  customer was texted" behavior in the code and changelog means a
  `Notification` row was written and logged — nothing left the server.
- **No online payment gateway.** `PREPAID_ONLINE`/`BANK_TRANSFER` exist
  as enum values with manual confirmation only; no PSP (Stripe/CMI/etc.)
  is integrated. Only COD is fully automated end-to-end.
- **No production-safe object storage.** Document/POD storage is local
  disk only (§10).
- **No rate limiting** on auth, MFA verification, or public tracking
  endpoints.
- **No CI/CD.** Tests exist (§12) but nothing in the repo runs them
  automatically on push/PR.
- **No production containerization for the app.** `docker-compose.yml`
  covers local dev dependencies (Postgres, Redis) only — there is no
  Dockerfile for the Next.js app itself, no staging/prod compose overlay.
- **No global authorization backstop** — RBAC enforcement is per-route
  only (§8).
- **No test-DB concurrency isolation** — parallel test runs corrupt each
  other (§12).

## 16. Agent Orchestration Rules

Specialist agents live in `.claude/agents/`. Use them deliberately, not
reflexively:

- **architect** — analyze first for any cross-domain feature (touches
  more than one module in §4), any change to the event bus, state
  machine, or module boundaries, and any request that sounds like "add a
  scheduler" / "restructure the monolith" / "introduce a new core
  entity." Architect review precedes implementation, not follows it.
- **database** — any schema/migration change. Always paired with
  **architect** review for anything beyond an additive, backward-compatible
  column (new required relation, entity split like `Vehicle`, table
  removal, index/constraint change affecting existing queries).
- **backend** — API routes, services, business logic, transactions,
  integrations. Owns the route → service → Prisma layering (§3).
- **frontend** — portal UI (`(dashboard)`, `(driver)`, `(supplier)`,
  public pages), components, forms, client-side validation. Never
  duplicates backend business logic or treats hidden UI as security.
- **logistics** — any change to the order/delivery lifecycle (§6),
  dispatch scoring/eligibility (§7), driver state rules, or zone/service
  area logic. Review required before merging a business-lifecycle
  change, because these ripple into payments, notifications, and three
  different dashboards.
- **security** — any change touching auth, MFA, RBAC/permissions,
  ownership checks, document/file handling, webhooks, or anything
  handling secrets. Review required before completion, not just at
  design time.
- **testing** — critical changes (state machine, financial calculation,
  RBAC, dispatch eligibility) require testing review/regression coverage
  before the change is considered done (§12).
- **devops** — environment config, Docker, CI, health checks, deployment
  topology. Never commits secrets or silently changes prod-facing
  infrastructure.
- **research** — use when a library's current behavior/API is uncertain,
  or when comparing architectural approaches against current docs, before
  committing to an implementation.

## 17. Change Management

Before implementing any non-trivial feature or change:

**A.** Inspect the existing implementation (grep/read the actual code,
not just this file or the docs — this file summarizes, it does not
replace reading the module you're about to touch).

**B.** Identify affected modules (§4) — list them explicitly.

**C.** Identify schema impact — new models/fields/migrations, and whether
`tests/db.ts`'s truncation list needs updating (§12).

**D.** Identify API impact — new/changed routes, request/response shape,
versioning.

**E.** Identify security impact — new permission needed? new ownership
check needed? does it touch auth, documents, webhooks, or secrets? (§8,
§14)

**F.** Identify tests needed — new test file or additions to an existing
one; regression test for any bug fix (§12).

**G.** Propose a plan before writing code, sized to the change — a
one-line note for a small fix, a short structured plan for anything
crossing module boundaries or touching §6/§7/§9/§13.

**H.** Implement only after the current architecture is actually
understood — not guessed from a similar-sounding pattern elsewhere.

**I.** Run relevant validation — typecheck, targeted tests at minimum;
full suite for anything touching state machine, dispatch, or financial
logic.

**J.** Report what changed — plainly, including what was deliberately
NOT done and why, matching the honesty standard already established in
`docs/00-PROGRESSION.md`.

**Never rebuild an existing feature without first determining why the
current implementation is insufficient.** Several past sessions found
that a "missing" capability was already implemented and merely
unverified, unwired to the UI, or intentionally dormant (MFA verification
was a stub; the compliance gate existed but was deliberately inactive;
zone assignment existed with no UI). Verify before rebuilding.
