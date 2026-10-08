<!-- nav -->
[← Bridges for types](BRIDGES.md) · [Home](../README.md) · [Equivalence →](EQUIVALENCE.md)

# Code generation for Python

Status: `Types` is built (0.1–0.8): schemas to dataclasses and type aliases, and back. It applies [mbse-patterns' transforms
design](https://github.com/pitaman71/mbse-patterns/blob/main/docs/TRANSFORMS.md) to Python: phase 2 of its plan, the
first transform with both directions.

## What it generates

`Types` renders mbse-schemas' object schemas as Python dataclasses, through mbse-programs' Python syntax trees, and
reads dataclasses back into schemas. The two directions are inverse: schemas to source and back gives the same schemas,
and source to schemas and back gives the same source, given the same decisions. `Expressions` and `Patterns` come later.

## One store, three parts

A session runs over one store, `Types.store(schemas, module)`, mbse-schemas' `Stores.Combined` of three:

- **the schemas**: `Reflection.of(schemas)`, whose objects are the schemas a store registers and the named schemas
  they refer to, each an object of its kind's meta-schema (`Schemas.OfObject.Schema`, named `Schemas.Object`, and the
  like). A transform's symbol declared with a meta-schema binds a schema, and its predicate says which schemas match.
  The store's data is never read;
- **the syntax trees**: mbse-programs' Python store, whose objects are syntax nodes;
- **the output**: a store of this repository's own, whose singleton `Codegen.Output` links the module, by
  `Codegen.Generated`, so that what is generated is reachable, and so matched.

Reading code back runs a session over the same three: the module given, parsed by a standard of mbse-programs, is
what is matched, and the schemas are what is written, into the store given.

## Transforms

One transform per kind of decision, each `before` and `after` over the same symbols, as mbse-patterns' `Transforms`
requires.

| Transform | Symbols | Before | After | Parameters |
|---|---|---|---|---|
| `Dataclass` | `s`: `Schemas.OfObject.Schema` | `s` is named, declares no parameters, holds no unbuilt type (`Types.Unbuilt`: parameters or terms), and has no adjacency to a relation declaring parameters | the module has a class named after `s` | `frozen`: `bool` |
| `Union` | `s`: `Schemas.OfUnion.Schema` | `s` is named, not `flat`, declares no parameters, has branches, and holds no unbuilt type (`Types.Unbuilt`: parameters or terms) | the module has a class named after `s` | `frozen`: `bool` |
| `Intersection` | `s`: `Schemas.OfIntersection.Schema` | `s` is named, declares no parameters, has parts, and holds no unbuilt type (`Types.Unbuilt`: parameters or terms), its inline parts' properties included where `flat` | the module has a class named after `s` | `frozen`: `bool` |
| `Alias` | `s`: `Schemas.OfUnion.Schema` | `s` is named, `flat`, declares no parameters, has branches, and holds no unbuilt type (`Types.Unbuilt`: parameters or terms) | the module has a type alias named after `s` | none |
| `Entry` | `r`: `Schemas.OfRelation.Schema` | `r` is named, declares no parameters, holds no unbuilt type (`Types.Unbuilt`: parameters or terms), and no link is declared by an object schema declaring parameters | the module has a class named after `r` | none |
| `Schema` | `c`: `Programs.Python.ClassDef` | `c` is decorated `@dataclass` or `@dataclass(...)` | a relation named after `c` has its links, or an object schema named after `c` has a property or adjacency per field, is `ref` where `c` is `eq=False`, and is described where `c` has a docstring | none |
| `NativeAlias` | `s`: `Schemas.OfNative.Schema` | `s` is named, declares no parameters, is a basic or a `python3` native, and its width is no term | the module has a type alias named after `s` | none |
| `ListAlias` | `s`: `Schemas.OfIndexed.Schema` | `s` is named, declares no parameters, its extent is of int bounds if any, and its item and key are not unbuilt | the module has a type alias named after `s` | none |
| `AliasSchema` | `al`: `Programs.Python.TypeAlias` | always | a schema named after `al` has been read: a union with branches, a native with a token, or a list with an item | none |
| `DropInline`, `DropFormat`, `DropUndeclared` | `s` (`r` for a relation): a meta-schema of each kind a reason applies to | `s` is named and holds a type dropped for the reason (an inline object, union, intersection or relation; another format's native; a link no object schema declares), or, `DropFormat`, is another format's native | the output records the drop (`Codegen.Dropped`): `s`, the reason, and where | none |

- **A class is one step**, with all its fields: its one decision is `frozen`, and the fields follow from the schema.
  A symbol binds a schema, never a property: a property is a value within a schema, read with `get`, quantified over
  (`s.get("properties").all(...)`) and compared deeply (mbse-expressions' Basic). A decision about one property, when
  there is one to take, will be a parameter of the schema's step.
- **What renders**: a basic or `python3` native as Python's name for it (`str`, `int`, `float`, `bool`, `bytes`), a
  named object schema, union, intersection, native or list by its name, a positional list as `list[...]` and a keyed
  list as `dict[K, V]` or `Proxies.OfIndexed.Map[K, V]` (see Keyed lists), of any of these, nested to any depth; a type
  dropped (see Drops) as `Any`. A type with parameters or terms is unbuilt (`Types.Unbuilt`, a predicate that applies
  itself to a list's item, mbse-patterns 0.8.2): a schema holding one has no class yet, rather than a field that names
  nothing, until the parametric bridge (see Open questions).
- **Drops are steps** (0.15; see Resolved). A type with no Python form is dropped by a step of its own, one transform
  per reason (`Types.DROPS`): `DropInline`, `DropFormat`, `DropUndeclared`. The step's schema is the named schema that
  is dropped as a whole (another format's native: no alias) or that holds the dropped type, which keeps its class; the
  output records each drop, `Codegen.Dropped`, and `Types.dropped(session)` reports them in order, each the schema's
  name, where in it (`""`, a property, adjacency, link, branch or part, `codes[item]` within a list), the transform and
  why. Where a dropped type is held, and wherever a schema dropped as a whole is named, the annotation is `Any`, which
  reading back refuses ("Any is a dropped type, which reading cannot restore"). A reason applies to several kinds of
  schema, and a transform's symbol to one, so each reason is a transform per kind it applies to (`Types.DROP`), all of
  one name.
- **Keyed lists**, as decided (see Resolved): a list keyed by a native a `dict` compares as schema equality does (`str`,
  `int`, `bool`, `bytes`, named or not) is `dict[K, V]`; any other key (a `float`, whose NaNs a `dict` never matches
  and whose `-0.0` it merges with `0.0`, a list, a value object, a union, an intersection) makes it mbse-schemas'
  `Proxies.OfIndexed.Map[K, V]`, which compares keys as schema equality does (mbse-schemas' EQUALITY.md) and is read
  with plain keys, as proxies' keyed lists are: `survey.weights[float("nan")]` reads either. A generated value object
  is a key by its class and the fields it has set. The module then imports `from mbse.Schemas.Framework import
  Proxies`, its one run-time dependency on mbse-schemas, and only where a keyed list needs it.
- **What an annotation cannot say is `Annotated` metadata** (0.11): a native's width (`Annotated[int, {"bits": 32}]`),
  a list's extent (`Annotated[list[Phone], {"minimum": 1, "maximum": 3}]`, the maximum only where it has one) and a
  native's or a list's own description, inline or in a named one's alias (`type Byte = Annotated[int, {"bits": 8,
  "description": "one octet"}]`). A flat union's branch so annotated is still named after its type (`int`). A
  `python3` token of a basic type's name is that type, its token in the metadata (`Annotated[int, {"native":
  ["python3", "int"]}]`), so that it reads back as `python3`; another `python3` token (`decimal.Decimal`), for which
  mbse-schemas' proxies have no host type, has no Python form here yet (0.12).
- **A named native or list is a type alias** (0.10) of what it holds, as a proxy reads its value: `type Word = str`,
  `type Names = list[Word]`, `type Tally = dict[Word, Count]`, its description in `Annotated` metadata, as a flat
  union's is. A field names it (`word: Word | None = None`); one without an alias (another format's native, a bounded
  list) is in `missing`. Reading back tells aliases apart by what they hold (`AliasSchema`, which replaces 0.8's
  `FlatUnion`): `A | B` a flat union, a native's name a named native, `list[...]` or `dict[...]` a named list. A named
  native or list a field names is read in full by that class's step, so its own alias's step has nothing left to do;
  that step does not link it (a rewrite returns one element per role), an open question below.
- **Names are written as the schemas have them**, so that a step can still configure them; a name Python cannot spell
  (not an identifier, or a keyword) is a problem of the module, which mbse-programs' validation reports by path
  (`Types.problems(session)`), and taking the source (`Types.text(session)`) with any left is a `ValueError` listing
  them all. A property named by a keyword is a field with a trailing underscore (`from_`), read back without it: a
  spelling, not a loss.
- **Completeness is reported**: `Types.missing(session)` lists the named schemas no class or alias renders, each kind
  in name order: those dropped as a whole and those unbuilt (or invalid, such as a union without branches). A schema
  unbuilt only for what it holds (`Card`, holding an application) still lets a class that names it be written, a
  name the module does not define, until the parametric bridge.
- **Objects read alike, whatever implements them.** Generated classes have the members mbse-schemas' proxies have, so
  that code written against one works on the other without change: a property is a field, and an adjacency is as
  mbse-schemas' FRAMEWORK.md specifies under Resolved (Adjacencies): "adjacencies are always stored in a class under
  the name of the adjacency and must store an Iterable over full relation entries, such as `Proxies.OfEntry.Data` or
  generated equivalent." Here the field holds a tuple of the relation's entry class (`phones: tuple[Phones, ...] =
  ()`), the generated equivalent of `Proxies.OfEntry.Data`; the tuple is one Iterable, not part of the contract, so
  there is nothing to choose. Both ends of a relation have their field.
- **A relation is the class of its entries**, named after it (`Entry`): a field per link, typed by the object schemas
  that declare an adjacency via it (`phone: Pager | Phone | None = None`), then one per property, its class variables
  `LINKS` and `UNIQUES` saying which fields are links and what is unique, its docstring its description. An entry is
  one object, in the tuples of each object it links. On the wire an entry is written in its adjacency's form, without
  the link the adjacency implies; in a class, every link is a field, any of which may be `None`.
- **An adjacency field says its link only where it is ambiguous**: reading back takes the one link of the entry class
  typed by the owner, and where a schema declares adjacencies via several links of one relation (a self-relation,
  `Person.children` and `Person.parents` through `Parentage`), each field's metadata names its link:
  `field(default=(), metadata={"me": "parent"})`. A relation the store holds, with no class in the module, needs it
  too.
- **Flat, where the schema says so.** A union or intersection configured `flat` (mbse-schemas 0.9) reads, on proxies
  and generated code alike, as Python's own forms. A flat union is a type alias of its branches' types (`type Channel =
  Call | Mail`): its value is the branch's value, told apart by type. Its branches' names, where they differ from their
  types' (`call` for `Call`, `int`, `list`, `dict`), and its description, are `Annotated` metadata (`type Code =
  Annotated[int | str, {"branches": ["n", "s"], "description": "A code"}]`). A flat intersection is a class of its
  parts' properties (`ticket.stamp.at`), whose class variable `PARTS` says each part's schema, or the properties of an
  inline part: `{"when": ("at",), "who": "Who"}`. The wire form stays tagged.
- **Absent reads as `None`** on both: a generated field defaults to `None`, and a proxy reads a property that is not set
  as `None` (mbse-schemas 0.8.4), so code that handles a missing value works on either.
- **A field is optional**, as every property is (mbse-schemas: nothing is mandatory but by a constraint):
  `name: str | None = None`. `from __future__ import annotations` lets a field name a class defined later.
- **A reference object schema compares by identity**: `@dataclass(eq=False)`, read back as `ref`. A schema's
  description is the class's docstring, a string in double quotes, and a singleton's name its class variable
  `SINGLETON` (`SINGLETON: ClassVar[str] = "Codegen.Output"`).
- **Nothing is lost silently** (0.9.1). A property's, an adjacency's, a relation property's and a branch's or part's
  description is its field's metadata (`field(default=None, metadata={"description": "digits"})`, beside an
  adjacency's `"me"`); a flat union's branches' descriptions are its `Annotated` metadata's `"descriptions"`, and a
  flat intersection's parts' its class variable `DESCRIPTIONS`, since no field holds a part. What has no Python form
  yet (a width that is a term, a native with parameters) has no class, and `missing` reports it.
- **Classes are in name order**, wherever the steps that wrote them come in the trace, so the module does not depend
  on the order of the decisions; the imports come first, once.
- **Names are matched by name.** After says "a class named after `s`" by its `name` child's spelling, since the
  reflected schemas and the syntax nodes are held by different stores and declare no relation between them; the trace
  links each step to its match.
- **Each step links what it wrote** (0.9.2, mbse-patterns 0.9), by role: `Dataclass`, `Entry`, `Union` and
  `Intersection` a `class`, `Alias` an `alias`, and reading back a `schema`. Within the session the link is the
  element (`session.wrote(cls)` is the step that wrote it); a trace names it by its path when written, by its
  qualified name in `Codegen.Defined` (`Codegen.Output/defined[name="Phone"]`), wherever the class is (0.14).
- **Dotted names are nested classes** (0.14; see Resolved): `Codegen.Output` is a class `Output` nested in the class
  `Codegen`, whose `__qualname__` is the schema's name, so it is spelled, not renamed. The prefix's class is its own
  schema's dataclass where it has one (fields first, then what it holds, in name order), else a class that only holds
  others; a class written after those nested in its place takes them in, so the module does not depend on the order of
  the steps. Annotations write dotted names as attributes (`tuple[Books.Held, ...]`), which `from __future__ import
  annotations` resolves from the module. A nested class under the name of a field of the class holding it is in
  `Types.problems`; a prefix that is a type alias holds no class, which stays at module level named as given, a name
  Python cannot spell, whichever step comes first. What the module defines is read by qualified name through
  `Codegen.Defined`, a relation of the output derived from the module whenever it is read, which every step's after,
  reading back and `missing` use.
- **Reading back** registers each class's schema in the store given; a class a field names before its own step is
  registered empty, which `Schema`'s after does not take for that class's schema unless the class has no fields, and is
  filled when the class is read. An annotation `Dataclass` does not write is refused, naming the field (`Bad.x: cannot
  read the annotation dict[str, int]`).
- **Regenerating reuses decisions.** A step's key is `Dataclass(s=Contact)`, by the schema's path, its name
  (mbse-schemas' `Paths`). Given the earlier steps (`generate(schemas, policy, earlier)`, or a session's `earlier`), a
  generation takes each decision again where its key still occurs, so after the schemas change only a new schema
  asks; the decisions about schemas now gone are `orphans`, and `Transforms.diff` lists what was added, removed and
  decided otherwise (mbse-patterns 0.8).
- **Round trips are laws, tested both ways.** Schemas to source to schemas gives the same schemas, compared as their
  modules' JSON; source to schemas to source gives the source as mbse-programs' Python 3.12 prints it, taking the same
  decisions again. `frozen` is the one thing a schema does not hold: the trace of the generation keeps it.

## Open questions

- **Inline schemas (`DropInline`).** An inline object, union, intersection or relation is dropped, its place `Any`,
  since a class needs a name that is the schema's to give. Should one ever get a Python form: a name the schema gives
  some other way, or a convention that is not a name codegen invents?
- **Natives of other formats (`DropFormat`).** Only Python's and basic natives are supported. Should another format's
  native ever map to a Python type, by an equivalence mbse-schemas declares (a `ccpp` `int32_t` as a 32-bit `int`)
  rather than by a choice codegen makes?
- **Undeclared links (`DropUndeclared`).** A relation's link that no object schema declares has no type, so its entry
  class's field is `Any`. Is that a defect of the model, for mbse-schemas' validation of a store to report, rather
  than a drop?
- **Parametric schemas and tensors.** A parametric schema uses TypeVars (see Resolved); its proposed form is PEP 695
  type parameters bounded by the parameters' types (`class Matrix[rows: int, cols: int]`), applications with
  `Literal` arguments (`Matrix[Literal[3], Literal[4]]`), and a term that is a parameter written as that TypeVar.
  Open: how a compound term (`rows - 1`, an extent's maximum) is written in `Annotated` metadata (its source text, its
  mbse-expressions form, or a function of the TypeVars), and where a parameter's description goes.

- **Model parameters.** A parametric schema as a generic dataclass (`class Matrix[T]`) needs type parameters, which
  mbse-schemas has not built yet; value parameters (an extent's bound) have no Python construct.
- **Runtime bindings.** The generated classes hold relations as containers, but are not bound to a store: generating
  mbse-schemas' `Bindings` beside them would let them serialize, validate and be queried as any store's objects.
- **Entries as a sorted set.** Any iterable holds entries; a set sorted by a comparator would serve retrieval.
- **The older adapter.** mbse-schemas' `Adapters/Dataclasses.py` maps containers of dataclasses to relations, as
  0.5 did and 0.6 no longer does; its classes do not read as proxies. Retire it, or bring it to entry classes.
- **Several elements in one role.** A class's step reads the native and list aliases its fields name, which a rewrite
  cannot yet return as written (one element per role): mbse-patterns could let a role hold several.
- **Checking extents and widths.** `Annotated` metadata says them; checking them (`__post_init__`, or a validator
  beside the classes) is Codegen/Patterns' work, with the constraints.

## Resolved

- **Parametric schemas are not dropped**, as the user decided: "DropParametric? Absolutely not." Parameters stay
  parameters in generated code (mbse-schemas' FRAMEWORK.md, Parametrics), and a parametric schema uses TypeVars. Nor
  are terms dropped, since a term is an expression over parameters. Tensor types must be representable: a list
  (`OfIndexed`) whose shape is constrained (its extents, nested a list per dimension) by terms that may use parameters
  (`Matrix[rows, cols]`). Until the parametric bridge is built, a schema with parameters or terms has no class and
  `missing` reports it; it is not dropped.

- **Inline schemas are dropped**, as the user decided: "yes, drop it." An inline object, union, intersection or
  relation has no name, and a Python class needs one, which is the schema's to give, so codegen invents none. And: "A
  report of all dropped types and reasons should be easy to obtain ... as dropping transform steps": every type that
  gets no Python form is dropped by a transform step of its own, whose transform says why, so the trace is the report.
  The reasons, for now, are three, each with an open question (see Open questions): `DropInline` (an inline object,
  union, intersection or relation), `DropFormat` (a native of another format) and `DropUndeclared` (a relation's link
  that no object schema declares). Parameters and terms are not reasons (see Parametric schemas), nor a `python3`
  token that is not a basic type's name, which mbse-schemas does not let a schema configure.
- **References to a dropped type are `Any`**, as the user decided: "anything that references a dropped type should be
  demoted to Any." So a dropped type costs only its own place: a property, a branch, a list's item, a link whose type
  is dropped is `Any` there, and the schema holding it still has its class; a named schema dropped as a whole (a
  native of another format) has no alias, and every reference to it is `Any`.

- **Dotted names are nested classes**, as the user asked ("what about nested classes?") and decided, case by case: a
  prefix that is also a schema's name, its class holds those nested in it, "(a)", and of a nested class under the
  name of one of that class's fields, "validation flags it"; a prefix that is a type alias, which cannot hold a
  class: "agreed", flagged; a class that only holds others, a namespace, which Python more often makes a module:
  "okay for now" (0.14). It replaces the `layout` parameter (packages per prefix), which needed several modules.

- **Natives codegen supports**, as the user decided: "only python native and basic can be supported for codegen." A
  native of another format (`ccpp` `int32_t`, `typescript5` `number`) is not bridged: no Python type is chosen to
  stand for it (there is no `host` parameter), it has no class, and `missing` reports it. Of `python3`'s own tokens,
  those of a basic type's name are built (0.12); the others (`decimal.Decimal`) wait on mbse-schemas' proxies having
  a host type for them.

- **Keys a `dict` cannot hold faithfully**, as the user decided: "dict keyed by a wrapper", and of where the wrapper
  lives, "(b)": in mbse-schemas, as a run-time class generated code imports, so that one implementation compares keys
  as schema equality does. The wrapper is `Proxies.OfIndexed.Map`, which wraps keys within, so code reads it with
  plain keys as it reads a proxy's keyed list (0.13; mbse-schemas 0.9.2). It replaces 0.3's `dict[float, V]`, which
  merged `-0.0` with `0.0` and never matched a NaN, a silent loss.

- A named native is a type alias, not a `NewType` (0.10): a `NewType` cannot hold the `Annotated` metadata that
  carries a description or a width, and a proxy's value is the plain host value either way.

- Descriptions are field metadata (0.9.1), not comments or `Annotated` annotations: metadata reaches code at run
  time (`dataclasses.fields`), as an adjacency's `"me"` already did, and leaves the annotation the type alone.

- Codegen matches schemas through mbse-schemas' `Reflection.of(store)` (0.8), and compares what they hold with
  mbse-expressions' deep equality (0.5).
- One transform per class, not per field: a step is a decision, and a field has none yet.
- No silent loss (0.3): a property type or an extent `Dataclass` cannot render faithfully makes its schema have no
  candidate, and `missing` reports it.
- Relations render as entry classes, and adjacencies as fields holding entries, on both ends (0.6), as specified (see
  Objects read alike), so that generated
  classes read as mbse-schemas' proxies do (0.8.3) and code works on either without change. It replaces 0.5's
  container fields (the older adapter's mapping), which hid the entries and differed from proxies.
- Unions and intersections render as value classes of a dataclass field per branch or part (0.7), as proxies read
  union and intersection values, the default form; `KIND` says which on the way back. Reading back never makes up a
  schema: a name that is neither a class of the module nor a schema of the store is refused.
- Unions and intersections may be configured `flat` in the schema (mbse-schemas 0.9, codegen 0.8): a type alias of
  the branches' types and a class of the parts' properties, as flat proxies read them. Both forms are a schema's
  configuration, not a decision of codegen, since code written against one does not read the other.
- Names Python cannot spell are written as they are, flagged by mbse-programs' validation (which already holds any
  spelling and flags those), and an error only when the source is taken (0.4), so that a step may still configure
  them. Codegen never renames: a name is the schema's to configure, and one Python cannot spell is fixed there. Keyed lists and nested lists render, as mbse-schemas' older Python adapter
  (`Adapters/Dataclasses.py`) maps them.
- Decisions are keyed by schema names (0.2), so they survive any change but a rename; a renamed schema's decision is
  an orphan, for the person to confirm again (mbse-patterns' open question on renames).

---

<!-- nav -->
[← Bridges for types](BRIDGES.md) · [Home](../README.md) · [Equivalence →](EQUIVALENCE.md)
