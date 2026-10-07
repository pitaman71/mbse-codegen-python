<!-- nav -->
[← TypeScript package](../README.md) · [Home](../../README.md)

# Test plan (TypeScript)

The suites, cases and order are Python's (the [Python test plan](../../python3/tests/TestPlan.md)); this lists
only what differs. The deliberate differences between the implementations are in
[Equivalence](../../docs/EQUIVALENCE.md).

- Each case's code is a block (`{ ... }`), since a notebook runs as one module.
- `run-notebooks.ts` runs the notebooks headless, each in its own process; `--typecheck` type-checks them first.
- SKL-02 type-checks each TypeScript program in the skill before running it.

---

---

<!-- nav -->
[← TypeScript package](../README.md) · [Home](../../README.md)
