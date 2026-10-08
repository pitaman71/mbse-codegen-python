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
- a native's **width** or its own description, which `int` cannot hold: now no class, reported by `missing`.

## Natives

| Construct | Python bridge | Ambiguity, as a parameter | Status |
|---|---|---|---|
| Basic native (`bool`, `int`, `float`, `str`, `bytes`) | Python's own type | none | built |
| `python3` token of a basic native | the same type; reads back as `basic` | none (both tokens map to one host type) | feasible: it is refused today. Reading back cannot tell the two apart, so the format would go in metadata |
| Native of another format (`ccpp` `int32_t`, `typescript5` `number`) | a basic Python type, the token kept in metadata: `Annotated[int, {"native": ["ccpp", "int32_t"]}]` | `host`: which basic type. A policy may hold a table of them | feasible |
| Width in bits or bytes, an int | metadata: `Annotated[int, {"bits": 32}]` | none | feasible: no class today (was lost until 0.9.1) |
| Width as a term | the term, rendered by `Codegen/Expressions` | | waits on Codegen/Expressions |
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
| Adjacency | one field holding its entries: `phones: tuple[Phones, ...] = ()` | `container`: a tuple, a list, or a set sorted by a comparator. Today it is always a tuple | built, without the parameter |
| Adjacency's description | in the field's metadata | none | built (0.9.1) |
| Inline object schema as a property's type | a class nested in its owner (`Contact.Address`) | `name`: Python needs one, by default the property's name in CamelCase | feasible: no candidate today |
| Anonymous adjacency (the TODO's: participation without storage) | no field. A class variable may list them | | waits on mbse-schemas |

## Relations

| Construct | Python bridge | Ambiguity, as a parameter | Status |
|---|---|---|---|
| Named relation | entry class: a field per link, then its properties; `LINKS`, `UNIQUES` | none | built |
| Relation's property description | in the field's metadata, as an object's | none | built (0.9.1) |
| Self-relation adjacencies | `field(default=(), metadata={"me": ...})` | none | built |
| Unnamed relation | an entry class needs a name | `name` | feasible: no candidate today |

## Unions and intersections

| Construct | Python bridge | Ambiguity, as a parameter | Status |
|---|---|---|---|
| Named union | value class, a field per branch, `KIND = "union"` | `frozen` | built |
| Flat union (the schema's configuration) | `type X = A \| B`, names and description in `Annotated` | none | built |
| Named intersection | value class, a field per part | `frozen` | built |
| Flat intersection | class of its parts' properties, `PARTS` | `frozen` | built |
| Branch's or part's description | field metadata; in a flat union, `Annotated` metadata; in a flat intersection, `DESCRIPTIONS` | none | built (0.9.1) |
| Inline union or intersection as a property's type | a nested class, or a nested alias | `name`, as for an inline object | feasible: no candidate today |
| Branch of an inline type | a nested class of the union | `name` | feasible: no candidate today |

## Lists

| Construct | Python bridge | Ambiguity, as a parameter | Status |
|---|---|---|---|
| Positional list | `list[T]` | none | built |
| Keyed by a basic native | `dict[K, V]` | none | built |
| Keyed by a value object, union or intersection | `dict[K, V]` | none, but K's class must be hashable, so K's step must take `frozen=True`: a constraint between two steps | feasible |
| Extent with int bounds | `Annotated[list[T], {"extent": [0, 9]}]` | none: a fixed `tuple[T, T, T]` was considered, but an extent bounds a list's keys, not how many items it holds | feasible |
| Extent with a term | the term, rendered by `Codegen/Expressions` | | waits on Codegen/Expressions |
| Named list (`Names`) | `type Names = list[str]`, a dict keyed by a named native too | none | built (0.10) |
| Lists nested to any depth | as above | none | built (0.9): `Types.Rendered` applies itself to the item, replacing `DEPTH`, which unrolled the check four deep |

## Parametrics

| Construct | Python bridge | Ambiguity, as a parameter | Status |
|---|---|---|---|
| Value parameters (`Matrix[rows, cols]`) | Python has no value parameters. Options: class variables set by a subclass per application (`class Matrix3x4(Matrix)`), `Literal` type parameters (`class Matrix[R: int, C: int]` applied as `Matrix[Literal[3], Literal[4]]`), or instance fields that are checked | `form`, as FRAMEWORK.md decided ("a parameter of the generating step") | feasible once the options are chosen; needs a decision |
| Application (`OfApply`) with literal arguments | the parametric class, applied in the form chosen above | follows the parametric's `form` | feasible with the above |
| Arguments that are terms | rendered by `Codegen/Expressions` | | waits on Codegen/Expressions |
| Type parameters | `class Box[T]` | | waits on mbse-schemas (type parameters are not built) |

## The module

| Construct | Python bridge | Ambiguity, as a parameter | Status |
|---|---|---|---|
| Schemas of one store | one module, classes and aliases in name order | none | built |
| Dotted names (`Codegen.Output`) | a package per prefix (`Codegen/__init__.py` holding `Output`), or one module with names mangled | `layout`. Today a dotted name is a problem when the source is taken | feasible |
| A name Python cannot spell | written as it is, then an error | `name`: a rename step, recorded in the trace | the error is built; the rename is feasible |
| Instances that serialize and validate as the store's objects | the module binds its classes to the schemas (mbse-schemas' `Bindings`), so `to_plain` and `from_plain` give the wire form | `bound`: whether generated code depends on mbse-schemas at run time | feasible |

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
4. The deterministic rows without parameters: named natives and lists as aliases (0.10, done), widths, extents with int bounds,
   `python3` tokens.
5. The rows with a parameter: other formats' natives (`host`), inline schemas (`name`), keys of schemas (`frozen`
   coupling), the adjacency `container`, dotted names (`layout`), the rename step.
6. Bindings (`bound`).
7. Value parameters and applications, once their `form` options are chosen.
8. Rows that wait on other repositories: terms (Codegen/Expressions), type parameters and anonymous adjacencies
   (mbse-schemas).

---

<!-- nav -->
[← Why the mbse repositories exist](../MBSE.md) · [Home](../README.md) · [Code generation for Python →](CODEGEN.md)
