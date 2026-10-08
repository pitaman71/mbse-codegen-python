<!-- nav -->
[← Python package](../README.md) · [Home](../../README.md) · [TypeScript package →](../../typescript5/README.md)

# Test plan

One suite per notebook, with the same case IDs, in the same order, in both implementations; each case is a markdown
cell `## ID · title` followed by one code cell. `support.py` holds the shared helpers. TypeScript's plan lists only its
differences.

| Notebook | Suite | Cases | Covers |
|---|---|---|---|
| `01_Types.ipynb` | TYP | 9 | The store of a session: the schemas a store registers and those they refer to, Python's syntax trees, and the output, whose singleton holds the module, read through the visitor protocols with a module and without, its extent reached from the output; `Dataclass`'s candidates, one per value of `frozen`, for each object schema it renders, and none for those it does not (an inline object, another format's native, a bounded list, a named native, a named union, lists nested past `DEPTH`, a dict keyed by a schema, parameters, adjacencies), `missing` before and after a run; steps taken by the caller and by a policy, the module printed exactly (imports once, classes in name order, `eq=False`, `frozen=True` and both, a docstring with escapes, `pass`, natives, named schemas and lists), the trace, `generate` with its default policy and another, a valid tree; `Schema` reading classes back (references filled when read, lists, `eq=False`, docstrings in double, single and triple quotes with escapes, annotations without `\| None`, fields with other values, a first statement that is not a docstring, undecorated and otherwise decorated classes not read, a store given), and the annotations it refuses, by field (`dict` without two parameters, `set`, attributes, unions of types, other operators); both round trips, given the same decisions; regenerating after the schemas change: decisions taken again by key (the schema's name), the new schema left to ask, the gone one reported as an orphan, the diff of the two generations, `generate` given earlier steps; dicts keyed by natives, nested lists and keyword fields, generated exactly, read back and generated again; names Python cannot spell written as the schemas have them, reported by path, and refused when the source is taken; relations as container fields (`set`, `list`, `dict` with another key name, two element classes with backs by type, a self-relation with uniques, a relation as its field says, one with another name and links), both round trips, what has no container form (three links, two properties, no unique, parameters, a float key, value objects or nothing at the second link, two uniques, the second side alone), reading back (a set of value classes refused, a list of them a property, `field(default=None)`, a dict's default key, a schema the store holds, an unknown class refused) |
| `02_Skill.ipynb` | SKL | 3 | The packaged copy of the skill is current; every complete program in the skill runs; every link in the agent guides resolves, anchors included |

Total: 12 cases, with the same IDs in the same order in both implementations.

## Not testable yet

What is not rendered yet: unions and intersections, parametric schemas, relations, other natives (see the design's
open questions); diffs and incremental rebuilds (mbse-patterns' plan).

---

---

<!-- nav -->
[← Python package](../README.md) · [Home](../../README.md) · [TypeScript package →](../../typescript5/README.md)
