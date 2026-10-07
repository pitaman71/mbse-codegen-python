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
| Understand a design decision or an open question | [docs/CODEGEN.md](docs/CODEGEN.md), by section |
| Change the package | this file, then [docs/EQUIVALENCE.md](docs/EQUIVALENCE.md) |
| Find or add a test case | [python3/tests/TestPlan.md](python3/tests/TestPlan.md) (TypeScript's plan lists only its differences) |
| Write the transforms' constraints | [mbse-patterns' AGENTS.md](https://github.com/pitaman71/mbse-patterns/blob/main/AGENTS.md), in the sibling checkout |
| Build or print syntax trees | [mbse-programs' AGENTS.md](https://github.com/pitaman71/mbse-programs/blob/main/AGENTS.md), in the sibling checkout |

## Invariants when changing code

- **One vocabulary across the mbse repositories.** A kind's or schema's named members are *properties*, never
  "fields" (a field is only the host language's class member that holds one). An element of an expression tree is
  a *term* (mbse-expressions), and of a program tree a *syntax node* (mbse-programs); never a bare "node" in code,
  docs or messages. What a specification requires is a *constraint*, never a "rule"; a constraint is checked,
  resolved or generated from, never executed ([MBSE.md, What a specification is made
  of](MBSE.md#what-a-specification-is-made-of)). Across this many languages, terms collide (an SVA
  `property`, a C++ template parameter, a SystemVerilog `constraint` block): wherever ours meets a language's own,
  in docs and examples, qualify the colliding term with whose it is. Here the seam is everywhere: a schema's
  *property* becomes a dataclass *field*, and Python's `@property` is Python's.
- **The README opens with why.** Its first sentence or paragraph says, TL;DR style, why this repository exists, in
  the terms of `MBSE.md`; what it is comes after. Keep that opening true as the repository changes.
- **Every human-facing document has navigation.** A `{previous, home, next}` line heads and ends each document in
  reading order; after adding, renaming or retitling one, run `python3 ../mbse-schemas/scripts/nav.py .`. Link text
  is human-readable, never a path.
- **Parallel work happens in workspaces.** Agents working at the same time each get a workspace from
  `python3 scripts/siblings.py workspace <dir> --branch <name>` (with `--edit <sibling>` for a change that spans
  repositories), install there, and `land` it when done.
- **The two implementations are equivalent.** Change both in the same commit, with the same names, the same error
  classes and byte-identical messages. Generated source must be byte-identical. A difference not listed in
  `docs/EQUIVALENCE.md` is a bug.
- **Generation is invertible.** Every transform that writes Python has an inverse that reads it back; the tests check
  both round trips (schemas to source to schemas, and source to schemas to source).
- **Tests are Jupyter notebooks**, one suite per notebook, with the same case IDs in the same order in both
  languages. Each case is a markdown cell `## ID · title` followed by one code cell. Notebooks are JSON written with
  `indent=1`, `sort_keys=True` and `ensure_ascii=False`.
- **Coverage is 100%** in both languages (statements and branches; in TypeScript also functions and lines). Close a gap
  with an assertion in the shared case, in both suites.
- **The skill is packaged with each implementation.** After editing `skills/mbse-codegen-python/`, run
  `skills/sync.sh`.
- **Behavior is decided in `docs/CODEGEN.md`.** Record new decisions under Resolved, and put what stays undecided
  under Open questions.

## Commands

```sh
python3 scripts/siblings.py clone            # the mbse siblings, beside this repository, pinned
python3 scripts/siblings.py check            # the siblings are present and compatible with siblings.json
cd python3 && uv sync --all-extras           # Python: use uv, never pip
uv run coverage run -m pytest && uv run coverage combine && uv run coverage report

cd typescript5 && nvm use && npm install     # TypeScript: Node 22 or later
npm run coverage                             # type-checks, runs every notebook, gates at 100%
```

## Related repositories

Sibling checkouts beside this one, pinned by version and commit in `siblings.json` (see `scripts/siblings.py`):
[mbse-schemas](https://github.com/pitaman71/mbse-schemas) (the schemas, reflected as a store's objects),
[mbse-expressions](https://github.com/pitaman71/mbse-expressions) (the transforms' constraints),
[mbse-patterns](https://github.com/pitaman71/mbse-patterns) (`Transforms`: sessions, steps, policies and traces) and
[mbse-programs](https://github.com/pitaman71/mbse-programs) (Python's syntax trees, parsing and printing). The other
target languages have their own repositories: mbse-codegen-ccpp, mbse-codegen-typescript and mbse-codegen-verilog.
