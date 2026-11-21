<!-- nav -->
[← Python package](../README.md) · [Home](../../README.md) · [TypeScript package →](../../typescript5/README.md)

# Test plan

One suite per notebook, with the same case IDs, in the same order, in both implementations; each case is a markdown
cell `## ID · title` followed by one code cell. TypeScript's plan lists only its differences.

`Types` is being ported onto mbse-transforms, stage by stage, as
[the port proposal](../../docs/proposals/port/README.md#stages) says. 0.16's suite TYP was removed with 0.16's code, and
each later stage adds its cases anew: stage 2 ports TYP's cases of rendering, stage 3 those of applications, policies
and regeneration, stage 4 the round trips.

| Notebook | Suite | Cases | Covers |
|---|---|---|---|
| `01_Install.ipynb` | INS | 4 | The transforms as data, in a store `Types.INSTALLS` writes: each transform found in mbse-transforms' catalog by name, in the proposal's order, naming its procedure (its own name) and its prototype, `Codegen.<transform>`, whose symbol binds its kind of schema (`s`, `r`, or `m`, a Python 3 module), and no `NativeAlias`, `DropFormat` or `AliasSchema`; each prototype's parameters and their domains (`frozen` and `slots`, each a `Schemas.OfBool`, for `Dataclass`, `Union` and `Intersection`; `slots` for `Entry`; none for the others), each valid by `Parametrics.validate`; installed again, by `INSTALLS` and by `install`, nothing written; the measure of what each prototype's spec states, each run as a query over a store of schemas of every kind: what each keeps (a schema declaring parameters, an object schema with an adjacency to a relation declaring them, a union not flat or flat, without branches, with `flat` absent, an intersection without parts), what needs an expression and so is kept for the caller's verification (an object schema holding a schema declaring parameters, every named schema of a drop's kind), and the module `Schema` binds |
| `02_Skill.ipynb` | SKL | 3 | The packaged copy of the skill is current; every complete program in the skill runs, none while the skill teaches 0.16's API, its programs tagged `python 0.16` and `typescript 0.16`, until the port's stage 6; every link in the agent guides resolves, anchors included |

Total: 7 cases.

## Not testable yet

The procedures, their application and their certificates (the port's stages 2 to 4); what each prototype states only
by an expression, which waits on
[CAP-142: expressions evaluated in queries](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/CAP-142.md).

---

---

<!-- nav -->
[← Python package](../README.md) · [Home](../../README.md) · [TypeScript package →](../../typescript5/README.md)
