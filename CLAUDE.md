# MetYet

MetYet is a coordination product for trusted relationships between Collectors and Trusted Partners.

## Before making changes

Read:

1. `docs/METYET_ENGINEERING_CONTEXT.md`
2. The task brief supplied for the current batch.
3. Relevant current code and tests.

The repository and its tests are the source of truth for what is actually implemented.

`docs/METYET_ENGINEERING_CONTEXT.md` is the source of truth for durable product doctrine.

If they appear to conflict, stop and report the discrepancy rather than silently choosing one.

## Working rules

- Do not implement beyond the current task brief.
- Do not invent product behavior to solve an engineering problem.
- Preserve established product invariants and privacy boundaries.
- Prefer the smallest coherent change.
- Inspect before editing.
- Run targeted tests before full verification.
- Use adversarial or mutation testing when the task requires it.
- Never weaken an invariant merely to make a test pass.
- Do not merge, push, deploy, migrate production data, or begin the next batch unless the current task explicitly authorizes it.
- At completion, provide a hand-back containing the verified starting state, changes made, evidence, tests/builds, mutations where applicable, semantic counts, discoveries, deferred work, and exact stopping point.
