# Guide for AI agents

mbse-codegen-python renders [mbse-schemas](https://github.com/pitaman71/mbse-schemas)' schemas as Python source, and
reads Python source back into schemas, through [mbse-programs](https://github.com/pitaman71/mbse-programs)' Python
syntax trees, step by step with [mbse-patterns](https://github.com/pitaman71/mbse-patterns)' `Transforms`. Two
equivalent implementations exist: `python3/` and `typescript5/`; both generate Python.

## Start here

| You want to | Read |
|---|---|
| Know why the mbse repositories exist, and this one's part in them | [MBSE.md](MBSE.md) |
| Use the library: generate Python from schemas, or read it back | [skills/mbse-codegen-python/SKILL.md](skills/mbse-codegen-python/SKILL.md), a skill |
| Understand a design decision or an open question | mbse-basis [CAP-027: Python3 source generated from schemas](../mbse-basis/docs/capabilities/CAP-027.md), by section (and [CAP-039: schemas round-trip through Python3](../mbse-basis/docs/capabilities/CAP-039.md), [FEA-021: every generation ambiguity a parameter](../mbse-basis/docs/features/FEA-021.md)) |
| Change the package | this file, then [docs/EQUIVALENCE.md](docs/EQUIVALENCE.md) |
| Find or add a test case | [python3/tests/TestPlan.md](python3/tests/TestPlan.md) (TypeScript's plan lists only its differences) |
| Write the transforms' constraints | [mbse-patterns' AGENTS.md](https://github.com/pitaman71/mbse-patterns/blob/main/AGENTS.md), in the sibling checkout |
| Build or print syntax trees | [mbse-programs' AGENTS.md](https://github.com/pitaman71/mbse-programs/blob/main/AGENTS.md), in the sibling checkout |

## Invariants when changing code

The conventions every mbse repository shares are stated once in mbse-basis; this file cites them and keeps
only what differs here.

- **Vocabulary**: [VOC-007: property](../mbse-basis/docs/VOCABULARY.md#VOC-007), [VOC-026: schema](../mbse-basis/docs/VOCABULARY.md#VOC-026), [VOC-008: term](../mbse-basis/docs/VOCABULARY.md#VOC-008), [VOC-009: syntax node](../mbse-basis/docs/VOCABULARY.md#VOC-009) and [VOC-002: constraint](../mbse-basis/docs/VOCABULARY.md#VOC-002), each qualified with whose it is where it meets a language's own term ([the vocabulary](../mbse-basis/docs/VOCABULARY.md), its introduction). Here the seam is everywhere: a schema's *property* becomes a dataclass *field*, and Python's
  `@property` is Python's.
- **Documents**: navigation lines, the README opening with why, and what this file holds ([Rules for every document](../mbse-basis/docs/README.md#rules-for-every-document)).
- **Equivalence**: [PRI-028: both implementations change together](../mbse-basis/docs/PRINCIPLES.md#PRI-028), [PRI-037: the same conformance corpora](../mbse-basis/docs/PRINCIPLES.md#PRI-037), [PRI-038: the same cases in both languages](../mbse-basis/docs/PRINCIPLES.md#PRI-038), [PRI-039: 100% coverage of both](../mbse-basis/docs/PRINCIPLES.md#PRI-039) and [PRI-040: deliberate differences listed](../mbse-basis/docs/PRINCIPLES.md#PRI-040), the differences listed in `docs/EQUIVALENCE.md`. Here the output is generated source, which must be byte-identical in both.
- **Tests**: [PRI-035: tests are notebooks: one suite each, the same case IDs in the same order in both languages](../mbse-basis/docs/PRINCIPLES.md#PRI-035).
- **The skill**: after editing `skills/mbse-codegen-python/`, run `skills/sync.sh`; SKL-01 fails until the packaged copies match (the copy [PRI-016: guidance written once](../mbse-basis/docs/PRINCIPLES.md#PRI-016) plans to remove), and SKL-02 runs every complete program ([PRI-036: every program in a skill is complete and run; fragments are tagged as fragments](../mbse-basis/docs/PRINCIPLES.md#PRI-036)).
- **Work**: [PRI-029: parallel work in polyrepo workspaces](../mbse-basis/docs/PRINCIPLES.md#PRI-029), [PRI-031: the version is the contract](../mbse-basis/docs/PRINCIPLES.md#PRI-031), [PRI-032: a sibling's gap is reported, not worked around](../mbse-basis/docs/PRINCIPLES.md#PRI-032) and [PRI-033: work lands by branch and pull request](../mbse-basis/docs/PRINCIPLES.md#PRI-033).
- **Behavior is decided in mbse-basis items**: [CAP-027: Python3 source generated from schemas](../mbse-basis/docs/capabilities/CAP-027.md), [CAP-039: schemas round-trip through Python3](../mbse-basis/docs/capabilities/CAP-039.md) and [FEA-021: every generation ambiguity a parameter](../mbse-basis/docs/features/FEA-021.md), recorded as the basis says ([Detail files](../mbse-basis/docs/README.md#detail-files)).
- **Generation is invertible** ([CAP-080: invertible transforms](../mbse-basis/docs/capabilities/CAP-080.md), [CAP-039: schemas round-trip through Python3](../mbse-basis/docs/capabilities/CAP-039.md)): every transform that writes Python has an inverse that reads it back,
  and the tests check both round trips (schemas to source to schemas, and source to schemas to source).
- Never write to `~/.claude/projects/*/memory/` or any hidden memory: what is worth keeping goes in the repository.

## Commands

```sh
python3 ../mbse-basis/scripts/polyrepo.py clone # the mbse siblings, beside this repository, pinned
python3 ../mbse-basis/scripts/polyrepo.py check # the siblings are present and compatible with siblings.json
cd python3 && uv sync --all-extras              # Python: use uv, never pip
uv run coverage run -m pytest && uv run coverage combine && uv run coverage report

cd typescript5 && nvm use && npm install        # TypeScript: Node 22 or later
npm run coverage                                # type-checks, runs every notebook, gates at 100%
```

## Related repositories

Sibling checkouts beside this one, pinned by version and commit in `siblings.json` (see mbse-basis'
`scripts/polyrepo.py`): [mbse-schemas](https://github.com/pitaman71/mbse-schemas) (the schemas, reflected as a store's
objects), [mbse-expressions](https://github.com/pitaman71/mbse-expressions) (the transforms' constraints),
[mbse-patterns](https://github.com/pitaman71/mbse-patterns) (`Transforms`: sessions, steps, policies and traces) and
[mbse-programs](https://github.com/pitaman71/mbse-programs) (Python's syntax trees, parsing and printing). The other
target languages have their own repositories: mbse-codegen-ccpp, mbse-codegen-typescript and mbse-codegen-verilog.
