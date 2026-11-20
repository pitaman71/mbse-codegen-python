<!-- nav -->
[← Why the mbse repositories exist](../MBSE.md) · [Home](../README.md) · [Python package →](../python3/README.md)

# Equivalence

The Python (`mbse.Codegen.Python`) and TypeScript (`@mbse/codegen-python`) implementations have the same modules,
names, error classes and messages, the same test cases in the same order, and generate byte-identical Python source.
They follow the conventions of mbse-schemas, mbse-transforms and mbse-programs; the differences below are deliberate,
each forced by the language. Any other difference is a bug.
This is the list mbse-basis [PRI-040: deliberate differences listed](https://github.com/pitaman71/mbse-basis/blob/main/docs/PRINCIPLES.md#PRI-040) asks every
repository to keep.

## Set aside until the port's stage 5

`Types` is being ported onto mbse-transforms, Python first, and TypeScript in a stage of its own, after mbse-programs'
TypeScript builds Python 3 trees as values ([the port proposal](proposals/port/README.md#the-typescript-side), Decided,
9). Until then the implementations differ by what is set aside, not by a deliberate difference:

| Set aside in TypeScript | What Python has instead | Restored |
|---|---|---|
| `src/Types.ts`, 0.16's `Types`: excluded from the type check (`tsconfig.json`) and from coverage (`.c8rc.json`), and exported by nothing (`src/index.ts`); it imports mbse-patterns and mbse-programs 0.3, which the package no longer depends on | `Types` 0.17: `install` and `INSTALLS`, the transforms as data | stage 5 |
| `tests/01_Types.ipynb`, 0.16's suite TYP, and `tests/support.ts`, the helpers it alone uses: not run (`package.json` names the notebooks the gate runs) and not type-checked | suite INS, `tests/01_Install.ipynb`; 0.16's suite TYP and `tests/support.py` removed | stage 5 |

TypeScript's gate runs suite SKL alone, which loads the package and imports Node's `assert` in place of `support.ts`'s.

## Deliberate differences

None yet: each returns with the code it concerns, from stage 5.

---

<!-- nav -->
[← Why the mbse repositories exist](../MBSE.md) · [Home](../README.md) · [Python package →](../python3/README.md)
