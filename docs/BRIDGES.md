<!-- nav -->
[← Why the mbse repositories exist](../MBSE.md) · [Home](../README.md) · [Code generation for Python →](CODEGEN.md)

# Bridges for types

The first step of the gamified transforms process: enumerate the feasible bridges from existing models, each useful
and deterministic, before documenting the steps that take them. This lists every construct of mbse-schemas' meta-model
(0.9) and its Python form: which are built, which are feasible and not built, and which wait on another repository.
"Fully functional for types" means every row marked feasible is built, with no silent loss.

A bridge is **deterministic** when the schema and the step's arguments fix the source exactly. An ambiguity in a bridge
is a **parameter** of its step, which the caller decides or a policy ranks; a bridge with none has no parameter. Every
bridge also **reads back**: Python's form holds what the schema holds, the step's arguments aside.

## Status of the process

| Step of the process | Where Types stands |
|---|---|
| Enumerate the feasible bridges, useful and deterministic | Not done up front: bridges were added one by one (0.1–0.8). This document does it now |
| Document the algorithm as transform steps | Done for the built bridges: [CODEGEN.md, Transforms](CODEGEN.md#transforms) |
| Capture each ambiguity as a parameter of its step | Partly: `frozen` is the one parameter. Other choices were made once for every schema (a tuple for entries, `\| None = None`, `from_`), and some left the output silently until 0.9.1 (below) |
| Dataclasses, with builders and visitors, for every step type | Generic: a step type is an mbse-patterns `Transform` whose parameters are `OfParameter`s. A step and a trace are schema-driven data. There is no dataclass per step type |
| A stepwise-forward procedure | Done: mbse-patterns' `Session` |
| The caller iterates the next possible steps | Done: `session.candidates()` |
| The caller supplies a step's parameters | Done: `session.take(candidate)` with its arguments |
| The caller browses and selects among step types | Done: candidates of every transform, at every match |
| The trace keeps the order, and role-specific links to source and target elements | Done (mbse-patterns 0.9, codegen 0.9.2): a step links its source elements by symbol (`s=Contact`) and the target elements it wrote by role (`class`, `alias`, `schema`), as relations `Transforms.Matched` and `Transforms.Wrote`, each entry with its path |
| Policies reduce or remove interactive choices | Done: `Policy`, `Clause`, `Types.PLAIN` |

## Silent losses

Until 0.9.1 these broke CODEGEN.md's own "no silent loss" decision: each got a class or a field anyway, `missing` did
not report it, and reading back did not restore it. 0.9.1 writes and reads each, or leaves the schema without a class:

- an object schema's **singleton** name, now `SINGLETON`;
- the **description** of a property, a relation's property, a branch or a part, and an adjacency, now field metadata
  (and, where no field holds it, `Annotated` metadata or `DESCRIPTIONS`);
- a native's **width** or its own description, which `int` cannot hold: no class in 0.9.1, reported by `missing`, and
  `Annotated` metadata since 0.11.

## Natives

| Construct | Python bridge | Ambiguity, as a parameter | Status |
|---|---|---|---|
| Basic native (`bool`, `int`, `float`, `str`, `bytes`) | Python's own type | none | built |
| `python3` token of a basic native | the same type, the token in metadata: `Annotated[int, {"native": ["python3", "int"]}]`, so that it reads back as `python3` | none | built (0.12). Another `python3` token (`decimal.Decimal`) is invalid since mbse-schemas 0.10, as the user decided |
| Native of another format (`ccpp` `int32_t`, `typescript5` `number`) | none: only Python's and basic natives are supported (CODEGEN.md, Resolved). A named one has no alias, and every reference to it is `Any`; an inline one is `Any` where it is held | none | dropped (0.15, `DropFormat`); an open question |
| Width in bits or bytes, an int | metadata: `Annotated[int, {"bits": 32}]` | none | built (0.11) |
| A native's own description | metadata: `Annotated[int, {"description": "a count"}]` | none | built (0.11) |
| Width as a term | the term, written with the parameters' TypeVars (CODEGEN.md, Resolved) | | not built yet: the parametric bridge (Codegen/Expressions for a compound term); a schema holding one has no class yet |
| Named native (`Word`) | `type Word = str`, its description in `Annotated` metadata | none: a `NewType` was considered, but it cannot hold the `Annotated` metadata, and a proxy's value is the plain `str` anyway | built (0.10) |

## Objects

| Construct | Python bridge | Ambiguity, as a parameter | Status |
|---|---|---|---|
| Named value object schema | `@dataclass` class | `frozen` | built |
| Named reference object schema | `@dataclass(eq=False)` | `frozen` | built |
| Singleton | `SINGLETON: ClassVar[str] = "Codegen.Output"` | none | built (0.9.1) |
| Description | the class's docstring | none | built |
| Property | field `name: T \| None = None` | none | built |
| Property named by a keyword | `from_`, read back without the underscore | none | built |
| Property's description | `field(default=None, metadata={"description": ...})`, as an adjacency's `"me"` | none | built (0.9.1) |
| Adjacency | as specified (mbse-schemas' FRAMEWORK.md, Resolved, Adjacencies): one field named after it, an Iterable over full entries of the relation's entry class: `phones: tuple[Phones, ...] = ()` | none: any Iterable meets the contract, so there is nothing to choose. A set sorted by a comparator is an open question | built (0.6) |
| Adjacency's description | in the field's metadata | none | built (0.9.1) |
| Inline object schema as a property's type | none: a Python class needs a name, which is the schema's to give (CODEGEN.md, Resolved) | none | dropped (0.15, `DropInline`): `Any` where it is held; an open question |
| Anonymous adjacency (the TODO's: participation without storage) | no field. A class variable may list them | | waits on mbse-schemas |

## Relations

| Construct | Python bridge | Ambiguity, as a parameter | Status |
|---|---|---|---|
| Named relation | entry class: a field per link, then its properties; `LINKS`, `UNIQUES` | none | built |
| Relation's property description | in the field's metadata, as an object's | none | built (0.9.1) |
| Self-relation adjacencies | `field(default=(), metadata={"me": ...})` | none | built |
| Unnamed relation | none: an entry class needs a name (CODEGEN.md, Resolved) | none | dropped (0.15, `DropInline`): an adjacency to one holds `tuple[Any, ...]` |

## Unions and intersections

| Construct | Python bridge | Ambiguity, as a parameter | Status |
|---|---|---|---|
| Named union | value class, a field per branch, `KIND = "union"` | `frozen` | built |
| Flat union (the schema's configuration) | `type X = A \| B`, names and description in `Annotated` | none | built |
| Named intersection | value class, a field per part | `frozen` | built |
| Flat intersection | class of its parts' properties, `PARTS` | `frozen` | built |
| Branch's or part's description | field metadata; in a flat union, `Annotated` metadata; in a flat intersection, `DESCRIPTIONS` | none | built (0.9.1) |
| Inline union or intersection as a property's type | none, as an inline object schema (CODEGEN.md, Resolved) | none | dropped (0.15, `DropInline`) |
| Branch of an inline type | none, as an inline object schema (CODEGEN.md, Resolved) | none | dropped (0.15, `DropInline`): the branch is `Any` |

## Lists

| Construct | Python bridge | Ambiguity, as a parameter | Status |
|---|---|---|---|
| Positional list | `list[T]` | none | built |
| Keyed by a native a `dict` compares as schema equality does (`str`, `int`, `bool`, `bytes`) | `dict[K, V]` | none | built |
| Keyed by a `float`, a list, a value object, a union or an intersection | `Proxies.OfIndexed.Map[K, V]`, mbse-schemas' keyed list (CODEGEN.md, Resolved, Keys a `dict` cannot hold faithfully) | none: the user decided the form; keys need not be hashable, so no class must be frozen | built (0.13). Until 0.13 a `float` key was a `dict`, which lost `-0.0` against `0.0` and every NaN |
| Extent with int bounds | `Annotated[list[T], {"minimum": 0, "maximum": 9}]`, the maximum only where it has one | none: a fixed `tuple[T, T, T]` was considered, but an extent bounds a list's keys, not how many items it holds | built (0.11) |
| Extent with a term | the term, written with the parameters' TypeVars: a tensor's shape (CODEGEN.md, Resolved) | | not built yet: the parametric bridge; a schema holding one has no class yet |
| Named list (`Names`) | `type Names = list[str]`, a dict keyed by a named native too | none | built (0.10) |
| Lists nested to any depth | as above | none | built (0.9); since 0.15 only `Types.Unbuilt`, a predicate that applies itself to the item, keeps a type from rendering |

## Parametrics

| Construct | Python bridge | Ambiguity, as a parameter | Status |
|---|---|---|---|
| Value parameters (`Matrix[rows, cols]`) | TypeVars, as the user decided (CODEGEN.md, Resolved): proposed, PEP 695 type parameters bounded by the parameters' types, `class Matrix[rows: int, cols: int]` | none: the form is decided | not built yet: the parametric bridge; never dropped |
| Application (`OfApply`) with literal arguments | proposed, `Literal` type arguments: `Matrix[Literal[3], Literal[4]]` | none | not built yet: the parametric bridge |
| Arguments that are terms | rendered by `Codegen/Expressions` | | waits on Codegen/Expressions |
| Type parameters | `class Box[T]` | | waits on mbse-schemas (type parameters are not built) |

## The module

| Construct | Python bridge | Ambiguity, as a parameter | Status |
|---|---|---|---|
| Schemas of one store | one module, classes and aliases in name order | none | built |
| Dotted names (`Codegen.Output`) | a class nested in the class of its prefix, its `__qualname__` the schema's name (CODEGEN.md, Resolved, Dotted names are nested classes) | none: the user decided the form, so there is no `layout` | built (0.14) |
| A name Python cannot spell | written as it is, flagged by mbse-programs' validation, an error when the source is taken | none: the policy, not a bridge. A name is the schema's to configure; codegen never renames | built (0.4) |
| Instances that serialize and validate as the store's objects | the module binds its classes to the schemas (mbse-schemas' `Bindings`), so `to_plain` and `from_plain` give the wire form | `bound`: whether generated code depends on mbse-schemas at run time. A module holding a `Proxies.OfIndexed.Map` already does (0.13) | feasible |

## Not bridged on purpose

- **Constraints** on a type (once mbse-schemas has them) are Codegen/Patterns' work: checks in `__post_init__`, or
  a validator beside the classes.
- **The older adapter** (`Adapters/Dataclasses.py`) maps containers of dataclasses to relations. It is an earlier,
  different bridge, to retire or rebuild as transforms. It is not a row here.

## Proposed order

1. **Recursive predicates** (mbse-patterns 0.8.2, done): a predicate applies itself, so whether a type renders is one
   recursive predicate, and `DEPTH` is gone.
2. **No silent loss** (0.9.1, done): the singleton and every description, written and read back, and widths left
   without a class.
3. **Target links in the trace** (mbse-patterns 0.9, codegen 0.9.2, done): each step links the elements it matched
   and wrote, by role, as relations whose entries hold their paths.
4. The deterministic rows without parameters: named natives and lists as aliases (0.10, done), widths, natives' own
   descriptions and extents with int bounds (0.11, done), `python3` tokens (0.12, done).
5. The rows with a parameter: none remain. Keys of schemas (0.13) and dotted names (0.14) need none, other formats'
   natives are not bridged (no `host`), and inline schemas are dropped (no `name`).
6. **Drops as steps** (0.15, done): every type that gets no Python form is dropped by a transform step of its own, which says why
   (CODEGEN.md, Resolved, Inline schemas are dropped).
7. Bindings (`bound`).
8. Value parameters and applications, once their `form` options are chosen.
9. Rows that wait on other repositories: terms (Codegen/Expressions), type parameters and anonymous adjacencies
   (mbse-schemas).

---

<!-- nav -->
[← Why the mbse repositories exist](../MBSE.md) · [Home](../README.md) · [Code generation for Python →](CODEGEN.md)
