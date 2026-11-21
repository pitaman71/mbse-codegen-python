# Guide for AI agents

mbse-codegen-python renders [mbse-schemas](https://github.com/pitaman71/mbse-schemas)' schemas as Python source, and
reads Python source back into schemas, through [mbse-programs](https://github.com/pitaman71/mbse-programs)' Python
syntax trees, step by step with [mbse-transforms](https://github.com/pitaman71/mbse-transforms)' transforms. Two
equivalent implementations exist: `python3/` and `typescript5/`; both generate Python. `Types` is being ported onto
mbse-transforms, stage by stage, as [the port proposal](docs/proposals/port/README.md) says.

## Start here

| You want to | Read |
|---|---|
| Know why the mbse repositories exist, and this one's part in them | [Why the mbse repositories exist](MBSE.md) |
| Use the library: generate Python from schemas, or read it back | [mbse-codegen-python](skills/mbse-codegen-python/SKILL.md), a skill |
| Understand a design decision or an open question | mbse-basis [CAP-027: Python3 source generated from schemas](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/CAP-027.md), by section (and [CAP-039: schemas round-trip through Python3](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/CAP-039.md), [FEA-021: every generation ambiguity a parameter](https://github.com/pitaman71/mbse-basis/blob/main/docs/features/FEA-021.md)) |
| Change the package | this file, then [Equivalence](docs/EQUIVALENCE.md) |
| Find or add a test case | [Test plan](python3/tests/TestPlan.md) (TypeScript's plan lists only its differences) |
| Define, apply and certify the transforms | [mbse-transforms' AGENTS.md](https://github.com/pitaman71/mbse-transforms/blob/main/AGENTS.md), in the sibling checkout |
| Build or print syntax trees | [mbse-programs' AGENTS.md](https://github.com/pitaman71/mbse-programs/blob/main/AGENTS.md), in the sibling checkout |

## Read before any work

Agents must read these mbse-basis documents before doing any work:

- [The mbse basis](https://github.com/pitaman71/mbse-basis/blob/main/docs/README.md)
- [Principles](https://github.com/pitaman71/mbse-basis/blob/main/docs/PRINCIPLES.md)
- [Features](https://github.com/pitaman71/mbse-basis/blob/main/docs/features/README.md)
- [Capabilities](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/README.md)

These may be read selectively, on demand: [Vocabulary](https://github.com/pitaman71/mbse-basis/blob/main/docs/VOCABULARY.md) and
[Qualities](https://github.com/pitaman71/mbse-basis/blob/main/docs/QUALITIES.md).

Never write to `~/.claude/projects/*/memory/` or any hidden memory: what is worth keeping goes in the repository.

Resolve a link written `mbse:<repo>/<path>`, as skills and source comments write a link into another mbse
repository, to the first of these that exists: in a polyrepo checkout, `<repo root>/../<repo>/<path>`, where `<repo
root>` is this repository's root; for a link into the installed package's own repository, `<path>` without its
language directory (`python3/` or `typescript5/`), under the installed package's root (Python: the `site-packages`
directory that holds `mbse/`; npm: the package's directory), where the package ships that file; otherwise
`https://github.com/pitaman71/<repo>/blob/main/<path>`.

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
objects), [mbse-expressions](https://github.com/pitaman71/mbse-expressions) (the expressions of Python's statements,
their annotations among them), [mbse-transforms](https://github.com/pitaman71/mbse-transforms) (`Transforms`: the
transforms as data, their application, certificates, candidates and policies) and
[mbse-programs](https://github.com/pitaman71/mbse-programs) (Python's syntax trees, parsing and printing). The other
target languages have their own repositories: mbse-codegen-ccpp, mbse-codegen-typescript and mbse-codegen-verilog.
