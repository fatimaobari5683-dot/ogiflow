---
name: regression-check
description: Verify a bug fix or business-rule change in LogiFlow has adequate regression test coverage per CLAUDE.md's testing rules, and that tests/db.ts is up to date. Use after a bug fix, or before considering a critical-path change complete.
---

# Regression Check

Narrow responsibility: confirm a change is actually covered by tests
consistent with `CLAUDE.md` §12's testing rules — not to write the
feature, and not to relax or work around the test-safety guards this
project relies on.

## When to use this

- After any bug fix — CLAUDE.md §12 and §17 both require a regression
  test where practical.
- Before considering a change to a critical business rule complete: the
  order state machine, dispatch eligibility/scoring, financial
  calculations, RBAC/ownership checks (CLAUDE.md §12 makes tests
  mandatory here, not optional).
- When asked to validate that a change didn't regress existing behavior.

## Process

1. **Read `CLAUDE.md` §12 first.**
2. **Identify what changed** (diff, or the fix just applied) and map it
   to the relevant existing test file(s) under `tests/unit/` or
   `tests/integration/` — LogiFlow has one integration test file per
   domain; find the matching one before assuming a new file is needed.
3. **Check for a regression test.** For a bug fix: does a test exist
   that would have failed before the fix and passes after? If not, that
   is the primary finding — propose the specific test (what it sets up,
   what it asserts), don't just note its absence.
4. **Check `tests/db.ts` truncation coverage** if the change added a new
   Prisma model — this has been a real, repeated source of silent bugs
   in this project. A new model not in the truncation list is a finding.
5. **Check the guard rail**: confirm the change doesn't touch or weaken
   `tests/setup.ts`'s `DATABASE_URL` "must contain test" guard.
6. **Run targeted validation, not destructively**:
   - `npm run typecheck` is always safe to run.
   - Targeted test files via `dotenv -e .env.test -- vitest run
     <path>` are safe — they run against the dedicated test database
     that the guard rail protects.
   - **Never run the full suite concurrently with another test run** —
     CLAUDE.md §12 documents that parallel `npm test` invocations
     corrupt each other against the shared test DB. If another test run
     might be active, run targeted files only, or ask before running
     the full suite.
   - Never point any test command at a `DATABASE_URL` that doesn't
     contain `"test"`.
7. **Report clearly**: which tests exist/were added, what they actually
   assert (not just their names), whether `tests/db.ts` needed updating,
   and the actual command output (pass/fail counts) — not an assumption
   that it passed.

## Hard constraints

- No `prisma migrate`, `db push`, or `db seed` against any database.
- No writes to `.env`/`.env.test`.
- No running tests against a non-test database, ever, under any framing.
- If the change under review touches the order state machine, dispatch,
  or financial calculations and has *no* test coverage, say so plainly
  as a blocking finding — do not soften it into a "nice to have."
- This skill checks and reports; if it also writes a missing test, keep
  that test scoped to the specific gap identified, and re-run only the
  affected file(s) to confirm, not the full suite (per the concurrency
  constraint above).
