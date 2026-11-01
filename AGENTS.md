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

## Read before any work

Agents must read these mbse-basis documents before doing any work:

- [The mbse basis](../mbse-basis/docs/README.md)
- [Principles](../mbse-basis/docs/PRINCIPLES.md)
- [Features](../mbse-basis/docs/features/README.md)
- [Capabilities](../mbse-basis/docs/capabilities/README.md)

These may be read selectively, on demand: [Vocabulary](../mbse-basis/docs/VOCABULARY.md) and
[Qualities](../mbse-basis/docs/QUALITIES.md).

Never write to `~/.claude/projects/*/memory/` or any hidden memory: what is worth keeping goes in the repository.

## Commands

```sh
python3 ../mbse-basis/scripts/polyrepo.py clone # the mbse siblings, beside this repository, pinned
python3 ../mbse-basis/scripts/polyrepo.py check # the siblings are present and compatible with siblings.json
cd python3 && uv sync --all-extras              # Python: use uv, never pip
uv run coverage run -m pytest && uv run coverage combine && uv run coverage report

cd typescript5 && nvm use && npm install        # TypeScript: Node 22 or later
npm run coverage                                # type-checks, runs every notebook, gates at 100%

skills/sync.sh                                  # after editing skills/mbse-codegen-python/: the packaged copies (SKL-01)
```

## Related repositories

Sibling checkouts beside this one, pinned by version and commit in `siblings.json` (see mbse-basis'
`scripts/polyrepo.py`): [mbse-schemas](https://github.com/pitaman71/mbse-schemas) (the schemas, reflected as a store's
objects), [mbse-expressions](https://github.com/pitaman71/mbse-expressions) (the transforms' constraints),
[mbse-patterns](https://github.com/pitaman71/mbse-patterns) (`Transforms`: sessions, steps, policies and traces) and
[mbse-programs](https://github.com/pitaman71/mbse-programs) (Python's syntax trees, parsing and printing). The other
target languages have their own repositories: mbse-codegen-ccpp, mbse-codegen-typescript and mbse-codegen-verilog.
