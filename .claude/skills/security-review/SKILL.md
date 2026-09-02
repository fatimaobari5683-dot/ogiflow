---
name: security-review
description: Review authentication, authorization, ownership, input validation, file handling, secrets, or webhook/financial changes in LogiFlow against CLAUDE.md's security rules and known gaps. Use before completing any security-sensitive change, or when asked for a security review.
---

# Security Review

Narrow responsibility: check a specific change (diff, new route, new
service function) against LogiFlow's actual security model as documented
in `CLAUDE.md` §8, §9, and §14 — not generic OWASP boilerplate divorced
from this codebase's real patterns.

## When to use this

- Before completing any change touching auth, MFA, RBAC/permissions,
  ownership checks, document/file storage, webhooks, secrets, or
  financial calculations (CLAUDE.md §16 requires security review here).
- When the user asks for a security review of a diff, PR, or feature.

## Process

1. **Read `CLAUDE.md` §8 (auth/authz), §9 (financial invariants), and
   §14 (security rules) first** — these define what "correct" looks
   like in this specific codebase, not in the abstract.
2. **Inspect the actual change** (diff, new files) rather than reviewing
   from memory of similar routes elsewhere in the app.
3. Check specifically for:
   - **Deny-by-default RBAC**: does every new/changed API route call
     `requirePermission`/`requireAnyPermission`/`requireDriverAccess`/
     `requireSupplierAccess` (or an equivalent explicit check)? A route
     with no visible guard call is a finding, full stop — there is no
     global middleware net in this codebase to fall back on.
   - **Ownership/IDOR**: can a driver or supplier act on another driver's
     or supplier's resource? Reuse `assertDeliveryOwnership`/
     `requireSupplierAccess`/`requireDriverAccess` rather than a new
     bespoke check — a new hand-rolled ownership check is itself worth
     flagging for review even if it looks correct.
   - **Server-side trust boundary**: is any price, commission, discount,
     or other financial value accepted from client input instead of
     recalculated from the database/catalog? This is the single most
     repeated invariant in this codebase's history — treat any
     violation as high severity.
   - **Input validation**: is every external input validated with Zod
     at the API boundary?
   - **Frontend-only gating**: does authorization rely, anywhere, on a
     hidden button/nav item rather than a server-side check?
   - **File/document handling**: are documents/POD files served only
     through an authenticated route, never `/public`? Is the storage
     abstraction (`DocumentStorage`) used rather than a new ad hoc file
     write?
   - **Secrets**: does the change read, log, print, or otherwise expose
     `.env` values, `JWT_SECRET`, or `webhookSecret`? Flag any such
     exposure regardless of whether it seems "just for debugging."
   - **Audit logging**: does a new sensitive state change (approval,
     rejection, financial adjustment, permission change) write an
     `AuditLog` entry, consistent with existing patterns?
   - **Idempotency**: does a new mutating endpoint with duplicate-
     submission consequences use `withIdempotency`, consistent with
     `POST /api/v1/orders`?
4. **Cross-check against known, already-documented gaps** (`CLAUDE.md`
   §15) — no rate limiting, minimal webhook SSRF protection,
   `NODE_ENV`-gated JWT secret strength check, no global RBAC backstop,
   local-disk document storage. Do not report these as *newly
   discovered* findings unless the change under review specifically
   worsens one of them — but do note if a change touches one of these
   areas without improving it, when the task was expected to.
5. **Report findings clearly**, most severe first: what's wrong, the
   concrete exploit/failure scenario (not just "this is unsafe"), and
   the file/line. Distinguish a confirmed issue from a plausible one you
   couldn't fully verify.

## Hard constraints

- Read-only by default — this skill reviews and reports; it does not
  fix. If asked to also apply fixes, keep changes scoped to exactly the
  findings reported, and re-report what was fixed vs. skipped.
- Never print secret values (`.env` contents, JWT secrets, webhook
  secrets, password hashes) in the review output, even when explaining
  why something is a finding.
- Do not silently "fix" a known gap from §15 (e.g. by adding rate
  limiting or wiring a real notification provider) as a side effect of a
  security review — those are real features requiring their own plan
  (use `feature-planning`), not a drive-by patch.
