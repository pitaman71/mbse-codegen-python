<!-- nav -->
[← Why the mbse repositories exist](../MBSE.md) · [Home](../README.md) · [Python package →](../python3/README.md)

# Equivalence

The Python (`mbse.Codegen.Python`) and TypeScript (`@mbse/codegen-python`) implementations have the same modules,
names, error classes and messages, the same test cases in the same order, and generate byte-identical Python source.
They follow the conventions of mbse-schemas, mbse-patterns and mbse-programs; the differences below are deliberate,
each forced by the language. Any other difference is a bug.
This is the list mbse-basis [CAP-032: deliberate differences listed](../../mbse-basis/docs/capabilities/README.md#CAP-032) asks every
repository to keep.

| Concern | Python | TypeScript | Why | Cases |
|---|---|---|---|---|
| The output's identity | `id(self)` | a string unique to it (`"output 3"`) | mbse-schemas keys identities by `String(identity())` | TYP-01 |
| A candidate's match and arguments, a clause's arguments | dicts; `T.Clause("Dataclass", {"frozen": True})` | records; `new T.Clause("Dataclass", { frozen: true })` | as mbse-patterns' | TYP-02, TYP-03 |
| A schema's properties | a dict | a `Map` | as mbse-schemas' | TYP-04 |
| Integers | `int` | `bigint` | as mbse-schemas' | TYP-02 |

---

<!-- nav -->
[← Why the mbse repositories exist](../MBSE.md) · [Home](../README.md) · [Python package →](../python3/README.md)
