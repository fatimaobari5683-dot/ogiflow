---
name: feature-planning
description: Produce a change-management plan for a non-trivial LogiFlow feature or change, following CLAUDE.md's mandatory process (inspect, identify impact, propose plan) before any implementation. Use when asked to plan, scope, or design a feature/change before writing code.
---

# Feature Planning

Narrow responsibility: turn a feature request into a grounded plan,
following `CLAUDE.md` §17 (Change Management) exactly. This skill does
not write implementation code — it produces the plan implementation
would follow.

## When to use this

- Any feature or change request that touches more than a one-line fix.
- Before delegating to `backend`/`frontend`/`database`/`logistics`
  specialist agents for implementation.
- When the user asks "how would we build X" or "plan out Y" before
  committing to code.

## Process (mirrors CLAUDE.md §17)

**A. Inspect the existing implementation.** Read the actual relevant
service(s), route(s), and schema — not just `CLAUDE.md`'s summary of
them. Check whether the requested capability already exists in some
form (implemented, partially wired, or dormant) before assuming it needs
to be built. LogiFlow's history has repeated examples of a "missing"
feature turning out to already exist unwired or deliberately inactive —
treat that as the default hypothesis to rule out, not a curiosity.

**B. Identify affected modules** — name them explicitly from
`CLAUDE.md` §4's domain map (or note if a genuinely new module is
needed — that itself is a signal to loop in the `architect` agent).

**C. Identify schema impact** — new models/fields/migrations required,
and whether `tests/db.ts`'s truncation list will need a matching update.
Flag whether this needs the `database` agent (any change beyond an
additive, backward-compatible column).

**D. Identify API impact** — new or changed routes, request/response
shape, backward compatibility for existing consumers (supplier webhooks,
existing frontend calls).

**E. Identify security impact** — new permission needed in
`permissions.ts`? new ownership/ IDOR check needed? does it touch auth,
documents/file storage, webhooks, or secrets? Flag whether the
`security` agent should review before completion.

**F. Identify tests needed** — new test file vs. additions to an
existing one; a regression test if this stems from a bug report; note if
it touches a critical business rule (state machine, dispatch,
financial calculation, RBAC) that CLAUDE.md §12 says *requires* test
coverage, not just recommends it.

**G. Propose the plan** — sized to the change. A one-line note for a
small, contained fix; a structured plan (steps, files, order of
operations, specialist agents to involve) for anything crossing module
boundaries or touching the order state machine, driver state rules,
financial invariants, or the no-scheduler convention (CLAUDE.md §6, §7,
§9, §13 — a plan that quietly introduces a scheduler/job queue must
surface that as an explicit decision point, not slip it in as a detail).

Stop here. Steps H–J (implement, validate, report) belong to the actual
implementation work this plan feeds into — not to this skill.

## Hard constraints

- Do not write or edit application code, schema, or tests as part of
  planning — this skill's output is the plan itself.
- Do not run migrations, installs, or the dev server.
- If the investigation in step A reveals the feature already exists in
  some form, report that plainly as the primary finding — do not bury it
  under a plan to rebuild it anyway.
- Name which specialist agent(s) should own which part of the eventual
  implementation, per `CLAUDE.md` §16.
